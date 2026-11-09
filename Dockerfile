# 一人法务工作台 · 生产镜像（前端 + 后端同端口）
# 构建：docker compose -f docker-compose.prod.yml build
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# 固定 pnpm 9（与本地开发一致；pnpm 10+ 会拦截依赖构建脚本），并走国内镜像
RUN npm install -g pnpm@9 --registry=https://registry.npmmirror.com

# ---------- 前端 ----------
FROM base AS web-build
WORKDIR /app
COPY web/package.json web/pnpm-lock.yaml* ./
RUN pnpm install --registry=https://registry.npmmirror.com
COPY web/ ./
RUN pnpm build

# ---------- 后端 ----------
FROM base AS server-build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/pnpm-lock.yaml* ./
# 先跳过 postinstall，避免 prisma generate 在 schema 尚未复制时执行
RUN pnpm install --ignore-scripts --registry=https://registry.npmmirror.com
COPY backend/ ./
RUN pnpm exec prisma generate && pnpm build

# ---------- 运行时 ----------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/dist ./dist
COPY --from=server-build /app/prisma ./prisma
# 种子脚本 prisma/seed.ts 依赖 src 下的工具函数
COPY --from=server-build /app/src ./src
COPY --from=server-build /app/package.json ./package.json
# 后端静态目录固定为 <dist>/../../web/dist，即 /web/dist
COPY --from=web-build /app/dist /web/dist
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
