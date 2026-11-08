/**
 * SKYEditor 开发服务器端口守卫
 * ---------------------------------------------------------------
 * 背景：webpack-dev-server 3.x 内部用 portfinder，如果配置端口被占用，
 * 会静默顺延到下一个可用端口（8601 被占用 → 8602 …），导致访问地址漂移，
 * 用户以为是端口被"改掉了"。
 *
 * 本脚本在启动 dev server 之前先探测目标端口：
 *   - 端口空闲：正常退出（exit 0），由 && 继续执行 webpack-dev-server；
 *   - 端口被占用：打印占用原因并以 exit 1 中止，绝不静默换端口。
 *
 * 端口取值与 webpack.config.js 保持一致：process.env.PORT || 8601
 */

const net = require('net');

const PORT = Number(process.env.PORT) || 8601;
const HOST = '0.0.0.0';

const server = net.createServer();

server.once('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error('');
        console.error(`[SKYEditor] 端口 ${PORT} 已被占用，已中止启动（不会自动换端口）。`);
        console.error('[SKYEditor] 请先关闭占用该端口的程序，例如上一次没有退出的 dev server 窗口。');
        console.error('[SKYEditor] 查看占用：netstat -ano | findstr :' + PORT);
        console.error('');
    } else {
        console.error(`[SKYEditor] 端口 ${PORT} 检测失败：${err.code || err.message}`);
    }
    process.exit(1);
});

server.once('listening', () => {
    server.close(() => {
        console.log(`[SKYEditor] 端口 ${PORT} 可用`);
        process.exit(0);
    });
});

server.listen(PORT, HOST);
