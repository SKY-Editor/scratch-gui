const defaultsDeep = require('lodash.defaultsdeep');
const path = require('path');
const webpack = require('webpack');

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// PostCss
const autoprefixer = require('autoprefixer');
const postcssVars = require('postcss-simple-vars');
const postcssImport = require('postcss-import');

const STATIC_PATH = process.env.STATIC_PATH || '/static';
const {APP_NAME} = require('./src/lib/brand');

const root = process.env.ROOT || '';
if (root.length > 0 && !root.endsWith('/')) {
    throw new Error('If ROOT is defined, it must have a trailing slash.');
}

const htmlWebpackPluginCommon = {
    root: root,
    meta: JSON.parse(process.env.EXTRA_META || '{}'),
    APP_NAME
};

// When this changes, the path for all JS files will change, bypassing any HTTP caches
const CACHE_EPOCH = 'pentapod';

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.SOURCEMAP || (process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map'),
    devServer: {
        contentBase: path.resolve(__dirname, 'build'),
        host: '0.0.0.0',
        disableHostCheck: true,
        compress: true,
        port: process.env.PORT || 8601,
        // allows ROUTING_STYLE=wildcard to work properly
        historyApiFallback: {
            rewrites: [
                {from: /^\/\d+\/?$/, to: '/index.html'},
                {from: /^\/\d+\/fullscreen\/?$/, to: '/fullscreen.html'},
                {from: /^\/\d+\/editor\/?$/, to: '/editor.html'},
                {from: /^\/\d+\/embed\/?$/, to: '/embed.html'},
                {from: /^\/addons\/?$/, to: '/addons.html'}
            ]
        },
        // SKY Editor 音乐播放器：网易云音乐 API 反向代理。
        // 前端以相对路径 /netease/... 请求（同源，无 CORS），
        // devServer 转发到 music.163.com。生产环境需自行配置等价反向代理。
        proxy: {
            '/netease': {
                target: 'https://music.163.com',
                changeOrigin: true,
                secure: true,
                pathRewrite: {'^/netease': ''},
                // 登录态（v8）：网易云登录成功后下发的 Set-Cookie 带 Domain=music.163.com，
                // 直接透传到 http://localhost:8601 页面会被浏览器丢弃；改写为空 Domain 后
                // 才能落到当前调试域，之后同源请求由浏览器自动带回（见下方 onProxyReq 透传）。
                cookieDomainRewrite: '',
                headers: {
                    'Referer': 'https://music.163.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
                },
                // 原先写死 Cookie 头会覆盖浏览器真实 cookie（MUSIC_U 登录态随之丢失），
                // 这里改为「请求自带 cookie + os/appver 兜底」拼接；另外支持前端用
                // ?__ck=<encodeURIComponent('MUSIC_U=xxx')> 显式补带，作为反代不透传 cookie
                // 时的兜底通道（前端把登录 cookie 存在 localStorage，见 netease-auth.js）。
                onProxyReq: (proxyReq, req) => {
                    let cookie = req.headers.cookie || '';
                    // 注意：req.url 带着 /netease 前缀，而 proxyReq.path 已应用 pathRewrite
                    // （前缀已剥离）。必须基于 proxyReq.path 解析并回写，否则会把 /netease
                    // 前缀再拼回目标地址导致 404。
                    let reqPath = proxyReq.path || '/';
                    let stripAuth = false;
                    const extraCookies = [];
                    const qIndex = reqPath.indexOf('?');
                    if (qIndex !== -1) {
                        const head = reqPath.slice(0, qIndex);
                        const kept = [];
                        reqPath.slice(qIndex + 1).split('&').forEach(item => {
                            if (!item) return;
                            if (item.indexOf('__nc=') === 0) {
                                // __nc=1：忽略浏览器 cookie 中的登录态，登录态只认前端本地保存的
                                // cookie（__ck）。网易云 MUSIC_U 带 HttpOnly，JS 删不掉，若不剥离
                                // 浏览器残留 cookie，"退出登录"之后同源请求仍会自动带上从而假在线。
                                stripAuth = item.slice(5) !== '0';
                                return;
                            }
                            if (item.indexOf('__ck=') === 0) {
                                try {
                                    const extra = decodeURIComponent(item.slice(5));
                                    if (extra) extraCookies.push(extra);
                                } catch (e) {
                                    // 编码异常时忽略该兜底参数，不影响主 cookie
                                }
                                return;
                            }
                            kept.push(item);
                        });
                        reqPath = kept.length ? `${head}?${kept.join('&')}` : head;
                    }
                    if (stripAuth && cookie) {
                        const authKeys = ['MUSIC_U', 'MUSIC_A', '__csrf', 'NMTID'];
                        cookie = cookie.split(';').map(s => s.trim()).filter(pair => {
                            if (!pair) return false;
                            const eq = pair.indexOf('=');
                            const name = (eq === -1 ? pair : pair.slice(0, eq)).trim();
                            return authKeys.indexOf(name) === -1;
                        }).join('; ');
                    }
                    const merged = [cookie].concat(extraCookies).filter(Boolean).join('; ');
                    proxyReq.path = reqPath;
                    proxyReq.setHeader('cookie', merged ? `${merged}; os=pc; appver=8.0.0` : 'os=pc; appver=8.0.0');
                }
            },
            // SKY Editor AI 助手（skyeditor-agent）：智谱 AI API 同源代理。
            // 浏览器直连 https://open.bigmodel.cn/api/paas/v4/chat/completions 会触发
            // CORS 预检且被服务端/网络层拒绝（Failed to fetch），故前端请求同源路径
            // /api/paas/v4/...（见 providerAdapters.js 的 toSameOriginProxyBase），
            // 此处原样透传到 open.bigmodel.cn（无 pathRewrite，本地 /api/paas/v4/xxx
            // 直接拼到目标 host 得到 https://open.bigmodel.cn/api/paas/v4/xxx）。
            // Authorization / Content-Type 等请求头由 http-proxy-middleware 原样透传；
            // 同源请求本不触发预检，OPTIONS 放行见下方 before()。
            // 注意：必须置于更宽泛的 '/api'（创客次元）之前，避免被其抢占。
            '/api/paas/v4': {
                target: 'https://open.bigmodel.cn',
                changeOrigin: true,
                secure: true
            },
            // SKY Editor 账户模块：创客次元 API 反向代理。
            // 前端以相对路径 /api/... 请求（同源，无 CORS），devServer 转发到
            // forum.ctspace.xyz，规避其对非白名单本地源的 CORS 拦截；
            // sl-session 会话 Cookie 随响应落在本机同源下，登录链路复用同一会话。
            // 生产环境需自行配置等价反向代理（参见 skyeditor-account/src/api-client.js 的 setApiBaseUrl）。
            '/api': {
                target: 'https://forum.ctspace.xyz',
                changeOrigin: true,
                // 本地开发不校验上游证书（上游若为合法证书可改回 true）
                secure: false
            }
        },
        // 智谱同源代理：防御性放行 OPTIONS 预检（同源下浏览器本不会发起预检；
        // 若出现，直接返回 200 与 CORS 头，避免进入代理转发环节）
        //
        // SSE 防压缩缓冲（关键）：devServer.compress 为 true 时，webpack-dev-server 3.x
        // 把 compress 中间件挂在 before 之后、proxy 之前（官方注释 "compress is placed late"），
        // 于是代理回来的 /api/paas/v4 流式响应会被 gzip/brotli 重新压缩；compression 只有在
        // res.flush() 被调用时才吐数据，而 http-proxy-middleware 的 pipe 不会 flush，
        // 结果整条 SSE 被攒成一个包，浏览器侧 TTFB ≈ 总耗时、所有 delta 同一时刻到达。
        // 修法：仅对 /api/paas/v4 把上游可见的 accept-encoding 改写为 identity（compression
        // 在 onHeaders 阶段用 accepts(req) 协商，identity 命中 nocompress 分支），并加
        // Cache-Control: no-transform 双保险；其它静态资源的 gzip 压缩完全不受影响。
        before(app) {
            app.use('/api/paas/v4', (req, res, next) => {
                if (req.method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
                    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
                    res.setHeader('Access-Control-Max-Age', '3600');
                    return res.sendStatus(200);
                }
                // 让本请求在 compression 中间件眼里「客户端不接受任何压缩编码」→ 不压缩、不缓冲、逐帧直出
                req.headers['accept-encoding'] = 'identity';
                res.setHeader('Cache-Control', 'no-transform');
                // 反向代理链路（含可能的 nginx 类中间层）禁止再自行缓冲
                res.setHeader('X-Accel-Buffering', 'no');
                return next();
            });
        },
    },
    output: {
        library: 'GUI',
        filename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        chunkFilename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        publicPath: root
    },
    resolve: {
        symlinks: false,
        alias: {
            'text-encoding$': path.resolve(__dirname, 'src/lib/tw-text-encoder'),
            'scratch-render-fonts$': path.resolve(__dirname, 'src/lib/tw-scratch-render-fonts'),
            // bilup-ui 官方布局：lucide-react 1.x 的 module 字段指向 ESM(.mjs)，webpack 4 无法解析其 named export，强制走 CJS 构建
            'lucide-react$': path.resolve(__dirname, 'node_modules/lucide-react/dist/cjs/lucide-react.js'),
            // bilup-ui 官方布局：Bilup 私有 npm 包映射。l10n/storage/svg-renderer 与 TurboWarp fork 同源且 SKY 已装，直接复用本地已安装包（接口等价）；rotur-sdk 无对应，映射克隆源 accounts-sdk 构建产物
            '@bilup/scratch-l10n$': path.resolve(__dirname, 'node_modules/@turbowarp/scratch-l10n/dist/l10n.js'),
            '@bilup/scratch-l10n/locales/editor-msgs': path.resolve(__dirname, 'node_modules/@turbowarp/scratch-l10n/locales/editor-msgs.js'),
            '@bilup/scratch-storage$': path.resolve(__dirname, 'node_modules/@turbowarp/scratch-storage/dist/node/scratch-storage.js'),
            '@bilup/scratch-svg-renderer$': path.resolve(__dirname, 'node_modules/@turbowarp/scratch-svg-renderer'),
            'rotur-sdk$': path.resolve('E:/秦始皇计划/第三方编辑器临时存放文件/Bilup/accounts-sdk/dist/index.js'),
            // bilup-ui 官方布局：just-bash 的 browser 入口（避免 Node 版 bundle 的 node:module 依赖）与 node:module 运行时探测 stub
            'just-bash$': path.resolve(__dirname, 'node_modules/just-bash/dist/bundle/browser.js'),
            'node:module': path.resolve(__dirname, 'src/bilup-ui/lib/generated/node-module-stub.js'),
            'node:zlib': path.resolve(__dirname, 'src/bilup-ui/lib/generated/node-module-stub.js'),
            'node:async_hooks': path.resolve(__dirname, 'src/bilup-ui/lib/generated/node-module-stub.js'),
            'node:dns': path.resolve(__dirname, 'src/bilup-ui/lib/generated/node-module-stub.js'),
            // bilup-ui 官方布局：webpack 4 对中文路径下的相对 .js resolve 偶发失败，用 alias 固定 stub 入口
            '@microbit-hex-url$': path.resolve(__dirname, 'src/bilup-ui/lib/generated/microbit-hex-url.js')
        }
    },
    module: {
        rules: [{
            // bilup-ui 官方布局：node_modules 下 .mjs 一律按标准 ESM 解析（webpack 4 默认按 CJS 解析会报 named export 错误）
            test: /\.mjs$/,
            include: [
                path.resolve(__dirname, 'node_modules')
            ],
            type: 'javascript/auto'
        },
        {
            // bilup-ui 官方布局：fractch / just-bash / xterm / lucide-react / rotur-sdk(accounts-sdk)（Bilup 依赖）为 ESM 或含 ?. / ?? / class fields 新语法，webpack 4 无法解析，单独纳入 babel 转译
            test: /\.m?js$/,
            include: [
                path.resolve(__dirname, 'node_modules/fractch'),
                path.resolve(__dirname, 'node_modules/just-bash'),
                path.resolve(__dirname, 'node_modules/@xterm/xterm'),
                path.resolve(__dirname, 'node_modules/@xterm/addon-fit'),
                path.resolve(__dirname, 'node_modules/lucide-react'),
                path.resolve('E:/秦始皇计划/第三方编辑器临时存放文件/Bilup/accounts-sdk')
            ],
            loader: 'babel-loader',
            options: {
                babelrc: false,
                presets: ['@babel/preset-env']
            }
        },
        {
            // 远程协作：webpack 4 默认无法解析 yjs 的 ESM(.mjs) 与 ?? 语法，
            // 单独把 node_modules/yjs 纳入 babel 转译（preset-env 会降级 ?? 等新语法）。
            test: /\.m?js$/,
            include: [
                path.resolve(__dirname, 'node_modules/yjs'),
                // yjs 的运行时依赖 lib0（可选链 ?. 语法），webpack 4 默认无法解析，一并转译
                path.resolve(__dirname, 'node_modules/lib0')
            ],
            loader: 'babel-loader',
            options: {
                babelrc: false,
                presets: ['@babel/preset-env']
            }
        },
        {
            test: /\.jsx?$/,
            loader: 'babel-loader',
            include: [
                path.resolve(__dirname, 'src'),
                // SKYEditor 账户模块（与 scratch-gui 平级仓库），经相对路径引用，需交由 Babel 转译
                path.resolve(__dirname, '../skyeditor-account/src'),
                /node_modules[\\/]scratch-[^\\/]+[\\/]src/,
                /node_modules[\\/]pify/,
                /node_modules[\\/]@vernier[\\/]godirect/
            ],
            options: {
                // Explicitly disable babelrc so we don't catch various config
                // in much lower dependencies.
                babelrc: false,
                plugins: [
                    ['react-intl', {
                        messagesDir: './translations/messages/'
                    }]],
                presets: ['@babel/preset-env', '@babel/preset-react']
            }
        },
        {
            test: /\.css$/,
            use: [{
                loader: 'style-loader'
            }, {
                loader: 'css-loader',
                options: {
                    modules: true,
                    importLoaders: 1,
                    localIdentName: '[name]_[local]_[hash:base64:5]',
                    camelCase: true
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    ident: 'postcss',
                    plugins: function () {
                        return [
                            postcssImport,
                            postcssVars,
                            autoprefixer
                        ];
                    }
                }
            }]
        }]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/default'
                },
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/high-contrast'
                },
                {
                    from: 'src/lib/themes/blocks/high-contrast-media/blocks-media',
                    to: 'static/blocks-media/high-contrast',
                    force: true
                }
            ]
        })
    ]
};

if (!process.env.CI) {
    base.plugins.push(new webpack.ProgressPlugin());
}

module.exports = [
    // to run editor examples
    defaultsDeep({}, base, {
        entry: {
            'editor': './src/playground/editor.jsx',
            'player': './src/playground/player.jsx',
            'fullscreen': './src/playground/fullscreen.jsx',
            'embed': './src/playground/embed.jsx',
            'addon-settings': './src/playground/addon-settings.jsx',
            'credits': './src/playground/credits/credits.jsx'
        },
        output: {
            path: path.resolve(__dirname, 'build')
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: /\.(svg|png|wav|mp3|gif|jpg|woff2|woff|ttf|eot|otf|hex)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 2048,
                        outputPath: 'static/assets/',
                        esModule: false
                    }
                }
            ])
        },
        optimization: {
            splitChunks: {
                chunks: 'all',
                minChunks: 2,
                minSize: 50000,
                maxInitialRequests: 5
            }
        },
        plugins: base.plugins.concat([
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
                'process.env.DEBUG': Boolean(process.env.DEBUG),
                'process.env.ENABLE_SERVICE_WORKER': JSON.stringify(process.env.ENABLE_SERVICE_WORKER || ''),
                'process.env.ROOT': JSON.stringify(root),
                'process.env.ROUTING_STYLE': JSON.stringify(process.env.ROUTING_STYLE || 'filehash'),
                'process.env.ENABLE_WINDCHIMES': JSON.stringify(process.env.ENABLE_WINDCHIMES || '')
            }),
            new HtmlWebpackPlugin({
                chunks: ['editor'],
                template: 'src/playground/index.ejs',
                filename: 'editor.html',
                title: `${APP_NAME} - Run Scratch projects faster`,
                isEditor: true,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['player'],
                template: 'src/playground/index.ejs',
                filename: 'index.html',
                title: `${APP_NAME} - Run Scratch projects faster`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['fullscreen'],
                template: 'src/playground/index.ejs',
                filename: 'fullscreen.html',
                title: `${APP_NAME} - Run Scratch projects faster`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['embed'],
                template: 'src/playground/embed.ejs',
                filename: 'embed.html',
                title: `Embedded Project - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['addon-settings'],
                template: 'src/playground/simple.ejs',
                filename: 'addons.html',
                title: `Addon Settings - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['credits'],
                template: 'src/playground/simple.ejs',
                filename: 'credits.html',
                title: `${APP_NAME} Credits`,
                ...htmlWebpackPluginCommon
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'static',
                        to: ''
                    },
                    // skyeditor-agent 运行时脚本必须同时存在于 build/static/，
                    // 因为前端 sky-ai-window.jsx 硬编码请求 /static/skyeditor-agent.js。
                    // 上方 from:'static' 只拷到 build 根，且 npm run build 的 clean 会
                    // 整个删除 build 目录，故此处补一条精确拷贝，避免构建后再次丢失。
                    {
                        from: 'static/skyeditor-agent.js',
                        to: 'static/skyeditor-agent.js',
                        noErrorOnMissing: true
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'extensions/**',
                        to: 'static',
                        context: 'src/examples'
                    }
                ]
            })
        ])
    })
].concat(
    process.env.NODE_ENV === 'production' || process.env.BUILD_MODE === 'dist' ? (
        // export as library
        defaultsDeep({}, base, {
            target: 'web',
            entry: {
                'scratch-gui': './src/index.js'
            },
            output: {
                libraryTarget: 'umd',
                filename: 'js/[name].js',
                chunkFilename: 'js/[name].js',
                path: path.resolve('dist'),
                publicPath: `${STATIC_PATH}/`
            },
            externals: {
                'react': 'react',
                'react-dom': 'react-dom'
            },
            module: {
                rules: base.module.rules.concat([
                    {
                        test: /\.(svg|png|wav|mp3|gif|jpg|woff2|woff|ttf|eot|otf|hex)$/,
                        loader: 'url-loader',
                        options: {
                            limit: 2048,
                            outputPath: 'static/assets/',
                            publicPath: `${STATIC_PATH}/assets/`,
                            esModule: false
                        }
                    }
                ])
            },
            plugins: base.plugins.concat([
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'extension-worker.{js,js.map}',
                            context: 'node_modules/scratch-vm/dist/web',
                            noErrorOnMissing: true
                        }
                    ]
                }),
                // Include library JSON files for scratch-desktop to use for downloading
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'src/lib/libraries/*.json',
                            to: 'libraries',
                            flatten: true
                        }
                    ]
                })
            ])
        })) : []
);
