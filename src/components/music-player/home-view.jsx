import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import styles from './music-player.css';
import {PlayIcon} from './icons.jsx';

// 主页视图：内容全部来自网易云音乐公开接口（经 devServer 的 /netease 反代，同源免 CORS），
// 版式参照网易云首页（热门推荐 / 推荐歌单 / 榜单），但配色只取编辑器主题变量，不写死竞品红。
// 版块文案属于网易云内容语境，随内容一起保持中文，不新增 i18n 文案键（既有约定）。
const API = '/netease';

// 网易云图片：强制 https，并按需带上尺寸参数减小体积
const httpsUrl = url => (url ? String(url).replace(/^http:\/\//, 'https://') : '');
const sized = (url, size = 200) => (url ? `${httpsUrl(url)}?param=${size}y${size}` : '');

const fetchJSON = async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

const artistOf = song => {
    const list = song.ar || song.artists || [];
    return list.map(a => a && a.name).filter(Boolean).join(' / ');
};

// 网易云曲目 → 播放器曲目对象：音源与「从网易云添加」保持同一条路径（外链 mp3）
const toTrack = song => {
    const album = song.al || song.album || {};
    return {
        title: song.name || '未知曲目',
        artist: artistOf(song) || '未知歌手',
        album: album.name || '网易云音乐',
        seconds: Math.round((song.dt || song.duration || 0) / 1000),
        cover: sized(album.picUrl, 200),
        c1: '#8a8f99',
        c2: '#b9bec7',
        file: `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`,
        neteaseId: song.id
    };
};

// 播放量统一压到「万 / 亿」，与网易云首页角标一致
const fmtCount = n => {
    const v = Number(n) || 0;
    if (v < 10000) return String(v);
    if (v < 100000000) return `${(v / 10000).toFixed(1)}万`;
    return `${(v / 100000000).toFixed(1)}亿`;
};

/* 加载占位：闪烁骨架，保证板块标题与卡片网格先位 */
const SKELETON_RANKS = 4;
const SKELETON_SONGS = 6;
const SKELETON_PLAYLISTS = 9;

const skelList = n => [...Array.from({length: n}).keys()];

const SkelBlock = ({className}) => (
    <span className={`${styles.homeSkelBlock} ${className || ''}`} />
);

const SkelCards = ({count}) => (
    <div className={styles.homeCards}>
        {skelList(count).map(i => (
            <div key={i} className={styles.homeSkelCard}>
                <SkelBlock className={styles.homeSkelCover} />
                <SkelBlock className={styles.homeSkelLine} />
            </div>
        ))}
    </div>
);

const SkelSongs = ({count}) => (
    <div className={styles.homeSongs}>
        {skelList(count).map(i => (
            <div key={i} className={styles.homeSkelSong}>
                <SkelBlock className={styles.homeSkelThumb} />
                <span className={styles.homeSkelMeta}>
                    <SkelBlock className={styles.homeSkelLine} />
                    <SkelBlock className={styles.homeSkelLineShort} />
                </span>
            </div>
        ))}
    </div>
);

const SkelSection = ({title, note, children}) => (
    <div className={styles.homeSection}>
        <div className={styles.homeSectionHead}>
            <span className={styles.homeSectionTitle}>{title}</span>
            {note ? <span className={styles.homeSectionNote}>{note}</span> : null}
        </div>
        {children}
    </div>
);

const HomeSkeleton = () => (
    <>
        <SkelSection title="榜单" note="点击封面播放榜内曲目">
            <SkelCards count={SKELETON_RANKS} />
        </SkelSection>
        <SkelSection title="热门推荐" note="点击任意一首即可播放">
            <SkelSongs count={SKELETON_SONGS} />
        </SkelSection>
        <SkelSection title="推荐歌单" note="点击封面开始播放">
            <SkelCards count={SKELETON_PLAYLISTS} />
        </SkelSection>
    </>
);

const HomeView = memo(function HomeView ({onPlayQueue}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [news, setNews] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [ranks, setRanks] = useState([]);
    const [pendingId, setPendingId] = useState(null);
    const [hint, setHint] = useState('');
    const aliveRef = useRef(true);
    const hintTimerRef = useRef(null);

    const showHint = useCallback(text => {
        setHint(text);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHint(''), 2600);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [newsRes, playlistRes, rankRes] = await Promise.all([
                fetchJSON(`${API}/api/personalized/newsong`),
                fetchJSON(`${API}/api/personalized/playlist?limit=9`),
                fetchJSON(`${API}/api/toplist/detail`)
            ]);
            if (!aliveRef.current) return;
            const newsList = ((newsRes && newsRes.result) || [])
                .slice(0, 6)
                .map(item => item.song || item)
                .filter(song => song && song.id);
            const playlistList = ((playlistRes && playlistRes.result) || [])
                .filter(item => item && item.id)
                .slice(0, 9);
            const rankList = ((rankRes && rankRes.list) || [])
                .filter(item => item && item.id)
                .slice(0, 4);
            setNews(newsList);
            setPlaylists(playlistList);
            setRanks(rankList);
            if (!newsList.length && !playlistList.length && !rankList.length) {
                setError('网易云音乐没有返回内容');
            }
        } catch (e) {
            if (!aliveRef.current) return;
            setError(e && e.message ? e.message : '网络请求失败');
        } finally {
            if (aliveRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        aliveRef.current = true;
        load();
        return () => {
            aliveRef.current = false;
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        };
    }, [load]);

    // 热门推荐：整块列表作为播放队列，点击第 index 首开始播放
    const playNews = useCallback(index => {
        const queue = news.map(toTrack).filter(t => t.file);
        if (!queue.length) return;
        onPlayQueue(queue, Math.max(0, Math.min(index, queue.length - 1)));
    }, [news, onPlayQueue]);

    // 歌单 / 榜单：点开时拉取详情里的曲目，作为新的播放队列
    const playCollection = useCallback(async item => {
        if (!item || pendingId) return;
        setPendingId(item.id);
        try {
            const data = await fetchJSON(`${API}/api/v1/playlist/detail?id=${item.id}&n=1000`);
            const tracks = (data && data.playlist && data.playlist.tracks) || [];
            const queue = tracks.filter(t => t && t.id).slice(0, 60).map(toTrack);
            if (!queue.length) throw new Error('empty');
            onPlayQueue(queue, 0);
        } catch (e) {
            showHint('该歌单暂时取不到曲目，请稍后再试');
        } finally {
            setPendingId(null);
        }
    }, [onPlayQueue, pendingId, showHint]);

    return (
        <div className={styles.home}>
            {loading && <HomeSkeleton />}

            {!loading && error && (
                <div className={styles.homeError}>
                    <span>主页内容加载失败（{error}）</span>
                    <button className={styles.homeRetry} onClick={load}>重新加载</button>
                </div>
            )}

            {!loading && !error && (
                <>
                    {ranks.length > 0 && (
                        <div className={styles.homeSection}>
                            <div className={styles.homeSectionHead}>
                                <span className={styles.homeSectionTitle}>榜单</span>
                                <span className={styles.homeSectionNote}>点击封面播放榜内曲目</span>
                            </div>
                            <div className={styles.homeCards}>
                                {ranks.map(item => (
                                    <div key={item.id} className={styles.homeCard}>
                                        <div
                                            className={styles.homeCardCover}
                                            onClick={() => playCollection(item)}
                                        >
                                            <img src={sized(item.coverImgUrl, 300)} alt="" />
                                            <span className={styles.homeCardMask}>
                                                {pendingId === item.id
                                                    ? <span className={styles.homeCardBusy}>载入中</span>
                                                    : <PlayIcon size={18} />}
                                            </span>
                                        </div>
                                        <div className={styles.homeCardName}>{item.name}</div>
                                        <div className={styles.homeCardNote}>
                                            {item.updateFrequency || '实时更新'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {news.length > 0 && (
                        <div className={styles.homeSection}>
                            <div className={styles.homeSectionHead}>
                                <span className={styles.homeSectionTitle}>热门推荐</span>
                                <span className={styles.homeSectionNote}>点击任意一首即可播放</span>
                            </div>
                            <div className={styles.homeSongs}>
                                {news.map((song, index) => (
                                    <div
                                        key={song.id}
                                        className={styles.homeSong}
                                        onClick={() => playNews(index)}
                                        title={`${song.name} - ${artistOf(song) || '未知歌手'}`}
                                    >
                                        <div className={styles.homeSongCover}>
                                            {song.picUrl || (song.al && song.al.picUrl) ? (
                                                <img
                                                    src={sized(song.picUrl || (song.al && song.al.picUrl), 100)}
                                                    alt=""
                                                />
                                            ) : null}
                                            <span className={styles.homeSongPlay}>
                                                <PlayIcon size={16} />
                                            </span>
                                        </div>
                                        <div className={styles.homeSongMeta}>
                                            <div className={styles.homeSongName}>{song.name}</div>
                                            <div className={styles.homeSongArtist}>
                                                {artistOf(song) || '未知歌手'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {playlists.length > 0 && (
                        <div className={styles.homeSection}>
                            <div className={styles.homeSectionHead}>
                                <span className={styles.homeSectionTitle}>推荐歌单</span>
                                <span className={styles.homeSectionNote}>点击封面开始播放</span>
                            </div>
                            <div className={styles.homeCards}>
                                {playlists.map(item => (
                                    <div key={item.id} className={styles.homeCard}>
                                        <div
                                            className={styles.homeCardCover}
                                            onClick={() => playCollection(item)}
                                        >
                                            <img src={sized(item.picUrl, 300)} alt="" />
                                            <span className={styles.homeCardMask}>
                                                {pendingId === item.id
                                                    ? <span className={styles.homeCardBusy}>载入中</span>
                                                    : <PlayIcon size={18} />}
                                            </span>
                                            {item.playCount
                                                ? (
                                                    <span className={styles.homeCardCount}>
                                                        {fmtCount(item.playCount)}
                                                    </span>
                                                )
                                                : null}
                                        </div>
                                        <div className={styles.homeCardName}>{item.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {hint && <div className={styles.homeToast}>{hint}</div>}
        </div>
    );
});

export default HomeView;
