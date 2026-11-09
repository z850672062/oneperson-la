# OnePerson_LA 后端部署手册（MySQL 8）

## 1. 运行时要求

- Node.js >= 20（建议 22 LTS）
- pnpm >= 9（pnpm 10 需允许 Prisma/esbuild 的构建脚本，`package.json` 已配置 `pnpm.onlyBuiltDependencies`）
- **MySQL >= 8.0**（InnoDB；库与连接统一 `utf8mb4` / `utf8mb4_unicode_ci`）
- 端口：`3001`（可用 `PORT` 覆盖）；所有接口前缀 `/api`

## 2. 准备数据库

```sql
CREATE DATABASE oneperson_la CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE oneperson_la_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; -- 运行测试时使用
CREATE USER 'la'@'%' IDENTIFIED BY '强密码';
GRANT ALL PRIVILEGES ON oneperson_la.* TO 'la'@'%';
GRANT ALL PRIVILEGES ON oneperson_la_test.* TO 'la'@'%';
FLUSH PRIVILEGES;
```

初始化脚本见 `backend/scripts/init-mysql.sql`（Docker Compose 会自动挂载执行）。

本地开发三种供给方式：

| 方式 | 命令 | 端口 | 说明 |
| --- | --- | --- | --- |
| Windows 独立实例脚本 | `pnpm db:up` / `db:down` / `db:status`（在 `backend/` 下） | 3307 | 使用已安装的 `mysqld.exe`，数据目录 `backend/.mysql/data`，不影响系统 MySQL 服务 |
| Docker | 根目录 `docker compose up -d` | 3306 | `mysql:8.0`，账号 `la`，密码由 `MYSQL_PASSWORD` 控制 |
| 已有 MySQL 服务 | 手工执行上面的 SQL | 3306 | 改 `.env` 的 `DATABASE_URL` 即可 |

## 3. 首次部署

```bash
# 1) 进入后端目录
cd backend

# 2) 安装依赖（postinstall 会执行 prisma generate）
pnpm install

# 3) 配置环境变量（切勿提交 .env）
cp .env.example .env       # Linux/macOS
# copy .env.example .env   # Windows
# 必改：DATABASE_URL、JWT_SECRET、ENCRYPTION_KEY；按需设置 LLM_API_KEY、COOKIE_SECURE

# 4) 应用数据库迁移
pnpm db:deploy             # 生产环境使用 migrate deploy，不要用 migrate dev

# 5) 初始化演示数据（可选；生产可跳过并自行建账号）
pnpm db:seed

# 6) 构建并启动
pnpm build
pnpm start
```

健康检查：`GET http://localhost:3001/api/health` → `{"ok":true,"version":"0.1.0"}`

生产模式下若存在 `../web/dist`（即仓库根目录 `web/dist`），后端会自动托管前端静态资源并做 SPA fallback，且不会拦截 `/api` 请求。

## 4. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | 是 | 生产设为 `production`（会强制校验密钥、启用静态托管与 Secure Cookie 建议） |
| `PORT` | 否 | 默认 3001 |
| `DATABASE_URL` | 是 | `mysql://user:password@host:3306/oneperson_la` |
| `TEST_DATABASE_URL` | 否 | 测试库连接串，默认指向本机 3307 的 `oneperson_la_test` |
| `JWT_SECRET` | 是 | access token 签名密钥，生产必须为强随机串 |
| `ENCRYPTION_KEY` | 是 | API Key AES-256-GCM 加密密钥；丢失后旧 Key 不可恢复 |
| `LLM_API_KEY` | 否 | DeepSeek Key 兜底；也可在设置页保存加密 Key |
| `CORS_ORIGINS` | 否 | 允许前端来源，逗号分隔，默认 `http://localhost:5173` |
| `COOKIE_SECURE` | 否 | HTTPS 部署设为 `true` |

## 5. pm2 方式

`ecosystem.config.cjs`：

```js
module.exports = {
  apps: [
    {
      name: 'oneperson-la-api',
      cwd: '/opt/oneperson-la/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3001 },
      max_memory_restart: '300M',
      out_file: '/var/log/oneperson-la/api.out.log',
      error_file: '/var/log/oneperson-la/api.err.log'
    }
  ]
};
```

```bash
pnpm install --prod=false
pnpm db:deploy
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
```

> 登录限流为进程内计数，目前按单实例设计（`instances: 1`）。如需多实例，需把限流与 refresh token 吊销状态迁到 Redis。

## 6. systemd 方式

`/etc/systemd/system/oneperson-la-api.service`：

```ini
[Unit]
Description=OnePerson_LA API
After=network.target mysql.service

[Service]
Type=simple
User=oneperson
WorkingDirectory=/opt/oneperson-la/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/oneperson-la/backend/.env
ExecStart=/usr/bin/node /opt/oneperson-la/backend/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oneperson-la-api
sudo systemctl status oneperson-la-api
```

## 7. 备份

```bash
# 逻辑备份（推荐，加 --single-transaction 避免锁表，适用于 InnoDB）
mysqldump -h 127.0.0.1 -P 3306 -u la -p \
  --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 \
  oneperson_la | gzip > backups/oneperson_la-$(date +%Y%m%d-%H%M%S).sql.gz
```

- 建议每日定时备份并保留 7~30 天；备份文件与 `.env` 分开存放。
- 同时备份 `.env`（尤其 `ENCRYPTION_KEY`），否则已保存的 LLM API Key 无法解密。
- 大版本升级前额外做一次全量备份并记录 `_prisma_migrations` 版本。

## 8. 恢复

```bash
# 1) 停服，避免写入
pm2 stop oneperson-la-api

# 2) 恢复（库需已存在）
gunzip -c backups/oneperson_la-20261109-030000.sql.gz | mysql -h 127.0.0.1 -P 3306 -u la -p --default-character-set=utf8mb4 oneperson_la

# 3) 校验迁移版本与备份一致后启动
pnpm db:deploy
pm2 start oneperson-la-api
```

## 9. 迁移顺序（升级）

1. 备份数据库与 `.env`。
2. `pnpm install`（拉取新依赖并 `prisma generate`）。
3. `pnpm db:deploy`（只应用未执行迁移，不重置数据）。
4. `pnpm build`。
5. 重启进程（pm2 restart / systemctl restart）。
6. `GET /api/health` 与关键接口冒烟。

> 禁止在生产使用 `prisma migrate dev`、`prisma db push --force-reset` 等会重置数据的命令。

## 10. 回滚

1. 停服。
2. 回滚代码到上一个发布版本（git checkout 指定 tag / 制品目录切换）。
3. `pnpm install && pnpm build`。
4. 若新迁移已改变表结构且旧代码不兼容：用升级前的 `mysqldump` 备份恢复整个库（含 `_prisma_migrations`）。
5. 启动并冒烟。

## 11. 日志与安全

- 访问日志仅记录方法、路径（去掉 query）、状态码、耗时；不记录请求体、密码、token、API Key。
- 登录失败限流为进程内内存计数（5 次/15 分钟/IP+账号）。多实例部署会失效，本项目按单实例设计。
- refresh token 仅存 sha256 哈希，退出/改密即吊销；access token 15 分钟。
- 建议前置 Nginx/Caddy 启用 HTTPS，并设置 `COOKIE_SECURE=true`、`NODE_ENV=production`。
- MySQL 账号按最小权限授予，禁止业务账号使用 `root`；对外不暴露 3306，仅本机/VPC 可连。
