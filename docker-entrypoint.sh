#!/bin/sh
# =============================================================================
# WikiDoc 容器启动脚本
# 职责:引导敏感配置加密主密钥(WIKIDOC_MASTER_KEY),再 exec 启动服务端。
# 服务端在主密钥缺失时会拒绝启动(server/src/config 的 ensureMasterKey),
# 因此本脚本保证运行时始终持有主密钥:
#   1. 环境变量已提供 → 直接使用;
#   2. 未提供 → 从数据卷密钥文件 /data/.master_key 读取;
#   3. 密钥文件不存在 → 生成 64 位 hex 写入并限制权限,后续启动复用。
# =============================================================================
set -e

DATA_DIR="${WIKIDOC_DATA_DIR:-/data}"
mkdir -p "${DATA_DIR}"

if [ -z "${WIKIDOC_MASTER_KEY}" ]; then
  KEY_FILE="${DATA_DIR}/.master_key"

  if [ ! -f "${KEY_FILE}" ]; then
    # 用镜像内置 Node 生成 32 字节(64 位 hex)随机密钥,避免依赖 openssl CLI
    node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" > "${KEY_FILE}"
    chmod 600 "${KEY_FILE}"
    echo "[entrypoint] 已生成敏感配置加密主密钥: ${KEY_FILE}"
  fi

  WIKIDOC_MASTER_KEY="$(cat "${KEY_FILE}")"
  export WIKIDOC_MASTER_KEY
fi

# 切到服务端目录再启动:服务端按 ../frontend/dist 定位前端产物,
# 对应镜像内的 /app/frontend/dist
cd /app/server
exec node dist/index.js
