import React, {memo, useEffect, useRef, useState} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage} from './i18n';
import {ListIcon, MusicIcon, NoteIcon, PlayIcon, PlusIcon, SearchIcon} from './icons.jsx';
import TrackRow from './track-row.jsx';
import TrackCover from './cover.jsx';
import {buildFavoriteKey} from './utils';

// 表头：label 为消息 key，渲染时经 react-intl 取词（跟随编辑器语言）
const COLUMNS = [
    ['title', 'colTitle'],
    ['artist', 'colArtist'],
    ['album', 'colAlbum'],
    ['seconds', 'colDuration']
];

// 总时长：秒 -> m:ss（列表为空显示 0:00）
const fmtTotal = totalSeconds => {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return m + ':' + (rest < 10 ? '0' + rest : String(rest));
};

// 内容页：
// ① hero 卡片——96px 封面 + 歌单名 + 元信息（N 首 · 总时长），右侧「播放全部」描边次按钮 + 「+ 添加」主题色主按钮；
// ② 40px 工具条——左侧自绘排序下拉，右侧可展开搜索 + 「共 N 首」；
// ③ 表头 + 48px 歌曲行；空歌单显示空态（图标 + 提示 + 添加本地歌曲）；
// ④ 列表区支持拖拽导入（2px 主题色虚线描边 + 前景 4% 底），非音频文件由上层 toast 提示。
// 「添加歌曲」入口只有三处（HERO 菜单 / 空态按钮 / 拖拽），三处共用上层同一套 import 逻辑。
const TrackList = memo(function TrackList ({
    intl,
    tracks,
    currentIndex,
    isPlaying,
    sourceName,
    sortKey,
    sortAsc,
    onSortKeyChange,
    onToggleSortOrder,
    onSelectTrack,
    sourceId,
    favoriteKeys,
    onToggleFavorite,
    searchText,
    onSearchTextChange,
    onPickLocalFiles,
    onOpenNetease,
    onNewPlaylist,
    onImportFiles,
    onRowContextMenu,
    onBlankContextMenu,
    loading
}) {
    const t = (key, values) => mpMessage(intl, key, values);
    // 排序下拉：与表头共用 sortKey / sortAsc，二者双向同步（表头点击同样反映到下拉按钮文案）
    const [sortOpen, setSortOpen] = useState(false);
    const sortRef = useRef(null);
    useEffect(() => {
        if (!sortOpen) return undefined;
        const onDocDown = e => {
            if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [sortOpen]);
    const currentColumn = COLUMNS.filter(([key]) => key === sortKey)[0] || COLUMNS[0];
    // 点不同列切换排序维度；点当前列切换升降序（与表头行为一致）
    const handlePickSort = key => {
        if (key === sortKey) onToggleSortOrder();
        else onSortKeyChange(key);
        setSortOpen(false);
    };

    // 可展开搜索（自顶栏迁移至工具条右端）：收起 32x32 图标，展开 200px；逻辑与原实现一致
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef(null);
    const openSearch = () => {
        setSearchOpen(true);
        // 同帧聚焦会打断 width 过渡，延迟 40ms 等展开动画启动后再聚焦
        window.setTimeout(() => {
            if (searchInputRef.current) searchInputRef.current.focus();
        }, 40);
    };
    const closeSearch = () => {
        setSearchOpen(false);
        onSearchTextChange('');
    };
    const handleSearchBlur = e => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        // 仍有搜索词时保持展开，避免看不到当前过滤条件
        if (!searchText) setSearchOpen(false);
    };

    // 「+ 添加」下拉菜单（锚定 hero 按钮，点击外部关闭）
    const [addOpen, setAddOpen] = useState(false);
    const addRef = useRef(null);
    useEffect(() => {
        if (!addOpen) return undefined;
        const onDocDown = e => {
            if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false);
        };
        const onKeyDown = e => {
            if (e.key === 'Escape') setAddOpen(false);
        };
        document.addEventListener('mousedown', onDocDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onDocDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [addOpen]);
    const handleMenuPick = fn => {
        setAddOpen(false);
        if (fn) fn();
    };

    // 列表区拖拽导入：仅在本容器内响应，阻止冒泡以免影响整个窗口的拖拽行为
    const [dropActive, setDropActive] = useState(false);
    const hasFiles = e => {
        const dt = e.dataTransfer;
        if (!dt) return false;
        if (dt.types) {
            for (let i = 0; i < dt.types.length; i++) {
                if (dt.types[i] === 'Files') return true;
            }
            return false;
        }
        return true;
    };
    const handleDragOver = e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (!dropActive) setDropActive(true);
    };
    // 进入/离开用深度计数：拖拽经过行内子元素也会触发 dragleave，
    // 直接置 false 会与随后的 dragenter 交替，导致描边闪烁。
    const dragDepthRef = useRef(0);
    const handleDragEnter = e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current += 1;
        setDropActive(true);
    };
    const handleDragLeave = e => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDropActive(false);
    };
    const handleDrop = e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setDropActive(false);
        const files = e.dataTransfer ? e.dataTransfer.files : null;
        if (files && files.length && onImportFiles) onImportFiles(files);
    };

    // hero 取当前（排序后）列表首曲作为大封面
    const firstTrack = tracks.length > 0 ? tracks[0].track : null;
    // 元信息：N 首 · 总时长（各曲时长求和）
    const totalSeconds = tracks.reduce((sum, item) => sum + (Number(item.track.seconds) || 0), 0);
    const isEmpty = tracks.length === 0;

    return (
        <div className={styles.main}>
            <div className={styles.hero}>
                <TrackCover track={firstTrack} className={styles.heroCover} iconSize={28} />
                <div className={styles.heroInfo}>
                    <div className={styles.heroTitle} title={sourceName}>{sourceName}</div>
                    <div className={styles.heroDesc}>
                        {t('trackCount', {count: tracks.length})}
                        {' · '}
                        {fmtTotal(totalSeconds)}
                    </div>
                </div>
                <div className={styles.heroActions}>
                    <button
                        className={styles.heroPlay}
                        onClick={() => firstTrack && onSelectTrack(tracks[0].index)}
                        disabled={!firstTrack}
                        title={t('play')}
                    >
                        <PlayIcon size={12} />
                        <span>{t('play')}</span>
                    </button>
                    <div className={styles.addWrap} ref={addRef}>
                        <button
                            className={styles.heroAdd}
                            onClick={() => setAddOpen(v => !v)}
                            title={t('addSong')}
                            aria-haspopup="true"
                            aria-expanded={addOpen}
                        >
                            <PlusIcon size={14} />
                            <span>{t('addSong')}</span>
                        </button>
                        {addOpen && (
                            <div className={styles.addMenu}>
                                <button
                                    className={styles.addMenuItem}
                                    onClick={() => handleMenuPick(onPickLocalFiles)}
                                >
                                    <span className={styles.addMenuIcon}><NoteIcon size={16} /></span>
                                    <span className={styles.addMenuLabel}>{t('addSong')}</span>
                                </button>
                                <button
                                    className={styles.addMenuItem}
                                    onClick={() => handleMenuPick(onOpenNetease)}
                                >
                                    <span className={styles.addMenuIcon}><MusicIcon size={16} /></span>
                                    <span className={styles.addMenuLabel}>{t('settingsNavNetease')}</span>
                                </button>
                                <button
                                    className={styles.addMenuItem}
                                    onClick={() => handleMenuPick(onNewPlaylist)}
                                >
                                    <span className={styles.addMenuIcon}><PlusIcon size={16} /></span>
                                    <span className={styles.addMenuLabel}>{t('newPlaylist')}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className={styles.listToolbar}>
                <div className={styles.sortControl} ref={sortRef}>
                    <button
                        className={styles.sortBtn}
                        onClick={() => setSortOpen(v => !v)}
                        title={t(currentColumn[1])}
                    >
                        <ListIcon size={13} />
                        <span className={styles.sortBtnLabel}>{t(currentColumn[1])}</span>
                        <span className={styles.sortBtnArrow}>{sortAsc ? '\u2191' : '\u2193'}</span>
                    </button>
                    {sortOpen && (
                        <div className={styles.sortMenu}>
                            {COLUMNS.map(([key, label]) => (
                                <button
                                    key={key}
                                    className={key === sortKey
                                        ? `${styles.sortMenuItem} ${styles.sortMenuItemActive}`
                                        : styles.sortMenuItem}
                                    onClick={() => handlePickSort(key)}
                                >
                                    <span className={styles.sortMenuItemLabel}>{t(label)}</span>
                                    {key === sortKey && (
                                        <span className={styles.sortMenuItemArrow}>
                                            {sortAsc ? '\u2191' : '\u2193'}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className={styles.listToolbarRight}>
                    <div
                        className={searchOpen
                            ? `${styles.searchField} ${styles.searchFieldOpen}`
                            : styles.searchField}
                        onBlur={handleSearchBlur}
                    >
                        <button
                            className={searchOpen
                                ? `${styles.searchToggle} ${styles.searchToggleActive}`
                                : styles.searchToggle}
                            onClick={searchOpen ? closeSearch : openSearch}
                            title={t('searchPlaceholder')}
                        >
                            <SearchIcon size={15} />
                        </button>
                        <input
                            ref={searchInputRef}
                            className={styles.searchInput}
                            value={searchText}
                            tabIndex={searchOpen ? 0 : -1}
                            onChange={e => onSearchTextChange(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Escape') closeSearch();
                            }}
                            placeholder={t('searchPlaceholder')}
                        />
                    </div>
                    <span className={styles.listCount}>{t('trackCount', {count: tracks.length})}</span>
                </div>
            </div>
            <div
                className={dropActive
                    ? `${styles.listArea} ${styles.listAreaDrop}`
                    : styles.listArea}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onContextMenu={event => {
                    // 空白区右键菜单（导入本地歌曲 / 从网易云添加 / 新建歌单）；
                    // 行内右键已 stopPropagation，不会冒泡到这里重复弹菜单
                    if (!onBlankContextMenu) return;
                    event.preventDefault();
                    onBlankContextMenu(event);
                }}
            >
                {loading ? (
                    <div className={styles.skeletonList} aria-busy="true">
                        {[0, 1, 2].map(i => (
                            <div className={styles.skeletonRow} key={i}>
                                <span className={`${styles.skeletonBar} ${styles.skeletonBarIndex}`} />
                                <span className={`${styles.skeletonBar} ${styles.skeletonBarTitle}`} />
                                <span className={`${styles.skeletonBar} ${styles.skeletonBarArtist}`} />
                                <span className={`${styles.skeletonBar} ${styles.skeletonBarTime}`} />
                            </div>
                        ))}
                    </div>
                ) : isEmpty ? (
                    <div className={styles.emptyState}>
                        <NoteIcon size={48} />
                        <p className={styles.emptyText}>{t('noTracksInSource')}</p>
                        <button className={styles.emptyBtn} onClick={onPickLocalFiles}>
                            <NoteIcon size={14} />
                            <span>{t('addSong')}</span>
                        </button>
                    </div>
                ) : (
                    <React.Fragment>
                        <div className={styles.tableHeader}>
                            <div className={`${styles.headerCell} ${styles.headerIndex}`} />
                            {COLUMNS.map(([key, label]) => (
                                <div
                                    key={key}
                                    className={key === sortKey
                                        ? `${styles.headerCell} ${styles.headerCellActive}`
                                        : styles.headerCell}
                                    onClick={() => {
                                        if (key === sortKey) onToggleSortOrder();
                                        else onSortKeyChange(key);
                                    }}
                                >
                                    <span>{t(label)}</span>
                                    {key === sortKey && (
                                        <span className={styles.sortArrow}>
                                            {sortAsc ? '\u2191' : '\u2193'}
                                        </span>
                                    )}
                                </div>
                            ))}
                            <div className={`${styles.headerCell} ${styles.headerFav}`} />
                        </div>
                        <div className={styles.tracklist}>
                            {tracks.map(({track, index}, rowIndex) => (
                                <TrackRow
                                    key={index}
                                    track={track}
                                    index={index}
                                    displayIndex={rowIndex + 1}
                                    isActive={index === currentIndex}
                                    isPlaying={isPlaying}
                                    onSelect={onSelectTrack}
                                    isFavorite={favoriteKeys.has(buildFavoriteKey(track))}
                                    sourceId={sourceId}
                                    sourceName={sourceName}
                                    onToggleFavorite={onToggleFavorite}
                                    onContextMenu={onRowContextMenu}
                                />
                            ))}
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
});

export default injectIntl(TrackList);
