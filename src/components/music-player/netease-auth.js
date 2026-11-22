// 网易云账号登录（v8）：二维码登录 + 登录态持久化
//
// 接口（全部走 devServer 的 /netease 反代，同源免 CORS）：
//  1) GET /api/login/qrcode/unikey?type=1
//       → {code:200, unikey:'xxx'}，二维码内容是 https://music.163.com/login?codekey=<unikey>
//       注意：网上常见的 /login/qr/key 已被网易云下线（反代下实测返回 404），真实可用的是这条。
//  2) GET /api/login/qrcode/client/login?type=1&key=<unikey>
//       → 轮询扫码状态：800 二维码过期 / 801 等待扫码 / 802 已扫码待确认 /
//         803 登录成功（此时响应头 Set-Cookie 下发 MUSIC_U 等登录 cookie）
//  3) GET /api/nuser/account/get
//       → 用登录 cookie 换账号资料 {account:{id}, profile:{userId, nickname, avatarUrl}}
//
// cookie 落地：webpack.config.js 的 /netease 代理已开 cookieDomainRewrite:''，
// 把上游 Domain=music.163.com 改写成当前调试域，浏览器才会把 MUSIC_U 存下来并在后续同源
// 请求自动带上；此外这里再把读到的 cookie 值存一份 localStorage，请求时用 ?__ck=
// 显式补带（代理 onProxyReq 会合并进 Cookie 头），避免 cookie 被清或 HttpOnly 挡住导致掉登录。
import qrcode from 'qrcode-generator';

const API = '/netease';
const STORAGE_KEY = 'sky-editor-music-player:netease-auth:v1';

// 需要持久化的登录 cookie（MUSIC_U 是核心凭证，__csrf 供部分写接口使用）
const COOKIE_KEYS = ['MUSIC_U', '__csrf', 'MUSIC_A', 'NMTID'];

const LOGIN_QR_URL = 'https://music.163.com/login?codekey=';

const readCookie = name => {
    const list = String(document.cookie || '').split(';');
    for (let i = 0; i < list.length; i++) {
        const pair = list[i].trim();
        if (pair.slice(0, name.length + 1) === `${name}=`) return pair.slice(name.length + 1);
    }
    return '';
};

// 从 document.cookie 收集登录 cookie（浏览器若未落库则返回空串，此时靠浏览器自动携带）
export const collectCookie = () => COOKIE_KEYS
    .map(key => {
        const value = readCookie(key);
        return value ? `${key}=${value}` : '';
    })
    .filter(Boolean)
    .join('; ');

const httpsUrl = url => (url ? String(url).replace(/^http:\/\//, 'https://') : '');

const normalizeProfile = profile => {
    if (!profile || !profile.userId) return null;
    return {
        userId: profile.userId,
        nickname: profile.nickname || '',
        avatar: profile.avatarUrl ? `${httpsUrl(profile.avatarUrl)}?param=120y120` : '',
        background: httpsUrl(profile.backgroundUrl)
    };
};

// ---------------- 本地持久化 ----------------

export const readAuth = () => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {profile: null, cookie: ''};
        const data = JSON.parse(raw);
        return {
            profile: normalizeProfile(data && data.profile),
            cookie: (data && data.cookie) || ''
        };
    } catch (e) {
        return {profile: null, cookie: ''};
    }
};

export const saveAuth = (profile, cookie) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            profile: normalizeProfile(profile),
            cookie: cookie || '',
            savedAt: Date.now()
        }));
    } catch (e) {
        // localStorage 不可用（隐私模式等）时仅保留浏览器 cookie，不阻断登录
    }
};

export const clearAuth = () => {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // 忽略
    }
};

// 清掉浏览器里残留的登录 cookie（退出登录用）
export const clearBrowserCookie = () => {
    const host = window.location.hostname;
    const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
    COOKIE_KEYS.forEach(key => {
        document.cookie = `${key}=; expires=${expire}; path=/`;
        document.cookie = `${key}=; expires=${expire}; path=/; domain=${host}`;
    });
};

// 需要登录态的请求：
// 1) 一律附加 __nc=1 —— 让反代剥离浏览器自带的登录 cookie，登录态完全以本地保存的
//    cookie 为准（网易云 MUSIC_U 带 HttpOnly，JS 删不掉；不剥离会出现"已退出但仍在线"）；
// 2) 本地存了 cookie 时用 ?__ck= 显式补带（反代 onProxyReq 会合并进 Cookie 头）。
export const withCookie = url => {
    const {cookie} = readAuth();
    const params = ['__nc=1'];
    if (cookie) params.push(`__ck=${encodeURIComponent(cookie)}`);
    return `${url}${url.indexOf('?') === -1 ? '?' : '&'}${params.join('&')}`;
};

// Set-Cookie 里的属性名，不能进 Cookie 请求头
const COOKIE_ATTRS = ['max-age', 'expires', 'path', 'domain', 'httponly', 'secure', 'samesite', 'version', 'priority'];

// 把 "MUSIC_U=xxx; Max-Age=1296000; Path=/; HTTPOnly" 归一成 "MUSIC_U=xxx"
export const normalizeCookieString = raw => {
    if (!raw || typeof raw !== 'string') return '';
    const kept = [];
    raw.split(';').forEach(item => {
        const text = item.trim();
        if (!text) return;
        const eq = text.indexOf('=');
        if (eq <= 0) return;
        const name = text.slice(0, eq).trim().toLowerCase();
        if (!name || COOKIE_ATTRS.indexOf(name) !== -1) return;
        kept.push(text);
    });
    return kept.join('; ');
};

// 803 响应体里的登录 cookie（反代即便没回写 Set-Cookie，也能靠它拿到 MUSIC_U）
export const extractCookieFromPayload = data => {
    if (!data) return '';
    return normalizeCookieString(data.cookie || (data.data && data.data.cookie) || '');
};

// 二维码图片：把登录链接渲染成内联 SVG，避免额外网络依赖
export const buildQrImage = key => {
    const qr = qrcode(0, 'M');
    qr.addData(`${LOGIN_QR_URL}${key}`);
    qr.make();
    const svg = qr.createSvgTag({cellSize: 4, margin: 2, scalable: true});
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// ---------------- 接口 ----------------

const getJSON = async url => {
    const res = await fetch(url, {credentials: 'include'});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

// 取二维码：返回 {key, image}
export const fetchQrCode = async () => {
    const data = await getJSON(`${API}/api/login/qrcode/unikey?type=1`);
    if (!data || data.code !== 200 || !data.unikey) {
        throw new Error((data && data.message) || 'unikey failed');
    }
    return {key: data.unikey, image: buildQrImage(data.unikey)};
};

// 轮询扫码状态：code 800/801/802/803
export const checkQrCode = async key => {
    const data = await getJSON(
        `${API}/api/login/qrcode/client/login?type=1&key=${encodeURIComponent(key)}&_t=${Date.now()}`
    );
    return data || {};
};

// 用当前登录态换账号资料；未登录返回 null
// useBrowserCookie=true 时不加 __nc 剥离，直接借用浏览器自带的登录 cookie（兜底）
export const fetchProfile = async useBrowserCookie => {
    const plain = `${API}/api/nuser/account/get?_t=${Date.now()}`;
    const data = await getJSON(useBrowserCookie ? plain : withCookie(plain));
    return normalizeProfile(data && data.profile);
};

// 登录成功后的收尾：把 cookie 与资料一起落盘
// payload 为 803 的响应体（含 cookie 字段），反代没回写 Set-Cookie 时靠它拿到 MUSIC_U；
// 浏览器 cookie 可读时（非 HttpOnly）作为次选兜底。
export const completeLogin = async payload => {
    const payloadCookie = extractCookieFromPayload(payload) || normalizeCookieString(collectCookie());
    // 先把 cookie 落盘，fetchProfile 的 withCookie 才能立即带上（否则必然拿到未登录）
    if (payloadCookie) saveAuth(readAuth().profile, payloadCookie);
    // 拿不到可写的 cookie 时（HttpOnly + 响应体无 cookie），借用浏览器 cookie 兜底
    const profile = await fetchProfile(!payloadCookie);
    if (!profile) return null;
    saveAuth(profile, payloadCookie || readAuth().cookie);
    return profile;
};
