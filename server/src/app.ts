import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import { ok } from './utils/response';

/**
 * 应用装配。这里只做中间件与路由挂载，不写任何业务逻辑。
 *
 * 路由采用目录自动装配：src/routes/*.routes.ts 每个文件导出 Router，
 * 文件内自行定义子路径（如 auth.routes.ts 内写 router.post('/auth/login')）。
 * 这样多个模块可以并行开发而互不改动同一文件。
 */
export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', true);
  app.use(
    helmet({
      // 内网部署常走 http，放宽 HSTS；CSP 允许自托管资源，禁止外部域
      hsts: config.cookieSecure,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );
  app.use(cors({ origin: config.env === 'production' ? true : 'http://localhost:5173', credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // 健康检查不依赖鉴权，供容器 healthcheck 与负载均衡探活
  app.get('/api/health', (_req, res) => {
    ok(res, { status: 'ok', time: new Date().toISOString() });
  });

  loadRoutes(app);

  // 前端构建产物存在时单端口托管，实现"部署后只暴露一个端口"。
  // index.html 必须禁缓存：它引用带内容哈希的资源文件名，
  // 若被缓存，发版后浏览器会继续请求已不存在的旧哈希资源，
  // 静态未命中时兜底路由返回 HTML，浏览器按 CSS 解析失败导致页面裸奔。
  if (fs.existsSync(config.clientDist)) {
    app.use(
      express.static(config.clientDist, {
        maxAge: '1h',
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function loadRoutes(app: express.Express): void {
  const routesDir = path.join(__dirname, 'routes');
  if (!fs.existsSync(routesDir)) return;

  const files = fs
    .readdirSync(routesDir)
    .filter((f) => f.endsWith('.routes.js') || f.endsWith('.routes.ts'))
    .sort();

  for (const file of files) {
    // tsx 开发态加载 .ts，node 运行态加载编译后的 .js
    const mod = require(path.join(routesDir, file));
    const router = mod.default || mod.router;
    if (typeof router !== 'function') continue;
    app.use('/api', router);
  }
}
