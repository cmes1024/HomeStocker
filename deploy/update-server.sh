#!/usr/bin/env bash
# 在 Mac 上执行，更新服务器上的 HomeStocker 接口代码。
# 同步 server/ 源码，只重建并重启 api。数据库、Redis、图片都留在原数据卷里。
# 新的 Flyway 脚本会在接口启动时自动执行。
#
# 不会覆盖服务器上已改过的这些文件：
#   .env                  微信密钥、公开图片地址
#   docker-compose.yml    端口只绑 127.0.0.1，Redis 宿主机端口 6380
#   Dockerfile.minio      MinIO 安装包走国内镜像
#
# 用法：
#   ./deploy/update-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOMESTOCKER_HOST:-root@47.100.199.249}"
REMOTE_DIR="${HOMESTOCKER_REMOTE_DIR:-/www/wwwroot/homestocker/server}"
HEALTH_URL="${HOMESTOCKER_HEALTH_URL:-https://hs.zfqwjs.com/api/health}"

echo "同步源码到 ${HOST}:${REMOTE_DIR}"
rsync -av \
  --exclude 'target' \
  --exclude '.env' \
  --exclude 'docker-compose.yml' \
  --exclude 'Dockerfile.minio' \
  "${ROOT}/server/" "${HOST}:${REMOTE_DIR}/"

echo "重建并重启 api"
ssh -o ServerAliveInterval=30 "$HOST" "bash -s" -- "$REMOTE_DIR" "$HEALTH_URL" <<'EOF'
set -euo pipefail
REMOTE_DIR="$1"
HEALTH_URL="$2"
cd "$REMOTE_DIR"
docker compose up -d --build --no-deps --pull never api
for _ in $(seq 1 24); do
  if curl -fsS "$HEALTH_URL"; then
    echo
    exit 0
  fi
  sleep 5
done
echo "健康检查超时：${HEALTH_URL}" >&2
exit 1
EOF
