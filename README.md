# 一人法务工作台（OnePerson_LA）

面向单人法务的结构化工作台：**工作记录 → 汇总复盘 → 报表输出 → 知识库引用 → AI 对话**，最终沉淀为「AI 版本的我」。

需求与验收标准见 [docs/PRD.md](docs/PRD.md)；视觉与交互基准见 [design/prototypes/prototype.html](design/prototypes/prototype.html)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 `web/` | Vite + React 18 + TypeScript + React Router 6 + Ant Design 5 + Zustand + axios + ECharts |
| 后端 `backend/` | Node.js 20+ + TypeScript + Express 4 + Prisma + **MySQL 8（utf8mb4 / InnoDB）** |
| 鉴权 | JWT Access Token（15 分钟）+ HttpOnly Refresh Cookie（7 天，服务端哈希存储、可吊销） |
| 检索 | MySQL 包含匹配（Obsidian 本地 Markdown 只读索引） |
| 对话 | SSE 流式输出；未配置 Key 时使用内置离线 Mock，配置 `LLM_API_KEY` 后走 DeepSeek |

## 目录结构

```
OnePerson_LA/
├─ docs/PRD.md                 # 产品需求（唯一功能基准）
├─ design/prototypes/          # 已确认的高保真原型（HTML/CSS/JS）
├─ backend/
│  ├─ docs/openapi.yaml        # API 契约（唯一接口基准）
│  ├─ docs/DB_Schema.md        # 数据模型与迁移策略
│  ├─ prisma/schema.prisma     # 数据模型 + migrations + seed
│  ├─ scripts/                 # MySQL 初始化 SQL、本地开发实例脚本
│  ├─ src/{routes,services,middleware}
│  └─ DEPLOY.md
├─ web/
│  ├─ src/{api,components,pages,store,utils}
│  ├─ BUILD.md / DEPLOY.md / PACKAGE.md
│  └─ dist/                    # 构建产物（后端同端口托管）
├─ docker-compose.yml          # 本地/测试用 MySQL 8
└─ package.json                # 根脚本（不参与依赖安装）
```

## 快速开始

前置：Node.js >= 20、pnpm >= 9、**MySQL 8**。

```bash
# 1. 安装依赖（两个子工程各自独立安装）
pnpm --dir backend install
pnpm --dir web install

# 2. 准备 MySQL 8（三选一）
#   A. 本地独立开发实例（Windows，端口 3307，数据在 backend/.mysql）
pnpm --dir backend db:up
#   B. Docker（端口 3306）
docker compose up -d
#   C. 已有 MySQL 服务：创建库与账号后，改 backend/.env 的 DATABASE_URL
#      CREATE DATABASE oneperson_la CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
#      CREATE DATABASE oneperson_la_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 3. 迁移与种子数据
pnpm db:migrate
pnpm db:seed

# 4A. 开发模式（前后端分离热更新）
pnpm dev:server     # 后端 http://localhost:3001
pnpm dev            # 前端 http://localhost:5173（/api 已代理到 3001）

# 4B. 本地生产态（单端口，后端托管 web/dist）
pnpm build
pnpm start          # http://localhost:3001
```

演示账号：`demo@legal.local` / `Legal1234`

> 本地无 MySQL 时，`pnpm --dir backend db:up` 会用已安装的 MySQL 8 在端口 3307 启动独立实例（不影响系统服务）；`db:down` 停止，`db:status` 查看状态。Linux 请使用 Docker 或系统 MySQL。

## Linux 部署（Docker Compose）

服务器只需 Docker 与 Compose v2，MySQL 与应用都跑在容器里（MySQL 不映射宿主端口，避免与已有数据库冲突；应用默认映射 `8080`）。

```bash
git clone <repo> /opt/oneperson-la && cd /opt/oneperson-la
cp .env.prod.example .env && vim .env      # 填 DATABASE_URL / MYSQL_* / JWT_SECRET / ENCRYPTION_KEY
docker compose -f docker-compose.prod.yml up -d --build
```

- 升级：`bash deploy.sh`（拉取代码 → 重建 → 重启 → 清理旧镜像）；容器重启策略为 `unless-stopped`，开机自启
- 迁移：应用容器启动时自动执行 `prisma migrate deploy`
- 备份：`docker exec oneperson-la-mysql mysqldump -ula -p"$MYSQL_PASSWORD" oneperson_la > backup.sql`
- Obsidian：宿主目录以只读方式挂到容器 `/vault`（`.env` 的 `OBSIDIAN_VAULT`），连接器路径填 `/vault/子目录`
  - 库在 Windows 本机：两种接法
    - **SMB 挂载（推荐，实时只读）**：Windows 上共享该文件夹 → Linux 执行
      `mount -t cifs //<Windows_IP>/<共享名> /mnt/obsidian_win -o username=<用户>,password=<密码>,ro,uid=1000,gid=1000`
      → `.env` 设 `OBSIDIAN_VAULT=/mnt/obsidian_win` → `docker compose -f docker-compose.prod.yml up -d app`，连接器填 `/vault`
    - **Nextcloud 同步**：Windows 客户端把库同步到服务器 `/mnt/nextcloud_data/<目录>`，`OBSIDIAN_VAULT` 指向该目录
  - 路径写错时「索引」会直接报“路径不可访问”，不会再假装已连接
- 对外访问建议用已有 nginx 反代 `127.0.0.1:8080` 并配置 HTTPS；HTTPS 下将 `COOKIE_SECURE` 置为 `true`

## 常用脚本（根目录）

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动前端 Vite（5173） |
| `pnpm dev:server` | 启动后端（3001，tsx watch） |
| `pnpm build` | 构建前端 `web/dist` 与后端 `backend/dist` |
| `pnpm start` | 生产态单端口运行（3001） |
| `pnpm db:migrate` | 执行 Prisma 迁移（开发） |
| `pnpm --dir backend db:deploy` | 生产环境应用迁移（不生成新迁移） |
| `pnpm db:seed` | 写入演示数据（可重复执行） |
| `pnpm test` | 后端 API 集成测试 + 前端组件测试 |
| `pnpm typecheck` | 前后端 TypeScript 检查 |

## 环境变量

后端读取 `backend/.env`（已在 `.gitignore` 中忽略），模板见 `backend/.env.example`：

| 变量 | 用途 |
| --- | --- |
| `PORT` | 服务端口，默认 3001 |
| `DATABASE_URL` | MySQL 连接串，如 `mysql://la:password@127.0.0.1:3306/oneperson_la` |
| `TEST_DATABASE_URL` | 测试库连接串（vitest 使用，可覆盖） |
| `JWT_SECRET` | Access Token 签名密钥（生产必须替换） |
| `ENCRYPTION_KEY` | LLM API Key 等敏感字段的 AES-256-GCM 加密密钥 |
| `LLM_API_KEY` | 可选；配置后对话走真实模型，否则使用离线 Mock |
| `COOKIE_SECURE` | HTTPS 部署时置 `true`（Refresh Cookie 加 Secure） |
| `CORS_ORIGINS` | 开发期跨域白名单，默认 `http://localhost:5173` |

## 已实现（MVP / P0）

- 登录、会话恢复、刷新、改密、退出；登录失败限流
- 两级分类（合同审查 / 诉讼仲裁 / 合规咨询 / 公司治理）与分类管理（删除保护）
- 自定义字段模板：分组（基础信息 / 过程信息 / 结果信息）、类型、必填、选项；公共字段「状态」「截止日期」锁定
- 工作记录 CRUD、动态分组表单、级联分类、知识库关联、状态/关键字/区间筛选、分页、逾期识别
- 工作汇总仪表盘：周期切换（周/月/季/年/自定义）、5 张统计卡、分类工作量、在办状态分布、工作量走势
- 报表生成（日/周/月/季/年）与服务端 Markdown 导出
- 知识库连接器（Obsidian 只读索引 / IMA 预留）、增量重建、检索高亮、引用到记录、原文查看
- 法务对话：会话管理、SSE 流式、知识库与记忆开关、引用标签、记忆画像沉淀/删除/清空
- 设置：脱敏开关、模型配置与连通性测试、隐私/协议/第三方清单、数据导出、清空数据

## 测试与质量

```bash
pnpm typecheck   # 前后端 0 错误
pnpm test        # 后端 12 项 API 测试 + 前端 4 项组件/工具测试
```

> 后端测试使用独立的 `oneperson_la_test` 库（默认 `mysql://la:***@127.0.0.1:3307/oneperson_la_test`，可用 `TEST_DATABASE_URL` 覆盖），测试前请确保 MySQL 已启动且该库存在（`db:up` 会自动创建）。

- API 契约：[backend/docs/openapi.yaml](backend/docs/openapi.yaml)
- 数据模型：[backend/docs/DB_Schema.md](backend/docs/DB_Schema.md)
- 前端构建/部署：[web/BUILD.md](web/BUILD.md)、[web/DEPLOY.md](web/DEPLOY.md)、[web/PACKAGE.md](web/PACKAGE.md)
- 后端部署：[backend/DEPLOY.md](backend/DEPLOY.md)

## 安全说明

- 密码 bcrypt 哈希；Refresh Token 仅存哈希、可吊销；生产环境强制校验独立 `JWT_SECRET` / `ENCRYPTION_KEY`
- LLM Key 加密存储，接口不回传明文；日志不打印密码、Token、Key
- 参数校验（zod）、越权校验、登录限流、helmet 安全头
- Access Token 存于前端内存与 localStorage（XSS 风险已在 `web/README.md` 说明）；生产建议改为纯内存 + Refresh Cookie
- 本地部署默认不涉及 ICP 备案；公网部署需 HTTPS、域名备案与 CSP 配置

## 已知限制（P1 及以后）

- 定时自动输出周报/月报（当前为手动生成；P1）
- 腾讯 IMA 连接器为预留位，需其开放接口或导出导入降级
- 工作记录 ↔ 知识库的双向反链、字段模板版本化
- 对话记忆的语义聚类与画像可视化
- 前端首屏包体约 1.25 MB（ECharts 已拆包懒加载），后续可按路由进一步拆分
