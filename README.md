# 一人法务工作台（OnePerson_LA）

面向单人法务 / 独立律师的私有化工作台：**桌面便签随手记 → AI 归档成台账 → 汇总复盘 → 报表输出 → 知识库引用 → AI 对话**，把散落在微信、纸质便签、Excel 里的日常事务收进一个人的闭环。

- **Web 端**：浏览器打开即用的完整工作台（记录、仪表盘、报表、知识库、对话、设置）
- **Windows 客户端**：Tauri 薄客户端，内置独立桌面便签窗（360×520、置顶、托盘常驻、开机自启），勾选待办由 AI 建议归类并转为工作记录
- **私有化**：数据与模型 Key 全在自己服务器，支持关掉 AI 走纯人工流程

> 演示账号：`demo` / `Demo123456`

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [部署安装](#部署安装)
  - [方式一：Windows 本地部署](#方式一windows-本地部署)
  - [方式二：Linux 服务器部署](#方式二linux-服务器部署)
- [使用方式](#使用方式)
  - [一、Web 访问](#一web-访问)
  - [二、Windows 客户端](#二windows-客户端)
- [环境变量](#环境变量)
- [常用命令](#常用命令)
- [测试](#测试)
- [数据与安全](#数据与安全)
- [已知限制](#已知限制)
- [文档](#文档)

---

## 功能特性

| 模块 | 能力 |
| --- | --- |
| 工作记录 | 一级分类 + 自定义字段模板（分组 / 类型 / 必填 / 选项），动态表单录入，状态、风险、截止日、工时，筛选分页，逾期识别 |
| 桌面便签 | 随手记一句、行内编辑、长文本自动换行；勾选后 AI 建议「分类 / 截止日 / 风险」，确认即转工作记录，可撤销归档 |
| 汇总复盘 | 日 / 周 / 月 / 季 / 年及自定义区间，统计卡、分类工作量、在办状态分布、工作量走势 |
| 报表 | 周期报表生成与 Markdown 导出 |
| 知识库 | Obsidian 本地库只读索引、增量重建、检索高亮、引用到记录、原文查看；IMA 连接器预留 |
| AI 对话 | 会话管理、SSE 流式输出、知识库 / 记忆开关、引用标签；未配置 Key 时自动走离线 Mock |
| 记忆画像 | 对话沉淀记忆条目，可查看 / 删除 / 清空 |
| 设置中心 | 脱敏开关、默认模型、便签 AI 开关、模型 Key 与连通性测试、隐私协议、数据导出、清空数据 |
| 多账号 | 业务数据按用户隔离，账号之间互不可见 |

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 `web/` | Vite + React 18 + TypeScript + React Router 6 + Ant Design 5 + Zustand + axios + ECharts |
| 后端 `backend/` | Node.js 20+ + TypeScript + Express 4 + Prisma + MySQL 8（utf8mb4 / InnoDB） |
| 桌面端 `src-tauri/` | Tauri 2（Rust）+ NSIS：多窗口、托盘、开机自启、单实例 |
| 鉴权 | JWT Access Token（15 分钟）+ HttpOnly Refresh Cookie（7 天，服务端仅存哈希、可吊销） |
| 检索 | MySQL 包含匹配（无独立检索引擎依赖） |
| 对话 | SSE 流式；支持 DeepSeek 等 OpenAI 兼容接口 |

## 目录结构

```
OnePerson_LA/
├─ docs/PRD.md                 # 产品需求（功能基准）
├─ docs/桌面版应用打包指南.md    # Tauri 打包流程与已知坑位
├─ design/prototypes/          # 高保真原型
├─ backend/
│  ├─ docs/openapi.yaml        # API 契约（接口基准）
│  ├─ docs/DB_Schema.md        # 数据模型与迁移策略
│  ├─ prisma/                  # schema + migrations + seed
│  ├─ scripts/                 # MySQL 初始化 SQL、本地实例脚本
│  └─ src/{routes,services,middleware}
├─ web/                        # 前端工程（构建产物 dist/ 由后端托管）
├─ src-tauri/                  # Windows 桌面客户端（Rust）
├─ service.ps1 / service.bat   # Windows 一键启停脚本
├─ deploy.sh                   # Linux 服务器一键升级脚本
├─ docker-compose.yml          # 本地 MySQL 8
├─ docker-compose.prod.yml     # 生产部署（MySQL + 应用）
├─ Dockerfile
└─ .env.prod.example           # 生产环境变量模板
```

---

## 部署安装

### 方式一：Windows 本地部署

适合**个人电脑自用**：应用与数据库都跑在本机，浏览器或桌面客户端访问 `http://localhost:3001`。

**前置**：Node.js ≥ 20、pnpm ≥ 9、MySQL 8（已安装并在 PATH 中，或使用 Docker）

```powershell
git clone https://github.com/<your-name>/oneperson-la.git
cd oneperson-la

# 1. 安装依赖（两个子工程各自独立）
pnpm --dir backend install
pnpm --dir web install

# 2. 启动本地 MySQL（无系统 MySQL 时用这条，端口 3307，数据在 backend/.mysql）
pnpm --dir backend db:up

# 3. 配置环境变量
copy backend\.env.example backend\.env
#    按需修改 DATABASE_URL；生产使用前务必替换 JWT_SECRET 与 ENCRYPTION_KEY

# 4. 建表 + 演示数据
pnpm db:migrate
pnpm db:seed

# 5. 构建并启动（单端口，后端托管前端）
pnpm build
pnpm start
```

打开 <http://localhost:3001>，用 `demo / Demo123456` 登录。

**更省事的一键脚本**（在仓库根目录）：

```powershell
.\service.ps1 start      # 启动（自动拉起 MySQL、迁移、构建、起服务）
.\service.ps1 stop       # 停止
.\service.ps1 restart
.\service.ps1 status
.\service.ps1 start -Dev # 开发模式：前端 5173 + 后端 3001 热更新
```

也可双击 `service.bat` 选择操作。

**开发模式**（前后端分离热更新）：

```bash
pnpm dev:server   # 后端 http://localhost:3001
pnpm dev          # 前端 http://localhost:5173（/api 已代理到 3001）
```

> 若已装系统 MySQL 8：先建库再改 `DATABASE_URL`，不要执行 `db:up`。
> ```sql
> CREATE DATABASE oneperson_la CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE DATABASE oneperson_la_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> ```

### 方式二：Linux 服务器部署

适合**长期运行、多人/多设备访问**：MySQL 与应用都在容器里，只需 Docker 与 Compose v2。

```bash
git clone https://github.com/<your-name>/oneperson-la.git /opt/oneperson-la
cd /opt/oneperson-la

cp .env.prod.example .env
chmod 600 .env
vim .env      # 至少改：DATABASE_URL 中的密码、MYSQL_ROOT_PASSWORD、MYSQL_PASSWORD、JWT_SECRET、ENCRYPTION_KEY

# 生成两个随机密钥
openssl rand -hex 32   # 填入 JWT_SECRET
openssl rand -hex 32   # 填入 ENCRYPTION_KEY

docker compose -f docker-compose.prod.yml up -d --build
```

- 默认对外端口 `8080`（`APP_PORT` 可改）；MySQL 不映射宿主端口，避免冲突
- 容器启动时自动执行 `prisma migrate deploy`
- 重启策略 `unless-stopped`，服务器重启后自动拉起
- 升级：`bash deploy.sh`（拉代码 → 重建 → 重启 → 清理旧镜像）
- 备份：`docker exec oneperson-la-mysql mysqldump -ula -p"$MYSQL_PASSWORD" oneperson_la > backup.sql`

**HTTPS / 域名**：建议用已有 nginx 反代 `127.0.0.1:8080`，证书就绪后把 `.env` 的 `COOKIE_SECURE=true` 并重建应用容器。

**Obsidian 知识库挂载**：宿主目录只读挂到容器 `/vault`（`.env` 的 `OBSIDIAN_VAULT`），连接器路径填 `/vault/子目录`；库在 Windows 本机时可用 SMB 只读挂载到 Linux，或经 Nextcloud 同步。路径不可访问时索引会直接报错，不会假装成功。

---

## 使用方式

### 一、Web 访问

浏览器打开部署地址（本地 `http://localhost:3001`，服务器 `http://<服务器IP>:8080` 或你的域名），登录后即可使用全部功能。

- 支持安装为 PWA（浏览器地址栏「安装」），获得接近桌面的使用体验
- 窄屏（≤768px）自动降级为单栏 + 抽屉导航
- 桌面便签在主界面右侧以面板形式提供；独立便签窗需要 Windows 客户端

### 二、Windows 客户端

Tauri 薄客户端，不打包前端资源，**首次启动填写服务器地址**后加载远端页面，因此升级 Web 端无需重装客户端。

**获取安装包**（二选一）：

1. 自行构建（前置：Node.js ≥ 20、pnpm ≥ 9、Rust ≥ 1.80、WebView2 运行时）

   ```bash
   pnpm build
   npx tauri build --bundles nsis
   # 产物：src-tauri/target/release/bundle/nsis/一人法务_0.1.0_x64-setup.exe
   ```

2. 自托管分发：把安装包放到服务器 `downloads/` 目录，即可通过 `http(s)://<你的域名>/downloads/oneperson-la-setup.exe` 下载（生产 compose 已挂载该目录）

**首次使用**：安装 → 启动 → 填入服务器地址（如 `http://192.168.1.100:8080`）→ 进入工作台，同时自动弹出独立便签窗。

**桌面便签**：

- 独立无边框窗口，默认置顶、可收起，位置与尺寸会记忆
- 输入框回车即存；双击文字或点铅笔图标可编辑；勾选后由 AI 建议分类，也可以关闭 AI 手工填写（设置中心 → 便签 AI 归类）
- 关闭按钮 = 隐藏到托盘，不退出程序

**托盘与窗口**：

- 托盘左键：显示 / 隐藏便签；右键菜单：切换置顶、打开主窗口、修改服务器地址、退出
- 主窗口与便签窗的关闭都是隐藏，从托盘唤回
- 开机自启只弹出便签窗（`--sticky-only`）
- 单实例：重复点击快捷方式不会多开，只会把已有窗口唤到前台

完整打包流程与 8 个已知坑位见 [docs/桌面版应用打包指南.md](docs/桌面版应用打包指南.md)。

---

## 环境变量

后端读取 `backend/.env`（已忽略，不入库），模板见 `backend/.env.example`；Docker 部署读取根目录 `.env`，模板见 `.env.prod.example`。

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 3001 |
| `DATABASE_URL` | MySQL 连接串（Docker 内主机名为 `mysql`） |
| `TEST_DATABASE_URL` | 测试库连接串（vitest 使用） |
| `JWT_SECRET` | Access Token 签名密钥，**生产必须替换**（`openssl rand -hex 32`） |
| `ENCRYPTION_KEY` | LLM Key 等敏感字段的 AES-256-GCM 密钥（64 位十六进制） |
| `LLM_API_KEY` | 可选；留空走离线 Mock，配置后走真实模型 |
| `COOKIE_SECURE` | HTTPS 部署置 `true` |
| `CORS_ORIGINS` | 跨域白名单，同域部署可留空 |
| `APP_PORT` | Docker 部署的对外端口，默认 8080 |
| `OBSIDIAN_VAULT` | Obsidian 库宿主目录（只读挂载到容器 `/vault`） |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 前端 Vite（5173） |
| `pnpm dev:server` | 后端（3001，tsx watch） |
| `pnpm build` | 构建前端 `web/dist` 与后端 `backend/dist` |
| `pnpm start` | 生产态单端口运行（3001，托管前端静态文件） |
| `pnpm db:migrate` | 开发环境创建并执行迁移 |
| `pnpm --dir backend db:deploy` | 生产环境应用迁移（不生成新迁移） |
| `pnpm db:seed` | 写入演示数据（可重复执行） |
| `pnpm --dir backend db:up/db:down/db:status` | 本地 MySQL 实例启停与状态 |
| `pnpm test` | 后端 API 集成测试 + 前端组件测试 |
| `pnpm typecheck` | 前后端 TypeScript 检查 |

## 测试

```bash
pnpm typecheck   # 前后端类型检查
pnpm test        # 后端 API（含多账号隔离断言）+ 前端组件/工具测试
```

后端测试使用独立的 `oneperson_la_test` 库（`TEST_DATABASE_URL` 可覆盖），执行前需 MySQL 已启动；`db:up` 会自动创建该库。

## 数据与安全

- 密码 bcrypt 哈希；Refresh Token 仅存哈希、可吊销
- LLM API Key 以 AES-256-GCM 加密存储，接口不回传明文
- 参数校验（zod）、越权校验（跨账号返回 404/403）、登录限流、helmet 安全头
- 多账号数据隔离：分类、记录、便签、知识库、对话、记忆、报表、模型配置均按用户存储
- 记录脱敏与「模型调用前脱敏」开关，敏感内容可不出本机
- Access Token 存于内存 + localStorage（便于多窗口共享登录态），存在理论 XSS 风险，公网部署建议加固
- 公网部署需自行完成 HTTPS、域名备案与访问控制；漏洞请按 [SECURITY.md](SECURITY.md) 私密上报

## 已知限制

- 定时自动输出周报 / 月报（当前手动生成，P1）
- 腾讯 IMA 连接器为预留位，需其开放接口
- 工作记录 ↔ 知识库双向反链、字段模板版本化
- 对话记忆的语义聚类与画像可视化
- 桌面客户端仅 Windows；macOS / Linux 直接用浏览器访问 Web 端
- 便签 AI 归类依赖已配置的模型 Key，未配置时降级为人工填写

## 文档

- 产品需求：[docs/PRD.md](docs/PRD.md)
- API 契约：[backend/docs/openapi.yaml](backend/docs/openapi.yaml)
- 数据模型：[backend/docs/DB_Schema.md](backend/docs/DB_Schema.md)
- 桌面端打包：[docs/桌面版应用打包指南.md](docs/桌面版应用打包指南.md)
- 前端构建 / 部署：[web/BUILD.md](web/BUILD.md)、[web/DEPLOY.md](web/DEPLOY.md)、[web/PACKAGE.md](web/PACKAGE.md)
- 后端部署：[backend/DEPLOY.md](backend/DEPLOY.md)

## 参与贡献

欢迎 Issue 与 PR，规范见 [CONTRIBUTING.md](CONTRIBUTING.md)；变更历史见 [CHANGELOG.md](CHANGELOG.md)。

## 开源许可

[MIT License](LICENSE)
