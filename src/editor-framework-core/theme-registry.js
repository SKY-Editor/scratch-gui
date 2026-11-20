/**
 * editor-framework-core / theme-registry
 * 主题清单（框架级唯一真源）
 * ---------------------------------------------------------------------------
 * 多主题「外壳+插槽」架构中，主题清单只允许存在于本文件：
 *   - 每个主题 = 一个外壳（Shell），拥有独立的 GUI / VM 差异文件与命名空间；
 *   - 新增主题时只改本文件（加一条注册记录 + 挂载专属样式），
 *     选择入口 / 持久化 / reducer / 作用域标记 / 专属变量自动生效；
 *   - Theme/public 只做「读取当前主题 + 切换」的纯工具，从本文件读清单，
 *     不再维护自己的注册表副本。
 *
 * 与既有机制的关系（不破坏、只收口）：
 *   - Theme/public/ui-theme-registry.js 是本文件的兼容 re-export 层，
 *     旧代码 import '../../Theme/common/ui-theme-registry' 零逻辑改动；
 *   - presets.js 由本注册表派生（THEME_PRESETS 兼容导出）；
 *   - uiThemePersistance.js 的校验与属性写入改为调用本注册表；
 *   - guiHelpers.applyGuiColors(theme) 原有 CSS 变量链路保持不变；
 *   - 现有 CSS 属性选择器 html[data-ui-theme='xxx'] 因 attribute 值不变继续命中。
 *
 * 铁律：
 *   - 差异化逻辑严格限定本主题作用域（data 属性 + namespace 类），严禁影响其它主题；
 *   - namespace 类 / 变量前缀必须全局唯一，主题间互不串扰；
 *   - 原版 TurboWarp 是最底层兼容层，不默认运行；作为「经典」主题被用户
 *     主动选中时同样走框架装配（零件树 + 外壳），外壳装配失败时才降级兜底。
 * ---------------------------------------------------------------------------
 */
import '../Theme/demo-azure/ui-demo-azure.css'; // 示例主题专属样式挂载点：新增主题的样式文件统一在此 import（选择器必须带 namespace）
import '../Theme/bilup/ui-bilup.css'; // bilup 主题专属样式（来源：Bilup GPL-3.0，仅作功能参考自行实现，非逐字复制）

export const UI_THEME_STORAGE_KEY = 'tw:ui-theme';

/**
 * 注册表条目字段说明：
 *   id        唯一标识（同时是 redux state / localStorage 的值），一经发布不得修改
 *   name      选择菜单显示名
 *   iconColor 选择菜单图标色
 *   attribute 写入 <html data-ui-theme="..."> 的值（供现有 CSS 属性选择器使用）
 *   namespace 挂在 <html> 上的命名空间类（主题专属样式统一用 html.{namespace} 限定）
 *   accent    复用 Theme accent 层（见 lib/themes/index.js 的 ACCENT_MAP），null 表示使用默认
 *   gui       默认明暗基础（'light' | 'dark'），用户仍可通过明暗切换覆盖
 *   inheritsBase 是否继续继承 TW 基础 UI（true 时 applyGuiColors 仍全量下发默认语义变量）
 *   variables 主题专属 CSS 变量（light/dark 两套），切换主题时由 applyUiThemeChrome 注入 :root
 *   shells    该主题注册的外壳（见 shell-registry.js），未注册时为 []
 *   note      说明文案（仅文档用途）
 */
const UI_THEME_REGISTRY = [
    {
        id: 'turbowarp',
        name: '经典',
        iconColor: '#ff4c4c',
        attribute: 'turbowarp',
        namespace: 'tw-theme',
        accent: null,
        gui: 'light',
        inheritsBase: true,
        variables: {
            light: {},
            dark: {}
        },
        shells: ['turbowarp'],
        parts: ['tw-window-shell'],
        note: 'TurboWarp 原始 UI（经典主题，隔离基准 / 零回归铁律对象）：已框架化——零件树 tw-window-shell（原生 Modal 外壳）与外壳注册齐全，用户选中时走框架装配；同时是最底层兼容层，外壳装配失败时降级兜底'
    },
    {
        id: 'sky-editor',
        name: 'SKYEditor',
        iconColor: '#1c86ff',
        attribute: 'sky-editor',
        namespace: 'sky-editor-theme',
        accent: 'sky-editor',
        gui: 'light',
        inheritsBase: true,
        variables: {
            light: {
                '--sky-theme-surface': 'rgba(28, 134, 255, 0.05)',
                '--sky-theme-border': 'rgba(28, 134, 255, 0.25)',
                '--sky-accent': '#1c86ff',
                '--sky-accent-strong': '#0f6ce0',
                '--sky-accent-soft': 'rgba(28, 134, 255, 0.12)',
                '--sky-text-on-accent': '#ffffff'
                // 顶栏底色严禁在此写死：必须跟随主题色（accent），
                // 由 applyGuiColors 下发的 --menu-bar-background 决定。
                // （历史问题：此处曾写死 '#4083FB'，导致切换主题色时顶栏恒为蓝色）
            },
            dark: {
                '--sky-theme-surface': 'rgba(28, 134, 255, 0.14)',
                '--sky-theme-border': 'rgba(28, 134, 255, 0.45)',
                '--sky-accent': '#3a9bff',
                '--sky-accent-strong': '#1c86ff',
                '--sky-accent-soft': 'rgba(58, 155, 255, 0.20)',
                '--sky-text-on-accent': '#ffffff'
            }
        },
        shells: ['sky-editor'],
        parts: [
            'sky-window-shell',
            'sky-menu-bar',
            'sky-surface-tokens'
        ],
        note: 'SKYEditor 专属主题，attribute 保持 sky-editor，现有 CSS 属性选择器零迁移；嵌套式主题的第一个落地主题（窗口外壳零件树 + 菜单栏零件 + 表面令牌零件）'
    },
    {
        id: 'demo-azure',
        name: 'Azure Demo',
        iconColor: '#00a8a8',
        attribute: 'demo-azure',
        namespace: 'demo-azure-theme',
        accent: null,
        gui: 'light',
        inheritsBase: true,
        variables: {
            light: {
                '--demo-accent': '#00a8a8',
                '--demo-surface': '#f2fbfb'
            },
            dark: {
                '--demo-accent': '#37d6d6',
                '--demo-surface': '#0e2a2a'
            }
        },
        shells: [],
        note: '最小示例主题（新增主题的标准模板，仅演示注册即生效，不要求完整视觉）'
    },
    {
        id: 'bilup',
        name: 'Bilup',
        iconColor: '#75c1c4',
        attribute: 'bilup',
        namespace: 'bilup-theme',
        accent: 'bilup',
        gui: 'light',
        inheritsBase: true,
        variables: {
            // 与 Bilup 官方默认主题逐值对齐（本地克隆源 E:\秦始皇计划\第三方编辑器临时存放文件\Bilup\scratch-gui\src\lib\themes）
            // light = 官方 accent/pale-blue.js + gui/light.js：菜单栏青绿 #75C1C4，页底 #E5F0FF，抽屉白
            light: {
                '--bilup-accent': '#75c1c4',
                '--bilup-accent-strong': '#6fc5c7',
                '--bilup-accent-soft': 'rgba(117, 193, 196, 0.25)',
                '--bilup-surface-page': '#e5f0ff',
                '--bilup-surface-sprite': '#e9f1fc',
                '--bilup-surface-panel': '#ffffff',
                '--bilup-surface-flyout': '#ffffff',
                '--bilup-text': '#575e75'
            },
            // dark = 官方 gui/dark.js：菜单栏 #333333，页底 #111111，面板 #1e1e1e/#2e2e2e，抽屉 #111111
            dark: {
                '--bilup-accent': '#75c1c4',
                '--bilup-accent-strong': '#6fc5c7',
                '--bilup-accent-soft': 'rgba(117, 193, 196, 0.3)',
                '--bilup-surface-page': '#111111',
                '--bilup-surface-sprite': '#1e1e1e',
                '--bilup-surface-panel': '#2e2e2e',
                '--bilup-surface-flyout': '#111111',
                '--bilup-text': '#eeeeee'
            }
        },
        shells: ['bilup'],
        note: 'Bilup 主题（视觉与 Bilup 官方默认 pale-blue + light/dark 逐值对齐：菜单栏 #75C1C4、页底 #E5F0FF、暗色 #111111/#1e1e1e/#2e2e2e/#333333；来源 Bilup GPL-3.0，仅作功能参考自行实现）——新框架架构下第一个完整主题'
    }
];

const DEFAULT_UI_THEME_ID = 'sky-editor';

/**
 * 返回选择菜单所需的最小投影（id / name / iconColor）
 * @returns {Array<{id: string, name: string, iconColor: string}>} 主题预设投影列表
 */
const getUiThemePresets = () => UI_THEME_REGISTRY.map(({id, name, iconColor}) => ({id, name, iconColor}));

/**
 * 按 id 取完整注册条目；未知 id 回退默认主题（sky-editor）
 * @param {string} id 主题 id
 * @returns {object} 注册表条目
 */
const getUiThemeById = id =>
    UI_THEME_REGISTRY.find(preset => preset.id === id) ||
    UI_THEME_REGISTRY.find(preset => preset.id === DEFAULT_UI_THEME_ID);

/**
 * 归一化：未知 id → 默认 id
 * @param {string} id 主题 id
 * @returns {string} 归一化后的有效主题 id
 */
const normalizeUiThemeId = id => getUiThemeById(id).id;

/**
 * data-ui-theme 属性值
 * @param {string} id 主题 id
 * @returns {string} 写入 <html data-ui-theme> 的值
 */
const getUiThemeAttribute = id => getUiThemeById(id).attribute;

/**
 * 命名空间类名（挂在 <html> 上）
 * @param {string} id 主题 id
 * @returns {string} 命名空间类名
 */
const getUiThemeNamespace = id => getUiThemeById(id).namespace;

/**
 * 主题专属 CSS 变量（按明暗取一套；未注册的主题返回空对象）
 * @param {string} id 主题 id
 * @param {boolean} isDark 是否深色
 * @returns {object} 变量名到变量值的映射
 */
const getUiThemeVariables = (id, isDark) => {
    const preset = UI_THEME_REGISTRY.find(item => item.id === id);
    if (!preset) return {};
    return (isDark ? preset.variables.dark : preset.variables.light) || {};
};

/**
 * 语义判定：是否指定主题（替代散落的 uiTheme === 'xxx' 硬编码，后续可逐步迁移）
 * @param {string} id 当前主题 id
 * @param {string} targetId 目标主题 id
 * @returns {boolean} 是否为指定主题
 */
const isUiTheme = (id, targetId) => id === targetId;

/**
 * 兼容语义：是否 SKYEditor（等价于旧代码 uiTheme === 'sky-editor'）
 * @param {string} id 当前主题 id
 * @returns {boolean} 是否为 sky-editor
 */
const isSkyEditor = id => id === 'sky-editor';

/**
 * 主题作用域同步（统一收口，唯一写 <html> 的入口）
 * ---------------------------------------------------------------------------
 * 职责（全部幂等）：
 *   1. 持久化当前主题 id（localStorage）
 *   2. 写 <html data-ui-theme="{attribute}">（现有 CSS 属性选择器依赖）
 *   3. 切换 <html> 上的命名空间类（移除所有已注册 namespace，仅保留当前主题）
 *   4. 注入主题专属 CSS 变量（isDark 缺省时不注入，留给 applyGuiColors 链路补）
 * 说明：本函数不负责 redux dispatch（组件层 dispatch(setUiTheme) 后调用即可）。
 * @param {string} themeId 主题 id
 * @param {boolean} [isDark] 是否深色（缺省则不注入专属变量）
 * ---------------------------------------------------------------------------
 */
const applyUiThemeChrome = (themeId, isDark) => {
    const preset = getUiThemeById(themeId);
    const doc = document.documentElement;

    try {
        localStorage.setItem(UI_THEME_STORAGE_KEY, preset.id);
    } catch (e) {
        // ignore
    }

    doc.setAttribute('data-ui-theme', preset.attribute);
    // 未传入明暗时保持既有标记：若写成空串，切换 UI 主题会把当前深色判定清掉，
    // 使深色样式与窗口组件的明暗判断短暂失效（刷新后由真实明暗重新写入）
    if (typeof isDark === 'boolean') {
        doc.setAttribute('data-ui-dark', String(isDark));
    }

    UI_THEME_REGISTRY.forEach(item => doc.classList.remove(item.namespace));
    doc.classList.add(preset.namespace);

    if (typeof isDark === 'boolean') {
        Object.entries(getUiThemeVariables(preset.id, isDark)).forEach(([name, value]) => {
            doc.style.setProperty(name, value);
        });
    }
};

export {
    UI_THEME_REGISTRY,
    DEFAULT_UI_THEME_ID,
    getUiThemePresets,
    getUiThemeById,
    normalizeUiThemeId,
    getUiThemeAttribute,
    getUiThemeNamespace,
    getUiThemeVariables,
    isUiTheme,
    isSkyEditor,
    applyUiThemeChrome
};
