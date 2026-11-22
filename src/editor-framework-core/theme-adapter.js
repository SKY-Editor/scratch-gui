/**
 * editor-framework-core / theme-adapter
 * 主题呈现适配接口（Presentation Adapter）—— 新功能「写一份、两主题自适应」的唯一入口
 * ---------------------------------------------------------------------------
 * 设计目标（对应铁律：SKY 新增功能在 TurboWarp 主题下必须以其原生形态呈现）
 *
 *   同一个功能（窗口 / 标签页 / 设置 / 对话框 / 菜单 …）只写一份内容与交互，
 *   呈现「形态」由当前主题的 surface 决定，业务侧不写 if (theme === ...)：
 *
 *     功能内容（一份，业务自持）
 *              │
 *              ▼
 *     theme-adapter.getSurface(uiTheme)   ← 唯一决策点
 *              │
 *      ┌───────┴────────┐
 *      ▼                ▼
 *   sky-editor        turbowarp（及一切未登记主题，走官方兼容形态）
 *   Win11 窗口         官方 Modal 弹窗（标题居中 + 圆形关闭）
 *   竖向标签栏          横向标签栏
 *   独立设置窗口        官方设置下拉菜单
 *   圆角卡片对话框      官方深灰标题栏对话框
 *
 * 语义键（surface key）—— 一个功能只依赖语义，不依赖主题 id：
 *   windowKind          窗口外壳：'win11' | 'tw-modal'
 *   tabsAxis            标签栏方向：'vertical' | 'horizontal'
 *   settingsSurface     设置的呈现：'window'（独立窗口）| 'menu'（下拉菜单）
 *   dialogSurface       确认框 / 输入框：'win11' | 'tw-modal'
 *   menuSurface         菜单栏形态：'sky' | 'classic'
 *   contextMenuSurface  右键菜单形态：'sky' | 'classic'
 *   contentSurface      大块内容：'inline'（内联）| 'modal'
 *
 * 扩展方式：
 *   - 新主题：在 THEME_SURFACES 增加条目，或运行时 registerSurface(themeId, {...})
 *     只覆盖需要差异的键，其余继承 DEFAULT_SURFACE 的官方形态；
 *   - 新功能：在业务侧使用 <ThemedWindow>（窗口）或 getSurface / withThemeSurface
 *     （形态判断），禁止在业务代码里硬编码 uiTheme 字符串比较。
 * ---------------------------------------------------------------------------
 */
import {connect, useSelector} from 'react-redux';

/**
 * 官方兼容形态（TurboWarp 基线）：任何未登记的主题都按此呈现，
 * 保证「新主题 / 未知主题」不会出现 SKY 专属视觉。
 */
const DEFAULT_SURFACE = {
    windowKind: 'tw-modal',
    tabsAxis: 'horizontal',
    settingsSurface: 'menu',
    dialogSurface: 'tw-modal',
    menuSurface: 'classic',
    contextMenuSurface: 'classic',
    contentSurface: 'inline',
    // —— SKYEditor 新增功能在「官方形态」下的默认呈现（新增能力的唯一兜底口径）——
    newFeatureShell: 'modal', // 新功能独立外壳：官方一律弹窗
    newFeatureChrome: 'classic', // 新功能外壳骨架：官方深灰标题栏
    tabStripStyle: 'topbar', // 标签条：官方顶部横排
    popoverSurface: 'classic', // 浮动层（popover / 提示）：官方样式
    scrollbarStyle: 'native' // 滚动条：官方原生
};

/**
 * 已登记主题的呈现策略（只写与官方形态不同的键）
 */
const THEME_SURFACES = {
    'sky-editor': {
        windowKind: 'win11',
        tabsAxis: 'vertical',
        settingsSurface: 'window',
        dialogSurface: 'win11',
        menuSurface: 'sky',
        contextMenuSurface: 'sky',
        newFeatureShell: 'window',
        newFeatureChrome: 'win11',
        tabStripStyle: 'sidebar',
        popoverSurface: 'sky',
        scrollbarStyle: 'sky'
    },
    'turbowarp': {}
};

/** 未知主题回退的主题 id（同时是官方兼容层） */
const FALLBACK_THEME_ID = 'turbowarp';

/**
 * 取某主题的完整呈现策略
 * @param {string} themeId 主题 id（state.scratchGui.uiTheme）
 * @returns {object} 完整 surface（DEFAULT_SURFACE 为底，叠加该主题差异）
 */
const getSurface = themeId => {
    const override = (themeId && THEME_SURFACES[themeId]) || {};
    return Object.assign({}, DEFAULT_SURFACE, override);
};

/**
 * 取某主题的单个呈现语义值
 * @param {string} themeId 主题 id
 * @param {string} key 语义键（见文件头注释）
 * @returns {string} 语义值
 */
const getSurfaceValue = (themeId, key) => getSurface(themeId)[key];

/**
 * 取窗口外壳类型
 * @param {string} themeId 主题 id
 * @returns {string} 'win11' | 'tw-modal'
 */
const getWindowKind = themeId => getSurfaceValue(themeId, 'windowKind');

/**
 * 判断是否使用 SKY 风格窗口（Win11 外壳）
 * @param {string} themeId 主题 id
 * @returns {boolean} 是否 win11
 */
const isWin11Shell = themeId => getWindowKind(themeId) === 'win11';

/**
 * 是否为横向标签栏（TurboWarp 官方形态）
 * @param {string} themeId 主题 id
 * @returns {boolean} 是否横向
 */
const isHorizontalTabs = themeId => getSurfaceValue(themeId, 'tabsAxis') === 'horizontal';

/**
 * 注册 / 覆盖某主题的呈现策略（供新主题或运行时扩展使用，幂等合并）
 * @param {string} themeId 主题 id
 * @param {object} patch 需要覆盖的语义键
 * @returns {object} 合并后的 surface
 */
const registerSurface = (themeId, patch) => {
    if (!themeId) return DEFAULT_SURFACE;
    THEME_SURFACES[themeId] = Object.assign({}, THEME_SURFACES[themeId], patch);
    return getSurface(themeId);
};

/**
 * 新增功能的呈现登记表（feature surface）
 * ---------------------------------------------------------------------------
 * 「以后新建的任何内容都能同时适配两个主题」的唯一入口：
 * 新功能只需在模块顶部调用一次 registerFeatureSurface(id, {...})，
 * 声明它在两个主题下分别长什么样，然后在组件里用 useFeatureSurface(id)
 * 拿到当前主题的形态（外壳 / 标签方向 / 骨架类名），无需再写 uiTheme 判断。
 */
const FEATURE_SURFACES = {};

/**
 * 登记一个新功能在双主题下的呈现形态
 * @param {string} featureId 功能标识（稳定、唯一，如 'music-player'）
 * @param {object} config {kind, sky:{...}, tw:{...}}，kind 为默认外壳语义
 *     kind: 'window'（独立窗口型）| 'dialog'（短暂交互）| 'panel'（内联面板）
 * @returns {object} 归一后的登记项
 */
const registerFeatureSurface = (featureId, config) => {
    if (!featureId) throw new Error('registerFeatureSurface: featureId 必填');
    const normalized = {
        kind: (config && config.kind) || 'window',
        sky: Object.assign({}, config && config.sky),
        tw: Object.assign({}, config && config.tw)
    };
    FEATURE_SURFACES[featureId] = normalized;
    return normalized;
};

/**
 * 取某功能在某主题下的呈现形态
 * @param {string} themeId 主题 id
 * @param {string} featureId 功能标识
 * @returns {object} {featureId, themeId, kind, shell, chrome, tabsAxis, tone, role}
 */
const getFeatureSurface = (themeId, featureId) => {
    const base = getSurface(themeId);
    const themeIdResolved = (themeId && THEME_SURFACES[themeId]) ? themeId : FALLBACK_THEME_ID;
    const entry = FEATURE_SURFACES[featureId] || {};
    const themeKey = themeIdResolved === 'sky-editor' ? 'sky' : 'tw';
    const pick = Object.assign({}, entry[themeKey]);
    const kind = entry.kind || 'window';
    const isSky = themeIdResolved === 'sky-editor';
    return {
        featureId,
        themeId: themeIdResolved,
        kind,
        shell: pick.shell || (isSky ? base.windowKind : base.newFeatureShell),
        chrome: pick.chrome || (isSky ? base.newFeatureChrome : base.newFeatureChrome),
        tabsAxis: pick.tabsAxis || base.tabsAxis,
        tone: pick.tone || (isSky ? 'sky' : 'classic'),
        role: isSky ? 'sky' : 'classic'
    };
};

/**
 * 骨架类名：供 CSS 做双轨（.tw-surface--window / .sky-surface--window ...）
 * @param {string} themeId 主题 id
 * @param {string} featureId 功能标识
 * @returns {string} 空格分隔的类名串
 */
const getSurfaceClassNames = (themeId, featureId) => {
    const s = getFeatureSurface(themeId, featureId);
    return [
        'themed-surface',
        `${s.role}-surface`,
        `${s.role}-surface--${s.kind}`,
        `${s.role}-surface--${s.tabsAxis}-tabs`
    ].join(' ');
};

/**
 * React Hook：组件内直接拿到当前主题下的功能形态
 * 用法：const surface = useFeatureSurface('music-player');
 * @param {string} featureId 功能标识
 * @returns {object} 见 getFeatureSurface
 */
const useFeatureSurface = featureId => {
    const uiTheme = useSelector(state => state.scratchGui.uiTheme);
    return getFeatureSurface(uiTheme, featureId);
};

/**
 * 窗口尺寸 / 标识的别名归一（兼容 Win11Window 旧属性命名，业务侧迁移零改写）
 * @param {object} props 组件属性
 * @returns {object} {id, width, height}
 */
const resolveWindowMetrics = props => ({
    id: props.id || props.windowId,
    width: typeof props.width === 'number' ? props.width : props.defaultWidth,
    height: typeof props.height === 'number' ? props.height : props.defaultHeight
});

/**
 * HOC：给组件注入当前主题的 surface 对象（属性名 surface，另附 uiTheme）
 * 用法：
 *     export default withThemeSurface(MyPanel);
 *     // 组件内：props.surface.tabsAxis / props.surface.windowKind ...
 * @param {React.ComponentType} Component 目标组件
 * @returns {React.ComponentType} 已连接主题状态的组件
 */
const withThemeSurface = Component => {
    const mapStateToProps = state => {
        const uiTheme = state.scratchGui.uiTheme;
        return {
            uiTheme,
            surface: getSurface(uiTheme)
        };
    };
    const Connected = connect(mapStateToProps)(Component);
    Connected.displayName = `withThemeSurface(${Component.displayName || Component.name || 'Component'})`;
    return Connected;
};

export {
    DEFAULT_SURFACE,
    THEME_SURFACES,
    FALLBACK_THEME_ID,
    getSurface,
    getSurfaceValue,
    getWindowKind,
    isWin11Shell,
    isHorizontalTabs,
    registerSurface,
    registerFeatureSurface,
    getFeatureSurface,
    getSurfaceClassNames,
    useFeatureSurface,
    resolveWindowMetrics,
    withThemeSurface
};
