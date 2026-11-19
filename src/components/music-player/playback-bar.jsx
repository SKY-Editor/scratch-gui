import React from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage, displayArtist} from './i18n';
import {fmtTime} from './utils';
import TrackCover from './cover.jsx';
import {
    HeartFilledIcon,
    HeartIcon,
    ListLoopIcon,
    LyricsIcon,
    OrderIcon,
    PauseIcon,
    PlayIcon,
    PrevIcon,
    NextIcon,
    RepeatOneIcon,
    VolumeIcon,
    VolumeMutedIcon
} from './icons.jsx';

// 播放模式循环：manual(顺序播放) -> auto(列表循环) -> loop(单曲循环) -> manual
const MODE_ORDER = ['manual', 'auto', 'loop'];
const MODE_ICONS = {
    manual: OrderIcon,
    auto: ListLoopIcon,
    loop: RepeatOneIcon
};

// 播放栏（76px 三段式）：
// 左区 = 48px 封面（点击进歌词页）+ 歌名 / 歌手 + 当前曲收藏心形；
// 中区 = 上排控制组（播放模式 / 上一首 / 主播放键 / 下一首）+ 下排时间与进度条（上下两排居中叠放，总宽上限 480px）；
// 右区 = 桌面歌词开关 + 音量图标 + 滑块。
// 进度条已播段用 transform: scaleX 渲染（不做 width 过渡，避免重排），
// 原生的 input[type=range] 只保留交互层（轨道透明），保证拖动与键盘可达性不变。
const PlaybackBar = function ({
    intl,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    buffering,
    volume,
    muted,
    playMode,
    onSetPlayMode,
    onToggle,
    onPrev,
    onNext,
    onSeek,
    onVolumeChange,
    onToggleMute,
    onOpenLyrics,
    nowCoverRef,
    sourceId,
    isCurrentFavorite,
    onToggleCurrentFavorite,
    desktopLyrics,
    onToggleDesktopLyrics
}) {
    const t = (key, values) => mpMessage(intl, key, values);
    // 进度百分比：元数据未就绪时 duration 为 0，进度按 0 处理
    const seekPct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const seekScale = Math.max(0, Math.min(1, seekPct / 100));
    const handleToggleMode = () => {
        if (!onSetPlayMode) return;
        const idx = MODE_ORDER.indexOf(playMode);
        onSetPlayMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length]);
    };
    const handleToggleFavorite = () => {
        if (onToggleCurrentFavorite) onToggleCurrentFavorite(currentTrack, sourceId);
    };
    const ModeIcon = MODE_ICONS[playMode] || OrderIcon;
    return (
        <div className={styles.bottom}>
            <div className={styles.now}>
                <TrackCover
                    track={currentTrack}
                    className={styles.nowCover}
                    iconSize={20}
                    ref={nowCoverRef}
                    onClick={onOpenLyrics}
                    title={t('viewLyrics')}
                />
                <div className={styles.nowInfo}>
                    <div className={styles.nowName}>
                        {currentTrack.title}
                        {currentTrack.preview && <span className={styles.previewBadge} title={t('previewBadgeTip')}>{t('previewBadge')}</span>}
                    </div>
                    <div className={styles.nowArtist}>{displayArtist(intl, currentTrack.artist)}</div>
                </div>
                {/* 当前曲收藏：仅当存在可收藏曲目时显示 */}
                {currentTrack && currentTrack.file && (
                    <button
                        className={isCurrentFavorite
                            ? `${styles.nowFav} ${styles.nowFavActive}`
                            : styles.nowFav}
                        onClick={handleToggleFavorite}
                        title={isCurrentFavorite ? t('unfavorite') : t('favorite')}
                    >
                        {isCurrentFavorite ? <HeartFilledIcon size={17} /> : <HeartIcon size={17} />}
                    </button>
                )}
            </div>
            <div className={styles.center}>
                <div className={styles.controls}>
                    {/* 播放模式：控制组最左端 */}
                    <button
                        className={styles.modeBtn}
                        onClick={handleToggleMode}
                        title={playMode === 'loop' ? t('modeLoop') : (playMode === 'auto' ? t('modeAuto') : t('modeManual'))}
                    >
                        <ModeIcon size={17} />
                    </button>
                    <button className={styles.ctrl} onClick={onPrev} title={t('prev')}>
                        <PrevIcon size={16} />
                    </button>
                    <button
                        className={`${styles.ctrl} ${styles.playBtn}`}
                        onClick={onToggle}
                        title={isPlaying ? t('pause') : t('play')}
                    >
                        {/* 播放 / 暂停两层图标叠放，切换时 opacity + scale 交叉淡入 140ms */}
                        <span className={isPlaying
                            ? `${styles.playIcon} ${styles.playIconHidden}`
                            : styles.playIcon}
                        >
                            <PlayIcon size={15} />
                        </span>
                        <span className={isPlaying
                            ? styles.playIcon
                            : `${styles.playIcon} ${styles.playIconHidden}`}
                        >
                            <PauseIcon size={15} />
                        </span>
                    </button>
                    <button className={styles.ctrl} onClick={onNext} title={t('next')}>
                        <NextIcon size={16} />
                    </button>
                </div>
                <div className={styles.progress}>
                    <span className={styles.time}>{fmtTime(currentTime)}</span>
                    <div className={styles.seekWrap}>
                        <span className={styles.seekTrack} />
                        {/* 已播段：仅用 transform 缩放，不参与布局 */}
                        <span
                            className={styles.seekFill}
                            style={{transform: `scaleX(${seekScale})`}}
                        />
                        <input
                            className={styles.seek}
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={seekPct}
                            onChange={e => onSeek(Number(e.target.value))}
                            title={t('play')}
                        />
                    </div>
                    {buffering
                        ? <span className={styles.buffering}>{t('buffering')}</span>
                        : <span className={styles.time}>{fmtTime(currentTrack.seconds)}</span>}
                </div>
            </div>
            <div className={styles.volume}>
                {/* 桌面歌词开关（自顶栏迁移至此，与音量同排）：28px 图标按钮，激活态走主题色 */}
                <button
                    className={desktopLyrics
                        ? `${styles.lyricsToggle} ${styles.lyricsToggleActive}`
                        : styles.lyricsToggle}
                    onClick={onToggleDesktopLyrics}
                    title={desktopLyrics ? t('desktopLyricsOff') : t('desktopLyricsOn')}
                    aria-pressed={!!desktopLyrics}
                >
                    <LyricsIcon size={16} />
                </button>
                <button
                    className={muted ? `${styles.volumeBtn} ${styles.volumeBtnActive}` : styles.volumeBtn}
                    onClick={onToggleMute}
                    title={t('mute')}
                >
                    {muted ? <VolumeMutedIcon size={17} /> : <VolumeIcon size={17} />}
                </button>
                <input
                    className={styles.volumeSlider}
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={e => onVolumeChange(Number(e.target.value))}
                    style={{'--mp-fill': `${volume}%`}}
                    title={t('mute')}
                />
            </div>
        </div>
    );
};

export default injectIntl(PlaybackBar);
