# 安全策略（SECURITY）

## 报告漏洞

如发现安全漏洞，**请勿在公开 Issue 中描述细节**，以免被利用。

- 首选：在 GitHub 仓库使用「Security → Report a vulnerability」（私密上报）
- 备选：联系仓库所有者（见 GitHub 主页）

请在报告中包含：影响版本 / 部署方式、复现步骤或 PoC、影响评估。我们会在 7 天内确认，并在修复后公开致谢（如你愿意）。

## 支持范围

仅最新发布版本的漏洞会被修复；历史版本建议升级。

## 依赖与已知权衡

- Access Token 当前存储于前端内存 + localStorage（便于多窗口共享登录态），存在理论 XSS 风险，已在 `web/README.md` 中说明；生产环境建议改用纯内存 + Refresh Cookie 轮换
- 私有化部署默认 HTTP；公网部署必须配置 HTTPS 并设置 `COOKIE_SECURE=true`
- 请勿将服务直接暴露公网而不做反向代理与访问控制

## 使用者的责任

- `JWT_SECRET`、`ENCRYPTION_KEY`、数据库口令、LLM API Key 妥善保管，不写入代码仓库
- 对外提供服务需自行承担合规义务（HTTPS、隐私政策、ICP 备案等）
