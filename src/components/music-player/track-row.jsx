import React, {memo} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage, displayArtist, displayAlbum, DATA_CUSTOM_ALBUM} from './i18n';
import {MusicIcon, HeartIcon, HeartFilledIcon, PlayIcon} from './icons.jsx';
import TrackCover from './cover.jsx';
import {fmtTime} from './utils';

// 歌曲行：序号 / 标题 / 歌手 / 专辑 / 时长 / 收藏。
// 序号列默认显示序号；鼠标悬停整行时序号淡出、圆形播放按钮淡入并自下而上就位（替代静态序号）。
// 当前播放行：序号位替换为 3 根竖条的均衡器动画（整行播放时循环，暂停时动画暂停）。
// 播放中整行文字转强调色（.track-playing）。
// React.memo 浅比较 props：track/index/displayIndex/isActive/isPlaying/isFavorite/onSelect/sourceId/sourceName/onToggleFavorite/onContextMenu。
// v7：整行支持右键菜单（播放/下一首播放/加入歌单/收藏/查看信息/移除/删除），位置与条目由上层构造。
const TrackRow = memo(function TrackRow ({
    intl,
    track,
    index,
    displayIndex,
    isActive,
    isPlaying,
    isFavorite,
    onToggleFavorite,
    onSelect,
    onContextMenu,
    sourceId,
    sourceName
}) {
    // 序号列显示当前列表中的顺序位（排序后从 1 递增），index 仍为源数据索引，供 onSelect 定位
    const rowNumber = displayIndex || index + 1;
    const t = (key, values) => mpMessage(intl, key, values);
    // 专辑列：老数据残留的「自定义」兜底显示当前所在歌单名（与新增数据 album=歌单名一致）
    const albumText = track.album === DATA_CUSTOM_ALBUM && sourceName
        ? sourceName
        : displayAlbum(intl, track.album);
    return (
        <div
            className={isActive ? `${styles.track} ${styles.trackPlaying}` : styles.track}
            onClick={() => onSelect(index)}
            onContextMenu={event => {
                if (!onContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(event, track, index, sourceId);
            }}
        >
            <div className={styles.colIndex}>
                {/* 状态层：当前播放行显示均衡器，其余行显示序号；悬停时整体让位给播放按钮 */}
                <span className={styles.colIndexNum}>
                    {isActive
                        ? (
                            <span
                                className={isPlaying ? styles.eq : `${styles.eq} ${styles.eqPaused}`}
                                aria-hidden="true"
                            >
                                <i className={styles.eqBar} />
                                <i className={styles.eqBar} />
                                <i className={styles.eqBar} />
                            </span>
                        )
                        : rowNumber}
                </span>
                {/* 悬停层：圆形播放按钮，默认透明下沉 4px，悬停时淡入复位 */}
                <button
                    className={styles.colIndexPlay}
                    onClick={e => { e.stopPropagation(); onSelect(index); }}
                    title={t('play')}
                    tabIndex={-1}
                >
                    <PlayIcon size={11} />
                </button>
            </div>
            <div className={styles.colTitle}>
                <TrackCover track={track} className={styles.cover} iconSize={15} />
                <div className={styles.titleWrap}>
                    {isActive && <MusicIcon size={13} />}
                    <span className={styles.trackTitle}>{track.title}</span>
                    {track.preview && <span className={styles.previewBadge} title={t('previewBadgeTip')}>{t('previewBadge')}</span>}
                </div>
            </div>
            <div className={styles.colArtist}>{displayArtist(intl, track.artist)}</div>
            <div className={styles.colAlbum}>{albumText}</div>
            <div className={styles.colDuration}>{fmtTime(track.seconds)}</div>
            <div className={styles.colFav}>
                <button
                    className={isFavorite ? `${styles.favBtn} ${styles.favBtnActive}` : styles.favBtn}
                    onClick={e => { e.stopPropagation(); onToggleFavorite(track, sourceId); }}
                    title={isFavorite ? t('unfavorite') : t('favorite')}
                >
                    {isFavorite ? <HeartFilledIcon size={14} /> : <HeartIcon size={14} />}
                </button>
            </div>
        </div>
    );
});

export default injectIntl(TrackRow);
