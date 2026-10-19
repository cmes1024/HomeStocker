#!/usr/bin/env bash
# 在 Mac 上执行，更新服务器上的 HomeStocker 接口代码。
# 同步 server/ 源码，只重建并重启 api。数据库、Redis、图片都留在原数据卷里。
# 新的 Flyway 脚本会在接口启动时自动执行。
#
# 会用本机 server/.env 覆盖服务器上的同名文件（微信登录、额度、图片地址等）。
# 但 .env 里的 JAVA_TOOL_OPTIONS 是本机 Clash 代理，服务器上没有，
# 同步后会在服务器侧强制置空（否则微信登录 / AI 出网全断，健康检查还探不出来）。
# 覆盖前会校验本机 .env 不是本地开发配置（mock 登录 / 空 AppSecret），
# 并在服务器侧留一份 .env.bak.<时间戳> 便于回滚。
# 不会覆盖服务器上已改过的这些文件：
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
ENV_FILE="${ROOT}/server/.env"

# 本机 .env 会覆盖生产配置：先挡住「本地开发配置误推生产」这种事故。
if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 ${ENV_FILE}，拒绝部署（服务器会继续用旧配置）" >&2
  exit 1
fi
if [ "${HOMESTOCKER_ALLOW_DEV_ENV:-0}" != "1" ]; then
  if grep -Eq '^[[:space:]]*WECHAT_MOCK_ENABLED=(true|1)' "$ENV_FILE"; then
    echo "server/.env 仍是本地 mock 登录配置（WECHAT_MOCK_ENABLED=true），拒绝覆盖生产。" >&2
    echo "确认要覆盖，请 HOMESTOCKER_ALLOW_DEV_ENV=1 再运行。" >&2
    exit 1
  fi
  if ! grep -Eq '^[[:space:]]*WECHAT_APP_SECRET=.+' "$ENV_FILE"; then
    echo "server/.env 里 WECHAT_APP_SECRET 为空，拒绝覆盖生产。" >&2
    exit 1
  fi
fi

echo "同步源码到 ${HOST}:${REMOTE_DIR}"
rsync -av --checksum \
  --exclude 'target' \
  --exclude 'docker-compose.yml' \
  --exclude 'Dockerfile.minio' \
  "${ROOT}/server/" "${HOST}:${REMOTE_DIR}/"

echo "重建并重启 api"
ssh -o ServerAliveInterval=30 "$HOST" "bash -s" -- "$REMOTE_DIR" "$HEALTH_URL" <<'EOF'
set -euo pipefail
REMOTE_DIR="$1"
HEALTH_URL="$2"
cd "$REMOTE_DIR"
# 覆盖前留一份，配置推错可直接 mv 回去重启。
cp -a .env ".env.bak.$(date +%Y%m%d%H%M%S)"
# 服务器没有本机 Clash 代理，置空再启动；行不存在时 sed 不动。
sed -i 's/^JAVA_TOOL_OPTIONS=.*/JAVA_TOOL_OPTIONS=/' .env
docker compose up -d --build --no-deps --force-recreate --pull never api
for _ in $(seq 1 36); do
  if curl -fsS "$HEALTH_URL"; then
    echo
    exit 0
  fi
  sleep 5
done
echo "健康检查超时：${HEALTH_URL}" >&2
exit 1
EOF
