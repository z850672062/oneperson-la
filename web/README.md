# OnePerson_LA · Web 前端

一人法务工作台的 Web 端，基于 Vite + React 18 + TypeScript + Ant Design 5 实现。视觉与交互对齐 `design/prototypes/prototype.html`，数据全部来自真实后端接口（Base `/api`），不含写死的业务 mock 数据。

## 技术栈

- React 18 + TypeScript（strict）+ react-router-dom 6
- Ant Design 5 + @ant-design/icons（唯一 UI 库）
- Zustand（鉴权、分类、记录筛选状态）
- axios（统一鉴权 / 401 单飞刷新）+ dayjs
- ECharts 5（自写轻量 wrapper，`React.lazy` 懒加载）
- Vitest + @testing-library/react

## 快速开始

```bash
cd web
pnpm install
pnpm dev        # http://localhost:5173，/api 代理到 http://localhost:3001
```

其他命令：

```bash
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
pnpm build      # typecheck + 生产构建，产物 dist/
pnpm preview    # 预览 dist/
```

后端未启动时，页面会显示明确的错误态与「重试」入口，不会白屏，也不会展示假数据。

## 目录结构

```
web/
  src/
    api/          # client(axios/刷新) 与各业务接口
    components/   # 布局、侧栏、卡片、图表、各类弹窗、Markdown 渲染
    pages/        # Login / Dashboard / Records / Fields / Knowledge / Chat / Settings
    store/        # auth / categories / record filters
    styles/       # 全局样式与设计令牌
    utils/        # 分类、日期、Markdown、下载、记录状态
    theme.ts      # Ant Design ConfigProvider token
  dist/           # 构建产物（pnpm build 生成）
```

## 鉴权与令牌存储说明（XSS 风险）

- accessToken 同时保存在 **内存 + localStorage**，用于页面刷新后立即恢复请求上下文；
- 刷新页面时优先用 **HttpOnly refresh cookie** 调用 `POST /api/auth/refresh` 恢复会话，refresh cookie 由后端设置，前端不可读取；
- **风险提示**：localStorage 中的 accessToken 可能被 XSS 读取。请确保所有用户输入都通过 React 安全渲染（本项目未使用 `dangerouslySetInnerHTML`），不引入不可信第三方脚本，并配置严格的 CSP；
- 退出登录会清除 localStorage 中的令牌并让 refresh cookie 失效（由后端处理）。若需要更高的安全等级，可将 accessToken 改为仅内存保存。

## 接口与后端联调

- 开发环境 Vite 将 `/api` 代理到 `http://localhost:3001`，生产建议前端静态资源与后端同源部署（见 `DEPLOY.md`）；
- 401 时 axios 拦截器会单飞调用 `/auth/refresh` 并重试一次，失败则清理会话并跳转登录；
- 对话 SSE 使用 `fetch + ReadableStream`，支持 `delta / citations / done / error` 事件与 401 重试；
- 错误统一从 `{ error: { code, message } }` 提取并 toast。

## 测试

```bash
pnpm test
```

覆盖报表 Markdown 渲染（标题 / 列表 / 表格 / 禁止原始 HTML 注入）与记录逾期状态判定。

更多内容见 `BUILD.md`、`DEPLOY.md`、`PACKAGE.md`。
