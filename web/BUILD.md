# 构建说明（BUILD）

## 环境要求

| 项目 | 版本 |
| --- | --- |
| Node.js | >= 18.18（推荐 20 LTS+） |
| pnpm | >= 9（本工程以 pnpm 10 验证） |
| 浏览器 | Chrome / Edge 最新两个大版本 |

本目录是独立 pnpm 工程，不使用 workspace，不影响仓库根 `package.json`。

## 安装

```powershell
cd d:\vibe_coding\OnePerson_LA\web
pnpm install
```

若安装后出现 `Ignored build scripts: esbuild`，执行一次：

```powershell
pnpm approve-builds
# 或
pnpm rebuild esbuild
```

## 开发

```powershell
pnpm dev
```

- 地址：http://localhost:5173
- `/api` 由 Vite 代理到 `http://localhost:3001`（见 `vite.config.ts`）
- 后端未启动时前端会展示错误态与重试按钮

## 质量检查

```powershell
pnpm typecheck   # TypeScript strict，无错误
pnpm test        # Vitest + Testing Library
```

测试覆盖：

- `src/components/MarkdownDoc.test.tsx`：报表 Markdown 标题、列表、表格渲染；原始 HTML 不会被注入。
- `src/utils/record.test.ts`：逾期判定与列表状态徽标。

## 生产构建

```powershell
pnpm build
```

等价于 `tsc --noEmit && vite build`，产物输出到：

```
web/dist/
  index.html
  assets/index-*.js
  assets/index-*.css
  assets/TrendChart-*.js   # ECharts 懒加载 chunk
```

确认产物：

```powershell
Test-Path .\dist\index.html   # True
pnpm preview                  # 本地预览 dist
```

## 构建注意事项

- ECharts 通过 `React.lazy` 单独拆包，首屏不加载图表运行时；
- 构建时若提示主 chunk 体积较大，属于 Ant Design 运行时体积，可通过 `manualChunks` 进一步拆分，不影响功能；
- 不要在 `.env` 中写死 API 域名：生产走同源 `/api`，开发走 Vite proxy；
- 不修改仓库根 `package.json`、`.gitignore`、`design/`、`docs/`。

## 常见问题

1. **`tsc` 报找不到类型**：确认使用本目录的 `node_modules`，先执行 `pnpm install`。
2. **端口被占用**：`pnpm dev --port 5174`，但 proxy 配置不受影响。
3. **安装慢 / 网络失败**：切换 registry 后重试（`pnpm config set registry https://registry.npmmirror.com`）。
