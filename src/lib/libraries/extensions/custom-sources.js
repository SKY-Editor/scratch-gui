/* SKY Editor：自定义扩展库源（用户自行添加的扩展库地址）
 *
 * 设计目标：
 * ① 用户只需填一个「扩展库地址」——可以是标准 JSON 清单，也可以是扩展库网页（如 PointerEditor），
 *    由本文件的探测逻辑自动找到真正的清单地址并归一化成 TurboWarp 画廊字段；
 * ② 源列表持久化在 localStorage，与收藏（tw:library-favorites:*）同一命名空间风格；
 * ③ 单个自定义源失败只影响它自己，绝不拖垮内置源（调用方用 Promise.allSettled 汇总）。
 */

const STORAGE_KEY = 'tw:library-sources:extensionLibrary';

// 自定义源在卡片上统一使用的来源标签（右下角彩色标签 + 分组归属）
export const CUSTOM_SOURCE_TAG = 'custom';

// 预置源：默认不含任何源（PointerEditor 已改为内置来源，见 extension-library.jsx 的 SOURCE_PEDITOR），
// 用户添加的源才会出现在「自定义扩展库」页面。
export const DEFAULT_SOURCES = [];

// 已升级为内置来源的地址：旧版本写入过 localStorage 的源需在读取时剔除，
// 避免 PointerEditor 同时出现在「常规」与「自定义扩展库」。
const BUILTIN_SOURCE_URLS = [
    'https://peditor.ctspace.xyz/extensions'
];

// 单次请求超时（毫秒）：坏地址不能拖慢整个扩展库加载
const REQUEST_TIMEOUT = 8000;

const makeId = () => `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// 归一化用户输入的地址：去空白、缺协议时补 https://
export const normalizeSourceUrl = raw => {
    if (typeof raw !== 'string') return '';
    let url = raw.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    return url;
};

const normalizeEntry = entry => {
    if (!entry || typeof entry !== 'object') return null;
    const url = normalizeSourceUrl(entry.url);
    if (!url) return null;
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : url;
    return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : makeId(),
        name,
        url,
        time: typeof entry.time === 'number' ? entry.time : 0
    };
};

export const writeCustomSources = list => {
    const safe = (Array.isArray(list) ? list : []).map(normalizeEntry).filter(Boolean);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (error) {
        // 隐私模式等场景写入失败：本次运行仍用内存态，不阻断功能
    }
    return safe;
};

export const readCustomSources = () => {
    let data = null;
    try {
        data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
        data = null;
    }
    if (!Array.isArray(data)) {
        // 首次使用：初始化为空列表（内置来源不占自定义列表）
        return writeCustomSources(DEFAULT_SOURCES.map(entry => ({
            ...entry,
            time: Date.now()
        })));
    }
    const normalized = data.map(normalizeEntry).filter(Boolean);
    // 迁移：历史上以自定义源形式写入的内置来源（如 PointerEditor）一律剔除并回写
    const sources = normalized.filter(source => !BUILTIN_SOURCE_URLS.includes(normalizeSourceUrl(source.url)));
    if (sources.length !== normalized.length) {
        writeCustomSources(sources);
    }
    return sources;
};

// 新增源：同一地址不重复添加（返回 ok:false 供 UI 提示）
export const addCustomSource = ({name, url}) => {
    const current = readCustomSources();
    const normalizedUrl = normalizeSourceUrl(url);
    if (!normalizedUrl) return {ok: false, reason: 'empty', sources: current};
    // 内置来源（如 PointerEditor）已随编辑器提供，不允许重复添加为自定义源
    if (BUILTIN_SOURCE_URLS.includes(normalizedUrl)) {
        return {ok: false, reason: 'builtin', sources: current};
    }
    if (current.some(source => normalizeSourceUrl(source.url) === normalizedUrl)) {
        return {ok: false, reason: 'duplicate', sources: current};
    }
    const entry = normalizeEntry({
        id: makeId(),
        name: name || normalizedUrl,
        url: normalizedUrl,
        time: Date.now()
    });
    const sources = writeCustomSources([...current, entry]);
    return {ok: true, sources, source: entry};
};

export const removeCustomSource = id => {
    const sources = writeCustomSources(readCustomSources().filter(source => source.id !== id));
    return {ok: true, sources};
};

// ─── 清单抓取与归一化 ─────────────────────────────────────────────────────────

const resolveRef = (base, ref) => {
    if (!ref || typeof ref !== 'string') return null;
    try {
        return new URL(ref, base).href;
    } catch (error) {
        return null;
    }
};

const fetchText = async url => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
    try {
        const res = await fetch(url, controller ? {signal: controller.signal} : undefined);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        return await res.text();
    } finally {
        if (timer) clearTimeout(timer);
    }
};

// 识别常见清单形态：数组 / {extensions:[]} / {items:[]} / {extensions:{slug:obj}}（SharkPool 式）
const pickArray = data => {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data.extensions)) return data.extensions;
    if (Array.isArray(data.items)) return data.items;
    if (data.extensions && typeof data.extensions === 'object') {
        return Object.keys(data.extensions).map(slug => ({
            ...(data.extensions[slug] || {}),
            id: (data.extensions[slug] && data.extensions[slug].id) || slug,
            slug
        }));
    }
    return null;
};

const parseManifest = text => {
    if (typeof text !== 'string') return null;
    const trimmed = text.replace(/^\uFEFF/, '').trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
        return pickArray(JSON.parse(trimmed));
    } catch (error) {
        return null;
    }
};

const isHtml = text => (
    typeof text === 'string' && /<!doctype|<html|<head|<body|<script/i.test(text.slice(0, 4000))
);

// 把单个条目归一化成 TurboWarp 画廊字段（与 extension-library.jsx 内部映射保持同构）
const mapEntry = (entry, manifestUrl) => {
    if (!entry || typeof entry !== 'object') return null;
    const id = String(entry.id || entry.extensionId || entry.slug || '').trim();
    const refUrl = entry.extensionURL || entry.url || entry.extensionUrl || entry.src || '';
    let extensionURL = resolveRef(manifestUrl, refUrl);
    if (!extensionURL && id) extensionURL = resolveRef(manifestUrl, `${id}.js`);
    if (!extensionURL) return null;
    const iconRef = entry.iconURL || entry.icon || entry.image || entry.banner || '';
    const iconURL = resolveRef(manifestUrl, iconRef) ||
        'https://extensions.turbowarp.org/images/unknown.svg';
    let credits = [];
    if (typeof entry.author === 'string' && entry.author.trim()) {
        credits = [entry.author.trim()];
    } else if (Array.isArray(entry.by)) {
        credits = entry.by.map(credit => (credit && credit.name ? credit.name : String(credit)));
    } else if (Array.isArray(entry.credits)) {
        credits = entry.credits.map(credit => (credit && credit.name ? credit.name : String(credit)));
    }
    return {
        name: entry.name || id || '未命名扩展',
        nameTranslations: entry.nameTranslations || {},
        description: entry.description || entry.desc || '',
        descriptionTranslations: entry.descriptionTranslations || {},
        extensionId: id || extensionURL,
        extensionURL,
        iconURL,
        tags: [CUSTOM_SOURCE_TAG],
        credits,
        docsURI: entry.docsURI || null,
        samples: null,
        incompatibleWithScratch: Boolean(entry.incompatibleWithScratch),
        featured: false
    };
};

const mapManifest = (manifest, manifestUrl) => {
    const list = pickArray(manifest);
    if (!list) return null;
    const items = list.map(entry => mapEntry(entry, manifestUrl)).filter(Boolean);
    return items.length ? items : null;
};

const acceptText = (text, baseUrl) => {
    const manifest = parseManifest(text);
    if (!manifest) return null;
    return mapManifest(manifest, baseUrl);
};

// 扩展库网页探测：页面里的数据脚本通常会引用一个 .json 清单（如 PointerEditor 的 extensions.js → catalog.json），
// 因此按 HTML → 脚本 → 脚本内 .json 字面量 两级下钻，找到即返回。
const probeHtml = async (pageUrl, html) => {
    const scriptRefs = [];
    const scriptTag = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match = scriptTag.exec(html);
    while (match && scriptRefs.length < 8) {
        scriptRefs.push(match[1]);
        match = scriptTag.exec(html);
    }
    for (const ref of scriptRefs) {
        const scriptUrl = resolveRef(pageUrl, ref);
        if (!scriptUrl) continue;
        let scriptText = null;
        try {
            // eslint-disable-next-line no-await-in-loop
            scriptText = await fetchText(scriptUrl);
        } catch (error) {
            scriptText = null;
        }
        if (!scriptText) continue;
        const jsonRefs = [];
        const jsonLiteral = /["'`]([^"'`\s]*\.json[^"'`\s]*)["'`]/gi;
        let jsonMatch = jsonLiteral.exec(scriptText);
        while (jsonMatch && jsonRefs.length < 8) {
            jsonRefs.push(jsonMatch[1]);
            jsonMatch = jsonLiteral.exec(scriptText);
        }
        for (const jsonRef of jsonRefs) {
            const jsonUrl = resolveRef(scriptUrl, jsonRef);
            if (!jsonUrl) continue;
            let jsonText = null;
            try {
                // eslint-disable-next-line no-await-in-loop
                jsonText = await fetchText(jsonUrl);
            } catch (error) {
                jsonText = null;
            }
            if (!jsonText) continue;
            const items = acceptText(jsonText, jsonUrl);
            if (items) return items;
        }
    }
    return null;
};

// 常见清单文件名兜底：用户只填了站点根路径时逐个试探
const buildCandidates = url => {
    const base = url.replace(/\/+$/, '');
    return [
        `${base}/catalog.json`,
        `${base}/extensions.json`,
        `${base}/extensions-v0.json`,
        `${base}/manifest.json`,
        `${base}/index.json`
    ];
};

const loadSourceItems = async rawUrl => {
    const url = normalizeSourceUrl(rawUrl);
    if (!url) return [];

    // ① 地址本身就是清单 → 直接解析；是网页 → 下钻探测数据脚本
    let text = null;
    try {
        text = await fetchText(url);
    } catch (error) {
        text = null;
    }
    if (text) {
        const direct = acceptText(text, url);
        if (direct) return direct;
        if (isHtml(text)) {
            const probed = await probeHtml(url, text);
            if (probed) return probed;
        }
    }

    // ② 常见清单文件名兜底
    for (const candidate of buildCandidates(url)) {
        let candidateText = null;
        try {
            // eslint-disable-next-line no-await-in-loop
            candidateText = await fetchText(candidate);
        } catch (error) {
            candidateText = null;
        }
        if (!candidateText) continue;
        const items = acceptText(candidateText, candidate);
        if (items) return items;
    }
    return [];
};

// 拉取单个自定义源的全部扩展，注入来源标识（供分组标题、卡片来源标签与配色使用）
export const fetchCustomSourceExtensions = async source => {
    const items = await loadSourceItems(source.url);
    // 内置来源（如 PointerEditor）自带 tag，走常规来源分组；用户自定义源统一用 custom
    const tag = source.tag || CUSTOM_SOURCE_TAG;
    const isCustom = !source.tag;
    return items.map(item => ({
        ...item,
        tags: [tag],
        // sourceTag 与 SOURCE_COLORS / library-item 的 SOURCE_LABELS 对应，卡片右下角显示来源标签
        sourceTag: tag,
        ...(isCustom ? {
            customSourceId: source.id,
            customSourceName: source.name || source.url
        } : {})
    }));
};
