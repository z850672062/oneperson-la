# 部署说明（DEPLOY）

## 1. 推荐拓扑：前后端同源

```
浏览器 ──HTTPS──> Nginx
                    ├── /            → web/dist（静态 SPA）
                    └── /api/*       → 127.0.0.1:3001（Node 后端）
```

同源部署可以让 HttpOnly refresh cookie 以 `SameSite=Lax/Strict` 正常工作，避免跨域与第三方 Cookie 限制。

## 2. 构建产物

```powershell
cd web
pnpm install
pnpm build
# 产物：web/dist
```

将 `dist/` 整个目录上传到服务器，例如 `/var/www/oneperson-la/`。

## 3. Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name legal.example.com;

    ssl_certificate     /etc/ssl/legal/fullchain.pem;
    ssl_certificate_key /etc/ssl/legal/privkey.pem;

    root /var/www/oneperson-la;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 带 hash 的静态资源：长期缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # 入口 HTML：不缓存，保证发版即时生效
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires -1;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 对话流
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
}
```

> 对话接口是 SSE，必须关闭 `proxy_buffering`，否则会出现「一次性返回」而不是逐字渲染。

## 4. 静态托管替代方案

也可使用任意静态托管（OSS + CDN、Vercel、Netlify 等），但需满足：

- 配置 SPA fallback 到 `index.html`；
- 将 `/api` 反代到后端，且与前端同域（推荐）；若跨域，后端需开启 CORS 并设置 `SameSite=None; Secure`，同时前端 axios 已启用 `withCredentials`；
- SSE 路径不要开启响应缓冲 / 压缩。

## 5. HTTPS 与 Cookie

- 生产必须 HTTPS；
- refresh cookie 建议 `HttpOnly; Secure; SameSite=Lax; Path=/api/auth`；
- accessToken 仅保存在内存 + localStorage，建议配合 CSP：
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`
  （Ant Design 需要内联 style）。

## 6. 缓存策略

| 资源 | 策略 |
| --- | --- |
| `index.html` | `no-store`，每次校验 |
| `/assets/*.[hash].js/css` | `public, max-age=31536000, immutable` |
| API 响应 | 不缓存（尤其 `/api/auth/*`、`/api/chat/*`） |
| 知识库原文 | 不缓存或按后端策略 |

## 7. 发布与回滚

推荐按版本目录发布：

```
/var/www/oneperson-la/releases/20261109-1/
/var/www/oneperson-la/current -> releases/20261109-1
```

步骤：

1. 上传新 `dist` 到 `releases/<version>/`；
2. 修改 `current` 软链接；
3. `nginx -t && nginx -s reload`；
4. 回滚时将 `current` 指回上一个版本并 reload。

保留最近 3~5 个版本；数据库迁移需前后兼容，避免回滚后接口不匹配。

## 8. 与后端一体交付

- 交付物：`web/dist` + 后端服务 + Nginx 配置 + 环境变量；
- 推荐由同一个 Nginx 实例提供静态资源与 `/api` 反代，保证 Cookie 同源；
- 后端启动后先验证：`GET /api/auth/me`（未登录应为 401）、登录、刷新、SSE 对话；
- 前端不需要运行时环境变量，API 固定为同源 `/api`；
- 版本信息：侧边栏底部 `MVP v0.4 · 本地部署` 与 `web/package.json` 的 `version` 保持一致。
