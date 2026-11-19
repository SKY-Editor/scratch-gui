import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage, displaySourceName} from './i18n';
import {CloseIcon, MusicIcon, EditIcon} from './icons.jsx';
import {SOURCE_BUILTIN, SOURCE_FAVORITES} from './utils';

// 音乐来源「管理视图」（v6：嵌在右侧内容区内渲染，不再自带覆盖层与左导航）：
// 由设置页「歌曲与歌单管理 / 网易云配置」入口切换进来，四个分区自上而下堆叠展示。
//  - 音乐来源：内置曲库 + 用户自定义歌单，点击即切换播放来源；自定义歌单支持删除
//  - 「选择歌单添加歌曲」：先选一个自定义歌单（默认/内置曲库除外），再向该歌单添加歌曲；
//    已添加的歌曲行支持「编辑」（铅笔）——回填表单修改标题/歌手/链接/歌词/封面后保存
// 新建歌单入口已移至左侧栏底部按钮，弹窗内不再提供「新建来源」。
// 所有写入动作通过 redux action 落到 reducers/music-player.js。
// React.memo：sources 等 props 由上层以稳定引用注入，播放进度高频变化时弹窗整体跳过重渲染。
const SourceSettings = memo(function SourceSettings ({
    intl,
    sources,           // [{id, name, builtin, tracks}]
    currentSourceId,
    onSelectSource,
    onRemoveSource,
    onAddTrack,
    onRemoveTrack,
    onUpdateTrack,
    onUpdateTrackCover,
    onClose
}) {
    // 取词器：稳定引用（内部经 ref 读最新 intl），异步回调里也能拿到当前语言
    const intlRef = useRef(intl);
    intlRef.current = intl;
    const t = useCallback((key, values) => mpMessage(intlRef.current, key, values), []);

    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [url, setUrl] = useState('');
    const [lyrics, setLyrics] = useState('');
    // 时长（秒）：网易云抓取自动回填真实时长；手动添加无来源时保持 0（列表按 00:00 展示）
    const [seconds, setSeconds] = useState(0);
    const [targetSourceId, setTargetSourceId] = useState(null);
    // 正在编辑的歌曲下标（相对当前 targetSource.tracks；null=新增模式）
    const [editingIndex, setEditingIndex] = useState(null);
    // 设置页当前分类（纯 UI state）：playlists=歌单管理 / tracks=歌曲管理 / netease=网易云 / lyrics=歌词设置

    // 网易云歌曲链接自动获取：粘贴链接 → 解析 id → 代理拉详情+歌词 → 回填表单
    const [neteaseUrl, setNeteaseUrl] = useState('');
    const [fetching, setFetching] = useState(false);
    const [neteaseMsg, setNeteaseMsg] = useState('');
    const [neteaseOk, setNeteaseOk] = useState(false);
    // 试听标记：true 表示当前抓到的歌曲网易云只提供试听片段（截断版）
    const [neteasePreview, setNeteasePreview] = useState(false);
    // 封面：网易云拉取成功自动回填专辑封面；也可手动上传本地图片（dataURL）；null=无封面，播放器用渐变样式占位
    const [cover, setCover] = useState(null);
    const coverInputRef = useRef(null);

    // 本地上传封面：读为 dataURL 存入 cover（手动上传可覆盖自动获取的网易云封面）
    const handleCoverFile = useCallback((e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCover(typeof reader.result === 'string' ? reader.result : null);
        reader.readAsDataURL(file);
    }, []);

    const customSources = useMemo(() => sources.filter(s => !s.builtin), [sources]);

    // 目标歌单默认选中：当前是自定义歌单则选它；当前为内置曲库/我的歌单时选第一个自定义歌单
    useEffect(() => {
        if (customSources.length === 0) {
            setTargetSourceId(null);
            return;
        }
        const isCurrentCustom = currentSourceId !== SOURCE_BUILTIN &&
            currentSourceId !== SOURCE_FAVORITES &&
            customSources.some(s => s.id === currentSourceId);
        setTargetSourceId(isCurrentCustom ? currentSourceId : customSources[0].id);
    }, [sources, currentSourceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const targetSource = customSources.find(s => s.id === targetSourceId) || null;
    const tracks = targetSource ? targetSource.tracks : [];

    // 从网易云歌曲链接中提取歌曲 id，支持：
    //   https://music.163.com/song?id=186016&xxx
    //   https://music.163.com/#/song?id=186016
    //   https://music.163.com/song/186016
    const parseNeteaseId = (input) => {
        const s = (input || '').trim();
        if (!s) return null;
        const m = s.match(/[?&#/]id=(\d+)/) || s.match(/\/song\/(\d+)/);
        return m ? m[1] : null;
    };

    // 通过 devServer /netease 代理请求网易云接口（同源免 CORS），
    // 自动回填标题/歌手/歌词，并把播放外链填入「音频 URL」。
    const fetchNetease = useCallback(async () => {
        const id = parseNeteaseId(neteaseUrl);
        if (!id) {
            setNeteaseOk(false);
            setNeteaseMsg(t('neteaseBadUrl'));
            return;
        }
        setFetching(true);
        setNeteaseMsg('');
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
            // 网易云专辑封面 URL：作为自动获取的封面（个别歌曲 album 缺失时为空，走渐变占位）
            const albumCover = (song.album && song.album.picUrl) || null;
            // 音源探测：enhance/player/url 判断「完整版 / 试听片段 / 无音源」
            // 网易云对受限歌曲只返回 30~45 秒试听流（截断版），完整版歌正常返回全部音源。
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
                        srcInfo = { unavailable: true };
                    }
                }
            } catch (e) { /* 探测失败不阻塞，按可播放处理 */ }
            setTitle(song.name || '');
            setArtist(artistName);
            setLyrics(lrc);
            if (srcInfo && srcInfo.unavailable) {
                setNeteaseOk(false);
                setUrl('');
                setCover(null);
                setNeteasePreview(false);
                setNeteaseMsg(t('neteaseNoSource', {name: song.name}));
                return;
            }
            const playUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
            setUrl(playUrl);
            setCover(albumCover);
            // 回填真实时长：song.duration 为毫秒，转秒后用于列表/播放栏展示
            setSeconds(Math.round((song.duration || 0) / 1000));
            setNeteaseOk(true);
            setNeteasePreview(srcInfo ? !!srcInfo.preview : false);
            const previewTxt = srcInfo && srcInfo.preview
                ? t('neteasePreviewNote', {seconds: srcInfo.streamSec})
                : t('neteaseFullNote');
            // 「网络渠道获取的歌曲检查并更新封面」：若目标歌单已存在同一首歌（同播放链接），
            // 立即把最新专辑封面写回该行（老数据无 cover 也能借此补全），避免重复添加。
            // 编辑态下目标行自身不算重复（不会真新增，不需要提示写回封面）。
            let dupNote = '';
            if (targetSource && albumCover) {
                const existingIdx = targetSource.tracks.findIndex(t => t.file === playUrl);
                if (existingIdx >= 0 && existingIdx !== editingIndex) {
                    onUpdateTrackCover(targetSource.id, existingIdx, albumCover);
                    dupNote = t('neteaseDupNote');
                }
            }
            setNeteaseMsg(t('neteaseSuccess', {
                name: song.name,
                lyrics: lrc ? t('neteaseLyricsYes') : t('neteaseLyricsNo'),
                preview: previewTxt,
                dup: dupNote,
                action: editingIndex !== null ? t('saveChanges') : t('addSong')
            }));
        } catch (e) {
            setNeteaseOk(false);
            setNeteaseMsg(t('neteaseFail', {error: e.message || t('networkError')}));
        } finally {
            setFetching(false);
        }
    }, [neteaseUrl, targetSource, editingIndex, onUpdateTrackCover]);

    // 清空「添加/编辑」表单（含试听标记与封面），回到新增模式
    const clearAddForm = useCallback(() => {
        setTitle('');
        setArtist('');
        setUrl('');
        setLyrics('');
        setSeconds(0);
        setCover(null);
        setNeteasePreview(false);
        setEditingIndex(null);
    }, []);

    const handleAddTrack = useCallback(() => {
        // 编辑态下主按钮走「保存修改」，此处仅防 Enter 误触新增
        if (editingIndex !== null) return;
        if (!targetSource || !title.trim() || !url.trim()) return;
        onAddTrack(targetSource.id, {
            title: title.trim(),
            artist: artist.trim() || '未知歌手',
            // 所属专辑显示为当前所在歌单名（与内置曲库「本地音乐」同约定），不再写死「自定义」
            album: targetSource.name,
            seconds: seconds > 0 ? seconds : 0,
            file: url.trim(),
            // 可选歌词：空则不给 lyrics 字段，歌词页显示「纯音乐」；
            // 支持 LRC 格式（[mm:ss] 行，可跟随播放高亮）或纯文本（静态显示）。
            lyrics: lyrics.trim() || undefined,
            // 网易云试听标记：仅当前抓取的歌曲被判定为试听片段时置 true，列表/播放栏显示「试听」
            preview: neteasePreview || undefined,
            // 封面：自动获取（网易云专辑图）或手动上传的 dataURL；无封面时不携带字段 → 渐变占位
            cover: cover || undefined
        });
        clearAddForm();
    }, [editingIndex, targetSource, title, artist, url, lyrics, seconds, cover,
        neteasePreview, onAddTrack, clearAddForm]);

    // 点击行内「编辑」（铅笔）：把该行歌曲数据回填到下方表单，进入编辑模式
    const handleStartEdit = useCallback((index) => {
        if (!targetSource) return;
        const track = targetSource.tracks[index];
        if (!track) return;
        setTitle(track.title || '');
        setArtist(track.artist && track.artist !== '未知歌手' ? track.artist : '');
        setUrl(track.file || '');
        setLyrics(track.lyrics || '');
        setSeconds(track.seconds || 0);
        setCover(track.cover || null);
        setNeteasePreview(!!track.preview);
        setNeteaseUrl('');
        setNeteaseMsg('');
        setNeteaseOk(false);
        setEditingIndex(index);
    }, [targetSource]);

    // 取消编辑：清空表单与编辑状态
    const handleCancelEdit = useCallback(() => {
        clearAddForm();
        setNeteaseMsg('');
    }, [clearAddForm]);

    // 保存修改：以当前表单内容覆盖原行；album/seconds 沿用原值避免被表单重置。
    // 若修改的是已收藏歌曲，收藏条目由 reducer UPDATE_TRACK 同步更新（红心/我的歌单跟随）。
    const handleSaveEdit = useCallback(() => {
        if (!targetSource || editingIndex === null) return;
        const oldTrack = targetSource.tracks[editingIndex];
        if (!oldTrack) return;
        if (!title.trim() || !url.trim()) {
            setNeteaseOk(false);
            setNeteaseMsg(t('editNeedFields'));
            return;
        }
        onUpdateTrack(targetSource.id, editingIndex, {
            title: title.trim(),
            artist: artist.trim() || '未知歌手',
            // 专辑沿用原值；老数据残留的「自定义」升级为当前歌单名，编辑一次即修正显示
            album: oldTrack.album && oldTrack.album !== '自定义'
                ? oldTrack.album
                : targetSource.name,
            // 时长优先取表单值（网易云重新抓取会回填真实时长），否则沿用原值
            seconds: seconds > 0 ? seconds : (oldTrack.seconds || 0),
            file: url.trim(),
            // 可选歌词：空则不给 lyrics 字段，歌词页显示「纯音乐」；
            // 支持 LRC 格式（[mm:ss] 行，可跟随播放高亮）或纯文本（静态显示）。
            lyrics: lyrics.trim() || undefined,
            // 网易云试听标记：仅当前抓取的歌曲被判定为试听片段时置 true，列表/播放栏显示「试听」
            preview: neteasePreview || undefined,
            // 封面：自动获取（网易云专辑图）或手动上传的 dataURL；无封面时不携带字段 → 渐变占位
            cover: cover || undefined
        });
        const saved = title.trim();
        clearAddForm();
        setNeteaseOk(true);
        setNeteaseMsg(t('editSaved', {title: saved}));
    }, [targetSource, editingIndex, title, artist, url, lyrics, seconds, cover,
        neteasePreview, onUpdateTrack, clearAddForm]);

    // 表单主提交（音频 URL 输入框 Enter 快捷）：编辑态保存，新增态添加
    const handleSubmitForm = useCallback(() => {
        if (editingIndex !== null) handleSaveEdit();
        else handleAddTrack();
    }, [editingIndex, handleSaveEdit, handleAddTrack]);

    // 主按钮动作：编辑态=保存修改，新增态=添加歌曲
    const handleFormSubmit = editingIndex !== null ? handleSaveEdit : handleAddTrack;
    const formSubmitLabel = editingIndex !== null ? t('saveChanges') : t('addSong');

    return (
        <div className={styles.settingsEmbedded}>
                        <>
                            <div className={styles.settingsSection}>
                                <div className={styles.settingsSectionTitle}>{t('settingsNavPlaylists')}</div>
                                <div className={styles.settingsSectionDesc}>{t('settingsDescPlaylists')}</div>
                                <div className={styles.settingsSectionBody}>
                                    <div className={styles.sourceList}>
                                        {sources.map(s => (
                                            <div
                                                key={s.id}
                                                className={s.id === currentSourceId ?
                                                    `${styles.sourceRow} ${styles.sourceRowActive}` :
                                                    styles.sourceRow}
                                                onClick={() => onSelectSource(s.id)}
                                            >
                                                <MusicIcon size={14} />
                                                <span className={styles.sourceRowName}>{displaySourceName(intl, s)}</span>
                                                <span className={styles.sourceRowCount}>
                                                    {t('trackCount', {count: s.tracks ? s.tracks.length : 0})}
                                                </span>
                                                {!s.builtin && (
                                                    <button
                                                        className={styles.sourceRowRemove}
                                                        onClick={e => { e.stopPropagation(); clearAddForm(); onRemoveSource(s.id); }}
                                                        title={t('removeSource')}
                                                    >
                                                        <CloseIcon size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>

                        <>
                            <div>
                                <div className={styles.settingsSection}>
                                    <div className={styles.settingsSectionTitle}>{t('settingsNavTracks')}</div>
                                    <div className={styles.settingsSectionDesc}>{t('settingsDescTracks')}</div>
                                    <div className={styles.settingsSectionBody}>
                                        {customSources.length === 0 ? (
                                            <div className={styles.settingsHint}>
                                                {t('noCustomSources')}
                                            </div>
                                        ) : (
                                            <div>
                                                <div className={styles.targetSourceList}>
                                                    {customSources.map(s => (
                                                        <button
                                                            key={s.id}
                                                            className={s.id === targetSourceId ?
                                                                `${styles.targetSourceChip} ${styles.targetSourceChipActive}` :
                                                                styles.targetSourceChip}
                                                            onClick={() => {
                                                                if (s.id === targetSourceId) return;
                                                                clearAddForm();
                                                                setTargetSourceId(s.id);
                                                            }}
                                                            title={displaySourceName(intl, s)}
                                                        >
                                                            <span>{displaySourceName(intl, s)}</span>
                                                            <span className={styles.targetSourceCount}>
                                                                {t('trackCount', {count: s.tracks ? s.tracks.length : 0})}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                                {targetSource && (
                                                    <div className={styles.settingsTrackList}>
                                                        {tracks.length === 0 && (
                                                            <div className={styles.settingsHint}>{t('noTracksInSource')}</div>
                                                        )}
                                                        {tracks.map((track, i) => (
                                                            <div
                                                                key={i}
                                                                className={i === editingIndex ?
                                                                    `${styles.settingsTrackRow} ${styles.settingsTrackRowEditing}` :
                                                                    styles.settingsTrackRow}
                                                            >
                                                                <span className={styles.settingsTrackTitle}>{track.title}</span>
                                                                <span className={styles.settingsTrackArtist}>{track.artist}</span>
                                                                <div className={styles.settingsTrackActions}>
                                                                    <button
                                                                        className={styles.settingsTrackEdit}
                                                                        onClick={() => handleStartEdit(i)}
                                                                        title={t('editTrack')}
                                                                    >
                                                                        <EditIcon size={12} />
                                                                    </button>
                                                                    <button
                                                                        className={styles.settingsTrackDel}
                                                                        onClick={() => { clearAddForm(); onRemoveTrack(targetSource.id, i); }}
                                                                        title={t('deleteTrack')}
                                                                    >
                                                                        <CloseIcon size={12} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {targetSource && (
                                    <div className={styles.settingsSection}>
                                        <div className={styles.settingsSectionTitle}>
                                            {editingIndex !== null ? t('sectionEditTrack') : t('sectionAddTrack')}
                                        </div>
                                        <div className={styles.settingsSectionBody}>
                                            {editingIndex !== null && targetSource.tracks[editingIndex] && (
                                                <div className={styles.settingsEditHint}>
                                                    {t('editHint', {title: targetSource.tracks[editingIndex].title})}
                                                </div>
                                            )}
                                            <div className={styles.settingsFieldGrid}>
                                                <input
                                                    className={styles.settingsInput}
                                                    value={title}
                                                    onChange={e => setTitle(e.target.value)}
                                                    placeholder={t('inputTitle')}
                                                />
                                                <input
                                                    className={styles.settingsInput}
                                                    value={artist}
                                                    onChange={e => setArtist(e.target.value)}
                                                    placeholder={t('inputArtist')}
                                                />
                                            </div>
                                            <input
                                                className={styles.settingsInput}
                                                value={url}
                                                onChange={e => setUrl(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleSubmitForm(); }}
                                                placeholder={t('inputUrl')}
                                            />
                                            <div className={styles.settingsCoverRow}>
                                                {cover ? (
                                                    <img className={styles.settingsCoverPreview} src={cover} alt={t('coverAlt')} />
                                                ) : (
                                                    <span className={styles.settingsCoverPlaceholder}>{t('noCover')}</span>
                                                )}
                                                <input
                                                    ref={coverInputRef}
                                                    className={styles.settingsCoverInput}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleCoverFile}
                                                />
                                                <button
                                                    className={styles.settingsBtn}
                                                    onClick={() => coverInputRef.current && coverInputRef.current.click()}
                                                    title={t('uploadCoverTip')}
                                                >
                                                    {t('uploadCover')}
                                                </button>
                                                {cover && (
                                                    <button
                                                        className={`${styles.settingsBtn} ${styles.settingsBtnCancel}`}
                                                        onClick={() => setCover(null)}
                                                        title={t('removeCoverTip')}
                                                    >
                                                        {t('remove')}
                                                    </button>
                                                )}
                                            </div>
                                            <div className={styles.settingsFormActions}>
                                                <button
                                                    className={styles.settingsBtn}
                                                    onClick={handleFormSubmit}
                                                >
                                                    {formSubmitLabel}
                                                </button>
                                                {editingIndex !== null && (
                                                    <button
                                                        className={`${styles.settingsBtn} ${styles.settingsBtnCancel}`}
                                                        onClick={handleCancelEdit}
                                                    >
                                                        {t('cancelEdit')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>

                        <>
                            <div className={styles.settingsSection}>
                                <div className={styles.settingsSectionTitle}>{t('settingsNavNetease')}</div>
                                <div className={styles.settingsSectionDesc}>{t('settingsDescNetease')}</div>
                                <div className={styles.settingsSectionBody}>
                                    {customSources.length === 0 || !targetSource ? (
                                        <div className={styles.settingsHint}>{t('noCustomSources')}</div>
                                    ) : (
                                        <div className={styles.settingsNetease}>
                                            <div className={styles.settingsNeteaseRow}>
                                                <input
                                                    className={styles.settingsInput}
                                                    value={neteaseUrl}
                                                    onChange={e => setNeteaseUrl(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') fetchNetease(); }}
                                                    placeholder={t('neteasePlaceholder')}
                                                />
                                                <button
                                                    className={styles.settingsBtn}
                                                    onClick={fetchNetease}
                                                    disabled={fetching}
                                                >
                                                    {fetching ? t('fetching') : t('fetchSong')}
                                                </button>
                                            </div>
                                            {neteaseMsg && (
                                                <div className={neteaseOk ?
                                                    styles.settingsNeteaseOk :
                                                    styles.settingsNeteaseErr}>
                                                    {neteaseMsg}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>

                        <>
                            <div className={styles.settingsSection}>
                                <div className={styles.settingsSectionTitle}>{t('settingsNavLyrics')}</div>
                                <div className={styles.settingsSectionDesc}>{t('settingsDescLyrics')}</div>
                                <div className={styles.settingsSectionBody}>
                                    {customSources.length === 0 || !targetSource ? (
                                        <div className={styles.settingsHint}>{t('noCustomSources')}</div>
                                    ) : (
                                        <div className={styles.settingsAddTrack}>
                                            <textarea
                                                className={styles.settingsLyrics}
                                                value={lyrics}
                                                onChange={e => setLyrics(e.target.value)}
                                                placeholder={t('lyricsPlaceholder')}
                                                rows={8}
                                            />
                                            <div className={styles.settingsFormActions}>
                                                <button
                                                    className={styles.settingsBtn}
                                                    onClick={handleFormSubmit}
                                                >
                                                    {formSubmitLabel}
                                                </button>
                                                {editingIndex !== null && (
                                                    <button
                                                        className={`${styles.settingsBtn} ${styles.settingsBtnCancel}`}
                                                        onClick={handleCancelEdit}
                                                    >
                                                        {t('cancelEdit')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    </div>
    );
});

export default injectIntl(SourceSettings);
