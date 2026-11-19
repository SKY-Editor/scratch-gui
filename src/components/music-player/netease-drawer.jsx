import React, {memo, useCallback, useRef, useState} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage} from './i18n';
import {CloseIcon, MusicIcon} from './icons.jsx';
import {SOURCE_BUILTIN, SOURCE_FAVORITES} from './utils';

// 从网易云添加：居中小抽屉（宽 420px，fade + translateY 180ms）。
// 复用设置页既有的网易云抓取逻辑（/netease 代理 → detail + lyric + 音源探测），
// 抓取成功后直接把歌曲加入当前歌单（无需再跳设置页确认）。
// 尚未配置音乐源（没有任何自定义歌单）时，先提示并引导去设置里创建。
const NeteaseDrawer = memo(function NeteaseDrawer ({
    intl,
    sources,
    currentSourceId,
    onAddTrack,
    onAdded,
    onOpenSettings,
    onClose
}) {
    const t = (key, values) => mpMessage(intl, key, values);
    const [neteaseUrl, setNeteaseUrl] = useState('');
    const [fetching, setFetching] = useState(false);
    const [msg, setMsg] = useState('');
    const [msgOk, setMsgOk] = useState(false);
    const urlInputRef = useRef(null);

    const customSources = sources.filter(s => !s.builtin);
    const isCurrentCustom = currentSourceId !== SOURCE_BUILTIN &&
        currentSourceId !== SOURCE_FAVORITES;
    // 目标歌单：当前自定义歌单优先，否则第一个自定义歌单（与设置页同样的兜底规则）
    const targetSource = (isCurrentCustom && customSources.filter(s => s.id === currentSourceId)[0]) ||
        customSources[0] || null;

    // 从网易云歌曲链接中提取歌曲 id，支持：
    //   https://music.163.com/song?id=186016&xxx
    //   https://music.163.com/#/song?id=186016
    //   https://music.163.com/song/186016
    const parseNeteaseId = input => {
        const s = (input || '').trim();
        if (!s) return null;
        const m = s.match(/[?&#/]id=(\d+)/) || s.match(/\/song\/(\d+)/);
        return m ? m[1] : null;
    };

    const handleFetch = useCallback(async () => {
        if (!targetSource) return;
        const id = parseNeteaseId(neteaseUrl);
        if (!id) {
            setMsgOk(false);
            setMsg(t('neteaseBadUrl'));
            return;
        }
        setFetching(true);
        setMsg('');
        try {
            const detailRes = await fetch(`/netease/api/song/detail/?id=${id}&ids=[${id}]`);
            if (!detailRes.ok) throw new Error(t('neteaseDetailHttp', {status: detailRes.status}));
            const detail = await detailRes.json();
            const song = detail && detail.songs && detail.songs[0];
            if (!song) throw new Error(t('neteaseNotFound'));
            const artistName =
                (song.artists && song.artists[0] && song.artists[0].name) ||
                (song.ar && song.ar[0] && song.ar[0].name) ||
                '';
            const lyricRes = await fetch(`/netease/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`);
            if (!lyricRes.ok) throw new Error(t('neteaseLyricHttp', {status: lyricRes.status}));
            const lyric = await lyricRes.json();
            const lrc = (lyric && lyric.lrc && lyric.lrc.lyric) || '';
            const albumCover = (song.album && song.album.picUrl) || null;
            // 音源探测：判断「完整版 / 试听片段 / 无音源」
            let srcInfo = null;
            try {
                const urlRes = await fetch(`/netease/api/song/enhance/player/url?ids=[${id}]&br=128000`);
                if (urlRes.ok) {
                    const urlData = await urlRes.json();
                    const it = Array.isArray(urlData.data) && urlData.data[0];
                    if (it && it.code === 200 && it.url) {
                        const realSec = (song.duration || 0) / 1000;
                        const streamSec = it.size ? it.size / (it.br ? it.br / 8 : 16000) : 0;
                        srcInfo = {
                            preview: streamSec > 0 && realSec > 0 && streamSec < realSec * 0.8,
                            streamSec: Math.round(streamSec)
                        };
                    } else {
                        srcInfo = {unavailable: true};
                    }
                }
            } catch (e) { /* 探测失败不阻塞，按可播放处理 */ }
            if (srcInfo && srcInfo.unavailable) {
                setMsgOk(false);
                setMsg(t('neteaseNoSource', {name: song.name}));
                return;
            }
            const playUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
            // 同一链接已存在时不再重复添加，仅把最新封面写回
            const dupIndex = targetSource.tracks.findIndex(tr => tr.file === playUrl);
            onAddTrack(targetSource.id, {
                title: song.name || '',
                artist: artistName || '未知歌手',
                album: targetSource.name,
                seconds: Math.round((song.duration || 0) / 1000),
                file: playUrl,
                lyrics: lrc.trim() || undefined,
                preview: (srcInfo && srcInfo.preview) || undefined,
                cover: albumCover || undefined
            });
            setMsgOk(true);
            setMsg(t('neteaseSuccess', {
                name: song.name || '',
                lyrics: lrc.trim() ? t('neteaseLyricsYes') : t('neteaseLyricsNo'),
                preview: srcInfo && srcInfo.preview
                    ? t('neteasePreviewNote', {seconds: srcInfo.streamSec})
                    : t('neteaseFullNote'),
                dup: dupIndex >= 0 ? t('neteaseDupNote') : '',
                action: t('addSong')
            }));
            setNeteaseUrl('');
            if (onAdded) onAdded(1);
        } catch (e) {
            setMsgOk(false);
            setMsg(t('neteaseFail', {error: e.message || t('networkError')}));
        } finally {
            setFetching(false);
        }
    }, [neteaseUrl, targetSource, onAddTrack, onAdded]);

    return (
        <div className={styles.neteaseLayer} onMouseDown={onClose} role="presentation">
            <div
                className={styles.neteaseDrawer}
                onMouseDown={e => e.stopPropagation()}
                role="dialog"
                aria-label={t('settingsNavNetease')}
            >
                <div className={styles.neteaseHead}>
                    <span className={styles.neteaseTitle}>{t('settingsNavNetease')}</span>
                    <button className={styles.neteaseClose} onClick={onClose} title={t('close')}>
                        <CloseIcon size={14} />
                    </button>
                </div>
                {targetSource ? (
                    <React.Fragment>
                        <p className={styles.neteaseDesc}>{t('settingsDescNetease')}</p>
                        <div className={styles.neteaseRow}>
                            <input
                                ref={urlInputRef}
                                className={styles.neteaseInput}
                                value={neteaseUrl}
                                onChange={e => setNeteaseUrl(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !fetching) handleFetch();
                                }}
                                placeholder={t('neteasePlaceholder')}
                                autoFocus
                            />
                            <button
                                className={styles.neteaseFetch}
                                onClick={handleFetch}
                                disabled={fetching}
                            >
                                {fetching ? t('fetching') : t('fetchSong')}
                            </button>
                        </div>
                        {msg && (
                            <p className={msgOk
                                ? `${styles.neteaseMsg} ${styles.neteaseMsgOk}`
                                : `${styles.neteaseMsg} ${styles.neteaseMsgErr}`}
                            >
                                {msg}
                            </p>
                        )}
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <p className={styles.neteaseDesc}>{t('noCustomSources')}</p>
                        {msg && (
                            <p className={`${styles.neteaseMsg} ${styles.neteaseMsgErr}`}>{msg}</p>
                        )}
                        <div className={styles.neteaseTip}>
                            <span className={styles.neteaseTipText}>{t('settingsNavPlaylists')}</span>
                            <button className={styles.neteaseTipBtn} onClick={onOpenSettings}>
                                <MusicIcon size={12} />
                                {' '}
                                {t('settings')}
                            </button>
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
});

export default injectIntl(NeteaseDrawer);
