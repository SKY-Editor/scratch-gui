import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import skyFallbackExtensions from '../lib/libraries/extensions/sky-aggregated.js';
// SKY Editor：用户自定义扩展库源（添加/删除 + 自动探测清单地址）
import {
    addCustomSource,
    CUSTOM_SOURCE_TAG,
    fetchCustomSourceExtensions,
    readCustomSources,
    removeCustomSource
} from '../lib/libraries/extensions/custom-sources.js';
import extensionTags from '../lib/libraries/tw-extension-tags';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        });
    }
    return extension;
};

const translateGalleryItem = (extension, locale) => ({
    ...extension,
    name: extension.nameTranslations[locale] || extension.name,
    description: extension.descriptionTranslations[locale] || extension.description
});

// SKY Editor：删除（卸载）已安装扩展。
// scratch-vm 原版没有公开卸载 API，优先调用运行期补丁提供的 removeExtension；
// 没有该能力时按 runtime 内部结构安全降级：
// ① 从 runtime._blockInfo 移除该扩展信息并注销其 opcode 原语（普通积木 + 帽子积木）；
// ② 从 extensionManager._loadedExtensions 删除记录（isExtensionLoaded 依据此表）；
// ③ 触发 workspaceUpdate 让积木区重建工具箱，去掉该扩展分类。
// 返回是否成功卸载。
const unloadExtension = (vm, extensionId) => {
    if (!vm || !extensionId) return false;
    const extensionManager = vm.extensionManager;
    const runtime = vm.runtime;
    try {
        if (extensionManager && typeof extensionManager.removeExtension === 'function') {
            extensionManager.removeExtension(extensionId);
            if (typeof vm.emitWorkspaceUpdate === 'function') {
                vm.emitWorkspaceUpdate();
            }
            return true;
        }
        if (!runtime) return false;
        if (Array.isArray(runtime._blockInfo)) {
            const index = runtime._blockInfo.findIndex(info => info && info.id === extensionId);
            if (index !== -1) {
                const info = runtime._blockInfo[index];
                const blocks = Array.isArray(info.blocks) ? info.blocks : [];
                blocks.forEach(block => {
                    const opcode = block && block.info && block.info.opcode;
                    if (!opcode) return;
                    if (runtime._primitives) delete runtime._primitives[opcode];
                    if (runtime._hats) delete runtime._hats[opcode];
                });
                runtime._blockInfo.splice(index, 1);
            }
        }
        if (extensionManager && extensionManager._loadedExtensions &&
            typeof extensionManager._loadedExtensions.forEach === 'function') {
            // 键名在不同加载路径下可能是 extensionId，也可能是加载 URL，因此按「键或记录 id」双条件匹配删除
            const staleKeys = [];
            extensionManager._loadedExtensions.forEach((value, key) => {
                if (key === extensionId || (value && value.id === extensionId)) {
                    staleKeys.push(key);
                }
            });
            staleKeys.forEach(key => extensionManager._loadedExtensions.delete(key));
            if (staleKeys.length === 0) extensionManager._loadedExtensions.delete(extensionId);
        }
        if (extensionManager && extensionManager._loadedExtensionsById &&
            typeof extensionManager._loadedExtensionsById.delete === 'function') {
            extensionManager._loadedExtensionsById.delete(extensionId);
        }
        if (typeof vm.emitWorkspaceUpdate === 'function') {
            vm.emitWorkspaceUpdate();
        }
        return true;
    } catch (error) {
        log.error(error);
        return false;
    }
};

// SKY Editor 扩展库聚合数据源（对齐 02Engine 已验证实现，字段与 TW extensions-v0.json 一致）
// 各源均可独立失败：单源异常不影响其余来源，全部失败时走 sky-aggregated.js 离线兜底。
const SOURCE_02ENGINE = {
    url: 'https://extensions.02engine.02studio.xyz/extensions.json',
    map: data => data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `https://extensions.02engine.02studio.xyz/extension/${extension.slug}.js`,
        iconURL: `https://extensions.02engine.02studio.xyz/image/${extension.image || 'images/unknown.svg'}`,
        tags: ['ztengine'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => {
            if (credit.link) {
                return (
                    <a
                        href={credit.link}
                        target="_blank"
                        rel="noreferrer"
                        key={credit.name}
                    >
                        {credit.name}
                    </a>
                );
            }
            return credit.name;
        }),
        docsURI: null,
        samples: extension.samples ? extension.samples.map(sample => ({
            href: `${process.env.ROOT}editor?project_url=https://extensions.02engine.02studio.xyz/samples/${encodeURIComponent(sample)}.sb3`,
            text: sample
        })) : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: false
    }))
};

// SKY Editor：PointerEditor 扩展库为内置来源（与 TurboWarp/02Engine 同级，归入「常规」分类），
// 其站点是扩展库网页，需借助 fetchCustomSourceExtensions 的探测逻辑定位真正的 JSON 清单。
const SOURCE_PEDITOR = {
    id: 'peditor',
    name: 'PointerEditor',
    url: 'https://peditor.ctspace.xyz/extensions',
    tag: 'peditor'
};

const SOURCE_TW = {
    url: 'https://extensions.turbowarp.org/generated-metadata/extensions-v0.json',
    map: data => data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
        iconURL: `https://extensions.turbowarp.org/${extension.image || 'images/unknown.svg'}`,
        tags: ['tw'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => {
            if (credit.link) {
                return (
                    <a
                        href={credit.link}
                        target="_blank"
                        rel="noreferrer"
                        key={credit.name}
                    >
                        {credit.name}
                    </a>
                );
            }
            return credit.name;
        }),
        docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
        samples: extension.samples ? extension.samples.map(sample => ({
            href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
            text: sample
        })) : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: false
    }))
};

const SOURCE_SHARKPOOL = {
    url: 'https://sharkpoolextensions.02studio.xyz/Gallery%20Files/Extension-Keys.json',
    map: data => Object.entries(data.extensions).map(([slug, extension]) => ({
        name: slug,
        nameTranslations: {},
        description: extension.desc,
        descriptionTranslations: {},
        extensionId: slug,
        extensionURL: `https://sharkpoolextensions.02studio.xyz/extension-code/${extension.url}`,
        iconURL: `https://sharkpoolextensions.02studio.xyz/extension-thumbs/${extension.banner || 'images/unknown.svg'}`,
        tags: [...(extension.tags || []), 'sp'],
        credits: (extension.creator || '')
            .split(',')
            .map(creator => creator.trim())
            .filter(Boolean),
        docsURI: null,
        samples: null,
        incompatibleWithScratch: false,
        featured: false
    }))
};

// ─── rw-extensions.pages.dev 统一聚合索引（RemixWarp 扩展库）────────────────────
// 该站把各家编辑器扩展统一为标准 TW 画廊格式（extensionId/extensionURL/iconURL/tags/credits 等），
// 并附带 pages.dev 镜像 URL，覆盖 AstraEditor/Bilup/CY ScrExt Hub/Mistium/PenguinMod/Yesshape，
// 另含 RemixWarp 自有扩展。统一格式可直接消费，避免每家手写字段映射。
// rw 不覆盖的来源（TurboWarp 全量 / SharkPool / 02Engine 全量）仍走上方原站 SOURCE_*。
const RW_INDEX_URL = 'https://rw-extensions.pages.dev';
const RW_TAG_MAP = {
    'astraeditor': 'astra',
    'penguinmod': 'pm',
    'mistium': 'mist',
    'cy-scr-ext-hub': 'cy',
    'bilup': 'bilup',
    'yesshape': 'yesshape',
    'remixwarp': 'remixwarp'
};
const mapRwEntry = extension => {
    const sourceTag = (extension.tags || [])[0];
    return {
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description || '',
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.extensionId,
        extensionURL: extension.extensionURL,
        iconURL: extension.iconURL || 'https://extensions.turbowarp.org/images/unknown.svg',
        tags: [RW_TAG_MAP[sourceTag] || sourceTag || 'tw'],
        credits: (extension.credits || []).map(credit => {
            if (credit && typeof credit === 'object') {
                if (credit.link) {
                    return (
                        <a
                            href={credit.link}
                            target="_blank"
                            rel="noreferrer"
                            key={credit.name}
                        >
                            {credit.name}
                        </a>
                    );
                }
                return credit.name;
            }
            return credit;
        }),
        docsURI: extension.docsURI || null,
        samples: extension.samples || null,
        incompatibleWithScratch: Boolean(extension.incompatibleWithScratch),
        featured: false
    };
};

// rw 统一索引子源：AstraEditor / Bilup / CY ScrExt Hub / Mistium / PenguinMod / Yesshape
const RW_SOURCES = [
    {key: 'astra', path: '/astraeditor/extensions-index.json'},
    {key: 'bilup', path: '/bilup/extensions-index.json'},
    {key: 'cy', path: '/cy-scr-ext-hub/extensions-index.json'},
    {key: 'mist', path: '/mistium/extensions-index.json'},
    {key: 'pm', path: '/penguinmod/extensions-index.json'},
    {key: 'yesshape', path: '/yesshape/extensions-index.json'}
].map(source => ({
    url: `${RW_INDEX_URL}${source.path}`,
    map: data => data.extensions.map(mapRwEntry)
}));

// RemixWarp 自有扩展：rw 根索引中 tag=remixwarp 的条目
const SOURCE_REMIXWARP = {
    url: `${RW_INDEX_URL}/extensions-index.json`,
    map: data => data.extensions
        .filter(extension => (extension.tags || []).includes('remixwarp'))
        .map(mapRwEntry)
};

let cachedGallery = null;

// customSources：用户在「自定义扩展库」中添加的源；任一源失败只少一个分组，不影响内置源。
const fetchLibrary = async (customSources = []) => {
    const safeFetch = async (source, defaultData = []) => {
        try {
            const res = await fetch(source.url);
            if (!res.ok) {
                throw new Error(`HTTP status ${res.status}`);
            }
            const data = source.raw ? await res.text() : await res.json();
            return source.map(data);
        } catch (error) {
            log.error(error);
            return defaultData;
        }
    };

    const safeFetchCustom = async source => {
        try {
            return await fetchCustomSourceExtensions(source);
        } catch (error) {
            log.error(error);
            return [];
        }
    };

    const results = await Promise.allSettled([
        safeFetch(SOURCE_02ENGINE),
        safeFetch(SOURCE_TW),
        safeFetch(SOURCE_SHARKPOOL),
        safeFetchCustom(SOURCE_PEDITOR),
        ...RW_SOURCES.map(source => safeFetch(source)),
        safeFetch(SOURCE_REMIXWARP),
        ...customSources.map(source => safeFetchCustom(source))
    ]);

    const merged = results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);

    if (merged.length === 0) {
        throw new Error('All extension sources unavailable');
    }
    return merged;
};

// 聚合扩展的来源分组（顺序即展示顺序，标题与 tw-extension-tags 的 intlLabel 对应）。
// SKY Editor：各编辑器扩展库按来源分区展示，避免全部内容混在一起。
const SOURCE_GROUP_ORDER = [
    CUSTOM_SOURCE_TAG,
    'tw',
    'peditor',
    'ztengine',
    'astra',
    'pm',
    'mist',
    'sp',
    'bilup',
    'cy',
    'yesshape',
    'remixwarp'
];
const SOURCE_GROUP_LABELS = {
    [CUSTOM_SOURCE_TAG]: '自定义扩展库',
    tw: 'TurboWarp',
    peditor: 'PointerEditor',
    ztengine: '02Engine',
    astra: 'AstraEditor',
    pm: 'PenguinMod',
    mist: 'Mist',
    sp: 'SharkPool',
    bilup: 'Bilup',
    cy: 'CY ScrExt Hub',
    yesshape: 'Yesshape',
    remixwarp: 'RemixWarp'
};
const sourceGroupOf = item => {
    // 自定义源条目在抓取时已注入 customSourceId，统一归入「自定义扩展库」分组（组内再按库分小节）
    if (item && item.customSourceId) return CUSTOM_SOURCE_TAG;
    const sourceTag = (item.tags || []).find(tag => SOURCE_GROUP_LABELS[tag]);
    return SOURCE_GROUP_LABELS[sourceTag] ? sourceTag : 'tw';
};

// SKY Editor：扩展来源品牌色映射（卡片右下角来源标签底色）。
// 前 8 个为各编辑器官方品牌色；remixwarp/mist/cy/yesshape 暂用中性灰蓝兜底（品牌色未确认）。
export const SOURCE_COLORS = {
    scratch: '#FF7B26', // Scratch 官方橙
    tw: '#FF4C4C', // TurboWarp
    peditor: '#446ce0', // PointerEditor 品牌色
    skyeditor: '#1C86FF', // SKY Editor
    ztengine: '#00BAAD', // 02Engine
    astra: '#0099FF', // AstraEditor
    pm: '#51D3F4', // PenguinMod
    sp: '#00A6FF', // SharkPool
    bilup: '#75C1C4', // Bilup
    remixwarp: '#7A8A99', // 未确认品牌色，中性灰蓝兜底
    mist: '#7A8A99',
    cy: '#7A8A99',
    yesshape: '#7A8A99',
    [CUSTOM_SOURCE_TAG]: '#8B5CF6' // 用户自定义扩展库
};

// 为扩展数据项注入来源标签（sourceTag），供卡片右下角来源彩色标签使用。
// '---' 分隔符等非对象项原样透传，避免污染库结构。
const withSourceTag = (item, sourceTag) => (
    typeof item === 'object' && item !== null ? {...item, sourceTag} : item
);

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleItemUninstall',
            'getInstalledIds',
            'loadGallery',
            'handleAddCustomSource',
            'handleRemoveCustomSource'
        ]);
        // SKY Editor：自定义扩展库源（localStorage 持久化，首次使用自动写入预置源）
        const customSources = readCustomSources();
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false,
            offline: false,
            customSources
        };
        this.galleryTimeout = null;
    }
    componentDidMount () {
        if (!this.state.gallery) {
            this.loadGallery(this.state.customSources);
        }
    }
    componentWillUnmount () {
        clearTimeout(this.galleryTimeout);
    }
    // SKY Editor：拉取全部扩展源（内置 + 自定义）。自定义源增删后重跑一次即可，无需刷新页面。
    loadGallery (customSources) {
        clearTimeout(this.galleryTimeout);
        this.galleryTimeout = setTimeout(() => {
            this.setState({
                galleryTimedOut: true
            });
        }, 750);

        fetchLibrary(customSources)
            .then(gallery => {
                cachedGallery = gallery;
                this.setState({
                    gallery,
                    galleryError: null,
                    offline: false
                });
                clearTimeout(this.galleryTimeout);
            })
            .catch(error => {
                log.error(error);
                this.setState({
                    galleryError: error,
                    offline: true
                });
                clearTimeout(this.galleryTimeout);
            });
    }
    // SKY Editor：新增自定义扩展库 → 写入 localStorage 并重新聚合
    handleAddCustomSource (source) {
        const result = addCustomSource(source);
        if (result.ok) {
            this.setState({
                customSources: result.sources,
                gallery: null,
                galleryError: null,
                offline: false,
                galleryTimedOut: false
            });
            this.loadGallery(result.sources);
        }
        return result;
    }
    // SKY Editor：删除自定义扩展库 → 写入 localStorage 并重新聚合
    handleRemoveCustomSource (id) {
        const result = removeCustomSource(id);
        this.setState({
            customSources: result.sources,
            gallery: null,
            galleryError: null,
            offline: false,
            galleryTimedOut: false
        });
        this.loadGallery(result.sources);
        return result;
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        const url = item.extensionURL ? item.extensionURL : extensionId;
        if (!item.disabled) {
            if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
                this.props.onCategorySelected(extensionId);
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url)
                    .then(() => {
                        this.props.onCategorySelected(extensionId);
                    })
                    .catch(err => {
                        log.error(err);
                        // eslint-disable-next-line no-alert
                        alert(err);
                    });
            }
        }
    }
    // SKY Editor：读取当前已安装（已加载）扩展 id 列表，供卡片按钮显示「安装」/「删除」。
    // 同时收集 Map 的 key 与记录自身的 id，兼容不同加载路径下的键名差异。
    getInstalledIds () {
        const vm = this.props.vm;
        const extensionManager = vm && vm.extensionManager;
        if (!extensionManager || !extensionManager._loadedExtensions) return [];
        const ids = [];
        try {
            extensionManager._loadedExtensions.forEach((value, key) => {
                ids.push(key);
                if (value && typeof value.id === 'string') ids.push(value.id);
            });
        } catch (error) {
            // ignore
        }
        return ids;
    }
    // SKY Editor：卡片「删除」按钮 → 卸载扩展并回到普通分类（该扩展分类已被移除）
    handleItemUninstall (item) {
        if (!item || !item.extensionId) return;
        const extensionId = item.extensionId;
        // 特殊项（自定义扩展入口 / 返回值积木）不是可卸载的扩展
        if (extensionId === 'custom_extension' || extensionId === 'procedures_enable_return') return;
        const uninstalled = unloadExtension(this.props.vm, extensionId);
        if (!uninstalled) {
            // eslint-disable-next-line no-alert
            alert('删除失败：当前运行环境未提供卸载扩展的接口。');
            return;
        }
        if (this.props.onCategorySelected) {
            this.props.onCategorySelected('motion');
        }
    }
    render () {
        let library = null;
        if (this.state.gallery || this.state.offline || this.state.galleryError || this.state.galleryTimedOut) {
            // SKY Editor：内置扩展统一标注来源 scratch（右下角来源彩色标签用）
            library = extensionLibraryContent.map(item => withSourceTag(toLibraryItem(item), 'scratch'));
            library.push('---');
            if (this.state.offline) {
                // 所有远程扩展源均不可用：改用 SKY 离线兜底清单（真实扩展快照，TW 画廊格式）
                library.push(toLibraryItem(galleryError));
                library.push('---');
                // 离线兜底项按来源分组标签注入 sourceTag
                library.push(...skyFallbackExtensions.map(item => (
                    withSourceTag(toLibraryItem(item), sourceGroupOf(item))
                )));
            } else if (this.state.gallery) {
                library.push(toLibraryItem(galleryMore));
                const locale = this.props.intl.locale;
                // 聚合扩展按来源分组标签注入 sourceTag（sectionTitle/分隔符保持原样）
                const galleryItems = this.state.gallery
                    .filter(i => i.extensionId !== 'faceSensing')
                    .map(i => translateGalleryItem(i, locale))
                    .map(toLibraryItem)
                    .map(item => withSourceTag(item, sourceGroupOf(item)));

                // SKY Editor：聚合扩展按来源分区（每组前插入分组标题，修复内容混在一起的问题）
                const groups = {};
                for (const item of galleryItems) {
                    const group = sourceGroupOf(item);
                    (groups[group] = groups[group] || []).push(item);
                }
                const grouped = [];
                const makeKey = (item, prefix) => (
                    item.key ? item : ({
                        ...item,
                        key: item.extensionId ?
                            `${prefix}-${item.extensionId}` :
                            `${prefix}-${item.rawURL || item.name || 'unknown'}`
                    })
                );
                for (const group of SOURCE_GROUP_ORDER) {
                    if (!groups[group] || groups[group].length === 0) continue;
                    // 自定义扩展库：组内按「库」再分小节，标题用库名，用户添加几个库就出现几个小节
                    if (group === CUSTOM_SOURCE_TAG) {
                        const bySource = new Map();
                        for (const item of groups[group]) {
                            const sourceId = item.customSourceId || CUSTOM_SOURCE_TAG;
                            if (!bySource.has(sourceId)) {
                                bySource.set(sourceId, {
                                    name: item.customSourceName || SOURCE_GROUP_LABELS[CUSTOM_SOURCE_TAG],
                                    items: []
                                });
                            }
                            bySource.get(sourceId).items.push(item);
                        }
                        for (const [sourceId, bucket] of bySource) {
                            grouped.push({
                                type: 'sectionTitle',
                                title: bucket.name,
                                tags: [CUSTOM_SOURCE_TAG],
                                key: `section-custom-${sourceId}`
                            });
                            grouped.push(...bucket.items.map(item => makeKey(item, `custom-${sourceId}`)));
                        }
                        continue;
                    }
                    grouped.push({
                        type: 'sectionTitle',
                        title: SOURCE_GROUP_LABELS[group],
                        tags: [group],
                        key: `section-${group}`
                    });
                    // 为每个扩展项注入来源分组前缀的唯一 key（`来源-extensionId`）：
                    // 不同来源存在大量同名扩展（如各家的 "Utilities"/"Text" 等），
                    // 若仅用 name 作 React key 会相互冲突，切换标签后再切回"所有"时
                    // React 会复用错位的组件实例，导致扩展位置显示错误。
                    // key 必须稳定唯一，"所有"视图与单来源视图之间才可正确 diff。
                    grouped.push(...groups[group].map(item => makeKey(item, group)));
                }
                library.push(...grouped);
            } else if (this.state.galleryError) {
                library.push(toLibraryItem(galleryError));
            } else {
                library.push(toLibraryItem(galleryLoading));
            }
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                persistableKey="extensionId"
                id="extensionLibrary"
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                icon={extensionIcon}
                windowed={this.props.uiTheme === 'sky-editor'}
                visible={this.props.visible}
                theme={this.props.theme}
                sourceColors={SOURCE_COLORS}
                onItemSelected={this.handleItemSelect}
                onItemUninstall={this.handleItemUninstall}
                getInstalledIds={this.getInstalledIds}
                customSources={this.state.customSources}
                onAddCustomSource={this.handleAddCustomSource}
                onRemoveCustomSource={this.handleRemoveCustomSource}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    uiTheme: PropTypes.string,
    // SKY Editor：主题对象（浅色/深色模式判定，透传给 LibraryComponent）
    theme: PropTypes.shape({
        gui: PropTypes.string
    }),
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

const mapStateToProps = state => ({
    uiTheme: state.scratchGui.uiTheme,
    // SKY Editor：浅色/深色模式判定源（与设置窗口一致：state.scratchGui.theme.theme.gui）
    theme: state.scratchGui.theme.theme
});

export default connect(mapStateToProps)(injectIntl(ExtensionLibrary));
