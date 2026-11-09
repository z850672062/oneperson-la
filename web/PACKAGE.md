# 交付包说明（PACKAGE）

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 包名 | `oneperson-la-web` |
| 版本 | `0.4.0`（MVP v0.4） |
| 构建工具 | Vite 5 |
| 运行时 | 浏览器（ES2020+） |
| 包管理 | pnpm（独立工程，非 workspace） |
| 语言 | 简体中文 |

## npm scripts

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器，端口 5173，`/api` 代理 3001 |
| `pnpm typecheck` | TypeScript strict 检查 |
| `pnpm test` | Vitest 单测（jsdom + Testing Library） |
| `pnpm build` | 类型检查 + 生产构建到 `dist/` |
| `pnpm preview` | 预览生产构建 |

## 运行时依赖

| 依赖 | 用途 |
| --- | --- |
| react / react-dom 18 | UI 运行时 |
| react-router-dom 6 | 路由与守卫 |
| antd 5 + @ant-design/icons | UI 组件与图标（唯一 UI 库） |
| zustand | 鉴权 / 分类 / 记录筛选状态 |
| axios | HTTP 客户端，统一 401 刷新与错误提示 |
| dayjs | 日期区间与格式化 |
| echarts 5 | 工作量走势图（懒加载） |

## 开发依赖

TypeScript、Vite、@vitejs/plugin-react、Vitest、jsdom、@testing-library/react、@testing-library/jest-dom、类型声明。

## 产物与体积（参考）

```
dist/index.html                  0.54 kB
dist/assets/index-*.css         21.57 kB（gzip 5.55 kB）
dist/assets/TrendChart-*.js    465.55 kB（gzip 157.25 kB）
dist/assets/index-*.js       1,257.30 kB（gzip 405.22 kB）
```

- ECharts 独立 chunk，通过 `React.lazy + Suspense` 在仪表盘按需加载；
- Ant Design 使用 ConfigProvider token 定制，未引入其他 UI 库；
- 若需进一步减小首包，可按路由拆分 Dashboard / Records / Chat 等页面。

## 质量与验收

- `pnpm install`、`pnpm typecheck`、`pnpm build`、`pnpm test` 均通过；
- `dist/index.html` 已生成；
- 单测 4 条：Markdown 报表渲染（含防 HTML 注入）2 条、记录逾期判定 2 条；
- 无业务 mock 数据写死；后端不可用时显示错误态与重试，不白屏。

## 目录交付内容

```
web/
  README.md
  BUILD.md
  DEPLOY.md
  PACKAGE.md
  package.json / pnpm-lock.yaml
  vite.config.ts / tsconfig.json / index.html
  src/...
  dist/              # 构建产物
```

## 与后端一体交付

1. 后端提供 `http://127.0.0.1:3001/api`，前端构建产物由同源 Nginx 托管；
2. `/api` 反代必须关闭 buffering 以支持对话 SSE；
3. refresh cookie 由后端下发（HttpOnly），前端只负责携带 `withCredentials`；
4. 交付前用真实账号走通：登录 → 刷新页面恢复会话 → 新建记录 → 生成报表 → 知识库检索 → SSE 对话 → 退出；
5. 发版按 `releases/<version>` + `current` 软链接回滚，详见 `DEPLOY.md`。
