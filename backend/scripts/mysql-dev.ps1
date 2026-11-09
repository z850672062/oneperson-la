# Local dev-only MySQL 8 instance (port 3307, data dir backend/.mysql, does not touch the system MySQL service).
# Usage: pnpm db:up / pnpm db:down / pnpm db:status (from backend/).
# NOTE: keep this file ASCII-only: Windows PowerShell 5.1 parses non-BOM UTF-8 as ANSI.
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'init')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$base = 'C:\Program Files\MySQL\MySQL Server 8.0'
$mysqld = Join-Path $base 'bin\mysqld.exe'
$mysqlCli = Join-Path $base 'bin\mysql.exe'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workDir = Join-Path $projectRoot '.mysql'
$dataDir = Join-Path $workDir 'data'
$pidFile = Join-Path $workDir 'mysqld.pid'
$outLog = Join-Path $workDir 'mysqld.out.log'
$errLog = Join-Path $workDir 'mysqld.err.log'
$port = 3307
$dbUser = 'la'
$dbPass = 'LaLocal2026!'

function Test-MySqlUp {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $mysqlCli --silent --skip-column-names -h 127.0.0.1 -P $port -u $dbUser "-p$dbPass" --protocol=TCP -e "SELECT 1" 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Initialize-DataDir {
  if (Test-Path (Join-Path $dataDir 'ibdata1')) { return }
  Write-Host "[mysql-dev] initializing data dir: $dataDir"
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  & $mysqld --initialize-insecure "--basedir=$base" "--datadir=$dataDir" --console 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'failed to initialize data dir' }
}

function Ensure-Databases {
  $lines = @(
    "CREATE DATABASE IF NOT EXISTS oneperson_la CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    "CREATE DATABASE IF NOT EXISTS oneperson_la_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    "CREATE USER IF NOT EXISTS '$dbUser'@'%' IDENTIFIED BY '$dbPass';",
    "GRANT ALL PRIVILEGES ON oneperson_la.* TO '$dbUser'@'%';",
    "GRANT ALL PRIVILEGES ON oneperson_la_test.* TO '$dbUser'@'%';",
    "FLUSH PRIVILEGES;"
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $lines -join "`n" | & $mysqlCli -h 127.0.0.1 -P $port -u root --protocol=TCP 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'failed to create databases or app user' }
  } finally {
    $ErrorActionPreference = $prev
  }
}

switch ($Action) {
  'init' {
    Initialize-DataDir
    Write-Host '[mysql-dev] data dir ready (instance not started)'
  }
  'start' {
    if (Test-MySqlUp) {
      Write-Host "[mysql-dev] already running: 127.0.0.1:$port"
      break
    }
    Initialize-DataDir
    New-Item -ItemType Directory -Force -Path $workDir | Out-Null
    $argList = @(
      "--basedir=`"$base`"",
      "--datadir=`"$dataDir`"",
      "--port=$port",
      "--mysqlx=0",
      "--skip-log-bin"
    )
    $proc = Start-Process -FilePath $mysqld `
      -ArgumentList $argList `
      -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii

    $ok = $false
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Milliseconds 800
      try {
        & $mysqlCli -h 127.0.0.1 -P $port -u root --protocol=TCP -e "SELECT 1" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
      } catch { }
    }
    if (-not $ok) { throw "start failed, see $errLog" }
    Ensure-Databases
    Write-Host "[mysql-dev] started: mysql://${dbUser}:***@127.0.0.1:$port/oneperson_la"
  }
  'stop' {
    $pid = $null
    if (Test-Path $pidFile) { $pid = (Get-Content $pidFile | Select-Object -First 1) }
    if (-not $pid) {
      $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      if ($conn) { $pid = $conn.OwningProcess }
    }
    if ($pid) {
      $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'mysqld') {
        Stop-Process -Id $pid -Force
        Write-Host "[mysql-dev] stopped pid=$pid"
      } else {
        Write-Host '[mysql-dev] port is held by a non-mysqld process, skip stop'
      }
    } else {
      Write-Host '[mysql-dev] no running instance found'
    }
  }
  'status' {
    if (Test-MySqlUp) { Write-Host "[mysql-dev] running 127.0.0.1:$port" }
    else { Write-Host '[mysql-dev] stopped' }
  }
}
