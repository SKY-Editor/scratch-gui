import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from './music-player.css';
import {fmtTime} from './utils';
import {CheckIcon, FolderIcon, NoteIcon, PlayIcon, PlusIcon, SlidersIcon, TrashIcon} from './icons.jsx';

// 管理视图（v7）：从设置里剥离出来的「歌曲 / 歌单 / 导入」三段独立视图。
// 侧栏常驻、就地渲染右侧内容，页内不出现第二套左导航。
// 只读来源（内置曲库 / 我的歌单）不提供移除与删除，仅允许播放与加入歌单。

const SEGMENTS = ['songs', 'playlists', 'import'];

const ManagePane = function (props) {
    const {
        t, sources, isReadOnlySource, currentTracks, currentSourceName, currentSourceId,
        onSelectSource, onPlayTrack, onTrackContextMenu, onPlaylistContextMenu,
        onCreatePlaylist, onPickLocalFiles, onImportFiles, onOpenNeteaseSettings,
        onBatchAddToPlaylist, onBatchRemove, onBatchDelete, onRenameSource
    } = props;
    const [segment, setSegment] = React.useState('songs');
    const [selected, setSelected] = React.useState([]);
    const [dragActive, setDragActive] = React.useState(false);

    React.useEffect(() => {
        // 换歌单后清空多选，避免批量操作作用到不可见的曲目
        setSelected([]);
    }, [currentSourceId]);

    const readOnly = isReadOnlySource;

    const toggleSelected = index => {
        setSelected(prev => (prev.indexOf(index) >= 0 ?
            prev.filter(i => i !== index) :
            prev.concat(index)));
    };

    const handleDrop = event => {
        event.preventDefault();
        setDragActive(false);
        if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
            onImportFiles(event.dataTransfer.files);
        }
    };

    return (
        <div className={styles.managePane}>
            <div className={styles.manageHead}>
                <div className={styles.manageTitle}>{t('manageTitle')}</div>
                <div className={styles.manageSeg}>
                    {SEGMENTS.map(key => (
                        <button
                            className={classNames(styles.manageSegItem, {
                                [styles.manageSegItemActive]: segment === key
                            })}
                            key={key}
                            onClick={() => setSegment(key)}
                            type="button"
                        >
                            {t(`manageSeg${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.manageBody}>
                {segment === 'songs' ? (
                    <React.Fragment>
                        <div className={styles.manageSectionHead}>
                            <span className={styles.manageSectionTitle}>{currentSourceName}</span>
                            <span className={styles.manageSectionMeta}>
                                {t('trackCount').replace('{count}', String(currentTracks.length))}
                            </span>
                        </div>
                        {selected.length ? (
                            <div className={styles.manageBatchBar}>
                                <span className={styles.manageBatchCount}>
                                    {t('manageSelected').replace('{count}', String(selected.length))}
                                </span>
                                <div className={styles.manageBatchActions}>
                                    <button
                                        className={styles.manageGhostBtn}
                                        onClick={() => onBatchAddToPlaylist(selected)}
                                        type="button"
                                    >
                                        <PlusIcon size={13} />
                                        <span>{t('ctxAddToPlaylist')}</span>
                                    </button>
                                    <button
                                        className={styles.manageGhostBtn}
                                        disabled={readOnly}
                                        onClick={() => onBatchRemove(selected)}
                                        type="button"
                                    >
                                        <span>{t('ctxRemoveFromPlaylist')}</span>
                                    </button>
                                    <button
                                        className={classNames(styles.manageGhostBtn, styles.manageDangerBtn)}
                                        disabled={readOnly}
                                        onClick={() => onBatchDelete(selected)}
                                        type="button"
                                    >
                                        <TrashIcon size={13} />
                                        <span>{t('ctxDeleteTrack')}</span>
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        {readOnly ? (
                            <div className={styles.manageNote}>{t('manageReadOnlyNote')}</div>
                        ) : null}
                        <div className={styles.manageTrackList}>
                            {currentTracks.length === 0 ? (
                                <div className={styles.manageEmpty}>{t('emptyPlaylist')}</div>
                            ) : currentTracks.map((track, index) => (
                                <div
                                    className={classNames(styles.manageTrackRow, {
                                        [styles.manageTrackRowSelected]: selected.indexOf(index) >= 0
                                    })}
                                    key={`${track.title}-${index}`}
                                    onContextMenu={event => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onTrackContextMenu(event, track, index, currentSourceId);
                                    }}
                                >
                                    <button
                                        aria-label={t('manageSelectTrack')}
                                        className={classNames(styles.manageCheck, {
                                            [styles.manageCheckOn]: selected.indexOf(index) >= 0
                                        })}
                                        onClick={() => toggleSelected(index)}
                                        type="button"
                                    >
                                        {selected.indexOf(index) >= 0 ? <CheckIcon size={12} /> : null}
                                    </button>
                                    <span className={styles.manageTrackIndex}>{index + 1}</span>
                                    <span className={styles.manageTrackName}>
                                        <span className={styles.manageTrackTitle}>{track.title}</span>
                                        <span className={styles.manageTrackArtist}>{track.artist}</span>
                                    </span>
                                    <span className={styles.manageTrackAlbum}>{track.album || '—'}</span>
                                    <span className={styles.manageTrackTime}>{fmtTime(track.seconds)}</span>
                                    <button
                                        aria-label={t('play')}
                                        className={styles.manageIconBtn}
                                        onClick={() => onPlayTrack(index)}
                                        type="button"
                                    >
                                        <PlayIcon size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </React.Fragment>
                ) : null}

                {segment === 'playlists' ? (
                    <React.Fragment>
                        <div className={styles.manageSectionHead}>
                            <span className={styles.manageSectionTitle}>{t('playlistsTitle')}</span>
                            <button
                                className={styles.manageGhostBtn}
                                onClick={onCreatePlaylist}
                                type="button"
                            >
                                <PlusIcon size={13} />
                                <span>{t('newPlaylist')}</span>
                            </button>
                        </div>
                        {sources.length === 0 ? (
                            <div className={styles.manageEmpty}>{t('manageNoPlaylist')}</div>
                        ) : (
                            <div className={styles.manageCardGrid}>
                                {sources.map(source => (
                                    <div
                                        className={classNames(styles.manageCard, {
                                            [styles.manageCardActive]: source.id === currentSourceId
                                        })}
                                        key={source.id}
                                        onClick={() => {
                                            onSelectSource(source.id);
                                            setSegment('songs');
                                        }}
                                        onContextMenu={event => {
                                            event.preventDefault();
                                            onPlaylistContextMenu(event, source);
                                        }}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className={styles.manageCardCover}>
                                            <FolderIcon size={22} />
                                        </div>
                                        <div className={styles.manageCardName}>{source.name}</div>
                                        <div className={styles.manageCardMeta}>
                                            {t('trackCount').replace('{count}', String(source.tracks.length))}
                                        </div>
                                        <button
                                            className={styles.manageCardRename}
                                            onClick={event => {
                                                event.stopPropagation();
                                                onRenameSource(source);
                                            }}
                                            type="button"
                                        >
                                            {t('ctxRenamePlaylist')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </React.Fragment>
                ) : null}

                {segment === 'import' ? (
                    <React.Fragment>
                        <div className={styles.manageSectionHead}>
                            <span className={styles.manageSectionTitle}>{t('manageSegImport')}</span>
                        </div>
                        <div
                            className={classNames(styles.manageDropzone, {
                                [styles.manageDropzoneActive]: dragActive
                            })}
                            onClick={onPickLocalFiles}
                            onDragEnter={event => {
                                event.preventDefault();
                                setDragActive(true);
                            }}
                            onDragLeave={() => setDragActive(false)}
                            onDragOver={event => {
                                event.preventDefault();
                                setDragActive(true);
                            }}
                            onDrop={handleDrop}
                            role="button"
                            tabIndex={0}
                        >
                            <NoteIcon size={26} />
                            <div className={styles.manageDropTitle}>{t('manageImportTip')}</div>
                            <div className={styles.manageDropHint}>{t('manageImportHint')}</div>
                        </div>
                        <div className={styles.manageImportActions}>
                            <button className={styles.managePrimaryBtn} onClick={onPickLocalFiles} type="button">
                                {t('managePickFiles')}
                            </button>
                            <button
                                className={styles.manageGhostBtn}
                                onClick={onOpenNeteaseSettings}
                                type="button"
                            >
                                <SlidersIcon size={13} />
                                <span>{t('manageNeteaseEntry')}</span>
                            </button>
                        </div>
                        <div className={styles.manageNote}>{t('manageNeteaseHint')}</div>
                    </React.Fragment>
                ) : null}
            </div>
        </div>
    );
};

ManagePane.propTypes = {
    t: PropTypes.func.isRequired,
    sources: PropTypes.arrayOf(PropTypes.object),
    isReadOnlySource: PropTypes.bool,
    currentTracks: PropTypes.arrayOf(PropTypes.object),
    currentSourceName: PropTypes.string,
    currentSourceId: PropTypes.string,
    onSelectSource: PropTypes.func,
    onPlayTrack: PropTypes.func,
    onTrackContextMenu: PropTypes.func,
    onPlaylistContextMenu: PropTypes.func,
    onCreatePlaylist: PropTypes.func,
    onPickLocalFiles: PropTypes.func,
    onImportFiles: PropTypes.func,
    onOpenNeteaseSettings: PropTypes.func,
    onBatchAddToPlaylist: PropTypes.func,
    onBatchRemove: PropTypes.func,
    onBatchDelete: PropTypes.func,
    onRenameSource: PropTypes.func
};

ManagePane.defaultProps = {
    isReadOnlySource: false,
    sources: [],
    currentTracks: []
};

export default ManagePane;
