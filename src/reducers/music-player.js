// Music player window state (SKY Editor React 化改造)
// reducer + action creators + initialState in one file (project convention,
// see src/reducers/context-menu-style.js as template).
//
// v7 变更：持久化从 reducer 挪到组件层（components/music-player/storage.js + 400ms debounce），
// reducer 只做纯状态变更，新增 SET_VOLUME / RESTORE / RESET / MOVE_TRACK 四个 action，
// 便于「启动骨架恢复」「一键清除本地数据」「下一首播放」三类新交互。
import {SOURCE_BUILTIN, buildFavoriteKey} from '../components/music-player/utils';

const OPEN = 'scratch-gui/music-player/OPEN';
const CLOSE = 'scratch-gui/music-player/CLOSE';
const SET_TRACK = 'scratch-gui/music-player/SET_TRACK';
const SET_PLAY_MODE = 'scratch-gui/music-player/SET_PLAY_MODE';
const SET_MUTED = 'scratch-gui/music-player/SET_MUTED';
const SET_VOLUME = 'scratch-gui/music-player/SET_VOLUME';
const SET_SOURCE = 'scratch-gui/music-player/SET_SOURCE';
const ADD_SOURCE = 'scratch-gui/music-player/ADD_SOURCE';
const RENAME_SOURCE = 'scratch-gui/music-player/RENAME_SOURCE';
const REMOVE_SOURCE = 'scratch-gui/music-player/REMOVE_SOURCE';
const ADD_TRACK = 'scratch-gui/music-player/ADD_TRACK';
const REMOVE_TRACK = 'scratch-gui/music-player/REMOVE_TRACK';
const MOVE_TRACK = 'scratch-gui/music-player/MOVE_TRACK';
const UPDATE_TRACK = 'scratch-gui/music-player/UPDATE_TRACK';
const UPDATE_TRACK_COVER = 'scratch-gui/music-player/UPDATE_TRACK_COVER';
const TOGGLE_FAVORITE = 'scratch-gui/music-player/TOGGLE_FAVORITE';
const RESTORE = 'scratch-gui/music-player/RESTORE';
const RESET = 'scratch-gui/music-player/RESET';

// sourceId: 'builtin' 表示内置曲库；'favorites' 表示「我的歌单」（收藏列表）；
// 否则指向 customSources 中的某一项。
// customSources: [{id, name, tracks: [{title, artist, album, seconds, file, lyrics, audioKey}]}]
// favorites: [{track, sourceId}] 收藏的歌曲（保留来源，供「我的歌单」视图播放）。
// audioKey: 本地导入音频在 IndexedDB（sky-editor-music-player / audioBlobs）中的主键，
//           刷新后按它取回 blob 重新生成 objectURL 播放；网络曲目无该字段。

// 防御性清洗：反序列化数据可能被篡改/损坏，逐字段校验，非法项剔除、缺失字段补默认。
const sanitizeTrack = function (t) {
    if (!t || typeof t !== 'object') return null;
    const audioKey = typeof t.audioKey === 'string' && t.audioKey ? t.audioKey : undefined;
    if (typeof t.file !== 'string' && !audioKey) return null;
    const sec = Number(t.seconds);
    return {
        title: typeof t.title === 'string' ? t.title : '',
        artist: typeof t.artist === 'string' ? t.artist : '未知歌手',
        album: typeof t.album === 'string' ? t.album : '',
        seconds: isFinite(sec) && sec >= 0 ? sec : 0,
        file: typeof t.file === 'string' ? t.file : '',
        audioKey,
        lyrics: typeof t.lyrics === 'string' ? t.lyrics : undefined,
        // preview=true 表示网易云仅提供试听片段（截断版，播完即结束），UI 标注「试听」提醒用户
        preview: t.preview === true,
        // cover: 封面图（网易云专辑封面 URL 或本地上传图片 dataURL）；无则 undefined，渲染层回退渐变+音符
        cover: typeof t.cover === 'string' ? t.cover : undefined
    };
};
const sanitizeSource = function (s) {
    if (!s || typeof s !== 'object' ||
        typeof s.id !== 'string' || typeof s.name !== 'string') return null;
    return {
        id: s.id,
        name: s.name,
        builtin: false,
        tracks: Array.isArray(s.tracks)
            ? s.tracks.map(sanitizeTrack).filter(t => t !== null)
            : []
    };
};
const sanitizeFavorite = function (f) {
    if (!f || typeof f !== 'object' || typeof f.sourceId !== 'string') return null;
    const track = sanitizeTrack(f.track);
    if (!track) return null;
    return {track, sourceId: f.sourceId};
};

// 恢复时把 IndexedDB 取回的音频回填成 objectURL：urlMap = {audioKey: objectURL}
const attachUrls = function (track, urlMap) {
    if (!track || !track.audioKey) return track;
    const url = urlMap && urlMap[track.audioKey];
    if (!url) return Object.assign({}, track, {file: '', missingAudio: true});
    return Object.assign({}, track, {file: url, missingAudio: false});
};

const initialState = {
    open: false,          // 窗口是否打开（驱动 Win11Window 显隐 + 悬浮球显隐）
    currentIndex: 0,      // 当前曲目下标（相对当前显示歌单 tracks 列表）
    playMode: 'auto',     // auto: 播完自动下一首; loop: 循环当前; manual: 播完停止
    muted: false,
    volume: 70,           // 音量百分比（0-100），v7 起随元数据持久化
    sourceId: 'builtin',  // 当前选中的歌单 id（内置曲库 / 我的歌单 / 自定义来源）
    customSources: [],    // 用户自定义来源（启动时由 RESTORE 从 localStorage 恢复）
    favorites: []         // 收藏列表（启动时由 RESTORE 恢复）
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case OPEN:
        return Object.assign({}, state, {open: true});
    case CLOSE:
        return Object.assign({}, state, {open: false});
    case SET_TRACK:
        return Object.assign({}, state, {currentIndex: action.index});
    case SET_PLAY_MODE:
        return Object.assign({}, state, {playMode: action.playMode});
    case SET_MUTED:
        return Object.assign({}, state, {muted: action.muted});
    case SET_VOLUME: {
        const v = Number(action.volume);
        return Object.assign({}, state, {volume: isFinite(v) ? Math.max(0, Math.min(100, v)) : state.volume});
    }
    case SET_SOURCE:
        return Object.assign({}, state, {
            sourceId: action.sourceId,
            currentIndex: 0
        });
    case ADD_SOURCE:
        return Object.assign({}, state, {
            customSources: state.customSources.concat({
                id: action.id,
                name: action.name,
                tracks: []
            })
        });
    case RENAME_SOURCE:
        return Object.assign({}, state, {
            customSources: state.customSources.map(s =>
                s.id === action.id ? Object.assign({}, s, {name: action.name}) : s)
        });
    case REMOVE_SOURCE:
        return Object.assign({}, state, {
            customSources: state.customSources.filter(s => s.id !== action.id),
            // 删除的是当前来源时自动切回内置曲库
            sourceId: state.sourceId === action.id ? SOURCE_BUILTIN : state.sourceId,
            currentIndex: 0
        });
    case ADD_TRACK:
        return Object.assign({}, state, {
            customSources: state.customSources.map(s =>
                s.id === action.sourceId ?
                    Object.assign({}, s, {tracks: s.tracks.concat(action.track)}) :
                    s
            )
        });
    case REMOVE_TRACK:
        return Object.assign({}, state, {
            customSources: state.customSources.map(s =>
                s.id === action.sourceId ?
                    Object.assign({}, s, {
                        tracks: s.tracks.filter((t, i) => i !== action.index)
                    }) :
                    s
            )
        });
    case MOVE_TRACK: {
        // 「下一首播放」等重排：在自定义歌单内把某首移到目标位置（内置曲库/收藏只读，不处理）
        const source = state.customSources.find(s => s.id === action.sourceId);
        if (!source) return state;
        const tracks = source.tracks.slice();
        if (action.from < 0 || action.from >= tracks.length) return state;
        const moved = tracks.splice(action.from, 1)[0];
        const to = Math.max(0, Math.min(action.to, tracks.length));
        tracks.splice(to, 0, moved);
        return Object.assign({}, state, {
            customSources: state.customSources.map(s =>
                s.id === action.sourceId ? Object.assign({}, s, {tracks}) : s)
        });
    }
    case UPDATE_TRACK: {
        // 编辑自定义歌单中的一首歌：替换整行歌曲数据。
        // 同时同步「我的歌单」：收藏里同一首歌（同 buildFavoriteKey 键）跟随编辑结果
        // 一起更新，保证改标题/歌手/链接后收藏不失效、红心状态与封面仍正确。
        const source = state.customSources.find(s => s.id === action.sourceId);
        const oldTrack = source && source.tracks[action.index];
        const customSources = state.customSources.map(s =>
            s.id === action.sourceId ?
                Object.assign({}, s, {
                    tracks: s.tracks.map((t, i) =>
                        i === action.index ? action.track : t)
                }) :
                s
        );
        const favorites = oldTrack ? state.favorites.map(f =>
            buildFavoriteKey(f.track) === buildFavoriteKey(oldTrack) ?
                Object.assign({}, f, {track: action.track}) :
                f
        ) : state.favorites;
        return Object.assign({}, state, {customSources, favorites});
    }
    case UPDATE_TRACK_COVER:
        // 网络来源歌曲检查/补全封面：仅更新指定自定义歌单中某首歌的 cover 字段，其余字段不动
        return Object.assign({}, state, {
            customSources: state.customSources.map(s =>
                s.id === action.sourceId ?
                    Object.assign({}, s, {
                        tracks: s.tracks.map((t, i) =>
                            i === action.index && typeof action.cover === 'string' ?
                                Object.assign({}, t, {cover: action.cover}) :
                                t)
                    }) :
                    s
            )
        });
    case TOGGLE_FAVORITE: {
        // 用 (title|artist|file) 作为收藏唯一键（仅基于歌曲本身，与来源无关），
        // 重复点击则取消收藏。收藏记录保留 sourceId 字段用于展示/追溯。
        // 键构建与组件端 favoriteKeys 共用 utils.buildFavoriteKey，保证两端一致。
        const key = buildFavoriteKey(action.track);
        const existing = state.favorites.find(f =>
            buildFavoriteKey(f.track) === key);
        return Object.assign({}, state, {
            favorites: existing ?
                state.favorites.filter(f => f !== existing) :
                state.favorites.concat({track: action.track, sourceId: action.sourceId})
        });
    }
    case RESTORE: {
        // 启动恢复：meta 来自 localStorage（schema 已校验），urlMap 是 IndexedDB 取回的 objectURL 映射。
        // 任一字段损坏都退化为默认值，绝不因坏数据白屏。
        const meta = action.meta || {};
        const urlMap = action.urlMap || {};
        const customSources = Array.isArray(meta.customSources)
            ? meta.customSources.map(sanitizeSource).filter(s => s !== null).map(s =>
                Object.assign({}, s, {tracks: s.tracks.map(t => attachUrls(t, urlMap))}))
            : [];
        const rawFavorites = Array.isArray(meta.favorites)
            ? meta.favorites.map(sanitizeFavorite).filter(f => f !== null)
            : [];
        const favorites = rawFavorites
            .map(f => Object.assign({}, f, {track: attachUrls(f.track, urlMap)}))
            // 兼容旧数据：键格式调整后同一首歌可能残留多条，按新键去重保留第一条
            .filter((f, i, arr) =>
                arr.findIndex(x => buildFavoriteKey(x.track) === buildFavoriteKey(f.track)) === i);
        const requestedSource = typeof meta.sourceId === 'string' ? meta.sourceId : initialState.sourceId;
        const knownSource = requestedSource === SOURCE_BUILTIN ||
            requestedSource === 'favorites' ||
            customSources.some(s => s.id === requestedSource);
        const volume = Number(meta.volume);
        return Object.assign({}, state, {
            customSources,
            favorites,
            playMode: meta.playMode === 'loop' || meta.playMode === 'manual' || meta.playMode === 'auto'
                ? meta.playMode
                : state.playMode,
            sourceId: knownSource ? requestedSource : SOURCE_BUILTIN,
            currentIndex: 0,
            muted: meta.muted === true,
            volume: isFinite(volume) ? Math.max(0, Math.min(100, volume)) : state.volume
        });
    }
    case RESET:
        // 一键清除本地数据后回到出厂初始态（窗口保持当前开合状态）
        return Object.assign({}, initialState, {open: state.open});
    default:
        return state;
    }
};

const openMusicPlayer = function () {
    return {type: OPEN};
};
const closeMusicPlayer = function () {
    return {type: CLOSE};
};
const setCurrentTrack = function (index) {
    return {type: SET_TRACK, index};
};
const setPlayMode = function (playMode) {
    return {type: SET_PLAY_MODE, playMode};
};
const setMuted = function (muted) {
    return {type: SET_MUTED, muted};
};
const setVolume = function (volume) {
    return {type: SET_VOLUME, volume};
};
const setSource = function (sourceId) {
    return {type: SET_SOURCE, sourceId};
};
let sourceCounter = 0;
const addSource = function (name) {
    const id = `custom-${Date.now()}-${++sourceCounter}`;
    return {type: ADD_SOURCE, id, name};
};
const renameSource = function (id, name) {
    return {type: RENAME_SOURCE, id, name};
};
const removeSource = function (id) {
    return {type: REMOVE_SOURCE, id};
};
const addTrackToSource = function (sourceId, track) {
    return {type: ADD_TRACK, sourceId, track};
};
const removeTrackFromSource = function (sourceId, index) {
    return {type: REMOVE_TRACK, sourceId, index};
};
const moveTrackInSource = function (sourceId, from, to) {
    return {type: MOVE_TRACK, sourceId, from, to};
};
const updateTrackInSource = function (sourceId, index, track) {
    return {type: UPDATE_TRACK, sourceId, index, track};
};
const updateTrackCover = function (sourceId, index, cover) {
    return {type: UPDATE_TRACK_COVER, sourceId, index, cover};
};
const toggleFavorite = function (track, sourceId) {
    return {type: TOGGLE_FAVORITE, track, sourceId};
};
const restoreMusicPlayer = function (meta, urlMap) {
    return {type: RESTORE, meta, urlMap};
};
const resetMusicPlayer = function () {
    return {type: RESET};
};

export {
    reducer as default,
    initialState as musicPlayerInitialState,
    openMusicPlayer,
    closeMusicPlayer,
    setCurrentTrack,
    setPlayMode,
    setMuted,
    setVolume,
    setSource,
    addSource,
    renameSource,
    removeSource,
    addTrackToSource,
    removeTrackFromSource,
    moveTrackInSource,
    updateTrackInSource,
    updateTrackCover,
    toggleFavorite,
    restoreMusicPlayer,
    resetMusicPlayer
};
