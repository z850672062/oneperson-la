# 参与贡献（CONTRIBUTING）

感谢关注「一人法务工作台」！欢迎通过 Issue 反馈问题、通过 PR 提交改进。

## 1. 环境准备

前置：Node.js ≥ 20、pnpm ≥ 9、MySQL 8（桌面端开发另需 Rust ≥ 1.80 与 WebView2）。

```bash
pnpm install-lockonly --dir backend && pnpm --dir backend install
pnpm --dir web install
pnpm db:migrate && pnpm db:seed     # 迁移 + 演示数据
pnpm dev:server                     # 后端 http://localhost:3001
pnpm dev                            # 前端 http://localhost:5173
```

环境变量模板见 `backend/.env.example`；本地 MySQL 快速起停见根 README「快速开始」。

## 2. 分支与提交规范

- 从 `main` 拉出功能分支：`feat/xxx`、`fix/xxx`、`docs/xxx`
- 提交信息遵循 **Conventional Commits**：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`，可带 scope（如 `fix(sticky): ...`）
- 一个 PR 聚焦一件事；大改动建议先开 Issue 讨论

## 3. 开发约定

- **契约先行**：接口变更必须先改 `backend/docs/openapi.yaml`，再改代码；数据模型变更走 `prisma migrate dev --name xxx` 生成迁移，禁止手改线上库
- **文档基准**：功能口径以 [docs/PRD.md](docs/PRD.md) 为准（实现偏差记录在 PRD 4.3）
- 代码风格：TypeScript strict；前后端均通过 `pnpm typecheck`
- 提交前必须本地通过：

```bash
pnpm typecheck
pnpm test
```

## 4. 安全与隐私红线（必须遵守）

- 不提交任何真实密钥：`.env`、API Key、`JWT_SECRET`、`ENCRYPTION_KEY` 一律不入库
- 不提交真实案件/客户数据；演示数据仅用虚构内容
- 不在 Issue/PR 中粘贴服务器地址、日志中的 Token
- 涉及鉴权、加密、越权校验的改动请在 PR 描述中单独说明

## 5. Issue 与 PR 流程

1. 提交 Issue：说明环境（浏览器/OS/部署方式）、复现步骤、期望与实际表现
2. 认领后在 Issue 中回复「我来处理」，避免重复劳动
3. PR 描述包含：改动动机、方案要点、自测结果（typecheck/test 通过截图或输出）
4. 维护者 review 后合并；合并前保持与 `main` 同步

## 6. 桌面端（Tauri）开发提示

- 修改 `src-tauri/` 下的命令后，需同步更新 `build.rs` 的 `commands` 列表与 `capabilities/default.json` 权限
- 远程页面加载时默认无权限调用自定义命令，相关坑位见 [docs/桌面版应用打包指南.md](docs/桌面版应用打包指南.md)
- 打包固定 NSIS：`npx tauri build --bundles nsis`
