import React, {memo, useCallback, useMemo, useState} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage} from './i18n';

// 设置内容区（右侧主内容，v6）：
//  - 不再使用全屏覆盖层：左侧导航栏常驻，本组件只占据右侧内容区；
//  - 内部禁止出现第二套左导航，分组切换统一用顶部一行分段控件（segmented chips，32px 高）；
//  - 内容最大宽度 560px、左对齐、左右内边距 24；每个分组是一张卡片（前景 4% 底、12px 圆角、16px 内边距）；
//  - 卡片内每行 44px：左 label 13/500（可选 11px 灰色副标题），右侧控件右对齐。
// 状态归属：已接入真实行为的项（默认音量 / 默认播放模式 / 默认排序 / 桌面歌词 / 歌词样式）由上层传入；
// 尚未接入持久化的项统一走 prefs 对象，只在界面层生效（报告中标注「仅界面占位」）。
const TABS = [
    {id: 'playback', key: 'settingsTabPlayback'},
    {id: 'playlist', key: 'settingsTabPlaylist'},
    {id: 'netease', key: 'settingsTabNetease'},
    {id: 'lyrics', key: 'settingsTabLyrics'}
];

const PLAY_MODES = [
    {id: 'manual', key: 'modeManual'},
    {id: 'auto', key: 'modeAuto'},
    {id: 'loop', key: 'modeLoop'}
];

const SORT_KEYS = [
    {id: 'title', key: 'sortTitle'},
    {id: 'artist', key: 'sortArtist'},
    {id: 'album', key: 'sortAlbum'},
    {id: 'added', key: 'sortAdded'}
];

const QUALITIES = [
    {id: 'standard', key: 'qualityStandard'},
    {id: 'higher', key: 'qualityHigher'},
    {id: 'highest', key: 'qualityHighest'}
];

const ALIGNS = [
    {id: 'center', key: 'alignCenter'},
    {id: 'left', key: 'alignLeft'}
];

// v8：默认启动页可选值（真实生效：由播放器窗口持久化并在下次打开时套用）
const VIEW_OPTIONS = [
    {id: 'home', key: 'viewHome'},
    {id: 'local', key: 'viewLocal'},
    {id: 'favorites', key: 'viewFavorites'},
    {id: 'last', key: 'viewLast'}
];

// 行骨架：左文案（label + 可选副标题） + 右侧控件
const Row = ({label, desc, tag, children}) => (
    <div className={styles.setRow}>
        <div className={styles.setRowText}>
            <div className={styles.setRowLabel}>
                <span>{label}</span>
                {tag ? <span className={styles.setTag}>{tag}</span> : null}
            </div>
            {desc ? <div className={styles.setRowDesc}>{desc}</div> : null}
        </div>
        <div className={styles.setRowControl}>{children}</div>
    </div>
);

// 开关：36x20 圆角胶囊，滑块 16px，开启时整体右移 16px
const Switch = ({on, onClick, label}) => (
    <button
        type="button"
        role="switch"
        aria-checked={!!on}
        aria-label={label}
        title={label}
        className={on ? `${styles.setSwitch} ${styles.setSwitchOn}` : styles.setSwitch}
        onClick={onClick}
    >
        <span className={styles.setKnob} />
    </button>
);

// 分段控件：32px 高、8px 圆角、选中项浅底 + 主题色文字（顶部 tab 与行内分段共用同一套类名）
const Seg = ({options, value, onChange, labelOf}) => (
    <div className={styles.seg} role="group">
        {options.map(o => (
            <button
                key={o.id}
                type="button"
                aria-pressed={o.id === value}
                className={o.id === value
                    ? `${styles.segItem} ${styles.segItemActive}`
                    : styles.segItem}
                onClick={() => onChange(o.id)}
            >
                {labelOf(o)}
            </button>
        ))}
    </div>
);

// 滑块 + 右侧数值（轨道 4px、thumb 12px，hover 放大到 14px 由 CSS 处理）
const Slider = ({value, min, max, step, onChange, text}) => (
    <div className={styles.setSliderWrap}>
        <input
            type="range"
            className={styles.setSlider}
            min={min}
            max={max}
            step={step || 1}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            aria-valuetext={text}
        />
        <span className={styles.setValue}>{text}</span>
    </div>
);

const SettingsPane = memo(function SettingsPane ({
    intl,
    initialTab,
    onClose,
    onOpenNetease,
    onClearLocalData,
    customSources,
    volume,
    onVolumeChange,
    playMode,
    onSetPlayMode,
    sortKey,
    onSortKeyChange,
    desktopLyrics,
    onToggleDesktopLyrics,
    defaultView,
    onDefaultViewChange,
    prefs,
    onPrefsChange
}) {
    const t = useCallback((key, values) => mpMessage(intl, key, values), [intl]);
    // 初始分段可由上层指定（如管理视图「导入」段的网易云入口直接落到 netease 分段）
    const [tab, setTab] = useState(initialTab || 'playback');

    const labelOf = useCallback(o => t(o.key), [t]);
    const onlyUi = useCallback(() => t('settingUiOnlyTag'), [t]);

    const customCount = useMemo(
        () => (customSources || []).filter(s => !s.builtin).length,
        [customSources]
    );

    return (
        <div className={styles.settingsPane}>
            <div className={styles.settingsPaneInner}>
                <div className={styles.settingsPaneHead}>
                    <span className={styles.settingsPaneTitle}>{t('settings')}</span>
                    <button className={styles.setGhostBtn} onClick={onClose}>
                        {t('settingDone')}
                    </button>
                </div>

                {/* 顶部一行分段控件：唯一的分组切换入口，不再有第二套左导航 */}
                <div className={styles.seg}>
                    {TABS.map(o => (
                        <button
                            key={o.id}
                            type="button"
                            aria-pressed={o.id === tab}
                            className={o.id === tab
                                ? `${styles.segItem} ${styles.segItemActive}`
                                : styles.segItem}
                            onClick={() => setTab(o.id)}
                        >
                            {t(o.key)}
                        </button>
                    ))}
                </div>

                {/* key 变化时重放入场淡入（120ms），切换分组右侧内容轻微 fade */}
                <div key={tab} className={styles.settingsBody}>
                    {tab === 'playback' && (
                        <div className={styles.setCard}>
                            {/* v8：默认启动页（真实持久化，下次打开播放器时生效） */}
                            <Row label={t('settingDefaultView')} desc={t('settingDefaultViewDesc')}>
                                <select
                                    className={styles.setSelect}
                                    value={defaultView || 'home'}
                                    onChange={e => onDefaultViewChange(e.target.value)}
                                    aria-label={t('settingDefaultView')}
                                >
                                    {VIEW_OPTIONS.map(o => (
                                        <option key={o.id} value={o.id}>{t(o.key)}</option>
                                    ))}
                                </select>
                            </Row>
                            <Row label={t('settingDefaultVolume')} desc={t('settingDefaultVolumeDesc')}>
                                <Slider
                                    min={0}
                                    max={100}
                                    value={volume}
                                    onChange={onVolumeChange}
                                    text={`${volume}%`}
                                />
                            </Row>
                            <Row label={t('settingPlayMode')}>
                                <Seg
                                    options={PLAY_MODES}
                                    value={playMode}
                                    onChange={onSetPlayMode}
                                    labelOf={labelOf}
                                />
                            </Row>
                            <Row label={t('settingHighlightRow')} tag={onlyUi()}>
                                <Switch
                                    on={prefs.highlightRow}
                                    label={t('settingHighlightRow')}
                                    onClick={() => onPrefsChange({highlightRow: !prefs.highlightRow})}
                                />
                            </Row>
                            <Row label={t('settingCrossfade')} desc={t('settingCrossfadeDesc')} tag={onlyUi()}>
                                <Switch
                                    on={prefs.crossfade}
                                    label={t('settingCrossfade')}
                                    onClick={() => onPrefsChange({crossfade: !prefs.crossfade})}
                                />
                            </Row>
                        </div>
                    )}

                    {tab === 'playlist' && (
                        <div className={styles.setCard}>
                            <Row label={t('settingSortDefault')}>
                                <select
                                    className={styles.setSelect}
                                    value={sortKey}
                                    onChange={e => onSortKeyChange(e.target.value)}
                                    aria-label={t('settingSortDefault')}
                                >
                                    {SORT_KEYS.map(o => (
                                        <option key={o.id} value={o.id}>{t(o.key)}</option>
                                    ))}
                                </select>
                            </Row>
                            <Row label={t('settingShowAlbum')} tag={onlyUi()}>
                                <Switch
                                    on={prefs.showAlbum}
                                    label={t('settingShowAlbum')}
                                    onClick={() => onPrefsChange({showAlbum: !prefs.showAlbum})}
                                />
                            </Row>
                            <Row label={t('settingShowCover')} tag={onlyUi()}>
                                <Switch
                                    on={prefs.showCover}
                                    label={t('settingShowCover')}
                                    onClick={() => onPrefsChange({showCover: !prefs.showCover})}
                                />
                            </Row>
                            <Row label={t('settingAutoPlayImported')} tag={onlyUi()}>
                                <Switch
                                    on={prefs.autoPlayImported}
                                    label={t('settingAutoPlayImported')}
                                    onClick={() => onPrefsChange({autoPlayImported: !prefs.autoPlayImported})}
                                />
                            </Row>
                            {/* 危险操作：清除本浏览器内的全部本地数据（歌单元数据 + 导入音频二进制） */}
                            <Row
                                label={t('settingClearData')}
                                desc={t('settingClearDataDesc')}
                            >
                                <button className={styles.setDangerBtn} onClick={onClearLocalData}>
                                    {t('settingClearData')}
                                </button>
                            </Row>
                        </div>
                    )}

                    {tab === 'netease' && (
                        <div className={styles.setCard}>
                            <Row label={t('settingSourceStatus')}>
                                <span className={styles.setStatus}>
                                    {customCount > 0
                                        ? t('settingSourceReady', {count: customCount})
                                        : t('settingSourceEmpty')}
                                </span>
                                <button className={styles.setTextBtn} onClick={onOpenNetease}>
                                    {t('settingOpenNetease')}
                                </button>
                            </Row>
                            <Row label={t('settingQuality')} tag={onlyUi()}>
                                <Seg
                                    options={QUALITIES}
                                    value={prefs.quality}
                                    onChange={v => onPrefsChange({quality: v})}
                                    labelOf={labelOf}
                                />
                            </Row>
                            <Row
                                label={t('settingPreferOfficialLrc')}
                                desc={t('settingPreferOfficialLrcDesc')}
                                tag={onlyUi()}
                            >
                                <Switch
                                    on={prefs.preferOfficialLrc}
                                    label={t('settingPreferOfficialLrc')}
                                    onClick={() => onPrefsChange({preferOfficialLrc: !prefs.preferOfficialLrc})}
                                />
                            </Row>
                        </div>
                    )}

                    {tab === 'lyrics' && (
                        <div className={styles.setCard}>
                            <Row label={t('desktopLyricsOn')}>
                                <Switch
                                    on={desktopLyrics}
                                    label={t('desktopLyricsOn')}
                                    onClick={onToggleDesktopLyrics}
                                />
                            </Row>
                            <Row label={t('settingFontSize')}>
                                <Slider
                                    min={12}
                                    max={28}
                                    value={prefs.lyricFontSize}
                                    onChange={v => onPrefsChange({lyricFontSize: v})}
                                    text={`${prefs.lyricFontSize}px`}
                                />
                            </Row>
                            <Row label={t('settingAlign')}>
                                <Seg
                                    options={ALIGNS}
                                    value={prefs.lyricAlign}
                                    onChange={v => onPrefsChange({lyricAlign: v})}
                                    labelOf={labelOf}
                                />
                            </Row>
                            <Row label={t('settingOpacity')}>
                                <Slider
                                    min={30}
                                    max={100}
                                    value={prefs.lyricOpacity}
                                    onChange={v => onPrefsChange({lyricOpacity: v})}
                                    text={`${prefs.lyricOpacity}%`}
                                />
                            </Row>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default injectIntl(SettingsPane);
