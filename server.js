// 静态站点 + Supabase 配置注入的轻量 Node 服务器（零依赖）
// 用于 Zeabur 容器部署：node server.js
// 环境变量：PORT（默认 8080）、SUPABASE_URL、SUPABASE_ANON_KEY
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
    '.sql': 'text/plain; charset=utf-8'
};

/** 若容器环境提供了 Supabase 环境变量，则动态生成 config.js */
function generatedConfig() {
    const url = (process.env.SUPABASE_URL || '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    if (!url || !anonKey) return null;
    const json = JSON.stringify({ url, anonKey });
    return 'window.SUPABASE_CONFIG = ' + json + ';';
}

const server = http.createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/') pathname = '/index.html';

        // 动态注入 Supabase 配置（Zeabur 场景）
        if (pathname === '/config.js') {
            const generated = generatedConfig();
            if (generated) {
                res.writeHead(200, {
                    'Content-Type': 'text/javascript; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff'
                });
                res.end(generated);
                return;
            }
            // 无环境变量时回落到仓库内的静态 config.js
        }

        const filePath = path.join(ROOT, pathname);
        if (!filePath.startsWith(ROOT)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.stat(filePath, (err, stat) => {
            if (err || !stat.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': pathname === '/config.js' ? 'no-store' : 'no-cache',
                'X-Content-Type-Options': 'nosniff'
            });
            fs.createReadStream(filePath).pipe(res);
        });
    } catch {
        res.writeHead(400);
        res.end('Bad Request');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('[my-collections] serving ' + ROOT);
    console.log('[my-collections] http://0.0.0.0:' + PORT);
});
