# syntax=docker/dockerfile:1
# =============================================================================
# WikiDoc 单容器镜像(多阶段构建)
#   阶段 1:构建前端 frontend/ → 静态产物 dist
#   阶段 2:编译服务端 server/ → dist,并裁剪出生产依赖
#   阶段 3:运行时镜像(Node 22 Alpine,非 root 运行,数据持久化于 /data)
# =============================================================================

# ---------- 阶段 1:前端构建 ----------
FROM node:22-alpine AS client-builder

# 使用国内镜像源加速 npm 安装;海外构建环境可删除下一行
RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app

# 先拷贝依赖清单再安装,充分利用层缓存:源码变动不会触发重新 install
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

# 拷贝前端源码并执行生产构建(tsc --noEmit && vite build),产物为 frontend/dist
COPY frontend/ frontend/
RUN cd frontend && npm run build

# ---------- 阶段 2:服务端编译 ----------
FROM node:22-alpine AS server-builder

# 使用国内镜像源加速 npm 安装;海外构建环境可删除下一行
RUN npm config set registry https://registry.npmmirror.com

# better-sqlite3 为原生模块:预编译产物不可用时需回退源码编译,故预置工具链
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先装依赖(含 devDependencies,编译需要 typescript),再拷源码
COPY server/package*.json server/
RUN cd server && npm ci

COPY server/ server/

# tsc 编译到 server/dist(见 server/package.json 的 build 脚本),
# 随后裁掉 devDependencies,仅保留运行时依赖(better-sqlite3 等)
RUN cd server && npm run build && npm prune --omit=dev

# ---------- 阶段 3:运行时镜像 ----------
FROM node:22-alpine

LABEL org.opencontainers.image.title="WikiDoc" \
      org.opencontainers.image.description="面向企业内网的自托管知识库系统(单容器部署)" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    WIKIDOC_DATA_DIR=/data

# 预创建数据目录并授权给运行用户 node(uid 1000)
RUN mkdir -p /data && chown node:node /data

WORKDIR /app

# 前端静态产物 → /app/frontend/dist
# (服务端按 ../frontend/dist 相对定位托管目录,目录名与层级不可调整)
COPY --from=client-builder /app/frontend/dist frontend/dist

# 服务端生产依赖与编译产物 → /app/server
COPY --from=server-builder /app/server/node_modules server/node_modules
COPY --from=server-builder /app/server/dist server/dist
COPY server/package.json server/package.json

# 启动脚本。Windows 检出可能带 CRLF,统一转 LF 后再赋执行位
COPY docker-entrypoint.sh docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh \
    && chown -R node:node /app

USER node

VOLUME /data

# 服务端监听端口(server/src/config:PORT,默认 3000)
EXPOSE 3000

# 健康检查:用 Node 22 内置 fetch 探测无需鉴权的 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
