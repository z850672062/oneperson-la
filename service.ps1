# OnePerson_LA (Legal Workbench) - Service Manager
# ASCII-only on purpose: Windows PowerShell 5.1 reads non-BOM UTF-8 files as ANSI.
param(
    [ValidateSet('start', 'stop', 'restart', 'status', 'help')]
    [string]$Action,
    [switch]$Dev
)

# Configuration
$ProjectHome = $PSScriptRoot
$BackendDir = Join-Path $ProjectHome "backend"
$WebDir = Join-Path $ProjectHome "web"
$LogDir = Join-Path $ProjectHome "logs"
$BackendPort = 3001
$FrontendPort = 5173
$DefaultDbPort = 3307
$NodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) { $NodeExe = "node.exe" }
$PnpmCmd = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
if (-not $PnpmCmd) { $PnpmCmd = "pnpm.cmd" }

# Functions
function Get-DbPort {
    $envFile = Join-Path $BackendDir ".env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
        if ($line -match '@[^/:]+:(\d+)/') { return [int]$Matches[1] }
    }
    return $DefaultDbPort
}

function GetProcessByPort($Port) {
    $proc = $null
    $connections = netstat -aon | Select-String ":$Port\s+.*LISTENING"
    if ($connections) {
        $firstConn = $connections[0].ToString()
        $parts = $firstConn -split '\s+'
        $procId = $parts[-1].Trim()
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($p) {
            $proc = [PSCustomObject]@{ PID = $procId; Name = $p.ProcessName }
        }
    }
    return $proc
}

function StopPort($Port, $Name) {
    $proc = GetProcessByPort $Port
    if ($proc) {
        Write-Host "  Stopping $Name (PID: $($proc.PID))..." -ForegroundColor Yellow
        Stop-Process -Id $proc.PID -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "  [OK] $Name stopped" -ForegroundColor Green
    } else {
        Write-Host "  [-] $Name not running" -ForegroundColor Gray
    }
}

function Test-Health {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 3
        if ($r.StatusCode -eq 200) { return $r.Content }
    } catch { }
    return $null
}

function Wait-Health($TimeoutSec) {
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        $body = Test-Health
        if ($body) { return $body }
        Start-Sleep -Seconds 1
    }
    return $null
}

function Test-TcpPort($Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect("127.0.0.1", $Port)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Ensure-MySql {
    $dbPort = Get-DbPort
    if (Test-TcpPort $dbPort) {
        Write-Host "  [OK] MySQL already listening on port $dbPort" -ForegroundColor Green
        return $true
    }
    if ($dbPort -ne $DefaultDbPort) {
        Write-Host "  [FAIL] MySQL on port $dbPort is not running. Start your own MySQL service first." -ForegroundColor Red
        return $false
    }

    $mySqlBase = "C:\Program Files\MySQL\MySQL Server 8.0"
    $mysqld = Join-Path $mySqlBase "bin\mysqld.exe"
    $mysqlCli = Join-Path $mySqlBase "bin\mysql.exe"
    $dbHome = Join-Path $BackendDir ".mysql"
    $dataDir = Join-Path $dbHome "data"

    if (-not (Test-Path $mysqld)) {
        Write-Host "  [FAIL] mysqld.exe not found: $mysqld" -ForegroundColor Red
        Write-Host "         Install MySQL 8, or point DATABASE_URL to your own MySQL." -ForegroundColor Gray
        return $false
    }

    if (-not (Test-Path (Join-Path $dataDir "ibdata1"))) {
        Write-Host "  Initializing local MySQL data dir (first run)..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
        & $mysqld --initialize-insecure "--basedir=$mySqlBase" "--datadir=$dataDir" --console 2>&1 | Out-Null
    }

    New-Item -ItemType Directory -Force -Path $dbHome | Out-Null
    Write-Host "  Launching mysqld on port $dbPort..." -ForegroundColor Cyan
    $argList = @(
        "--basedir=`"$mySqlBase`"",
        "--datadir=`"$dataDir`"",
        "--port=$dbPort",
        "--mysqlx=0",
        "--skip-log-bin"
    )
    Start-Process -FilePath $mysqld -ArgumentList $argList -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $dbHome "mysqld.out.log") `
        -RedirectStandardError (Join-Path $dbHome "mysqld.err.log") | Out-Null

    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-TcpPort $dbPort) {
            Write-Host "  [OK] MySQL started (port $dbPort)" -ForegroundColor Green
            if (-not (Test-Path (Join-Path $dbHome ".db-ready"))) {
                $prev = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                $sql = "CREATE DATABASE IF NOT EXISTS oneperson_la CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE IF NOT EXISTS oneperson_la_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                $sql | & $mysqlCli -h 127.0.0.1 -P $dbPort -u root --protocol=TCP 2>&1 | Out-Null
                $ErrorActionPreference = $prev
                New-Item -ItemType File -Force -Path (Join-Path $dbHome ".db-ready") | Out-Null
            }
            return $true
        }
    }
    Write-Host "  [FAIL] MySQL did not start in 20s, see backend\.mysql\mysqld.err.log" -ForegroundColor Red
    return $false
}

function Apply-Migrations {
    Write-Host "  Applying database migrations..." -ForegroundColor Cyan
    & $PnpmCmd --dir $BackendDir db:deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Migration failed" -ForegroundColor Red
        return $false
    }
    Write-Host "  [OK] Database up to date" -ForegroundColor Green
    return $true
}

function Build-All {
    Write-Host "  Building web..." -ForegroundColor Cyan
    & $PnpmCmd --dir $WebDir build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Web build failed!" -ForegroundColor Red
        return $false
    }
    Write-Host "  [OK] Web build done" -ForegroundColor Green

    Write-Host "  Building backend..." -ForegroundColor Cyan
    & $PnpmCmd --dir $BackendDir build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Backend build failed!" -ForegroundColor Red
        return $false
    }
    Write-Host "  [OK] Backend build done" -ForegroundColor Green
    return $true
}

function Start-Backend {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $outLog = Join-Path $LogDir "backend.out.log"
    $errLog = Join-Path $LogDir "backend.err.log"
    if ($Dev) {
        $env:NODE_ENV = "development"
        Start-Process -FilePath $PnpmCmd -ArgumentList "dev" -WorkingDirectory $BackendDir -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
    } else {
        $env:NODE_ENV = "production"
        Start-Process -FilePath $NodeExe -ArgumentList "dist/index.js" -WorkingDirectory $BackendDir -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
    }
    Write-Host "  [OK] Backend starting (port: $BackendPort)" -ForegroundColor Green
}

function Start-Frontend {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Start-Process -FilePath $PnpmCmd -ArgumentList "dev" -WorkingDirectory $WebDir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "web.out.log") `
        -RedirectStandardError (Join-Path $LogDir "web.err.log") | Out-Null
    Write-Host "  [OK] Frontend dev server starting (port: $FrontendPort)" -ForegroundColor Green
}

function DoStart {
    if ($Dev) { Write-Host "[START] Starting services in DEV mode..." -ForegroundColor Cyan }
    else { Write-Host "[START] Starting services in PROD mode (single port)..." -ForegroundColor Cyan }
    StopPort $BackendPort "Backend"
    if ($Dev) { StopPort $FrontendPort "Frontend" }
    Write-Host ""

    if (-not (Ensure-MySql)) { return }
    if (-not (Apply-Migrations)) { return }
    if (-not $Dev) {
        if (-not (Build-All)) { return }
    }
    Write-Host ""

    Start-Backend
    $health = Wait-Health 40
    if (-not $health) {
        Write-Host "  [FAIL] Backend health check failed, see logs\backend.err.log" -ForegroundColor Red
        return
    }
    Write-Host "  [OK] Backend healthy: $health" -ForegroundColor Green

    if ($Dev) {
        Start-Frontend
        Write-Host "`n  [DONE] Open http://localhost:$FrontendPort (API proxied to $BackendPort)" -ForegroundColor Green
    } else {
        Write-Host "`n  [DONE] Open http://localhost:$BackendPort" -ForegroundColor Green
    }
    Write-Host "  Login: demo / Demo123456" -ForegroundColor Yellow
}

function DoStop {
    Write-Host "[STOP] Stopping services..." -ForegroundColor Cyan
    StopPort $BackendPort "Backend"
    StopPort $FrontendPort "Frontend"
    Write-Host "  [OK] All services stopped (MySQL keeps running)" -ForegroundColor Green
    Write-Host "  Stop MySQL: backend\scripts\mysql-dev.ps1 stop" -ForegroundColor Gray
}

function DoRestart {
    Write-Host "[RESTART] Restarting services..." -ForegroundColor Cyan
    StopPort $BackendPort "Backend"
    StopPort $FrontendPort "Frontend"
    Start-Sleep -Seconds 2
    DoStart
}

function DoStatus {
    Write-Host "[STATUS] Service status" -ForegroundColor Cyan

    Write-Host "`n  Backend (port $BackendPort):" -ForegroundColor White
    $b = GetProcessByPort $BackendPort
    if ($b) { Write-Host "    [RUNNING] PID: $($b.PID)" -ForegroundColor Green }
    else { Write-Host "    [STOPPED]" -ForegroundColor Red }
    $health = Test-Health
    if ($health) { Write-Host "    Health: $health" -ForegroundColor Green }

    Write-Host "`n  Frontend dev server (port $FrontendPort):" -ForegroundColor White
    $f = GetProcessByPort $FrontendPort
    if ($f) { Write-Host "    [RUNNING] PID: $($f.PID)" -ForegroundColor Green }
    else { Write-Host "    [STOPPED] (only used in -Dev mode)" -ForegroundColor Gray }

    $dbPort = Get-DbPort
    Write-Host "`n  MySQL (port $dbPort):" -ForegroundColor White
    $m = GetProcessByPort $dbPort
    if ($m) { Write-Host "    [RUNNING] PID: $($m.PID)" -ForegroundColor Green }
    else { Write-Host "    [STOPPED]" -ForegroundColor Red }

    Write-Host "`n  URLs:" -ForegroundColor Yellow
    if ($f) {
        Write-Host "    App (dev):     http://localhost:$FrontendPort"
        Write-Host "    API:           http://localhost:$BackendPort/api"
    } else {
        Write-Host "    App (single):  http://localhost:$BackendPort"
    }
    Write-Host "    Health:        http://localhost:$BackendPort/api/health"
    Write-Host "`n  Logs: $LogDir" -ForegroundColor Gray
}

function DoHelp {
    Write-Host "`n============================================" -ForegroundColor Cyan
    Write-Host "    HELP - OnePerson_LA Service Manager" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "`n  Usage:" -ForegroundColor Yellow
    Write-Host '    .\service.ps1 start           # Build + start (single port 3001)'
    Write-Host '    .\service.ps1 start -Dev      # Dev mode: backend 3001 + Vite 5173'
    Write-Host '    .\service.ps1 stop            # Stop backend / frontend'
    Write-Host '    .\service.ps1 restart [-Dev]  # Restart services'
    Write-Host '    .\service.ps1 status          # Check services / MySQL / health'
    Write-Host '    .\service.ps1 help            # Show help'
    Write-Host "`n  What start does:" -ForegroundColor Yellow
    Write-Host "    1) Ensure MySQL (local dev instance on 3307 if not running)"
    Write-Host "    2) prisma migrate deploy (idempotent)"
    Write-Host "    3) Build web + backend (skipped with -Dev)"
    Write-Host "    4) Start backend and wait for /api/health"
    Write-Host "`n  Ports:" -ForegroundColor Yellow
    Write-Host "    Backend: $BackendPort | Frontend: $FrontendPort | MySQL: $(Get-DbPort)"
    Write-Host "`n  Login: demo@legal.local / Legal1234" -ForegroundColor Yellow
    Write-Host ""
}

# Main
if ($Action) {
    if ($Action -eq 'start') { DoStart }
    elseif ($Action -eq 'stop') { DoStop }
    elseif ($Action -eq 'restart') { DoRestart }
    elseif ($Action -eq 'status') { DoStatus }
    elseif ($Action -eq 'help') { DoHelp }
} else {
    # Interactive mode
    while ($true) {
        Write-Host "`n============================================" -ForegroundColor Cyan
        Write-Host "    OnePerson_LA - Service Manager" -ForegroundColor Cyan
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host "`n  Commands: start | dev | stop | restart | status | open | help | exit" -ForegroundColor White
        Write-Host ""

        $choice = Read-Host "Enter command"

        if ($choice -eq 'start' -or $choice -eq '1') { $Dev = $false; DoStart }
        elseif ($choice -eq 'dev' -or $choice -eq '6') { $Dev = $true; DoStart }
        elseif ($choice -eq 'stop' -or $choice -eq '2') { DoStop }
        elseif ($choice -eq 'restart' -or $choice -eq '3') { DoRestart }
        elseif ($choice -eq 'status' -or $choice -eq '4') { DoStatus }
        elseif ($choice -eq 'open' -or $choice -eq '5') {
            if (GetProcessByPort $FrontendPort) { Start-Process "http://localhost:$FrontendPort" }
            else { Start-Process "http://localhost:$BackendPort" }
        }
        elseif ($choice -eq 'help') { DoHelp }
        elseif ($choice -eq 'exit' -or $choice -eq '0' -or $choice -eq 'quit') { break }
        else { Write-Host "  Invalid command" -ForegroundColor Red }
    }
}
