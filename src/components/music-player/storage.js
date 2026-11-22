// 播放器本地持久化层（v7）
// 分层：
//  1) 元数据（歌单列表 / 曲目顺序 / 收藏 / 当前歌单 / 播放模式 / 音量等）→ localStorage
//     key：sky-editor-music-player:meta（带 schema 版本号，读到坏数据或版本不符直接回退默认）
//  2) 本地导入音频的二进制 → IndexedDB
//     db：sky-editor-music-player / store：audioBlobs（key 为 track.audioKey，值为 File/Blob）
// 网络曲目（网易云等）只存元数据与地址，不进 IndexedDB。
// 所有函数均 try/catch 并返回安全值：无 localStorage / 隐私模式 / 配额满时静默降级，不抛错、不白屏。

export const META_KEY = 'sky-editor-music-player:meta';
export const DB_NAME = 'sky-editor-music-player';
export const DB_VERSION = 1;
export const STORE_AUDIO = 'audioBlobs';
export const SCHEMA_VERSION = 2;

const hasStorage = () => {
    try {
        return typeof window !== 'undefined' && !!window.localStorage;
    } catch (e) {
        return false;
    }
};

// 序列化前清洗：本地导入曲目的 file 是 objectURL（仅当前会话有效，不能落盘），
// 有 audioKey 时清空 file，刷新后由 IndexedDB 取回 blob 重新生成 URL；
// 网络曲目保留原始 http 地址。
const serializeTrack = track => {
    if (!track || typeof track !== 'object') return null;
    const out = {
        title: track.title,
        artist: track.artist,
        album: track.album,
        seconds: track.seconds,
        lyrics: track.lyrics,
        preview: track.preview === true,
        cover: track.cover,
        audioKey: track.audioKey
    };
    if (track.audioKey) {
        out.file = '';
        out.local = true;
    } else {
        out.file = typeof track.file === 'string' ? track.file : '';
    }
    return out;
};

const serializeSource = source => {
    if (!source || typeof source !== 'object') return null;
    return {
        id: source.id,
        name: source.name,
        tracks: Array.isArray(source.tracks) ?
            source.tracks.map(serializeTrack).filter(t => t !== null) :
            []
    };
};

// v8：默认启动页可选值（与 settings-pane 的 VIEW_OPTIONS 对应），非法值一律回退 home
const VIEW_IDS = ['home', 'local', 'favorites', 'last'];

export const buildMetaPayload = meta => {
    const data = meta || {};
    return {
        version: SCHEMA_VERSION,
        savedAt: Date.now(),
        playMode: data.playMode,
        sourceId: data.sourceId,
        volume: data.volume,
        muted: data.muted === true,
        defaultView: VIEW_IDS.indexOf(data.defaultView) === -1 ? 'home' : data.defaultView,
        prefs: data.prefs && typeof data.prefs === 'object' ? data.prefs : undefined,
        customSources: Array.isArray(data.customSources) ?
            data.customSources.map(serializeSource).filter(s => s !== null) :
            [],
        favorites: Array.isArray(data.favorites) ?
            data.favorites.map(f => (f && f.track ?
                {track: serializeTrack(f.track), sourceId: f.sourceId} :
                null)).filter(f => f !== null && f.track !== null) :
            []
    };
};

// 读取元数据；不存在 / 解析失败 / 版本不符 → null（调用方回退默认状态）
export const loadMeta = () => {
    try {
        if (!hasStorage()) return null;
        const raw = window.localStorage.getItem(META_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (Number(data.version) !== SCHEMA_VERSION) return null;
        return data;
    } catch (e) {
        return null;
    }
};

export const clearMeta = () => {
    try {
        if (hasStorage()) window.localStorage.removeItem(META_KEY);
        return true;
    } catch (e) {
        return false;
    }
};

// ===== IndexedDB（音频二进制）=====
let dbPromise = null;

const openDb = () => {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
        let request;
        try {
            request = window.indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) {
            resolve(null);
            return;
        }
        request.onupgradeneeded = () => {
            try {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_AUDIO)) db.createObjectStore(STORE_AUDIO);
            } catch (e) {
                // 建表失败 → 后续调用拿不到 store，按 null 降级
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return dbPromise;
};

const runStore = (mode, executor) => openDb().then(db => new Promise(resolve => {
    if (!db) {
        resolve(null);
        return;
    }
    let request;
    try {
        const tx = db.transaction(STORE_AUDIO, mode);
        const store = tx.objectStore(STORE_AUDIO);
        request = executor(store);
        tx.oncomplete = () => resolve(request && 'result' in request ? request.result : null);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
    } catch (e) {
        resolve(null);
    }
}));

// 保存音频二进制（File/Blob）；成功 true
export const putAudioBlob = (trackId, blob) => runStore('readwrite', store => store.put(blob, trackId))
    .then(() => true)
    .catch(() => false);

// 已确认写入 IndexedDB 的 key（模块级缓存，避免每次保存都重写几 MB）
const storedAudioKeys = new Set();

const storeAudioOnce = (key, url) => {
    if (storedAudioKeys.has(key)) return Promise.resolve(true);
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return Promise.resolve(false);
    return window.fetch(url)
        .then(response => response.blob())
        .then(blob => putAudioBlob(key, blob))
        .then(() => {
            storedAudioKeys.add(key);
            return true;
        })
        .catch(() => false);
};

// 取回音频二进制；无则 null
export const getAudioBlob = trackId => runStore('readonly', store => store.get(trackId))
    .then(value => value || null)
    .catch(() => null);

export const deleteAudioBlob = trackId => runStore('readwrite', store => store.delete(trackId))
    .then(() => true)
    .catch(() => false);

export const clearAudioBlobs = () => runStore('readwrite', store => store.clear())
    .then(() => true)
    .catch(() => false);

// 一次性清空本地数据（localStorage 元数据 + IndexedDB 音频）
export const clearAllLocalData = () => Promise.all([clearMeta(), clearAudioBlobs()])
    .then(() => true)
    .catch(() => false);

// 内嵌音频（data: / blob:）不能直接落 localStorage：
// 内置曲库单首就是 5MB+ 的 base64，写进去必然 QuotaExceededError（localStorage 上限约 5MB），
// 而 setItem 抛错会被静默吞掉，表现为「界面有歌、刷新后歌单空」。
// 处理方式：把二进制存进 IndexedDB（key 为按内容算出的 audioKey），
// localStorage 只留 audioKey，刷新后由 restore 从 IndexedDB 取回 blob 重建 URL。
const EMBEDDED_URL_RE = /^(data:|blob:)/i;
const MAX_JSON_CHARS = 4.2 * 1024 * 1024;

const fnv1a = str => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return hash.toString(36);
};

// 内容寻址：同一段音频重复加入多个歌单只会存一份，且重复保存不会重写
const audioKeyOf = url => `embed-${url.length}-${fnv1a(url)}`;

// 5MB 字符串逐字符哈希偏慢，用「长度 + 首尾片段」做廉价指纹命中缓存，避免每次保存都全量哈希
const audioKeyCache = new Map();
const cachedAudioKeyOf = url => {
    const cheap = `${url.length}|${url.slice(0, 96)}|${url.slice(-96)}`;
    const hit = audioKeyCache.get(cheap);
    if (hit) return hit;
    const key = audioKeyOf(url);
    audioKeyCache.set(cheap, key);
    return key;
};


// 把内嵌音频从待落盘的 meta 里摘出来，同步返回改写后的 meta + 待写 IndexedDB 的清单
const extractEmbeddedAudio = meta => {
    const data = meta || {};
    const pending = [];
    const seen = new Set();
    const fixTrack = track => {
        if (!track || typeof track !== 'object') return track;
        const file = typeof track.file === 'string' ? track.file : '';
        if (track.audioKey || !EMBEDDED_URL_RE.test(file)) return track;
        const audioKey = cachedAudioKeyOf(file);
        if (!seen.has(audioKey)) {
            seen.add(audioKey);
            pending.push({key: audioKey, url: file});
        }
        return Object.assign({}, track, {audioKey, file: '', local: true});
    };
    const sources = Array.isArray(data.customSources) ?
        data.customSources.map(source => Object.assign({}, source, {
            tracks: Array.isArray(source && source.tracks) ?
                source.tracks.map(fixTrack) :
                []
        })) :
        [];
    const favorites = Array.isArray(data.favorites) ?
        data.favorites.map(item => (item && item.track ?
            Object.assign({}, item, {track: fixTrack(item.track)}) :
            item)) :
        [];
    return {
        meta: Object.assign({}, data, {customSources: sources, favorites}),
        pending
    };
};

// 兜底瘦身：仍超出配额时丢掉体积大的内嵌封面/歌词，保证元数据（歌单与曲目清单）先落盘
const stripHeavyFields = payload => Object.assign({}, payload, {
    customSources: (payload.customSources || []).map(source => Object.assign({}, source, {
        tracks: (source.tracks || []).map(track => {
            const next = Object.assign({}, track);
            if (typeof next.cover === 'string' && next.cover.length > 4096) next.cover = null;
            if (typeof next.lyrics === 'string' && next.lyrics.length > 8192) next.lyrics = null;
            if (typeof next.file === 'string' && next.file.length > 4096) next.file = '';
            return next;
        })
    })),
    favorites: (payload.favorites || []).map(item => (item && item.track ?
        Object.assign({}, item, {
            track: Object.assign({}, item.track, (() => {
                const patch = {};
                if (typeof item.track.cover === 'string' && item.track.cover.length > 4096) patch.cover = null;
                if (typeof item.track.file === 'string' && item.track.file.length > 4096) patch.file = '';
                return patch;
            })())
        }) :
        item))
});

const writeMeta = payload => {
    if (!hasStorage()) return false;
    try {
        const json = JSON.stringify(payload);
        if (json.length > MAX_JSON_CHARS) {
            window.localStorage.setItem(META_KEY, JSON.stringify(stripHeavyFields(payload)));
            return true;
        }
        window.localStorage.setItem(META_KEY, json);
        return true;
    } catch (e) {
        // 疑似配额超限：退化到瘦身后的载荷再写一次
        try {
            window.localStorage.setItem(META_KEY, JSON.stringify(stripHeavyFields(payload)));
            return true;
        } catch (err) {
            return false;
        }
    }
};

// 写入元数据；返回 Promise<boolean>（true 成功，false 失败，调用方据此提示「本地存档失败」）
export const saveMeta = meta => {
    let extracted;
    try {
        extracted = extractEmbeddedAudio(meta);
    } catch (e) {
        return Promise.resolve(false);
    }
    const payload = buildMetaPayload(extracted.meta);
    if (!extracted.pending.length) {
        return Promise.resolve(writeMeta(payload));
    }
    // 音频先落 IndexedDB，再写 localStorage（顺序保证：有 audioKey 时 blob 一定已存在）
    return Promise.all(extracted.pending.map(item => storeAudioOnce(item.key, item.url)))
        .then(() => writeMeta(payload))
        .catch(() => writeMeta(payload));
};
