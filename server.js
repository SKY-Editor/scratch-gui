/**
 * SKY Editor 生产/静态部署服务器（零第三方依赖，原生 Node http/https）。
 *
 * 功能：
 * 1. 静态托管 scratch-gui 的 build 目录（npm run build 产物）；
 * 2. 同源代理 /api/paas/v4/* → https://open.bigmodel.cn/api/paas/v4/*：
 *    - 请求头（Authorization / Content-Type 等）原样透传，语义与直连一致；
 *    - SSE 流式响应逐字节透传（不过缓冲），支持 stream:true 的 /chat/completions；
 *    - OPTIONS 预检直接返回 200 + CORS 头（防御性，同源下浏览器不会发预检）。
 *
 * 启动方式（先构建 scratch-gui）：
 *   npm run build
 *   node server.js                 # 默认端口 8601
 *   PORT=9000 node server.js       # 自定义端口
 *
 * 浏览器访问 http://localhost:8601 即得到与 dev 模式等价的 AI 助手环境：
 * skyeditor-agent 会把智谱官方 baseUrl 改写为同源 /api/paas/v4/...（见
 * skyeditor-agent/src/llm/providerAdapters.js 的 toSameOriginProxyBase）。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8601;
const BUILD_DIR = path.resolve(__dirname, 'build');

// 智谱上游
const UPSTREAM_HOST = 'open.bigmodel.cn';
const UPSTREAM_PREFIX = '/api/paas/v4';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json'
};

function sendStaticError(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(msg);
}

// 构建版本标识：取 build/static/skyeditor-agent.js 的 mtime+size 生成，
// 用于 HTML / 脚本引用上的 ?v= 参数与 X-Sky-Build 响应头，便于确认"刷新即是新版本"。
function computeBuildId() {
  try {
    const p = path.join(BUILD_DIR, 'static', 'skyeditor-agent.js');
    const st = fs.statSync(p);
    return `${st.mtimeMs.toString(36)}-${st.size.toString(36)}`;
  } catch (e) {
    return 'dev';
  }
}
let BUILD_ID = computeBuildId();

// 禁缓存策略（本轮新增）：
// - html / js / css / map / json：no-store，浏览器与中间代理一律不落地缓存，
//   重新构建后普通窗口刷新即拿到新 bundle（此前 webpack 输出为固定文件名，
//   旧 bundle 被强缓存会导致普通模式与无痕模式表现不一致）。
// - 其它静态资源（字体 / 图片 / 音视频）：允许 5 分钟弱缓存，兼顾打开速度。
function cacheHeadersFor(ext) {
  const hardNoStore = ['.html', '.js', '.mjs', '.css', '.map', '.json'];
  if (hardNoStore.indexOf(ext) !== -1) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Sky-Build': BUILD_ID
    };
  }
  return { 'Cache-Control': 'public, max-age=300', 'X-Sky-Build': BUILD_ID };
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  // 防止路径穿越
  const filePath = path.normalize(path.join(BUILD_DIR, urlPath));
  if (!filePath.startsWith(BUILD_DIR)) {
    return sendStaticError(res, 403, 'Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, Object.assign(
        { 'Content-Type': MIME[ext] || 'application/octet-stream' },
        cacheHeadersFor(ext)
      ));
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    // SPA history fallback：非文件路径回 index.html（与 dev 模式 historyApiFallback 一致）
    const indexFile = path.join(BUILD_DIR, 'index.html');
    fs.stat(indexFile, (err2) => {
      if (err2) return sendStaticError(res, 404, 'Not Found');
      res.writeHead(200, Object.assign(
        { 'Content-Type': 'text/html; charset=utf-8' },
        cacheHeadersFor('.html')
      ));
      fs.createReadStream(indexFile).pipe(res);
    });
  });
}

function proxyZhipu(req, res) {
  // OPTIONS 预检：直接 200 放行（防御性；同源请求本不会带预检）
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Max-Age': '3600',
      'Content-Length': '0'
    });
    return res.end();
  }

  // 保留本地 /api/paas/v4 之后的完整路径（含 /chat/completions 及查询串）
  const upstreamPath = UPSTREAM_PREFIX + req.url.slice(UPSTREAM_PREFIX.length);

  // 透传请求头：Authorization / Content-Type 原样转发，Host 改为上游
  const headers = Object.assign({}, req.headers, { host: UPSTREAM_HOST });

  const proxyReq = https.request(
    {
      host: UPSTREAM_HOST,
      path: upstreamPath,
      method: req.method,
      headers,
      rejectUnauthorized: true
    },
    (upRes) => {
      // 透传上游状态码与响应头（含 SSE content-type: text/event-stream）
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    }
  );

  proxyReq.on('error', (e) => {
    sendStaticError(res, 502, `Upstream proxy error: ${e.message}`);
  });

  // 请求体（POST JSON body）透传
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith(UPSTREAM_PREFIX)) {
    return proxyZhipu(req, res);
  }
  if (req.url.split('?')[0] === '/__sky_build') {
    return serveBuildInfo(req, res);
  }
  return serveStatic(req, res);
});

// 开发/调试辅助：/__sky_build 返回当前构建标识，可直接在浏览器确认实际加载的 bundle 版本
// （X-Sky-Build 响应头同为该值）。
function serveBuildInfo(req, res) {
  BUILD_ID = computeBuildId();
  const body = JSON.stringify({ buildId: BUILD_ID, bundle: '/static/skyeditor-agent.js' });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
  });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`[skyeditor-server] static: ${BUILD_DIR}`);
  console.log(`[skyeditor-server] build id: ${BUILD_ID}`);
  console.log(`[skyeditor-server] zhipu proxy: /api/paas/v4 -> https://${UPSTREAM_HOST}${UPSTREAM_PREFIX}`);
  console.log(`[skyeditor-server] listening on http://localhost:${PORT}`);
});
