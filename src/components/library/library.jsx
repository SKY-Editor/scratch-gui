import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import LibraryItem from '../../containers/library-item.jsx';
import Modal from '../../containers/modal.jsx';
import ThemedWindow from '../tw-themed-window/themed-window.jsx';
import Divider from '../divider/divider.jsx';
import Filter from '../filter/filter.jsx';
import TagButton from '../../containers/tag-button.jsx';
import Spinner from '../spinner/spinner.jsx';
import Separator from '../tw-extension-separator/separator.jsx';
import RemovedTrademarks from '../tw-removed-trademarks/removed-trademarks.jsx';
import {APP_NAME} from '../../lib/brand.js';
// SKY Editor：浅色模式判定（与设置窗口 settings-window.jsx 同一判定源 theme.gui）
import {GUI_LIGHT} from '../../lib/themes/index.js';
// SKY Editor：「我的」页排序下拉菜单的勾选标记图标（复用设置窗口同款 check.svg）
import check from '../menu-bar/check.svg';
// SKY Editor：自定义扩展库地址归一化（补协议 / 去空白），与持久化层同一实现
import {CUSTOM_SOURCE_TAG, normalizeSourceUrl} from '../../lib/libraries/extensions/custom-sources.js';

import styles from './library.css';
import skyStyles from './sky-library.css';

const messages = defineMessages({
    filterPlaceholder: {
        id: 'gui.library.filterPlaceholder',
        defaultMessage: 'Search',
        description: 'Placeholder text for library search field'
    },
    allTag: {
        id: 'gui.library.allTag',
        defaultMessage: 'All',
        description: 'Label for library tag to revert to all items after filtering by tag.'
    }
});

const ALL_TAG = {tag: 'all', intlLabel: messages.allTag};
const tagListPrefix = [ALL_TAG];

// SKY Editor：窗口化扩展库「行级虚拟渲染」参数
// 卡片 CSS 固定高 17.25rem（276px）、网格行间距 14px，行高因此是常量，可精确换算滚动偏移。
const SKY_VIRTUAL_GAP = 14;
const SKY_VIRTUAL_ITEM_H = 276;
const SKY_VIRTUAL_SEP_H = 44;
// 可见区之外额外保留的行数（上下各 3 行）
const SKY_VIRTUAL_OVERSCAN_ROWS = 3;

class LibraryComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleFilterChange',
            'handleFilterClear',
            'handleMouseEnter',
            'handleMouseLeave',
            'handlePlayingEnd',
            'handleSelect',
            'handleUninstall',
            'handleFavorite',
            'handleTagClick',
            'handleMyClick',
            'handleToggleGroup',
            'handleSortByChange',
            'handleSortDirToggle',
            'handleSortDirSelect',
            'handleSortMenuToggle',
            'handleSortMenuMouseDown',
            'handleExperimentalClick',
            // SKY Editor：自定义扩展库（视图切换 + 表单 + 增删）
            'handleCustomClick',
            'handleCustomSourceClick',
            'renderCustomGroupButtons',
            'handleToggleSourceForm',
            'handleSourceNameChange',
            'handleSourceUrlChange',
            'handleAddSource',
            'handleRemoveSource',
            'renderCustomSourceManager',
            'matchesQuery',
            'refreshInstalledIds',
            'renderTagButtons',
            'renderLibraryGrid',
            'renderLibraryItem',
            'renderVirtualGrid',
            'handleGridScroll',
            'setFilteredDataRef'
        ]);
        this.windowBodyRef = React.createRef();
        // SKY Editor：「我的」页排序下拉菜单容器 ref（外点关闭用）
        this.sortMenuRef = React.createRef();
        const favorites = this.readFavoritesFromStorage();
        this.state = {
            playingItem: null,
            filterQuery: '',
            selectedTag: ALL_TAG.tag,
            canDisplay: false,
            favorites,
            initialFavorites: favorites,
            // SKY Editor 窗口化侧栏：当前视图（library 常规 / favorites 我的）
            activeView: 'library',
            // 「常规」分组收起状态（默认全部展开）
            collapsedGroups: {},
            // SKY Editor：侧栏「自定义」分类下选中的具体自定义库 id（null 表示未按库筛选）
            customSourceFilter: null,
            // 「我的」页排序：按收藏时间(默认)或名称首字母；降序(默认)或升序
            favoritesSortBy: 'favoriteTime',
            favoritesSortDir: 'desc',
            // 「我的」页排序下拉菜单展开状态
            favoritesSortMenuOpen: false,
            // SKY Editor 窗口化扩展库：当前已安装扩展 id 列表（卡片按钮据此显示「安装」/「删除」）
            installedIds: [],
            // SKY Editor：自定义扩展库页——添加表单展开状态与输入内容
            sourceFormOpen: false,
            sourceNameInput: '',
            sourceUrlInput: '',
            sourceFormError: '',
            // SKY Editor：窗口化扩展库当前渲染的行区间 [virtualStart, virtualEnd)
            virtualStart: 0,
            virtualEnd: 8,
            // 当前列数（默认窗口 922 宽 → 3 列）；由 ResizeObserver 观测宽度后更新
            virtualCols: 3
        };
        // SKY Editor：虚拟渲染缓存（行切分结果、行高实测值、行偏移前缀和、滚动节流帧）
        this.virtualRows = null;
        this.virtualSignature = '';
        this.virtualHeightCache = {};
        this.virtualOffsets = null;
        this.virtualScrollFrame = null;
        this.virtualSyncFrame = null;
    }
    componentDidMount () {
        // Rendering all the items in the library can take a bit, so we'll always
        // show one frame with a loading spinner.
        setTimeout(() => {
            this.setState({
                canDisplay: true
            });
        });
        if (this.props.setStopHandler) this.props.setStopHandler(this.handlePlayingEnd);
        // SKY Editor：windowed 模式下列数随窗口宽度分档（默认 3 列、全屏最多 6 列、
        // 中间按宽度递增 4/5 列自动排列）。用 ResizeObserver 观测窗口内容区宽度，
        // 实时写入 --sky-cols，窗口缩放时列数即时跟随。
        if (this.props.windowed) {
            this.setupColumnObserver();
            // SKY Editor：「我的」页排序下拉菜单——外点关闭（与设置窗口语言下拉同款 mousedown 判定）
            document.addEventListener('mousedown', this.handleSortMenuMouseDown);
        }
        // SKY Editor 窗口化扩展库：安装态轮询（卡片「安装/删除」按钮文案依据）。
        // 只在外部注入 getInstalledIds 时启用，其他库（sprite/sound 等）零影响；
        // 轮询用签名比对，安装态未变化时不触发 setState，避免整网格无谓重渲染。
        if (this.props.windowed && this.props.getInstalledIds) {
            this.refreshInstalledIds();
            this.installedTimer = setInterval(this.refreshInstalledIds, 700);
        }
        // SKY Editor：数据已在缓存中时首屏可能有内容，挂载后再校准一次行高与可视区间
        this.scheduleVirtualSync();
    }

    componentDidUpdate (prevProps, prevState) {
        if (prevState.filterQuery !== this.state.filterQuery ||
            prevState.selectedTag !== this.state.selectedTag ||
            prevState.activeView !== this.state.activeView) {
            this.scrollToTop();
        }

        if (this.state.favorites !== prevState.favorites) {
            try {
                localStorage.setItem(this.getFavoriteStorageKey(), JSON.stringify(this.state.favorites));
            } catch (error) {
                // ignore
            }
        }

        // SKY Editor：虚拟渲染——每次渲染后实测各行真实高度（分隔符行与卡片行不同），
        // 修正上下占位条高度，保证滚动条长度与滚动位置不偏移。
        // 实测值无变化时 syncVirtualHeights 内部直接返回，不会产生二次渲染循环。
        this.scheduleVirtualSync();
    }

    componentWillUnmount () {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        clearTimeout(this.columnTimer);
        clearInterval(this.installedTimer);
        if (this.virtualScrollFrame) cancelAnimationFrame(this.virtualScrollFrame);
        if (this.virtualSyncFrame) cancelAnimationFrame(this.virtualSyncFrame);
        document.removeEventListener('mousedown', this.handleSortMenuMouseDown);
    }

    // SKY Editor：把行高实测与可视区间校验收敛到同一帧，避免连续 setState 抖动
    scheduleVirtualSync () {
        if (!this.props.windowed) return;
        if (this.virtualSyncFrame) cancelAnimationFrame(this.virtualSyncFrame);
        this.virtualSyncFrame = requestAnimationFrame(() => {
            this.virtualSyncFrame = null;
            this.syncVirtualHeights();
        });
    }

    // SKY Editor：同步已安装扩展列表（仅在真实变化时更新 state）
    refreshInstalledIds () {
        if (!this.props.getInstalledIds) return;
        let ids;
        try {
            ids = this.props.getInstalledIds() || [];
        } catch (error) {
            ids = [];
        }
        const signature = ids.join('|');
        if (signature === this.installedSignature) return;
        this.installedSignature = signature;
        this.setState({installedIds: ids});
    }

    setupColumnObserver () {
        const el = this.windowBodyRef && this.windowBodyRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        // 窗口最大化/还原有过渡动画，宽度连续变化会反复触发整网格重排造成卡顿。
        // 因此不实时更新列数，改为宽度稳定后一次切换，避免逐帧重排；
        // 防抖取 50ms（虚拟渲染已让重排开销归零，故可较以前更激进，让切换更跟手）。
        this.resizeObserver = new ResizeObserver(entries => {
            const width = entries[0].contentRect.width;
            clearTimeout(this.columnTimer);
            this.columnTimer = setTimeout(() => {
                this.updateColumnCount(width);
            }, 50);
        });
        this.resizeObserver.observe(el);
        // 初始同步一次（默认窗口 922 → 3 列）
        this.updateColumnCount(el.getBoundingClientRect().width);
    }

    updateColumnCount (width) {
        // 按窗口内容区实际宽度换算列数：≥1500→6（全屏）、≥1240→5、≥980→4，否则 3
        const cols = width >= 1500 ? 6 : width >= 1240 ? 5 : width >= 980 ? 4 : 3;
        if (this.getVirtualCols() === cols) return;
        // SKY Editor：列数改为 React state 驱动——虚拟渲染的行切分与 grid 的 --sky-cols
        // 在同一次渲染里一起更新，不会出现「列变了、行分组还是旧的」的错位帧。
        // 原 FLIP 位移动画依赖卡片 DOM 在两种布局间保持同一节点，行切分重建后不再成立，
        // 重排过程改由行内卡片的 CSS 入场过渡（淡入 + 轻微上移）表现。
        if (this.flipTimer) {
            clearTimeout(this.flipTimer);
            this.flipTimer = null;
        }
        this.setState({virtualCols: cols}, () => {
            // 行切分已在本次渲染中按新列数重建：用新偏移重新计算可视区间，
            // 保持当前滚动位置继续显示对应内容，不会出现中间空白。
            this.scheduleVirtualSync();
        });
    }
    cleanupFlip () {
        if (this.windowBodyRef && this.windowBodyRef.current) {
            const cards = this.windowBodyRef.current.querySelectorAll('.sky-library-card');
            Array.prototype.forEach.call(cards, c => {
                c.style.transition = '';
                c.style.transform = '';
            });
        }
    }
    handleSelect (id) {
        // SKY Editor：任何主题下启用扩展都不关闭扩展窗口/页面，用户可继续点击其他扩展或手动关闭。
        // （原 TurboWarp 行为是启用后自动关闭，此处按需求去除 handleClose。）
        this.props.onItemSelected(this.getFilteredData()[id]);
        // SKY Editor：安装完成后尽快同步「安装/删除」按钮状态（轮询之外的即时刷新）
        setTimeout(this.refreshInstalledIds, 300);
        setTimeout(this.refreshInstalledIds, 1200);
    }
    // SKY Editor：卡片底部「删除」按钮 → 通知上层卸载该扩展（真正的卸载由 container 调 vm 完成）
    handleUninstall (id) {
        if (!this.props.onItemUninstall) return;
        const dataItem = this.getFilteredData()[id];
        if (!dataItem) return;
        this.props.onItemUninstall(dataItem);
    }
    readFavoritesFromStorage () {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(this.getFavoriteStorageKey()));
        } catch (error) {
            // ignore
        }
        if (!Array.isArray(data)) {
            data = [];
        }
        // SKY Editor：收藏存储结构升级为 [{id, time}] 对象数组。
        // 旧版本存储的是纯 id 字符串数组，读取时归一化：字符串 → {id: str, time: 0}，
        // time=0 表示旧收藏无时间，排序时恒排最末。
        return data.map(item => (
            typeof item === 'object' && item !== null && typeof item.id !== 'undefined' ?
                {id: item.id, time: typeof item.time === 'number' ? item.time : 0} :
                {id: item, time: 0}
        ));
    }
    getFavoriteStorageKey () {
        return `tw:library-favorites:${this.props.id}`;
    }
    handleFavorite (id) {
        const data = this.getFilteredData()[id];
        const key = data[this.props.persistableKey];
        this.setState(oldState => ({
            favorites: oldState.favorites.some(f => f.id === key) ? (
                oldState.favorites.filter(f => f.id !== key)
            ) : (
                [...oldState.favorites, {id: key, time: Date.now()}]
            )
        }));
    }
    handleClose () {
        this.props.onRequestClose();
    }
    handleTagClick (tag) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: '',
                selectedTag: tag.toLowerCase(),
                // 切到其它标签时解除「自定义」分类下的单库筛选
                customSourceFilter: null,
                // SKY Editor：点击常规标签时回到常规视图（「我的」视图由侧栏「我的」按钮进入）
                activeView: 'library'
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[[this.state.playingItem]]);
            this.setState({
                filterQuery: '',
                playingItem: null,
                selectedTag: tag.toLowerCase(),
                customSourceFilter: null,
                activeView: 'library'
            });
        }
    }
    // SKY Editor：侧栏「我的」为独立页面入口（不再是开/关式切换按钮）。
    // 点击即进入「我的」页面并高亮；再次点击保持不动（不会退出），
    // 离开「我的」靠点击「常规」分类下的任一标签或「实验性」。
    handleMyClick () {
        if (this.state.activeView === 'favorites') return;
        this.setState({
            activeView: 'favorites',
            filterQuery: '',
            selectedTag: ALL_TAG.tag,
            customSourceFilter: null,
            favoritesSortMenuOpen: false
        });
    }
    // SKY Editor：侧栏分组标题——展开/收起指定分组（regular 常规 / custom 自定义）
    handleToggleGroup (group = 'regular') {
        this.setState(oldState => ({
            collapsedGroups: {
                ...oldState.collapsedGroups,
                [group]: !oldState.collapsedGroups[group]
            }
        }));
    }
    // SKY Editor：侧栏「自定义」分类下的单个扩展库——点击只显示该库的扩展
    handleCustomSourceClick (sourceId) {
        if (!sourceId) return;
        this.setState({
            activeView: 'library',
            filterQuery: '',
            selectedTag: CUSTOM_SOURCE_TAG,
            customSourceFilter: sourceId
        });
    }
    // SKY Editor：「我的」页排序方式切换（收藏时间 / 名称首字母）——点击下拉选项后更新并关闭菜单
    handleSortByChange (value) {
        this.setState({
            favoritesSortBy: value,
            favoritesSortMenuOpen: false
        });
    }
    // SKY Editor：「我的」页排序下拉菜单开合
    handleSortMenuToggle () {
        this.setState(oldState => ({
            favoritesSortMenuOpen: !oldState.favoritesSortMenuOpen
        }));
    }
    // SKY Editor：「我的」页排序下拉菜单外点关闭（document mousedown 时菜单容器不含目标则收起）
    handleSortMenuMouseDown (e) {
        if (this.sortMenuRef.current && !this.sortMenuRef.current.contains(e.target)) {
            this.setState({
                favoritesSortMenuOpen: false
            });
        }
    }
    // SKY Editor：「我的」页排序方向切换（升序 / 降序）
    handleSortDirToggle () {
        this.setState(oldState => ({
            favoritesSortDir: oldState.favoritesSortDir === 'desc' ? 'asc' : 'desc'
        }));
    }

    handleSortDirSelect (dir) {
        this.setState({
            favoritesSortDir: dir,
            favoritesSortMenuOpen: false
        });
    }
    // SKY Editor：侧栏「实验性」按钮——进入实验性空态视图
    handleExperimentalClick () {
        this.setState({
            selectedTag: 'experimental',
            activeView: 'library',
            filterQuery: '',
            customSourceFilter: null
        });
    }
    // SKY Editor：侧栏「自定义扩展库」按钮——进入自定义源管理视图（已在则不再切换）
    handleCustomClick () {
        if (this.state.activeView === 'custom') return;
        this.setState({
            activeView: 'custom',
            selectedTag: ALL_TAG.tag,
            customSourceFilter: null,
            filterQuery: '',
            sourceFormOpen: false,
            sourceNameInput: '',
            sourceUrlInput: '',
            sourceFormError: ''
        });
    }
    // SKY Editor：展开/收起「添加扩展库」表单
    handleToggleSourceForm () {
        this.setState(oldState => ({
            sourceFormOpen: !oldState.sourceFormOpen,
            sourceNameInput: '',
            sourceUrlInput: '',
            sourceFormError: ''
        }));
    }
    handleSourceNameChange (e) {
        this.setState({
            sourceNameInput: e.target.value,
            sourceFormError: ''
        });
    }
    handleSourceUrlChange (e) {
        this.setState({
            sourceUrlInput: e.target.value,
            sourceFormError: ''
        });
    }
    // SKY Editor：提交新增自定义扩展库（地址做协议补全与去重，成功后由容器重新聚合并复用缓存）
    handleAddSource () {
        const url = normalizeSourceUrl(this.state.sourceUrlInput);
        if (!url) {
            this.setState({
                sourceFormError: '请输入扩展库地址'
            });
            return;
        }
        if (!this.props.onAddCustomSource) return;
        const name = this.state.sourceNameInput.trim() || url;
        const result = this.props.onAddCustomSource({name, url});
        if (result && result.ok === false) {
            let message = '扩展库地址无效，请检查后重试';
            if (result.reason === 'duplicate') {
                message = '该扩展库地址已存在';
            } else if (result.reason === 'builtin') {
                message = '该扩展库已内置，无需添加';
            }
            this.setState({
                sourceFormError: message
            });
            return;
        }
        this.setState({
            sourceFormOpen: false,
            sourceNameInput: '',
            sourceUrlInput: '',
            sourceFormError: ''
        });
    }
    // SKY Editor：删除自定义扩展库（二次确认，仅移除源配置，不影响已安装扩展）
    handleRemoveSource (id) {
        if (!this.props.onRemoveCustomSource) return;
        // eslint-disable-next-line no-alert
        const confirmed = window.confirm('确定要删除这个自定义扩展库吗？已安装的扩展不受影响。');
        if (!confirmed) return;
        this.props.onRemoveCustomSource(id);
    }
    handleMouseEnter (id) {
        // don't restart if mouse over already playing item
        if (this.props.onItemMouseEnter && this.state.playingItem !== id) {
            this.props.onItemMouseEnter(this.getFilteredData()[id]);
            this.setState({
                playingItem: id
            });
        }
    }
    handleMouseLeave (id) {
        if (this.props.onItemMouseLeave) {
            this.props.onItemMouseLeave(this.getFilteredData()[id]);
            this.setState({
                playingItem: null
            });
        }
    }
    handlePlayingEnd () {
        if (this.state.playingItem !== null) {
            this.setState({
                playingItem: null
            });
        }
    }
    handleFilterChange (event) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: event.target.value,
                selectedTag: ALL_TAG.tag
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[[this.state.playingItem]]);
            this.setState({
                filterQuery: event.target.value,
                playingItem: null,
                selectedTag: ALL_TAG.tag
            });
        }
    }
    handleFilterClear () {
        this.setState({filterQuery: ''});
    }
    getFilteredData () {
        // SKY Editor 窗口化扩展库：收藏不再无条件前置，通过左侧栏「我的」按钮进入收藏视图；
        // 此改造仅作用于 windowed 模式，其他库（非窗口化）保留原有行为。
        if (this.props.windowed) {
            // 自定义扩展库视图：整页由自定义源管理面板渲染，网格区不展示扩展卡片，
            // 直接返回空数组，避免 applyFilters 把 sectionTitle 等结构项当数据过滤。
            if (this.state.activeView === 'custom') return [];
            if (this.state.activeView === 'favorites') {
                // 「我的」视图：仅展示已收藏扩展，支持查询过滤与排序（不做标签过滤）
                // 用 this.state.favorites（实时收藏态）而非 initialFavorites（仅构造时初始化）：
                // handleFavorite 只更新 favorites，同一会话新点收藏后切到「我的」必须立刻可见；
                // 空态判断（filteredData.length === 0）同样随之正确。
                let list = this.props.data.filter(dataItem => (
                    dataItem !== '---' &&
                    dataItem.type !== 'sectionTitle' &&
                    this.state.favorites.some(f => f.id === dataItem[this.props.persistableKey])
                ));
                if (this.state.filterQuery) {
                    list = list.filter(dataItem => this.matchesQuery(dataItem));
                }
                // 排序：收藏时间（time=0 的旧收藏恒排最末，无论方向）/ 名称首字母（localeCompare zh）
                const dir = this.state.favoritesSortDir;
                const favoriteTimeOf = dataItem => {
                    const fav = this.state.favorites.find(f => f.id === dataItem[this.props.persistableKey]);
                    return fav ? fav.time : 0;
                };
                const nameOf = dataItem => {
                    if (!dataItem.name) return '';
                    if (typeof dataItem.name === 'string') return dataItem.name;
                    try {
                        return this.props.intl.formatMessage(dataItem.name.props, {APP_NAME});
                    } catch (error) {
                        return '';
                    }
                };
                list = [...list].sort((a, b) => {
                    if (this.state.favoritesSortBy === 'favoriteTime') {
                        const ta = favoriteTimeOf(a);
                        const tb = favoriteTimeOf(b);
                        if (ta === 0 && tb === 0) return 0;
                        if (ta === 0) return 1; // 旧收藏（无时间）恒排最末
                        if (tb === 0) return -1;
                        return dir === 'desc' ? tb - ta : ta - tb;
                    }
                    const r = nameOf(a).localeCompare(nameOf(b), 'zh');
                    return dir === 'desc' ? -r : r;
                });
                return list;
            }
            const list = this.applyFilters(this.props.data);
            // 侧栏「自定义」分类下选中了具体库：只保留该库的扩展及其小节标题
            if (this.state.customSourceFilter) {
                const sectionKey = `section-custom-${this.state.customSourceFilter}`;
                return list.filter(dataItem => (
                    dataItem !== '---' && (
                        dataItem.type === 'sectionTitle' ?
                            dataItem.key === sectionKey :
                            dataItem.customSourceId === this.state.customSourceFilter
                    )
                ));
            }
            return list;
        }

        // When no filtering, favorites get their own section
        if (this.state.selectedTag === 'all' && !this.state.filterQuery) {
            const favoriteItems = this.props.data
                .filter(dataItem => (
                    this.state.initialFavorites.some(f => f.id === dataItem[this.props.persistableKey])
                ))
                .map(dataItem => ({
                    ...dataItem,
                    key: `favorite-${dataItem[this.props.persistableKey]}`
                }));

            if (favoriteItems.length) {
                favoriteItems.push('---');
            }

            return [
                ...favoriteItems,
                ...this.props.data
            ];
        }

        // When filtering, favorites are just listed first, not in a separate section.
        const favoriteItems = [];
        const nonFavoriteItems = [];
        for (const dataItem of this.props.data) {
            if (dataItem === '---') {
                // ignore
            } else if (this.state.initialFavorites.some(f => f.id === dataItem[this.props.persistableKey])) {
                favoriteItems.push(dataItem);
            } else {
                nonFavoriteItems.push(dataItem);
            }
        }

        let filteredItems = favoriteItems.concat(nonFavoriteItems);

        if (this.state.selectedTag !== 'all') {
            filteredItems = filteredItems.filter(dataItem => (
                dataItem.tags &&
                dataItem.tags.map(i => i.toLowerCase()).includes(this.state.selectedTag)
            ));
        }

        if (this.state.filterQuery) {
            filteredItems = filteredItems.filter(dataItem => {
                const search = [...dataItem.tags];
                if (dataItem.name) {
                    // Use the name if it is a string, else use formatMessage to get the translated name
                    if (typeof dataItem.name === 'string') {
                        search.push(dataItem.name);
                    } else {
                        search.push(this.props.intl.formatMessage(dataItem.name.props, {
                            APP_NAME
                        }));
                    }
                }
                if (dataItem.description) {
                    if (typeof dataItem.description === 'string') {
                        search.push(dataItem.description);
                    } else {
                        search.push(this.props.intl.formatMessage(dataItem.description.props, {
                            APP_NAME
                        }));
                    }
                }
                return search
                    .join('\n')
                    .toLowerCase()
                    .includes(this.state.filterQuery.toLowerCase());
            });
        }

        return filteredItems;
    }
    applyFilters (list) {
        let filteredItems = list;
        if (this.state.selectedTag !== 'all') {
            filteredItems = filteredItems.filter(dataItem => (
                dataItem !== '---' &&
                dataItem.tags &&
                dataItem.tags.map(i => i.toLowerCase()).includes(this.state.selectedTag)
            ));
        }
        if (this.state.filterQuery) {
            filteredItems = filteredItems.filter(dataItem => this.matchesQuery(dataItem));
        }
        return filteredItems;
    }
    // 查询匹配（供 applyFilters 与「我的」视图复用）：'---' 分隔符与分组标题不参与匹配
    matchesQuery (dataItem) {
        if (!this.state.filterQuery) return true;
        if (dataItem === '---' || dataItem.type === 'sectionTitle') {
            return false;
        }
        const search = [...dataItem.tags];
        if (dataItem.name) {
            // Use the name if it is a string, else use formatMessage to get the translated name
            if (typeof dataItem.name === 'string') {
                search.push(dataItem.name);
            } else {
                search.push(this.props.intl.formatMessage(dataItem.name.props, {
                    APP_NAME
                }));
            }
        }
        if (dataItem.description) {
            if (typeof dataItem.description === 'string') {
                search.push(dataItem.description);
            } else {
                search.push(this.props.intl.formatMessage(dataItem.description.props, {
                    APP_NAME
                }));
            }
        }
        return search
            .join('\n')
            .toLowerCase()
            .includes(this.state.filterQuery.toLowerCase());
    }
    scrollToTop () {
        // 自定义扩展库视图为整页面板，滚动容器未挂载，需容错
        if (this.filteredDataRef) {
            this.filteredDataRef.scrollTop = 0;
        }
    }
    setFilteredDataRef (ref) {
        this.filteredDataRef = ref;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SKY Editor：窗口化扩展库「行级虚拟渲染」
    // 卡顿根因：一次把数百张卡片（实测曾达 477 张）全部挂载进 DOM，首帧就要建几千个节点、
    // 触发上百次图片解码，滚动与列数切换自然卡。改为：
    //   1) 把条目按当前列数切成「行」，分隔符/分组标题独占一行；
    //   2) 只渲染「可见区 + 上下各 3 行」的行，其余高度用上下两个占位条撑住；
    //   3) 滚动用 requestAnimationFrame 节流，可视区间未变化不 setState；
    //   4) 行 key 取行内首张卡片自身 key，滚动时同一行可被 React 复用而不是重建。
    // 卡片高度由 CSS 固定（17.25rem），行高是常量，故偏移可精确换算，滚动条不会跳动。
    // ══════════════════════════════════════════════════════════════════════
    getVirtualCols () {
        const cols = parseInt(this.state.virtualCols, 10);
        return cols > 0 ? cols : 3;
    }

    isVirtualSeparator (dataItem) {
        return dataItem === '---' || Boolean(dataItem && dataItem.type === 'sectionTitle');
    }

    buildVirtualRows (items, cols) {
        const rows = [];
        let bucket = null;
        const flush = () => {
            if (bucket && bucket.length) rows.push({type: 'items', entries: bucket});
            bucket = null;
        };
        items.forEach((dataItem, index) => {
            if (this.isVirtualSeparator(dataItem)) {
                flush();
                rows.push({type: 'sep', dataItem, index});
                return;
            }
            if (!bucket) bucket = [];
            bucket.push({dataItem, index});
            if (bucket.length >= cols) flush();
        });
        flush();
        return rows;
    }

    // 数据/列数/视图变化时重建行切分缓存；其余情况复用，避免每次渲染都重算
    ensureVirtualRows (items) {
        const cols = this.getVirtualCols();
        const first = items[0];
        const last = items[items.length - 1];
        const fingerprint = item => (item && typeof item === 'object' ?
            `${item.key || item.name || item.rawURL || ''}` : String(item));
        const signature = [
            cols,
            items.length,
            fingerprint(first),
            fingerprint(last),
            this.state.activeView,
            this.state.selectedTag,
            this.state.filterQuery,
            this.state.customSourceFilter,
            this.state.favoritesSortBy,
            this.state.favoritesSortDir
        ].join('|');
        if (this.virtualSignature === signature && this.virtualRows) return this.virtualRows;
        this.virtualSignature = signature;
        this.virtualRows = this.buildVirtualRows(items, cols);
        this.virtualHeightCache = {};
        this.virtualOffsets = null;
        return this.virtualRows;
    }

    getVirtualRowHeight (row, index) {
        const measured = this.virtualHeightCache[index];
        if (measured) return measured;
        return row.type === 'sep' ? SKY_VIRTUAL_SEP_H : SKY_VIRTUAL_ITEM_H;
    }

    buildVirtualOffsets () {
        const rows = this.virtualRows || [];
        const offsets = new Array(rows.length + 1);
        offsets[0] = 0;
        for (let i = 0; i < rows.length; i++) {
            offsets[i + 1] = offsets[i] + this.getVirtualRowHeight(rows[i], i) + SKY_VIRTUAL_GAP;
        }
        this.virtualOffsets = offsets;
        return offsets;
    }

    computeVirtualRange (scrollTop, viewHeight, rows, offsets) {
        const keep = SKY_VIRTUAL_OVERSCAN_ROWS * (SKY_VIRTUAL_ITEM_H + SKY_VIRTUAL_GAP);
        const top = Math.max(0, scrollTop - keep);
        const bottom = scrollTop + viewHeight + keep;
        let start = rows.length;
        for (let i = 0; i < rows.length; i++) {
            if (offsets[i + 1] > top) {
                start = i;
                break;
            }
        }
        if (start >= rows.length) start = Math.max(0, rows.length - 1);
        let end = rows.length;
        for (let i = start; i < rows.length; i++) {
            if (offsets[i] >= bottom) {
                end = i;
                break;
            }
        }
        if (end <= start) end = Math.min(rows.length, start + 1);
        return {start, end};
    }

    updateVirtualWindow (force) {
        const el = this.filteredDataRef;
        const rows = this.virtualRows;
        if (!el || !rows || !rows.length) return;
        const offsets = this.virtualOffsets || this.buildVirtualOffsets();
        const range = this.computeVirtualRange(
            el.scrollTop,
            el.clientHeight || 420,
            rows,
            offsets
        );
        if (!force && range.start === this.state.virtualStart && range.end === this.state.virtualEnd) return;
        this.setState({virtualStart: range.start, virtualEnd: range.end});
    }

    handleGridScroll () {
        if (!this.props.windowed) return;
        if (this.virtualScrollFrame) return;
        this.virtualScrollFrame = requestAnimationFrame(() => {
            this.virtualScrollFrame = null;
            this.updateVirtualWindow(false);
        });
    }

    // 实测各行真实高度（分隔符行与卡片行不同），修正占位高度，防止滚动条长度/位置漂移
    syncVirtualHeights () {
        const el = this.filteredDataRef;
        if (!el || !this.virtualRows) return;
        const nodes = el.querySelectorAll('[data-sky-row]');
        if (!nodes.length) return;
        let changed = false;
        Array.prototype.forEach.call(nodes, node => {
            const index = parseInt(node.getAttribute('data-sky-row'), 10);
            const height = node.offsetHeight;
            if (!(height > 0) || isNaN(index)) return;
            const cached = this.virtualHeightCache[index];
            if (typeof cached !== 'number' || Math.abs(cached - height) > 1) {
                this.virtualHeightCache[index] = height;
                changed = true;
            }
        });
        if (!changed) return;
        this.buildVirtualOffsets();
        this.updateVirtualWindow(true);
    }

    renderVirtualGrid (filteredData) {
        const rows = this.ensureVirtualRows(filteredData);
        if (!rows.length) return null;
        const cols = this.getVirtualCols();
        const offsets = this.virtualOffsets || this.buildVirtualOffsets();
        const total = offsets[offsets.length - 1] || 0;
        const lastIndex = rows.length - 1;
        const start = Math.min(Math.max(this.state.virtualStart, 0), lastIndex);
        const end = Math.min(Math.max(this.state.virtualEnd, start + 1), rows.length);
        const topPad = Math.max(0, (offsets[start] || 0) - SKY_VIRTUAL_GAP);
        const bottomPad = Math.max(0, total - (offsets[end] || 0) - SKY_VIRTUAL_GAP);
        const children = [];
        if (topPad > 0) {
            children.push(
                <div
                    key="sky-virtual-pad-top"
                    className="sky-virtual-pad"
                    style={{height: topPad}}
                />
            );
        }
        for (let i = start; i < end; i++) {
            const row = rows[i];
            if (row.type === 'sep') {
                children.push(
                    <div
                        key={`sky-virtual-sep-${row.index}`}
                        className="sky-virtual-row sky-virtual-row-sep"
                        data-sky-row={i}
                    >
                        {row.dataItem === '---' ? (
                            <Separator />
                        ) : (
                            <Separator title={row.dataItem.title} />
                        )}
                    </div>
                );
            } else {
                const lead = row.entries[0];
                const leadKey = lead.dataItem.key ||
                    (typeof lead.dataItem.name === 'string' ? lead.dataItem.name : lead.dataItem.rawURL);
                // key 取「行首卡片的身份 + 其数据下标」：滚动时同一行稳定复用，
                // 列数变化导致行首卡片改变时也能保证 key 唯一，不会串行重排。
                children.push(
                    <div
                        key={`sky-virtual-row-${leadKey || 'row'}-${lead.index}`}
                        className="sky-virtual-row"
                        data-sky-row={i}
                        style={{gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`}}
                    >
                        {row.entries.map(entry => this.renderLibraryItem(entry.dataItem, entry.index))}
                    </div>
                );
            }
        }
        if (bottomPad > 0) {
            children.push(
                <div
                    key="sky-virtual-pad-bottom"
                    className="sky-virtual-pad"
                    style={{height: bottomPad}}
                />
            );
        }
        return children;
    }

    // 单张扩展卡（虚拟渲染与非虚拟渲染共用同一份 props 映射）
    renderLibraryItem (dataItem, index) {
        return (
            <LibraryItem
                bluetoothRequired={dataItem.bluetoothRequired}
                collaborator={dataItem.collaborator}
                description={dataItem.description}
                disabled={dataItem.disabled}
                extensionId={dataItem.extensionId}
                href={dataItem.href}
                featured={dataItem.featured}
                hidden={dataItem.hidden}
                iconMd5={dataItem.costumes ? dataItem.costumes[0].md5ext : dataItem.md5ext}
                iconRawURL={dataItem.rawURL}
                icons={dataItem.costumes}
                id={index}
                incompatibleWithScratch={dataItem.incompatibleWithScratch}
                installed={this.state.installedIds.indexOf(dataItem.extensionId) !== -1}
                favorite={this.state.favorites.some(f => f.id === dataItem[this.props.persistableKey])}
                onFavorite={this.handleFavorite}
                onUninstall={this.handleUninstall}
                insetIconURL={dataItem.insetIconURL}
                internetConnectionRequired={dataItem.internetConnectionRequired}
                isPlaying={this.state.playingItem === index}
                key={dataItem.key || (
                    typeof dataItem.name === 'string' ?
                        dataItem.name :
                        dataItem.rawURL
                )}
                name={dataItem.name}
                credits={dataItem.credits}
                samples={dataItem.samples}
                docsURI={dataItem.docsURI}
                showPlayButton={this.props.showPlayButton}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                onSelect={this.handleSelect}
                sourceTag={dataItem.sourceTag}
                sourceColor={this.props.sourceColors && this.props.sourceColors[dataItem.sourceTag]}
                windowed={this.props.windowed}
            />
        );
    }

    // SKY Editor：渲染「常规」分组内的标签按钮（windowed 侧栏使用，非窗口化 tagWrapper 复用）
    // 「所有」已独立成置顶项、「自定义」已独立成最下方分类，这里都不再输出
    renderTagButtons (includeAllTag = false) {
        // SKY Editor：「我的」「自定义扩展库」都是独立页面，进入后侧栏不再高亮任何来源标签，
        // 避免与这两个置顶独立项的选中态冲突
        const isFavoritesView = this.state.activeView === 'favorites' || this.state.activeView === 'custom';
        const regularTags = (this.props.tags || []).filter(
            tagProps => tagProps.tag.toLowerCase() !== CUSTOM_SOURCE_TAG
        );
        // 非窗口化的旧标签栏没有独立「所有」按钮，此处按老行为把「所有」放在最前
        const tagItems = includeAllTag && this.props.windowed !== true ?
            tagListPrefix.concat(regularTags) :
            regularTags;
        return tagItems.map((tagProps, id) => (
            <TagButton
                active={!isFavoritesView && this.state.selectedTag === tagProps.tag.toLowerCase()}
                className={classNames(
                    styles.filterBarItem,
                    styles.tagButton,
                    'sky-tag-button',
                    !isFavoritesView && this.state.selectedTag === tagProps.tag.toLowerCase() ?
                        'sky-tag-button-active' : null,
                    tagProps.className
                )}
                key={`tag-button-${id}`}
                onClick={this.handleTagClick}
                {...tagProps}
            />
        ));
    }
    // SKY Editor：渲染侧栏「自定义」分类下的子项——每个自定义扩展库一项，点击只看该库的扩展
    renderCustomGroupButtons () {
        const sources = this.props.customSources || [];
        const isFavoritesView = this.state.activeView === 'favorites' || this.state.activeView === 'custom';
        return sources.map(source => {
            const active = !isFavoritesView &&
                this.state.selectedTag === CUSTOM_SOURCE_TAG &&
                this.state.customSourceFilter === source.id;
            return (
                <TagButton
                    active={active}
                    className={classNames(
                        styles.filterBarItem,
                        styles.tagButton,
                        'sky-tag-button',
                        'sky-tag-button-custom-source',
                        active ? 'sky-tag-button-active' : null
                    )}
                    intlLabel={source.name || source.url}
                    key={`custom-source-${source.id}`}
                    onClick={() => this.handleCustomSourceClick(source.id)}
                    tag={source.id}
                    title={source.name || source.url}
                />
            );
        });
    }
    // SKY Editor：渲染「自定义扩展库」管理页（源列表 + 添加表单 + 删除）
    // 结构对齐「我的」独立页：顶部工具条（页内标题 + 数量 + 右侧按钮），下方可滚动列表
    renderCustomSourceManager () {
        const sources = this.props.customSources || [];
        // 统计每个自定义库当前聚合到的扩展条目数（为 0 通常说明地址不是有效清单）
        const countBySource = {};
        (this.props.data || []).forEach(item => {
            if (item && item.customSourceId) {
                countBySource[item.customSourceId] = (countBySource[item.customSourceId] || 0) + 1;
            }
        });
        return (
            <div className="sky-extension-source-page">
                <div className="sky-extension-pagehead sky-extension-source-toolbar">
                    <div className="sky-extension-pagehead-lead">
                        <span className="sky-extension-pagehead-icon" />
                        <span className="sky-extension-pagehead-title">自定义扩展库</span>
                        {sources.length > 0 && (
                            <span className="sky-extension-pagehead-count">{sources.length}</span>
                        )}
                    </div>
                    <button
                        type="button"
                        className={classNames('sky-extension-source-add', {
                            'sky-extension-source-add-open': this.state.sourceFormOpen
                        })}
                        onClick={this.handleToggleSourceForm}
                        title="添加扩展库"
                    >
                        {this.state.sourceFormOpen ? '取消' : '+ 添加扩展库'}
                    </button>
                </div>
                {this.state.sourceFormOpen && (
                    <div className="sky-extension-source-form">
                        <input
                            className="sky-extension-source-input"
                            type="text"
                            placeholder="名称（可留空，默认使用地址）"
                            value={this.state.sourceNameInput}
                            onChange={this.handleSourceNameChange}
                        />
                        <input
                            className="sky-extension-source-input sky-extension-source-input-url"
                            type="text"
                            placeholder="扩展库地址，例如 https://example.com/extensions"
                            value={this.state.sourceUrlInput}
                            onChange={this.handleSourceUrlChange}
                            onKeyDown={e => {
                                if (e.key === 'Enter') this.handleAddSource();
                            }}
                        />
                        <div className="sky-extension-source-form-footer">
                            <span className="sky-extension-source-hint">
                                支持 JSON 清单地址，也支持扩展库网页（自动探测清单）
                            </span>
                            <button
                                type="button"
                                className="sky-extension-source-confirm"
                                onClick={this.handleAddSource}
                            >
                                添加
                            </button>
                        </div>
                        {this.state.sourceFormError && (
                            <div className="sky-extension-source-error">{this.state.sourceFormError}</div>
                        )}
                    </div>
                )}
                <div className="sky-extension-source-list">
                    {sources.length === 0 ? (
                        <div className="sky-extension-source-empty">
                            <span
                                className="sky-extension-empty-icon sky-extension-empty-icon-folder"
                                aria-hidden="true"
                            />
                            <span className="sky-extension-empty-title">还没有自定义扩展库</span>
                            <span className="sky-extension-empty-desc">点击右上角「添加扩展库」填入地址即可接入</span>
                        </div>
                    ) : sources.map(source => (
                        <div
                            className="sky-extension-source-row"
                            key={source.id}
                        >
                            <div className="sky-extension-source-info">
                                <div className="sky-extension-source-title-row">
                                    <span className="sky-extension-source-name">{source.name}</span>
                                    <span
                                        className={classNames('sky-extension-source-count', {
                                            'sky-extension-source-count-empty': !countBySource[source.id]
                                        })}
                                    >
                                        {countBySource[source.id] ?
                                            `${countBySource[source.id]} 个扩展` :
                                            '未读取到扩展'}
                                    </span>
                                </div>
                                <span className="sky-extension-source-url">{source.url}</span>
                            </div>
                            <button
                                type="button"
                                className="sky-extension-source-remove"
                                onClick={() => this.handleRemoveSource(source.id)}
                                title="删除该扩展库"
                            >
                                删除
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    // SKY Editor：渲染扩展网格（含「实验性」空态与「我的」空态）
    renderLibraryGrid () {
        const filteredData = this.state.canDisplay && this.props.data && this.getFilteredData();
        return (
            <React.Fragment>
                {!filteredData && this.props.windowed && (
                    /* SKY Editor：窗口内加载层——脱离网格，直接撑满内容区并居中，不用转圈 */
                    <div className="sky-extension-loader">
                        <div className="sky-extension-loader-dots">
                            <span />
                            <span />
                            <span />
                        </div>
                        <span className="sky-extension-loader-text">正在加载扩展库</span>
                    </div>
                )}
                <div
                    className={classNames(
                        styles.libraryScrollGrid,
                        {'sky-extension-grid-hidden': !filteredData && this.props.windowed},
                        {
                            [styles.withFilterBar]: this.props.filterable || this.props.tags
                        }
                    )}
                    ref={this.setFilteredDataRef}
                    // 列数写入 CSS 变量：非窗口化视图不写，保持原有固定列宽不变
                    style={this.props.windowed ? {'--sky-cols': this.getVirtualCols()} : null}
                    onScroll={this.handleGridScroll}
                >
                {filteredData && this.props.windowed && this.state.selectedTag === 'experimental' &&
                    filteredData.length === 0 && (
                    <div className="sky-extension-experimental-empty">
                        <span
                            className="sky-extension-empty-icon sky-extension-empty-icon-lab"
                            aria-hidden="true"
                        />
                        <span className="sky-extension-empty-title">暂无实验性扩展</span>
                        <span className="sky-extension-empty-desc">开启「实验性」分类后，相关扩展会显示在这里</span>
                    </div>
                )}
                {filteredData && this.props.windowed && this.state.activeView === 'favorites' &&
                    filteredData.length === 0 && (
                    <div className="sky-extension-favorites-empty">
                        <span
                            className="sky-extension-empty-icon sky-extension-empty-icon-star"
                            aria-hidden="true"
                        />
                        <span className="sky-extension-empty-title">还没有收藏的扩展</span>
                        <span className="sky-extension-empty-desc">点击扩展卡片右上角的星形图标，收藏后会显示在这里</span>
                    </div>
                )}
                {filteredData && this.props.windowed && this.state.customSourceFilter &&
                    filteredData.length === 0 && (
                    <div className="sky-extension-custom-source-empty">
                        <span
                            className="sky-extension-empty-icon sky-extension-empty-icon-info"
                            aria-hidden="true"
                        />
                        <span className="sky-extension-empty-title">该扩展库暂无可用扩展</span>
                        <span className="sky-extension-empty-desc">可能是地址不是有效的扩展清单，请检查来源地址</span>
                    </div>
                )}
                {filteredData && this.props.windowed && this.renderVirtualGrid(filteredData)}
                {filteredData && !this.props.windowed && filteredData.map((dataItem, index) => (
                    dataItem === '---' ? (
                        <Separator key={index} />
                    ) : dataItem.type === 'sectionTitle' ? (
                        <Separator
                            key={dataItem.key || index}
                            title={dataItem.title}
                        />
                    ) : this.renderLibraryItem(dataItem, index)
                ))}
                {filteredData && this.props.removedTrademarks && (
                    <React.Fragment>
                        {filteredData.length > 0 && (
                            <Separator />
                        )}
                        <RemovedTrademarks />
                    </React.Fragment>
                )}
                {!filteredData && !this.props.windowed && (
                    <div className={styles.spinnerWrapper}>
                        <Spinner
                            large
                            level="primary"
                        />
                    </div>
                )}
                </div>
            </React.Fragment>
        );
    }
    render () {
        // SKY Editor：windowed 模式下搜索框放到左侧栏顶部（filterBar 内、标签之前），
        // 非窗口化仍保留在原顶部导航位置
        const filter = this.props.filterable ? (
            <Filter
                className={classNames(
                    styles.filterBarItem,
                    styles.filter,
                    this.props.windowed ? 'sky-extension-filter' : null
                )}
                filterQuery={this.state.filterQuery}
                inputClassName={classNames(
                    styles.filterInput,
                    this.props.windowed ? 'sky-extension-filter-input' : null
                )}
                iconClassName={this.props.windowed ? skyStyles.filterIcon : null}
                xIconWrapperClassName={this.props.windowed ? skyStyles.xIconWrapper : null}
                placeholderText={this.props.intl.formatMessage(messages.filterPlaceholder)}
                onChange={this.handleFilterChange}
                onClear={this.handleFilterClear}
            />
        ) : null;
        // SKY Editor：侧栏「我的」按钮收藏数角标（仅 windowed 使用）
        const favoriteCount = this.state.favorites.length;
        // SKY Editor：侧栏「自定义扩展库」按钮角标——已添加的自定义库数量
        const customSourceCount = (this.props.customSources || []).length;
        // SKY Editor：「我的」「自定义扩展库」都是独立页面，进入后侧栏不标亮任何来源标签
        const isDetachedView = this.state.activeView === 'favorites' || this.state.activeView === 'custom';
        const customSources = this.props.customSources || [];
        const libraryContent = (
            <React.Fragment>
                {(this.props.filterable || this.props.tags) && (
                    <div className={styles.filterBar}>
                        {filter}
                        {this.props.windowed ? (
                            /* SKY Editor 窗口化侧栏（结构对齐高级设置窗口 settings-window.jsx）：
                               搜索框（顶部）→「我的」置顶独立项(window-tab) →「常规」分类(window-category
                               + window-category-items 展开动画，子项 window-tab) →「实验性」置顶独立项 */
                            <React.Fragment>
                                {/* 「我的」：置顶独立项，对齐设置窗口「账号」的 window-tab 样式 */}
                                <button
                                    className={classNames(
                                        'sky-extension-my-button',
                                        {'sky-extension-my-button-active': this.state.activeView === 'favorites'}
                                    )}
                                    onClick={this.handleMyClick}
                                    title="我的"
                                >
                                    <span>我的</span>
                                    {favoriteCount > 0 && (
                                        <span className="sky-extension-fav-count">{favoriteCount}</span>
                                    )}
                                </button>
                                {/* 「自定义扩展库」：置顶独立项，位于「我的」下方；进入后可添加/删除扩展库地址 */}
                                <button
                                    className={classNames(
                                        'sky-extension-my-button',
                                        'sky-extension-custom-button',
                                        {'sky-extension-my-button-active': this.state.activeView === 'custom'}
                                    )}
                                    onClick={this.handleCustomClick}
                                    title="自定义扩展库"
                                >
                                    <span>自定义扩展库</span>
                                    {customSourceCount > 0 && (
                                        <span className="sky-extension-fav-count">{customSourceCount}</span>
                                    )}
                                </button>
                                {/* 「所有」：独立项（不再混在「常规」分类里），紧接「自定义扩展库」按钮下方 */}
                                <TagButton
                                    active={!isDetachedView && this.state.selectedTag === ALL_TAG.tag}
                                    className={classNames(
                                        styles.filterBarItem,
                                        styles.tagButton,
                                        'sky-tag-button',
                                        'sky-tag-button-all',
                                        {'sky-tag-button-active':
                                            !isDetachedView && this.state.selectedTag === ALL_TAG.tag}
                                    )}
                                    key="tag-button-all"
                                    onClick={this.handleTagClick}
                                    {...ALL_TAG}
                                />
                                {/* 「常规」：window-category 分组标题（caret + label，点击切换 collapsedGroups.regular） */}
                                <button
                                    className={classNames(
                                        'sky-extension-group-header',
                                        {'sky-extension-group-expanded': !this.state.collapsedGroups.regular}
                                    )}
                                    onClick={() => this.handleToggleGroup('regular')}
                                    title="常规"
                                >
                                    <span className="sky-extension-group-caret">{'▼'}</span>
                                    <span className="sky-extension-group-label">常规</span>
                                </button>
                                {/* 「常规」分组内容：grid 0fr→1fr + opacity 展开动画，与设置窗口 window-category-items 一致 */}
                                <div
                                    className={classNames(
                                        'sky-extension-group-items',
                                        {'sky-extension-group-items-expanded': !this.state.collapsedGroups.regular}
                                    )}
                                >
                                    <div className="sky-extension-group-items-inner">
                                        {this.renderTagButtons()}
                                    </div>
                                </div>
                                {/* 「实验性」：独立项 */}
                                <button
                                    className={classNames(
                                        'sky-extension-experimental-button',
                                        {'sky-extension-experimental-button-active':
                                            !isDetachedView &&
                                            this.state.selectedTag === 'experimental'}
                                    )}
                                    onClick={this.handleExperimentalClick}
                                    title="实验性"
                                >
                                    实验性
                                </button>
                                {/* 「自定义」：作为分类分组置于侧栏最下方，每个自定义扩展库为一个子项 */}
                                <button
                                    className={classNames(
                                        'sky-extension-group-header',
                                        {'sky-extension-group-expanded': !this.state.collapsedGroups.custom}
                                    )}
                                    onClick={() => this.handleToggleGroup('custom')}
                                    title="自定义"
                                >
                                    <span className="sky-extension-group-caret">{'▼'}</span>
                                    <span className="sky-extension-group-label">自定义</span>
                                </button>
                                <div
                                    className={classNames(
                                        'sky-extension-group-items',
                                        {'sky-extension-group-items-expanded': !this.state.collapsedGroups.custom}
                                    )}
                                >
                                    <div className="sky-extension-group-items-inner">
                                        {customSources.length > 0 ? this.renderCustomGroupButtons() : (
                                            <div className="sky-extension-custom-empty">暂无自定义扩展库</div>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                                {this.props.filterable && this.props.tags && (
                                    <Divider className={classNames(styles.filterBarItem, styles.divider)} />
                                )}
                                {this.props.tags &&
                                    <div className={styles.tagWrapper}>
                                        {this.renderTagButtons(true)}
                                    </div>
                                }
                            </React.Fragment>
                        )}
                    </div>
                )}
                {this.props.windowed ? (
                    <div className="sky-extension-grid-area">
                        {/* SKY Editor：自定义扩展库为独立页面，整页渲染源管理面板（列表 + 添加表单） */}
                        {this.state.activeView === 'custom' ? this.renderCustomSourceManager() : (
                            <React.Fragment>
                                {this.state.activeView === 'favorites' && (
                                    <div className="sky-extension-pagehead">
                                        {/* 左：图标 + 双行标题（主标题 + 当前排序状态说明） */}
                                        <div className="sky-extension-pagehead-lead">
                                            {/* 左：图标 + 标题 + 计数徽标（单行，去掉副标题堆叠） */}
                                            <span className="sky-extension-pagehead-icon" />
                                            <span className="sky-extension-pagehead-title">我的收藏</span>
                                            {favoriteCount > 0 && (
                                                <span className="sky-extension-pagehead-count">{favoriteCount}</span>
                                            )}
                                        </div>
                                        {/* 右：单一排序入口，点击展开排序面板（方式 + 顺序） */}
                                        <div
                                            className="sky-extension-sort"
                                            ref={this.sortMenuRef}
                                        >
                                            <button
                                                type="button"
                                                className={classNames('sky-extension-sort-trigger', {
                                                    'sky-extension-sort-trigger-open': this.state.favoritesSortMenuOpen
                                                })}
                                                onClick={this.handleSortMenuToggle}
                                                aria-label="排序方式"
                                                aria-expanded={this.state.favoritesSortMenuOpen}
                                            >
                                                <span className="sky-extension-sort-trigger-icon" />
                                            <span className="sky-extension-sort-trigger-text">
                                                {this.state.favoritesSortBy === 'name' ? '名称' : '收藏时间'}
                                                <span className="sky-extension-sort-trigger-sep">{'·'}</span>
                                                {this.state.favoritesSortDir === 'desc' ? '降序' : '升序'}
                                            </span>
                                            <span className="sky-extension-sort-trigger-caret" />
                                            </button>
                                            {this.state.favoritesSortMenuOpen && (
                                                <div className="sky-extension-sort-panel">
                                                    <div className="sky-extension-sort-panel-label">排序方式</div>
                                                    <button
                                                        type="button"
                                                        className={classNames('sky-extension-sort-panel-item', {
                                                            'sky-extension-sort-panel-item-selected':
                                                                this.state.favoritesSortBy === 'favoriteTime'
                                                        })}
                                                        onClick={() => this.handleSortByChange('favoriteTime')}
                                                    >
                                                        <span>收藏时间</span>
                                                        <Check selected={this.state.favoritesSortBy === 'favoriteTime'} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={classNames('sky-extension-sort-panel-item', {
                                                            'sky-extension-sort-panel-item-selected':
                                                                this.state.favoritesSortBy === 'name'
                                                        })}
                                                        onClick={() => this.handleSortByChange('name')}
                                                    >
                                                        <span>名称首字母</span>
                                                        <Check selected={this.state.favoritesSortBy === 'name'} />
                                                    </button>
                                                    <div className="sky-extension-sort-panel-sep" />
                                                    <div className="sky-extension-sort-panel-label">排列顺序</div>
                                                    <div className="sky-extension-sort-seg">
                                                        <button
                                                            type="button"
                                                            className={classNames('sky-extension-sort-seg-btn', {
                                                                'sky-extension-sort-seg-btn-active': this.state.favoritesSortDir === 'asc'
                                                            })}
                                                            onClick={() => this.handleSortDirSelect('asc')}
                                                        >
                                                            升序
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={classNames('sky-extension-sort-seg-btn', {
                                                                'sky-extension-sort-seg-btn-active': this.state.favoritesSortDir === 'desc'
                                                            })}
                                                            onClick={() => this.handleSortDirSelect('desc')}
                                                        >
                                                            降序
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {this.renderLibraryGrid()}
                            </React.Fragment>
                        )}
                    </div>
                ) : this.renderLibraryGrid()}
            </React.Fragment>
        );

        // SKY Editor：扩展库在 sky-editor 主题下以仿 Win11 窗口呈现（铁律：仅该主题生效）
        if (this.props.windowed) {
            // SKY Editor 浅色模式：窗口本身随主题变白，侧栏/卡片等硬编码深色样式需同步切换浅色方案
            const isLight = Boolean(this.props.theme && this.props.theme.gui === GUI_LIGHT);
            return (
                <ThemedWindow
                    title={this.props.title}
                    onClose={this.handleClose}
                    icon={this.props.icon}
                    id={this.props.id}
                    width={922}
                    height={567}
                >
                    <div
                        className={classNames(skyStyles.skyWindowBody, {
                            [skyStyles.skyWindowBodyLight]: isLight
                        })}
                        ref={this.windowBodyRef}
                    >
                        {libraryContent}
                    </div>
                </ThemedWindow>
            );
        }

        return (
            <Modal
                fullScreen
                contentLabel={this.props.title}
                id={this.props.id}
                onRequestClose={this.handleClose}
            >
                {libraryContent}
            </Modal>
        );
    }
}

// SKY Editor：「我的」页排序下拉菜单的勾选标记（与设置窗口语言下拉同款 Check 组件）
const Check = ({selected}) => (
    <img
        className={classNames('sky-extension-sort-check', {
            'sky-extension-sort-check-selected': selected
        })}
        src={check}
        draggable={false}
        width={15}
        height={12}
        alt=""
    />
);

Check.propTypes = {
    selected: PropTypes.bool
};

LibraryComponent.propTypes = {
    data: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.oneOfType([
            /* eslint-disable react/no-unused-prop-types, lines-around-comment */
            // An item in the library
            PropTypes.shape({
                // @todo remove md5/rawURL prop from library, refactor to use storage
                md5: PropTypes.string,
                name: PropTypes.oneOfType([
                    PropTypes.string,
                    PropTypes.node
                ]),
                rawURL: PropTypes.string
            }),
            PropTypes.string
            /* eslint-enable react/no-unused-prop-types, lines-around-comment */
        ])),
        PropTypes.instanceOf(Promise)
    ]),
    filterable: PropTypes.bool,
    icon: PropTypes.string,
    id: PropTypes.string.isRequired,
    persistableKey: PropTypes.string,
    intl: intlShape.isRequired,
    onItemMouseEnter: PropTypes.func,
    onItemMouseLeave: PropTypes.func,
    // SKY Editor：卡片「删除」按钮回调（卸载扩展）
    onItemUninstall: PropTypes.func,
    // SKY Editor：读取当前已安装扩展 id 列表（安装态轮询用，未提供则不轮询）
    getInstalledIds: PropTypes.func,
    onItemSelected: PropTypes.func,
    onRequestClose: PropTypes.func,
    setStopHandler: PropTypes.func,
    showPlayButton: PropTypes.bool,
    // SKY Editor：来源品牌色映射（sourceTag → 颜色），供卡片右下角来源标签取色
    sourceColors: PropTypes.object,
    tags: PropTypes.arrayOf(PropTypes.shape(TagButton.propTypes)),
    title: PropTypes.string.isRequired,
    removedTrademarks: PropTypes.bool,
    windowed: PropTypes.bool,
    // SKY Editor：主题对象，用于判定浅色/深色模式（theme.gui === 'light'）
    theme: PropTypes.shape({
        gui: PropTypes.string
    }),
    // SKY Editor：自定义扩展库源列表（[{id, name, url}]，容器从 localStorage 读取后透传）
    customSources: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        url: PropTypes.string
    })),
    // SKY Editor：新增自定义扩展库（返回 {ok, reason} 供表单提示，如地址重复）
    onAddCustomSource: PropTypes.func,
    // SKY Editor：删除自定义扩展库
    onRemoveCustomSource: PropTypes.func
};

LibraryComponent.defaultProps = {
    filterable: true,
    persistableKey: 'name',
    showPlayButton: false,
    windowed: false,
    customSources: []
};

export default injectIntl(LibraryComponent);
