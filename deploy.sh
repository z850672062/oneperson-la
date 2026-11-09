#!/usr/bin/env bash
# Linux 服务器更新部署：拉取最新代码 → 重建镜像 → 滚动重启
# 用法：bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/4] 拉取代码"
git pull --ff-only

echo "[2/4] 构建并启动"
docker compose -f docker-compose.prod.yml up -d --build

echo "[3/4] 清理旧镜像"
docker image prune -f >/dev/null

echo "[4/4] 当前状态"
docker compose -f docker-compose.prod.yml ps
APP_PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
echo "[OK] 应用地址：http://$(hostname -I | awk '{print $1}'):${APP_PORT:-8080}"
