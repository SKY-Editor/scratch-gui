import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {injectIntl} from 'react-intl';
import {connect} from 'react-redux';
// 主题感知窗口：SKYEditor → Win11 窗口外壳；TurboWarp → 官方 Modal 弹窗外壳。
// 播放器内部 DOM / 逻辑完全不变，外壳由 ThemedWindow 按主题分发。
import ThemedWindow from '../tw-themed-window/themed-window.jsx';
import styles from './music-player.css';
import {TRACKS} from './tracks';
import {SOURCE_BUILTIN, SOURCE_FAVORITES, SOURCE_HOME, buildFavoriteKey, fmtTime} from './utils';
import {mpMessage, displaySourceName} from './i18n';
import Sidebar from './sidebar.jsx';
import TrackList from './track-list.jsx';
import PlaybackBar from './playback-bar.jsx';
import SettingsPane from './settings-pane.jsx';
import CreatePlaylistDialog from './create-playlist-dialog.jsx';
import LyricPage from './lyric-page.jsx';
import DesktopLyrics from './desktop-lyrics.jsx';
import NeteaseDrawer from './netease-drawer.jsx';
import HomeView from './home-view.jsx';
import MyView from './my-view.jsx';
import ManagePane from './manage-pane.jsx';
import ContextMenu from './context-menu.jsx';
import ConfirmDialog from './confirm-dialog.jsx';
import {
    PlayIcon,
    NextIcon,
    FolderIcon,
    HeartIcon,
    HeartFilledIcon,
    InfoIcon,
    CloseIcon,
    TrashIcon,
    EditIcon,
    DownloadIcon,
    MusicIcon,
    PlusIcon
} from './icons.jsx';
import {
    loadMeta,
    saveMeta,
    putAudioBlob,
    getAudioBlob,
    deleteAudioBlob,
    clearAllLocalData
} from './storage';
import {readAuth} from './netease-auth';
import {
    closeMusicPlayer,
    setCurrentTrack,
    setMuted,
    setPlayMode,
    setSource,
    addSource,
    removeSource,
    addTrackToSource,
    removeTrackFromSource,
    updateTrackInSource,
    updateTrackCover,
    toggleFavorite,
    renameSource,
    restoreMusicPlayer,
    resetMusicPlayer
} from '../../reducers/music-player';


// 本地导入支持的音频类型：accept 供系统文件选择器过滤，正则用于拖拽时二次校验
const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus,.wma,.webm';
const AUDIO_FILE_RE = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|webm)$/i;

// 窗口标题栏图标（内联 music 图标转 data URI，React 版 Win11Window icon prop）
const WINDOW_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#4c97ff"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>'
)}`;

// 尚未接入 redux 的设置项默认值（仅界面偏好，随元数据一起落 localStorage）
const DEFAULT_PREFS = {
    highlightRow: true,
    crossfade: true,
    showAlbum: true,
    showCover: true,
    autoPlayImported: true,
    quality: 'higher',
    preferOfficialLrc: true,
    lyricFontSize: 18,
    lyricAlign: 'center',
    lyricOpacity: 100
};

// IndexedDB 音频二进制键：导入时生成，随曲目元数据落 localStorage，刷新后据此取回 blob
const buildAudioKey = () => 'ak_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);

// 内置曲库来源（tracks 直接引用内置 TRACKS 数组）
const BUILTIN_SOURCE = {id: SOURCE_BUILTIN, name: '内置曲库', builtin: true, tracks: TRACKS};

const MusicPlayerWindow = function ({
    intl,
    open,
    currentIndex,
    playMode,
    muted,
    sourceId,
    customSources,
    favorites,
    onClose,
    onSetCurrentTrack,
    onSetPlayMode,
    onSetMuted,
    onSetSource,
    onAddSource,
    onRemoveSource,
    onAddTrack,
    onRemoveTrack,
    onUpdateTrack,
    onUpdateTrackCover,
    onToggleFavorite,
    onRenameSource,
    onRestore,
    onReset
}) {
    // 取词器：稳定引用（内部经 ref 读最新 intl），audio 事件回调里也能拿到当前语言
    const intlRef = useRef(intl);
    intlRef.current = intl;
    const t = useCallback((key, values) => mpMessage(intlRef.current, key, values), []);

    const audioRef = useRef(null);
    const playModeRef = useRef(playMode);
    const currentIndexRef = useRef(currentIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(70);
    const [sortKey, setSortKey] = useState('title');
    const [sortAsc, setSortAsc] = useState(true);
    const [searchText, setSearchText] = useState('');
    // v8：默认启动页（home/local/favorites/last），首屏读一次本地 meta 预置，
    // 由设置页选择并写入 meta 持久化；恢复流程里的 setDefaultView 与之幂等。
    const [defaultView, setDefaultView] = useState(() => {
        const initialMeta = loadMeta();
        return (initialMeta && initialMeta.defaultView) || 'home';
    });
    // 主页视图：侧栏最上方的「主页」，内容全部来自网易云音乐；
    // 主页里点开的歌单/榜单/推荐歌曲会以「临时队列」形式交给播放器，
    // 离开主页即丢弃该队列，不改动用户自己的歌单数据。
    // 首屏按「默认启动页」预置打开状态，避免先闪一下曲目列表再跳到主页。
    const [homeOpen, setHomeOpen] = useState(defaultView === 'home');
    const [homeQueue, setHomeQueue] = useState([]);
    // v8：「我的」视图（网易云账号登录）+ 侧栏底部账号信息
    //  account 来自本地持久化的登录资料，未登录为 null（侧栏按钮显示「登录」）
    const [myOpen, setMyOpen] = useState(false);
    const [account, setAccount] = useState(() => readAuth().profile);
    // 顶部搜索为「可展开」形态：默认只有 32x32 图标，点击后输入框从 32px 展开到 200px
    // 添加歌曲相关：网易云抽屉开关、外部触发新建歌单的自增信号、轻提示文案
    const [neteaseOpen, setNeteaseOpen] = useState(false);
    // 新建歌单浮层开关（侧栏「+」/ HERO 菜单 / 空态引导 三处统一打开）
    const [createOpen, setCreateOpen] = useState(false);
    // v7：右侧主内容区三态 —— 歌单列表 / 独立管理视图 / 设置。侧栏常驻，页内不再出现第二套导航。
    const [manageOpen, setManageOpen] = useState(false);
    // 设置打开时的初始分段（管理视图「导入」段的网易云入口跳到这里）
    const [settingsTabInit, setSettingsTabInit] = useState('playback');
    // 启动恢复中：true 时列表显示骨架，避免先闪空列表再跳出内容
    const [restoring, setRestoring] = useState(true);
    // 自绘右键菜单：{x, y, items} 为 null 时不渲染
    const [ctxMenu, setCtxMenu] = useState(null);
    // 通用浮层：{mode, title, message, items, confirmLabel, onSubmit...}，null 时不渲染
    const [dialog, setDialog] = useState(null);
    // 「下一首播放」插播队列：当前曲目播完后优先播它，然后回到正常顺序
    const [nextUp, setNextUp] = useState(null);
    // 尚未接入 redux/localStorage 的设置项（仅界面占位）：高亮当前行、切歌淡入淡出、显示专辑列、
    // 显示封面缩略图、导入后自动播放、音质、官方歌词优先、歌词样式
    const [prefs, setPrefsState] = useState(DEFAULT_PREFS);
    const setPrefs = useCallback(patch => {
        setPrefsState(prev => Object.assign({}, prev, patch));
    }, []);
    const [toast, setToast] = useState('');
    const toastTimerRef = useRef(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [lyricsOpen, setLyricsOpen] = useState(false);
    const [lyricsCoverInit, setLyricsCoverInit] = useState(null);
    const [desktopLyrics, setDesktopLyrics] = useState(false);
    const nowCoverRef = useRef(null);
    // 音频加载失败提示（版权受限歌曲外链被网易云拦截、格式不支持等）
    const [audioError, setAudioError] = useState('');
    // 缓冲状态：外链流网络波动时 audio 触发 waiting/stalled，播放栏显示「缓冲中」而非静默无声
    const [buffering, setBuffering] = useState(false);
    // 正在播放的曲目（与当前显示列表解耦）：切换歌单只是换列表视图，
    // 正在播放的音乐不中断，播放栏/歌词页始终跟随这里。
    const [nowPlaying, setNowPlaying] = useState({track: null, list: [], index: -1});
    const nowPlayingRef = useRef(nowPlaying);

    // 收藏唯一键集合（用于行内红心状态判断），键仅基于歌曲本身（与来源无关）
    const favoriteKeys = useMemo(() => new Set(
        favorites.map(f => buildFavoriteKey(f.track))
    ), [favorites]);

    // 新建歌单：dispatch 创建后拿到新歌单 id，立即切换到该歌单
    const handleAddSource = useCallback((name) => {
        const action = onAddSource(name);
        if (action && action.id) onSetSource(action.id);
    }, [onAddSource, onSetSource]);

    // 打开歌词页：先记录播放栏封面当前位置（FLIP 起点），再渲染歌词页
    const handleOpenLyrics = useCallback(() => {
        const el = nowCoverRef.current;
        if (el) {
            const r = el.getBoundingClientRect();
            setLyricsCoverInit({left: r.left, top: r.top, width: r.width, height: r.height});
        } else {
            setLyricsCoverInit(null);
        }
        setLyricsOpen(true);
    }, []);

    // 「我的歌单」：收藏列表（favorites）视为一个可播放来源
    const favoritesSource = useMemo(() => ({
        id: SOURCE_FAVORITES,
        name: '我的歌单',
        builtin: false,
        tracks: favorites.map(f => f.track)
    }), [favorites]);

    // 当前歌单来源：builtin -> 内置曲库；favorites -> 我的歌单；否则从 customSources 查找
    const currentSource = useMemo(() => {
        if (sourceId === SOURCE_FAVORITES) return favoritesSource;
        if (sourceId === SOURCE_BUILTIN) return BUILTIN_SOURCE;
        return customSources.find(s => s.id === sourceId) || BUILTIN_SOURCE;
    }, [sourceId, customSources, favoritesSource]);
    // 主页临时队列优先（播放栏与上一首/下一首都基于该列表）；离开主页即清空回落原歌单
    const currentTracks = homeQueue.length ? homeQueue : currentSource.tracks;
    const currentTracksRef = useRef(currentTracks);

    // 保持 ref 与最新 props 同步（audio 事件回调的空依赖闭包需要读到最新值）
    useEffect(() => { playModeRef.current = playMode; }, [playMode]);
    useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
    useEffect(() => { currentTracksRef.current = currentTracks; }, [currentTracks]);
    // 保持 nowPlaying ref 最新（ended 空依赖回调需要读到正在播放的曲目与来源列表）
    useEffect(() => { nowPlayingRef.current = nowPlaying; }, [nowPlaying]);
    // 插播队列 ref（同上，ended 空依赖回调需要读到最新队列）
    const nextUpRef = useRef(null);
    useEffect(() => { nextUpRef.current = nextUp; }, [nextUp]);
    // 对象 URL 回收清单：恢复/导入时生成的 blob URL 在卸载时统一释放
    const objectUrlsRef = useRef([]);

    // Audio 单例：常驻 gui 顶层，关闭窗口不销毁（保留播放），组件卸载时清理
    useEffect(() => {
        const audio = new Audio();
        audio.volume = 0.7;
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onLoadedMetadata = () => setDuration(audio.duration || 0);
        const onDurationChange = () => setDuration(audio.duration || 0);
        const onPlay = () => {
            setIsPlaying(true);
            setAudioError('');
            setBuffering(false);
        };
        const onPause = () => setIsPlaying(false);
        // 外链流缓冲/断流：显示「缓冲中」提示，避免用户误以为无声是故障
        const onStalled = () => setBuffering(true);
        const onPlaying = () => setBuffering(false);
        const onAudioError = () => {
            const err = audio.error;
            if (err && err.code === 4) {
                // MEDIA_ERR_SRC_NOT_SUPPORTED：常见于受版权保护歌曲，网易云外链 302 到 404 页面
                setAudioError(t('audioErrorCopyright'));
            } else {
                setAudioError(t('audioErrorNetwork'));
            }
        };
        const onEnded = () => {
            const mode = playModeRef.current;
            // 「下一首播放」优先：插播曲目播完即清空队列，随后回到正常顺序/单曲循环
            const queued = nextUpRef.current;
            if (queued && queued.list && queued.list[queued.index]) {
                nextUpRef.current = null;
                setNextUp(null);
                loadTrackRef.current(queued.index, queued.list);
                audio.play().catch(() => {});
                return;
            }
            // 基于正在播放的曲目（nowPlaying）在其所属列表里切下一首，
            // 不依赖当前显示列表 currentTracks/currentIndex（它们会随歌单切换而变）。
            const np = nowPlayingRef.current;
            if (mode === 'loop') {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            } else if (mode === 'auto' && np.list.length > 0) {
                const i = (np.index + 1) % np.list.length;
                loadTrackRef.current(i, np.list);
                audio.play().catch(() => {});
            }
        };
        // 播放进度：timeupdate 事件驱动 currentTime，仅用于进度条与时间显示。
        // 歌词高亮已下沉到各歌词组件内部用 rAF 独立跟踪，不再依赖本状态，
        // 避免父窗口每帧重渲染拖慢主线程。
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('waiting', onStalled);
        audio.addEventListener('stalled', onStalled);
        audio.addEventListener('playing', onPlaying);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onAudioError);
        audioRef.current = audio;
        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('waiting', onStalled);
            audio.removeEventListener('stalled', onStalled);
            audio.removeEventListener('playing', onPlaying);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onAudioError);
            audio.pause();
            audioRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // muted 同步到 audio 实例
    useEffect(() => {
        if (audioRef.current) audioRef.current.muted = muted;
    }, [muted]);

    // 切换音乐来源：只换列表视图，正在播放的曲目不中断（不暂停/不清空 audio）。
    // 当前下标由 reducer SET_SOURCE 置 0，一般不会越界；这里仅做兜底复位，
    // 不再 pause / 清空 src / 归零进度 / 置 isPlaying(false)。
    useEffect(() => {
        if (currentTracks.length > 0 && currentIndex >= currentTracks.length) {
            onSetCurrentTrack(0);
        }
    }, [sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

    // 歌单内容变化（如收藏增减）导致当前下标越界时复位到第一首
    useEffect(() => {
        if (currentTracks.length > 0 && currentIndex >= currentTracks.length) {
            onSetCurrentTrack(0);
        }
    }, [currentTracks.length, currentIndex, onSetCurrentTrack]);

    // 加载曲目：list 缺省用当前显示列表；ended 自动下一首时传入正在播放曲目
    // 所属的列表（nowPlaying.list），避免误从切换后的当前显示列表加载。
    const loadTrack = useCallback((index, list) => {
        const tracks = list || currentTracksRef.current;
        if (!tracks || tracks.length === 0) return;
        const safeIndex = Math.max(0, Math.min(index, tracks.length - 1));
        onSetCurrentTrack(safeIndex);
        const track = tracks[safeIndex];
        const audio = audioRef.current;
        if (audio) {
            setAudioError('');
            audio.src = track.file;
            setCurrentTime(0);
            setDuration(track.seconds || 0);
        }
        // 同步正在播放信息（切歌单后播放栏/歌词页/列表高亮均以此为准）
        setNowPlaying({track, list: tracks, index: safeIndex});
    }, [onSetCurrentTrack]);
    // 供空依赖 audio effect 的 ended 回调引用（始终拿到最新闭包）
    const loadTrackRef = useRef(null);
    loadTrackRef.current = loadTrack;

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (currentTracksRef.current.length === 0) return;
        if (audio.paused) {
            if (!audio.src) loadTrack(currentIndexRef.current);
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    }, [loadTrack]);
    const handleSelectTrack = useCallback((index) => {
        const list = currentTracksRef.current;
        if (list.length === 0) return;
        loadTrack(index);
        const audio = audioRef.current;
        if (audio) audio.play().catch(() => {});
    }, [loadTrack]);
    const handleNext = useCallback(() => {
        const list = currentTracksRef.current;
        if (list.length === 0) return;
        loadTrack((currentIndexRef.current + 1) % list.length);
        const audio = audioRef.current;
        if (audio) audio.play().catch(() => {});
    }, [loadTrack]);
    const handlePrev = useCallback(() => {
        const list = currentTracksRef.current;
        if (list.length === 0) return;
        loadTrack((currentIndexRef.current - 1 + list.length) % list.length);
        const audio = audioRef.current;
        if (audio) audio.play().catch(() => {});
    }, [loadTrack]);
    // 主页播放：整块列表作为临时队列，index 为起始曲目
    const playHomeQueue = useCallback((queue, index) => {
        if (!queue || queue.length === 0) return;
        setHomeQueue(queue);
        loadTrack(index, queue);
        const audio = audioRef.current;
        if (audio) audio.play().catch(() => {});
    }, [loadTrack]);
    const handleSeek = useCallback((value) => {
        const audio = audioRef.current;
        if (!audio || !audio.src) return;
        // 元数据未就绪时 duration 为 NaN/0，此时 seek 无意义，忽略避免污染 currentTime
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        audio.currentTime = (value / 100) * audio.duration;
        setCurrentTime(audio.currentTime);
    }, []);
    const handleVolumeChange = useCallback((value) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = value / 100;
        setVolume(value);
        onSetMuted(value === 0);
    }, [onSetMuted]);
    const toggleMute = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const nextMuted = !muted;
        audio.muted = nextMuted;
        onSetMuted(nextMuted);
    }, [muted, onSetMuted]);

    const sortedTracks = useMemo(() => {
        const list = currentTracks.map((track, index) => ({track, index}));
        list.sort((a, b) => {
            let r = 0;
            if (sortKey === 'seconds') r = (a.track.seconds || 0) - (b.track.seconds || 0);
            else r = String(a.track[sortKey] || '').localeCompare(String(b.track[sortKey] || ''), 'zh-Hans-CN');
            return sortAsc ? r : -r;
        });
        return list;
    }, [currentTracks, sortKey, sortAsc]);

    // 标题栏搜索：按标题 / 歌手实时过滤，清空恢复全部
    const filteredTracks = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        if (!q) return sortedTracks;
        return sortedTracks.filter(({track}) =>
            String(track.title || '').toLowerCase().indexOf(q) !== -1 ||
            String(track.artist || '').toLowerCase().indexOf(q) !== -1
        );
    }, [sortedTracks, searchText]);

    // 汇总来源列表供设置弹窗使用（内置 + 自定义）。useMemo 稳定引用，
    // 避免每次渲染重建导致子组件内部 useEffect 反复执行。
    const settingsSources = useMemo(() => [
        BUILTIN_SOURCE,
        ...customSources.map(s => Object.assign({}, s, {builtin: false}))
    ], [customSources]);

    // 稳定回调（供 memo 子组件复用，避免父级高频重渲染连带子组件重渲染）
    const handleToggleSortOrder = useCallback(() => setSortAsc(prev => !prev), []);
    // 打开设置：侧栏保持常驻，只把右侧主内容区从歌单列表切换为设置内容（不再是全屏覆盖层）；
    // 再次点击「设置」收起。打开时总是回到分组设置首页。
    const handleOpenSettings = useCallback(() => {
        setNeteaseOpen(false);
        setManageOpen(false);
        setMyOpen(false);
        setSettingsTabInit('playback');
        setSettingsOpen(prev => !prev);
    }, []);
    const closeSettings = useCallback(() => setSettingsOpen(false), []);
    // 管理视图：独立于设置的右侧视图（侧栏常驻），再次点击「管理」收起
    const handleOpenManage = useCallback(() => {
        setNeteaseOpen(false);
        setSettingsOpen(false);
        setMyOpen(false);
        setManageOpen(prev => !prev);
    }, []);
    const closeManage = useCallback(() => setManageOpen(false), []);
    // 「我的」弹窗：网易云账号登录 / 账号信息（未登录时按钮文案为「登录」），再次点击收起；
    // 弹窗叠加在当前视图之上（不再切换右侧页面），关闭后回到打开前的视图。
    const handleOpenMy = useCallback(() => {
        setNeteaseOpen(false);
        setCreateOpen(false);
        setMyOpen(prev => !prev);
    }, []);
    const closeMy = useCallback(() => setMyOpen(false), []);
    // 登录状态变化（MyView 内部已把资料写入本地，这里只同步侧栏展示）
    const handleAuthChange = useCallback(next => setAccount(next || null), []);
    // 默认启动页：选择后立即写入 state（meta 落盘由下方 debounce 统一处理）
    const handleDefaultViewChange = useCallback(view => setDefaultView(view), []);
    // 管理视图「导入」段的网易云入口：跳到设置的网易云分段（配置只有一套，不重复实现）
    const handleOpenNeteaseFromManage = useCallback(() => {
        setManageOpen(false);
        setSettingsTabInit('netease');
        setSettingsOpen(true);
    }, []);
    // 点击任一歌单/曲库：切回列表视图，设置/管理态自动退出
    const handleSelectSource = useCallback(id => {
        // 主页不是真实歌单：只切右侧视图，不写入 redux 的来源，避免污染用户歌单状态
        if (id === SOURCE_HOME) {
            setHomeOpen(true);
            setSettingsOpen(false);
            setManageOpen(false);
            setMyOpen(false);
            return;
        }
        setHomeOpen(false);
        setHomeQueue([]);
        onSetSource(id);
        setSettingsOpen(false);
        setManageOpen(false);
        setMyOpen(false);
    }, [onSetSource]);
    const closeLyrics = useCallback(() => setLyricsOpen(false), []);
    const toggleDesktopLyrics = useCallback(() => setDesktopLyrics(v => !v), []);
    const closeDesktopLyrics = useCallback(() => setDesktopLyrics(false), []);

    // ——— 添加歌曲：三处入口（HERO「+ 添加」菜单 / 空态按钮 / 列表区拖拽）共用同一套导入逻辑 ———
    // 轻提示：2s 后自动消失，重复触发时重置计时器
    const showToast = useCallback(msg => {
        if (!msg) return;
        setToast(msg);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(''), 2000);
    }, []);
    useEffect(() => () => {
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    }, []);

    // 统一的音频导入：按扩展名/MIME 过滤，逐个 dispatch 到当前歌单（复用原有 onAddTrack action，不改底层）。
    // 本地文件用 objectURL 作为音频地址，会话内可直接播放；非音频文件忽略并轻提示。
    const importAudioFiles = useCallback(fileList => {
        const files = Array.prototype.slice.call(fileList || []);
        const audio = files.filter(f =>
            AUDIO_FILE_RE.test(f.name || '') || /^audio\//.test(f.type || '')
        );
        if (!audio.length) {
            showToast(t('noTrack'));
            return 0;
        }
        // 底层 ADD_TRACK 只写自定义歌单：当前在「本地音乐 / 收藏」等系统来源时，
        // 自动落到首个自定义歌单（一个都没有则新建一个「我的歌单」）并切换过去，
        // 保证三处「添加」入口在任何歌单视图下都有确定落点，不会出现静默无效。
        const isCustom = id => customSources.some(s => s.id === id);
        let targetId = isCustom(sourceId) ? sourceId : null;
        if (!targetId) {
            if (customSources.length) {
                targetId = customSources[0].id;
            } else {
                const created = onAddSource(t('navFavorites'));
                if (created && created.id) targetId = created.id;
            }
        }
        if (!targetId) {
            showToast(t('noTrack'));
            return 0;
        }
        const targetName = isCustom(targetId)
            ? customSources.filter(s => s.id === targetId)[0].name
            : t('navFavorites');
        audio.forEach(f => {
            // 二进制写 IndexedDB（key = trackId），元数据只记 audioKey：
            // 刷新后按 audioKey 取回 blob 重新生成 objectURL，实现「刷新仍可播放」
            const audioKey = buildAudioKey();
            const objectUrl = URL.createObjectURL(f);
            putAudioBlob(audioKey, f).catch(() => {});
            objectUrlsRef.current.push(objectUrl);
            onAddTrack(targetId, {
                title: String(f.name || '').replace(/\.[^.]+$/, ''),
                artist: t('unknownArtist'),
                album: targetName,
                // 本地文件时长需解码后才知道，先置 0，播放后由 audio 元数据补齐展示
                seconds: 0,
                file: objectUrl,
                audioKey,
                c1: '#5b6b7c',
                c2: '#2a3440'
            });
        });
        // 落点不是当前视图时切到目标歌单，让用户立即看到刚导入的歌曲
        if (targetId !== sourceId) onSetSource(targetId);
        showToast(t('trackCount', {count: audio.length}));
        return audio.length;
    }, [customSources, onAddSource, onSetSource, onAddTrack, sourceId, showToast, t]);

    // 入口①：唤起系统文件选择器（accept audio/*，多选），选完走 importAudioFiles
    const handlePickLocalFiles = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = AUDIO_ACCEPT;
        input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', () => {
            if (input.files && input.files.length) importAudioFiles(input.files);
            if (input.parentNode) input.parentNode.removeChild(input);
        });
        document.body.appendChild(input);
        input.click();
    }, [importAudioFiles]);

    // 入口②：打开网易云添加抽屉（未配置音乐源时抽屉内提示并引导去设置）
    const handleOpenNetease = useCallback(() => setNeteaseOpen(true), []);
    const closeNetease = useCallback(() => setNeteaseOpen(false), []);
    // 入口③：新建歌单 —— HERO「+ 添加」菜单第 3 项、侧栏「我的歌单 +」、空态引导共用同一入口，
    // 统一打开居中浮层（360px），创建逻辑沿用原 addSource action（创建后自动切到新歌单）。
    const handleNewPlaylist = useCallback(() => {
        setNeteaseOpen(false);
        setSettingsOpen(false);
        setCreateOpen(true);
    }, []);
    const closeCreatePlaylist = useCallback(() => setCreateOpen(false), []);
    const handleCreatePlaylist = useCallback(name => {
        handleAddSource(name);
        showToast(t('createSuccess', {name}));
    }, [handleAddSource, showToast, t]);

    // ═══════════ v7-A 持久化：元数据 localStorage + 音频二进制 IndexedDB ═══════════

    // 启动恢复：先读 localStorage 元数据，再按 audioKey 从 IndexedDB 取回 blob 生成 objectURL，
    // 最后一次性 RESTORE 到 redux。恢复期间 restoring=true（列表显示骨架），
    // 任何一步失败都降级为空并 toast 提示，绝不白屏。
    useEffect(() => {
        let cancelled = false;
        const restore = async () => {
            const meta = loadMeta();
            if (!meta) {
                if (!cancelled) setRestoring(false);
                return;
            }
            const keys = [];
            const collect = list => (Array.isArray(list) ? list : []).forEach(track => {
                if (track && track.audioKey && keys.indexOf(track.audioKey) === -1) {
                    keys.push(track.audioKey);
                }
            });
            (meta.customSources || []).forEach(source => collect(source && source.tracks));
            (meta.favorites || []).forEach(item => collect(item && item.track));
            const urlMap = {};
            await Promise.all(keys.map(audioKey => getAudioBlob(audioKey).then(blob => {
                if (!blob) return;
                const objectUrl = URL.createObjectURL(blob);
                urlMap[audioKey] = objectUrl;
                objectUrlsRef.current.push(objectUrl);
            }).catch(() => {})));
            if (cancelled) return;
            try {
                onRestore(meta, urlMap);
                if (typeof meta.volume === 'number' && isFinite(meta.volume)) {
                    setVolume(meta.volume);
                    if (audioRef.current) audioRef.current.volume = meta.volume / 100;
                }
                if (meta.prefs && typeof meta.prefs === 'object') {
                    setPrefsState(Object.assign({}, DEFAULT_PREFS, meta.prefs));
                }
                // v8：恢复「默认启动页」设置（下一段 effect 会在恢复完成后套用）
                if (meta.defaultView) setDefaultView(meta.defaultView);
            } catch (err) {
                setRestoring(false);
                showToast(t('toastRestoreFailed'));
                return;
            }
            setRestoring(false);
            // 部分本地曲目 blob 丢失（浏览器清过存储等）：列表保留元数据，仅提示不可播放
            if (keys.length && Object.keys(urlMap).length < keys.length) {
                showToast(t('toastRestorePartial'));
            }
        };
        restore();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // v8：默认启动页 —— 仅在「恢复完成」后套用一次，之后用户手动切换不被拉回
    //  home：主页 / local：本地音乐 / favorites：我的收藏 / last：沿用上次打开的来源
    const defaultViewAppliedRef = useRef(false);
    useEffect(() => {
        if (restoring || defaultViewAppliedRef.current) return;
        defaultViewAppliedRef.current = true;
        if (defaultView === 'local') {
            setHomeOpen(false);
            setHomeQueue([]);
            onSetSource(SOURCE_BUILTIN);
        } else if (defaultView === 'favorites') {
            setHomeOpen(false);
            setHomeQueue([]);
            onSetSource(SOURCE_FAVORITES);
        } else if (defaultView === 'last') {
            // 不改动来源：保留 redux 中上次的 sourceId
        } else {
            setHomeOpen(true);
        }
    }, [restoring, defaultView, onSetSource]);

    // 卸载时释放本次会话生成的对象 URL（恢复 + 导入）
    useEffect(() => () => {
        objectUrlsRef.current.forEach(objectUrl => {
            try { URL.revokeObjectURL(objectUrl); } catch (err) {}
        });
        objectUrlsRef.current = [];
    }, []);

    // 状态变化 400ms debounce 落盘：避免拖动音量/连续增删时高频写 localStorage
    const saveTimerRef = useRef(null);
    // 最近一次待落盘快照：debounce 未触发就刷新/关窗时，靠它同步补写一次，
    // 否则「新建歌单后立刻 F5」会读到上一版空数据（v7 实测出现过该丢数据现象）
    const pendingMetaRef = useRef(null);
    useEffect(() => {
        if (restoring) {
            pendingMetaRef.current = null;
            return undefined;
        }
        const meta = {playMode, sourceId, volume, muted, prefs, defaultView, customSources, favorites};
        pendingMetaRef.current = meta;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            saveMeta(meta);
        }, 400);
        return () => {
            if (saveTimerRef.current) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [restoring, customSources, favorites, sourceId, playMode, muted, volume, prefs, defaultView]);

    // 页面隐藏 / 卸载前同步补写未落盘的快照（刷新、关窗、切换窗口时不丢最后一次变更）
    useEffect(() => {
        const flush = () => {
            if (saveTimerRef.current) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            if (pendingMetaRef.current) saveMeta(pendingMetaRef.current);
        };
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);
        return () => {
            window.removeEventListener('beforeunload', flush);
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, []);

    // ═══════════ v7-B 右键菜单（自绘，四个位置共用一套组件） ═══════════

    const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
    const closeDialog = useCallback(() => setDialog(null), []);

    // 内置曲库与「我的歌单」为只读集合：不提供删除歌曲/重命名，避免破坏内置数据
    const isReadOnlySource = useCallback(
        id => id === SOURCE_BUILTIN || id === SOURCE_FAVORITES,
        []
    );

    const openTrackInfo = useCallback(track => {
        if (!track) return;
        setDialog({
            mode: 'info',
            title: t('ctxTrackInfo'),
            items: [
                {label: t('colTitle'), value: String(track.title || '-')},
                {label: t('colArtist'), value: String(track.artist || t('unknownArtist'))},
                {label: t('colAlbum'), value: String(track.album || '-')},
                {label: t('colDuration'), value: fmtTime(track.seconds || 0)},
                {label: t('ctxInfoSource'), value: track.audioKey ? t('ctxInfoLocalFile') : t('ctxInfoNetwork')}
            ]
        });
    }, [t]);

    // 删除歌曲（危险项）：二次确认后移出歌单并清理 IndexedDB 中的音频二进制
    const confirmDeleteTrack = useCallback((track, index, sid) => {
        setDialog({
            mode: 'confirm',
            danger: true,
            title: t('ctxConfirmDeleteTitle'),
            message: t('ctxConfirmDeleteMessage', {name: String((track && track.title) || '')}),
            confirmLabel: t('ctxDeleteLabel'),
            cancelLabel: t('cancel'),
            onSubmit: () => {
                onRemoveTrack(sid, index);
                if (track && track.audioKey) deleteAudioBlob(track.audioKey).catch(() => {});
                showToast(t('ctxToastTrackDeleted', {name: String((track && track.title) || '')}));
            },
            onClose: closeDialog
        });
    }, [closeDialog, onRemoveTrack, showToast, t]);

    // 「加入歌单」二级子菜单：全部自建歌单 + 新建歌单…
    const buildPlaylistChildren = useCallback(track => customSources.map(source => ({
        id: `ctx-add-${source.id}`,
        label: source.name,
        icon: <FolderIcon size={13} />,
        onClick: () => {
            const dup = source.tracks.some(item =>
                item.title === track.title && item.artist === track.artist);
            if (dup) {
                showToast(t('ctxToastAlreadyIn'));
                return;
            }
            onAddTrack(source.id, Object.assign({}, track));
            showToast(t('ctxToastAdded', {name: source.name}));
        }
    })).concat([
        {separator: true},
        {
            id: 'ctx-add-new',
            label: t('ctxNewPlaylist'),
            icon: <PlusIcon size={13} />,
            onClick: handleNewPlaylist
        }
    ]), [customSources, handleNewPlaylist, onAddTrack, showToast, t]);

    // 播放指定来源列表里的第 index 首（来源不同先切换，避免下标错位）
    const playInList = useCallback((index, sid) => {
        if (sid !== sourceId) {
            onSetSource(sid);
            return;
        }
        handleSelectTrack(index);
    }, [handleSelectTrack, onSetSource, sourceId]);

    // 「下一首播放」：入插播队列，当前曲目播完即播
    const queueNext = useCallback((index, sid) => {
        if (sid !== sourceId) return;
        const list = currentTracksRef.current;
        if (!list || !list[index]) return;
        setNextUp({index, list});
        showToast(t('ctxToastQueuedNext'));
    }, [showToast, sourceId, t]);

    // 歌单导出为 JSON（下载到浏览器默认下载目录）
    const exportPlaylist = useCallback(source => {
        try {
            const payload = {
                name: source.name,
                exportedAt: new Date().toISOString(),
                tracks: (source.tracks || []).map(track => ({
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    seconds: track.seconds
                }))
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `${source.name || 'playlist'}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            showToast(t('ctxToastExported'));
        } catch (err) {}
    }, [showToast, t]);

    // 位置①：歌曲行右键
    const handleRowContextMenu = useCallback((event, track, index, sid) => {
        if (!track) return;
        const readonly = isReadOnlySource(sid);
        const fav = favoriteKeys.has(buildFavoriteKey(track));
        const items = [
            {
                id: 'ctx-play',
                label: t('ctxPlay'),
                icon: <PlayIcon size={13} />,
                onClick: () => playInList(index, sid)
            },
            {
                id: 'ctx-play-next',
                label: t('ctxPlayNext'),
                icon: <NextIcon size={13} />,
                onClick: () => queueNext(index, sid)
            },
            {separator: true},
            {
                id: 'ctx-add',
                label: t('ctxAddToPlaylist'),
                icon: <FolderIcon size={13} />,
                children: buildPlaylistChildren(track)
            },
            {
                id: 'ctx-fav',
                label: fav ? t('ctxUnfavorite') : t('ctxFavorite'),
                icon: fav ? <HeartFilledIcon size={13} /> : <HeartIcon size={13} />,
                onClick: () => onToggleFavorite(track, sid)
            },
            {
                id: 'ctx-info',
                label: t('ctxTrackInfo'),
                icon: <InfoIcon size={13} />,
                onClick: () => openTrackInfo(track)
            }
        ];
        if (!readonly) {
            items.push({separator: true});
            items.push({
                id: 'ctx-remove',
                label: t('ctxRemoveFromPlaylist'),
                icon: <CloseIcon size={13} />,
                onClick: () => {
                    onRemoveTrack(sid, index);
                    showToast(t('ctxToastRemoved'));
                }
            });
            items.push({
                id: 'ctx-delete',
                label: t('ctxDeleteTrack'),
                icon: <TrashIcon size={13} />,
                danger: true,
                onClick: () => confirmDeleteTrack(track, index, sid)
            });
        }
        setCtxMenu({x: event.clientX, y: event.clientY, items});
    }, [buildPlaylistChildren, confirmDeleteTrack, favoriteKeys, isReadOnlySource,
        onRemoveTrack, onToggleFavorite, openTrackInfo, playInList, queueNext, showToast, t]);

    // 重命名歌单：复用通用输入浮层（空值/重名即时校验）
    const handleRenameSource = useCallback(source => {
        if (!source || isReadOnlySource(source.id)) return;
        setDialog({
            mode: 'input',
            title: t('ctxRenamePlaylistTitle'),
            message: t('ctxPlaylistNameLabel'),
            initialValue: source.name,
            placeholder: t('newPlaylistPlaceholder'),
            confirmLabel: t('confirm'),
            cancelLabel: t('cancel'),
            validate: value => {
                const name = String(value || '').trim();
                if (!name) return t('ctxPlaylistNameEmpty');
                const dup = customSources.some(item => item.id !== source.id && item.name === name);
                return dup ? t('ctxPlaylistNameExists') : '';
            },
            onSubmit: value => {
                const name = String(value || '').trim();
                onRenameSource(source.id, name);
                showToast(t('ctxToastRenamed', {name}));
            },
            onClose: closeDialog
        });
    }, [closeDialog, customSources, isReadOnlySource, onRenameSource, showToast, t]);

    // 位置②：侧栏歌单项右键
    const handlePlaylistContextMenu = useCallback((event, source) => {
        if (!source || isReadOnlySource(source.id)) return;
        const count = (source.tracks || []).length;
        setCtxMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                {
                    id: 'ctx-rename',
                    label: t('ctxRenamePlaylist'),
                    icon: <EditIcon size={13} />,
                    onClick: () => handleRenameSource(source)
                },
                {
                    id: 'ctx-delete-playlist',
                    label: t('ctxDeletePlaylist'),
                    icon: <TrashIcon size={13} />,
                    danger: true,
                    onClick: () => setDialog({
                        mode: 'confirm',
                        danger: true,
                        title: t('ctxConfirmDeletePlaylistTitle'),
                        message: t('ctxConfirmDeletePlaylistMessage', {name: source.name, count}),
                        confirmLabel: t('ctxDeleteLabel'),
                        cancelLabel: t('cancel'),
                        onSubmit: () => {
                            onRemoveSource(source.id);
                            showToast(t('ctxToastPlaylistDeleted', {name: source.name}));
                        },
                        onClose: closeDialog
                    })
                },
                {separator: true},
                {
                    id: 'ctx-export',
                    label: t('ctxExportPlaylist'),
                    icon: <DownloadIcon size={13} />,
                    onClick: () => exportPlaylist(source)
                }
            ]
        });
    }, [closeDialog, exportPlaylist, handleRenameSource, isReadOnlySource, onRemoveSource, showToast, t]);

    // 位置③：列表空白区右键
    const handleBlankContextMenu = useCallback(event => {
        setCtxMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                {
                    id: 'ctx-import',
                    label: t('ctxImportLocal'),
                    icon: <MusicIcon size={13} />,
                    onClick: handlePickLocalFiles
                },
                {
                    id: 'ctx-netease',
                    label: t('ctxNeteaseAdd'),
                    icon: <DownloadIcon size={13} />,
                    onClick: handleOpenNetease
                },
                {separator: true},
                {
                    id: 'ctx-new-playlist',
                    label: t('ctxNewPlaylist'),
                    icon: <PlusIcon size={13} />,
                    onClick: handleNewPlaylist
                }
            ]
        });
    }, [handleNewPlaylist, handleOpenNetease, handlePickLocalFiles, t]);

    // ═══════════ v7-C 管理视图：批量操作与数据清理 ═══════════

    // 管理视图歌单卡片数据：内置曲库 + 我的歌单 + 自建歌单（三者都可进入查看）
    const manageSources = useMemo(
        () => settingsSources.concat([Object.assign({}, favoritesSource, {readOnly: true})]),
        [settingsSources, favoritesSource]
    );

    // 批量加入歌单：在屏幕中部弹出同一套自绘菜单选目标歌单
    const handleBatchAdd = useCallback(selected => {
        const list = currentTracksRef.current;
        const tracks = (selected || []).map(index => list[index]).filter(Boolean);
        if (!tracks.length) return;
        const playlistItems = customSources.map(source => ({
            id: `batch-add-${source.id}`,
            label: source.name,
            icon: <FolderIcon size={13} />,
            onClick: () => {
                let added = 0;
                tracks.forEach(track => {
                    const dup = source.tracks.some(item =>
                        item.title === track.title && item.artist === track.artist);
                    if (dup) return;
                    onAddTrack(source.id, Object.assign({}, track));
                    added += 1;
                });
                showToast(added
                    ? t('ctxToastAdded', {name: source.name, count: added})
                    : t('ctxToastAlreadyIn'));
            }
        }));
        playlistItems.push({separator: true});
        playlistItems.push({
            id: 'batch-add-new',
            label: t('ctxNewPlaylist'),
            icon: <PlusIcon size={13} />,
            onClick: handleNewPlaylist
        });
        setCtxMenu({
            x: Math.round(window.innerWidth / 2 - 100),
            y: Math.round(window.innerHeight / 2 - 60),
            items: playlistItems
        });
    }, [customSources, handleNewPlaylist, onAddTrack, showToast, t]);

    // 批量移除：只从当前歌单摘掉，不动 IndexedDB 二进制
    const handleBatchRemove = useCallback(selected => {
        if (isReadOnlySource(sourceId)) return;
        (selected || []).slice().sort((a, b) => b - a).forEach(index => onRemoveTrack(sourceId, index));
        showToast(t('ctxToastRemoved'));
    }, [isReadOnlySource, onRemoveTrack, showToast, sourceId, t]);

    // 批量删除：二次确认后移除并清理二进制
    const handleBatchDelete = useCallback(selected => {
        if (isReadOnlySource(sourceId)) return;
        const list = currentTracksRef.current;
        const tracks = (selected || []).map(index => list[index]).filter(Boolean);
        if (!tracks.length) return;
        const label = tracks.length === 1
            ? String(tracks[0].title || '')
            : `${t('songs')} x${tracks.length}`;
        setDialog({
            mode: 'confirm',
            danger: true,
            title: t('ctxConfirmDeleteTitle'),
            message: t('ctxConfirmDeleteMessage', {name: label}),
            confirmLabel: t('ctxDeleteLabel'),
            cancelLabel: t('cancel'),
            onSubmit: () => {
                (selected || []).slice().sort((a, b) => b - a).forEach(index => onRemoveTrack(sourceId, index));
                tracks.forEach(track => {
                    if (track.audioKey) deleteAudioBlob(track.audioKey).catch(() => {});
                });
                showToast(t('ctxToastTrackDeleted', {name: label}));
            },
            onClose: closeDialog
        });
    }, [closeDialog, isReadOnlySource, onRemoveTrack, showToast, sourceId, t]);

    // 一键清除本地数据（危险操作，仅设置内文字红按钮 + 二次确认）
    const handleClearLocalData = useCallback(() => {
        setDialog({
            mode: 'confirm',
            danger: true,
            title: t('clearDataTitle'),
            message: t('clearDataMessage'),
            confirmLabel: t('ctxDeleteLabel'),
            cancelLabel: t('cancel'),
            onSubmit: () => {
                if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
                objectUrlsRef.current.forEach(objectUrl => {
                    try { URL.revokeObjectURL(objectUrl); } catch (err) {}
                });
                objectUrlsRef.current = [];
                clearAllLocalData().catch(() => {});
                onReset();
                setVolume(70);
                setPrefsState(DEFAULT_PREFS);
                showToast(t('toastCleared'));
            },
            onClose: closeDialog
        });
    }, [closeDialog, onReset, showToast, t]);

    const nowTrack = nowPlaying.track;

    // 列表高亮：按 file 匹配正在播放的曲目在当前显示列表中的位置；
    // 切歌单后若正在播的歌不在新列表则不高亮（-1），不强制高亮第一行。
    const activeIndex = useMemo(() => {
        if (!nowTrack) return -1;
        const idx = currentTracks.findIndex(t => t.file === nowTrack.file);
        return idx;
    }, [currentTracks, nowTrack]);

    // 组件常驻：窗口关闭时仅隐藏 Win11Window 本体，桌面歌词/后台播放继续存活
    // 播放栏/歌词页显示的曲目：优先当前正在播放的（nowTrack），
    // 无播放记录时回退到当前显示列表第一首（保持原观感）。
    const currentTrack = nowTrack || currentTracks[currentIndex] || currentTracks[0];

    // 播放栏左区心形收藏：当前播放曲的收藏状态（收藏键仅基于歌曲本身，与来源无关）
    const isCurrentFavorite = useMemo(
        () => (currentTrack ? favoriteKeys.has(buildFavoriteKey(currentTrack)) : false),
        [currentTrack, favoriteKeys]
    );

    return (
        <>
            {open && (
        <ThemedWindow
            windowId="music-player"
            title={t('windowTitle')}
            onClose={onClose}
            icon={WINDOW_ICON}
            defaultWidth={980}
            defaultHeight={680}
            flushBody
        >
            <div className={styles.content}>
                {audioError && (
                    <div className={styles.playerErrorBar}>{audioError}</div>
                )}
                <div className={styles.body}>
                    <Sidebar
                        activeId={homeOpen ? SOURCE_HOME : sourceId}
                        customSources={customSources}
                        onSelect={handleSelectSource}
                        onOpenSettings={handleOpenSettings}
                        onOpenManage={handleOpenManage}
                        onOpenMy={handleOpenMy}
                        onNewPlaylist={handleNewPlaylist}
                        onPlaylistContextMenu={handlePlaylistContextMenu}
                        settingsActive={settingsOpen}
                        manageActive={manageOpen}
                        myActive={myOpen}
                        account={account}
                    />
                    {manageOpen ? (
                        <ManagePane
                            t={t}
                            sources={manageSources}
                            isReadOnlySource={isReadOnlySource}
                            currentTracks={currentTracks}
                            currentSourceName={sourceId === SOURCE_BUILTIN
                                ? t('navLocal')
                                : displaySourceName(intl, currentSource)}
                            currentSourceId={sourceId}
                            onSelectSource={handleSelectSource}
                            onPlayTrack={index => playInList(index, sourceId)}
                            onTrackContextMenu={handleRowContextMenu}
                            onPlaylistContextMenu={handlePlaylistContextMenu}
                            onCreatePlaylist={handleNewPlaylist}
                            onPickLocalFiles={handlePickLocalFiles}
                            onImportFiles={importAudioFiles}
                            onOpenNeteaseSettings={handleOpenNeteaseFromManage}
                            onBatchAddToPlaylist={handleBatchAdd}
                            onBatchRemove={handleBatchRemove}
                            onBatchDelete={handleBatchDelete}
                            onRenameSource={handleRenameSource}
                        />
                    ) : settingsOpen ? (
                        <SettingsPane
                            key={settingsTabInit}
                            initialTab={settingsTabInit}
                            onClose={closeSettings}
                            onClearLocalData={handleClearLocalData}
                            onOpenNetease={handleOpenNetease}
                            customSources={settingsSources}
                            volume={volume}
                            onVolumeChange={handleVolumeChange}
                            playMode={playMode}
                            onSetPlayMode={onSetPlayMode}
                            sortKey={sortKey}
                            onSortKeyChange={setSortKey}
                            desktopLyrics={desktopLyrics}
                            onToggleDesktopLyrics={toggleDesktopLyrics}
                            defaultView={defaultView}
                            onDefaultViewChange={handleDefaultViewChange}
                            prefs={prefs}
                            onPrefsChange={setPrefs}
                        />
                    ) : homeOpen ? (
                        <HomeView onPlayQueue={playHomeQueue} />
                    ) : (
                        <TrackList
                            tracks={filteredTracks}
                            currentIndex={activeIndex}
                            isPlaying={isPlaying}
                            sourceName={sourceId === SOURCE_BUILTIN
                                ? t('navLocal')
                                : displaySourceName(intl, currentSource)}
                            sortKey={sortKey}
                            sortAsc={sortAsc}
                            onSortKeyChange={setSortKey}
                            onToggleSortOrder={handleToggleSortOrder}
                            onSelectTrack={handleSelectTrack}
                            sourceId={sourceId}
                            favoriteKeys={favoriteKeys}
                            onToggleFavorite={onToggleFavorite}
                            searchText={searchText}
                            onSearchTextChange={setSearchText}
                            onPickLocalFiles={handlePickLocalFiles}
                            onOpenNetease={handleOpenNetease}
                            onNewPlaylist={handleNewPlaylist}
                            onImportFiles={importAudioFiles}
                            loading={restoring}
                            onRowContextMenu={handleRowContextMenu}
                            onBlankContextMenu={handleBlankContextMenu}
                        />
                    )}
                </div>
                <PlaybackBar
                    currentTrack={currentTrack || {title: t('noTrack'), artist: '', c1: '#888888', c2: '#888888', seconds: 0}}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    buffering={buffering}
                    volume={volume}
                    muted={muted}
                    playMode={playMode}
                    onSetPlayMode={onSetPlayMode}
                    onToggle={togglePlay}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onSeek={handleSeek}
                    onVolumeChange={handleVolumeChange}
                    onToggleMute={toggleMute}
                    onOpenLyrics={handleOpenLyrics}
                    nowCoverRef={nowCoverRef}
                    sourceId={sourceId}
                    isCurrentFavorite={isCurrentFavorite}
                    onToggleCurrentFavorite={onToggleFavorite}
                    desktopLyrics={desktopLyrics}
                    onToggleDesktopLyrics={toggleDesktopLyrics}
                />
                {neteaseOpen && (
                    <NeteaseDrawer
                        sources={settingsSources}
                        currentSourceId={sourceId}
                        onAddTrack={onAddTrack}
                        onAdded={count => showToast(t('trackCount', {count}))}
                        onOpenSettings={handleOpenSettings}
                        onClose={closeNetease}
                    />
                )}
                {toast && <div className={styles.importToast}>{toast}</div>}
                {myOpen && (
                    <MyView
                        onAuthChange={handleAuthChange}
                        onToast={showToast}
                        onClose={closeMy}
                    />
                )}
                {createOpen && (
                    <CreatePlaylistDialog
                        existingNames={[
                            ...settingsSources.map(src => displaySourceName(intl, src)),
                            intl.formatMessage({id: 'sky.musicPlayer.sourceFavorites'})
                        ]}
                        onSubmit={handleCreatePlaylist}
                        onClose={closeCreatePlaylist}
                    />
                )}
                {ctxMenu && (
                    <ContextMenu
                        x={ctxMenu.x}
                        y={ctxMenu.y}
                        items={ctxMenu.items}
                        onClose={closeCtxMenu}
                    />
                )}
                {dialog && (
                    <ConfirmDialog
                        mode={dialog.mode}
                        title={dialog.title}
                        message={dialog.message}
                        items={dialog.items}
                        confirmLabel={dialog.confirmLabel}
                        cancelLabel={dialog.cancelLabel}
                        danger={dialog.danger}
                        initialValue={dialog.initialValue}
                        placeholder={dialog.placeholder}
                        validate={dialog.validate}
                        onSubmit={dialog.onSubmit}
                        onClose={dialog.onClose || closeDialog}
                    />
                )}
                {lyricsOpen && currentTrack && (
                    <LyricPage
                        key={currentTrack.file}
                        track={currentTrack}
                        audioRef={audioRef}
                        coverInit={lyricsCoverInit}
                        onClose={closeLyrics}
                    />
                )}
            </div>
        </ThemedWindow>
            )}
            {desktopLyrics && currentTrack && (
                <DesktopLyrics
                    key={currentTrack.file}
                    track={currentTrack}
                    audioRef={audioRef}
                    onClose={closeDesktopLyrics}
                    fontSize={prefs.lyricFontSize}
                    align={prefs.lyricAlign}
                    opacity={prefs.lyricOpacity}
                />
            )}
        </>
    );
};

const mapStateToProps = state => ({
    open: state.scratchGui.musicPlayer.open,
    currentIndex: state.scratchGui.musicPlayer.currentIndex,
    playMode: state.scratchGui.musicPlayer.playMode,
    muted: state.scratchGui.musicPlayer.muted,
    sourceId: state.scratchGui.musicPlayer.sourceId,
    customSources: state.scratchGui.musicPlayer.customSources,
    favorites: state.scratchGui.musicPlayer.favorites
});
const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeMusicPlayer()),
    onSetCurrentTrack: index => dispatch(setCurrentTrack(index)),
    onSetPlayMode: mode => dispatch(setPlayMode(mode)),
    onSetMuted: value => dispatch(setMuted(value)),
    onSetSource: id => dispatch(setSource(id)),
    onAddSource: name => dispatch(addSource(name)),
    onRemoveSource: id => dispatch(removeSource(id)),
    onAddTrack: (sid, track) => dispatch(addTrackToSource(sid, track)),
    onRemoveTrack: (sid, index) => dispatch(removeTrackFromSource(sid, index)),
    onUpdateTrack: (sid, index, track) => dispatch(updateTrackInSource(sid, index, track)),
    onUpdateTrackCover: (sid, index, cover) => dispatch(updateTrackCover(sid, index, cover)),
    onToggleFavorite: (track, sourceId) => dispatch(toggleFavorite(track, sourceId)),
    onRenameSource: (id, name) => dispatch(renameSource(id, name)),
    onRestore: (meta, urlMap) => dispatch(restoreMusicPlayer(meta, urlMap)),
    onReset: () => dispatch(resetMusicPlayer())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(MusicPlayerWindow));
