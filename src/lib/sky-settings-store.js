/**
 * SKY Editor 设置项持久化统一存储（sky-settings-store.js）
 * ---------------------------------------------------------------------------
 * 2026-11-18 由6个 *Persistance.js 合并而来——原文件名中的 Persistance 是
 * Persistence 的拼写错误，随合并一并消除；对外导出的函数/常量名保持不变，
 * 消费者仅改 import 路径（共12处代码 + 3处注释）。
 *
 * 合并范围（原文件 → 本文件分区）：
 *   audioEditorStylePersistance.js    → 高级声音编辑器样式
 *   contextMenuStylePersistance.js    → 右键菜单样式（含 SE 皮肤 CSS 变量下发）
 *   menuBarPositionPersistance.js     → 菜单栏位置
 *   tabLayoutPersistance.js           → 标签栏布局
 *   windowButtonStylePersistance.js   → 窗口按钮样式（windows/mac）
 *   windowTabBarThemePersistance.js   → 主题色窗口标签栏
 *
 * 实现约定：
 * - 纯读写型设置项（audio/menuBar/tabLayout/contextMenu 写入）复用
 *   readSetting/writeSetting 底座；
 * - 带副作用型（contextMenu 的变量下发、windowButton/windowTabBar 的 <html>
 *   属性应用与事件广播）逐字保留原实现，行为不变；
 * - localStorage 键与默认值按设置项独立命名（原6文件同名的 STORAGE_KEY /
 *   DEFAULT_STYLE / normalize 合并后不再冲突）；
 * - 新增设置项：在对应分区追加 KEY/DEFAULT/detect/persist，并加入底部 export。
 */

// —— 通用底座（仅纯读写型设置项使用）——
const readSetting = (key, fallback, validate) => {
    try {
        const stored = localStorage.getItem(key);
        if (validate(stored)) return stored;
    } catch (e) {
        // ignore：localStorage 不可用（隐私模式等）时回退默认值
    }
    return fallback;
};

const writeSetting = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // ignore：写入失败不影响当次内存态
    }
};

/* ==================== 高级声音编辑器样式 ==================== */
const AUDIO_EDITOR_STYLE_KEY = 'sky:audio-editor-style';
// 默认使用高级版本（当前 scratch-gui 声音编辑器已内置高级版 UI），
// 用户可在 设置 → 工具 → 高级功能 中切回 Scratch 原版样式。
const DEFAULT_AUDIO_EDITOR_STYLE = 'advanced';

const detectAudioEditorStyle = () => readSetting(
    AUDIO_EDITOR_STYLE_KEY,
    DEFAULT_AUDIO_EDITOR_STYLE,
    stored => stored === 'scratch' || stored === 'advanced'
);

const persistAudioEditorStyle = style => writeSetting(AUDIO_EDITOR_STYLE_KEY, style);

/* ==================== 右键菜单样式（SE 皮肤 CSS 变量下发）==================== */
const CONTEXT_MENU_STYLE_KEY = 'sky:context-menu-style';
const DEFAULT_CONTEXT_MENU_STYLE = 'tw';

// SE（SKYEditor）样式右键菜单的观感，通过 CSS 变量下发；
// 未设置任何变量时各菜单保持 TurboWarp 原始（浅色）样式，可回退。
// 观感对齐「调试器插件当前使用的那套菜单」（调试器标题栏右键弹出的系统菜单）：
// 8px 圆角 + 200px 最小宽度 + 12px 字号 + 紧凑留白。
//
// 【明暗自适应】颜色项一律以 TurboWarp 既有的「明暗语义变量」表达，而不是写死色值：
//   --popover-background / --text-primary / --ui-black-transparent / --shadow
// 这些变量由 lib/themes/guiHelpers.js 的 applyGuiColors(theme) 按当前 GUI 主题
// （themes/gui/dark.js 或 light.js，判据即既有的 theme.isDark() → 'color-scheme'）注入到
// :root，因此同一套 SE 皮肤在浅色 GUI 主题下自动呈现
// 「浅色底 + 深灰文字 + 淡边框 + 淡分隔线 + 柔和阴影」，深色主题下保持深色观感，
// 无需新增任何 data 属性、也无需在 CSS 里重复判明暗。
// 【浅色对齐】兜底策略与窗口菜单逐项同值：不再保留「SE 深色」兜底（那会使非窗口
// 菜单在浅色模式下回退成深色底 + 亮色文字，与窗口菜单正好相反）。颜色项统一走
// 「语义变量 → 浅色默认层(--*-default) → 与窗口菜单 CSS 兜底同值的浅色常量」三级回退，
// 保证任何时刻（含变量尚未注入的启动早期）都与窗口菜单呈现同一套配色。
const SE_VARS = {
    // 【浅色对齐】颜色项三级回退：当前明暗语义变量 → 该变量的「浅色默认」层
    // （--*-default，由 applyGuiColors 恒注入 light 值，故恒为浅色）→ 与窗口菜单
    // （tw-win11-window / debugger 的 .win11-context-menu）CSS 兜底完全同值的浅色常量。
    // 浅色 GUI 主题下三级结果一致（浅色底 + 深灰文字 + 淡边框/淡分隔线）；
    // 深色 GUI 主题下第一级即命中深色值，与窗口菜单同色，不产生回归。
    '--sky-ctx-menu-bg': 'var(--popover-background, var(--popover-background-default, #ffffff))',
    '--sky-ctx-menu-fg': 'var(--text-primary, var(--text-primary-default, inherit))',
    '--sky-ctx-menu-border': 'var(--ui-black-transparent, var(--ui-black-transparent-default, rgba(0, 0, 0, 0.15)))',
    '--sky-ctx-menu-hover-bg': 'var(--ui-black-transparent, var(--ui-black-transparent-default, rgba(0, 0, 0, 0.08)))',
    '--sky-ctx-menu-hover-fg': 'var(--text-primary, var(--text-primary-default, inherit))',
    '--sky-ctx-menu-divider': 'var(--ui-black-transparent, var(--ui-black-transparent-default, rgba(0, 0, 0, 0.15)))',
    '--sky-ctx-menu-radius': '8px',
    '--sky-ctx-menu-shadow': '0 8px 24px var(--shadow, var(--shadow-default, rgba(0, 0, 0, 0.25)))',
    '--sky-ctx-menu-min-width': '200px',
    '--sky-ctx-menu-padding': '4px',
    '--sky-ctx-menu-margin': '0',
    '--sky-ctx-menu-font-size': '12px',
    '--sky-ctx-menu-item-padding': '6px 12px',
    // 以下三项使「SKYEditor样式」与调试器菜单严格一致：
    // z-index 1000、菜单项 4px 圆角、无 hover 过渡动画（调试器菜单无 transition）
    '--sky-ctx-menu-z-index': '1000',
    '--sky-ctx-menu-item-radius': '4px',
    '--sky-ctx-menu-item-transition': 'none',
    // 禁用项：与窗口菜单（.win11-menu-item-disabled）逐项同源 ——
    // 只用透明度 0.5（与窗口菜单兜底同值）表达不可用，文字色沿用正常文字色，
    // 不再自造独立灰值 #9A9EB0（避免「独立灰 × 透明度」双重变淡，
    // 导致浅色模式下不可用项偏亮/偏灰、与窗口菜单不一致）；hover 不产生高亮。
    '--sky-ctx-menu-disabled-opacity': '0.5',
    '--sky-ctx-menu-disabled-hover-bg': 'transparent',
    '--sky-ctx-menu-disabled-hover-fg': 'var(--sky-ctx-menu-fg, inherit)'
};

const applyContextMenuStyle = style => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // 同时把当前选择写到 <html data-sky-ctx-menu="se|tw">，
    // 供「SKYEditor 全局右键菜单统一样式」（sky-context-menu.css）以属性选择器命中；
    // 只有 sky-editor 主题 + 'se' 双条件同时成立时才会生效，其余情况该文件不命中、零影响。
    root.setAttribute('data-sky-ctx-menu', style);
    if (style === 'se') {
        for (const key of Object.keys(SE_VARS)) {
            root.style.setProperty(key, SE_VARS[key]);
        }
    } else {
        for (const key of Object.keys(SE_VARS)) {
            root.style.removeProperty(key);
        }
    }
};

const detectContextMenuStyle = () => {
    let value = DEFAULT_CONTEXT_MENU_STYLE;
    try {
        const stored = localStorage.getItem(CONTEXT_MENU_STYLE_KEY);
        if (stored === 'tw' || stored === 'se') {
            value = stored;
        }
    } catch (e) {
        // ignore
    }
    // 模块加载（应用启动）即同步一次全局变量，保证已持久化的选择立即生效
    applyContextMenuStyle(value);
    return value;
};

const persistContextMenuStyle = style => writeSetting(CONTEXT_MENU_STYLE_KEY, style);

/* ==================== 菜单栏位置 ==================== */
const MENU_BAR_POSITION_KEY = 'sky:menu-bar-position';
const DEFAULT_MENU_BAR_POSITION = 'center';

const detectMenuBarPosition = () => readSetting(
    MENU_BAR_POSITION_KEY,
    DEFAULT_MENU_BAR_POSITION,
    stored => stored === 'left' || stored === 'center'
);

const persistMenuBarPosition = position => writeSetting(MENU_BAR_POSITION_KEY, position);

/* ==================== 标签栏布局 ==================== */
const TAB_LAYOUT_KEY = 'sky:tab-layout';
const DEFAULT_TAB_LAYOUT = 'vertical';

const detectTabLayout = () => readSetting(
    TAB_LAYOUT_KEY,
    DEFAULT_TAB_LAYOUT,
    stored => stored === 'vertical' || stored === 'horizontal'
);

const persistTabLayout = layout => writeSetting(TAB_LAYOUT_KEY, layout);

/* ==================== 窗口按钮样式（windows/mac）==================== */
/**
 * 窗口按钮样式持久化
 * ---------------------------------------------------------------------------
 * 可选值：
 *   - 'windows'：Windows 风格（满高方块按钮 + 单色图标 + 悬停高亮），默认值；
 *   - 'mac'    ：macOS 交通灯（绿/黄/红三圆点，悬停显示缩小版原图标）。
 *
 * 生效方式：把样式写进 <html data-sky-window-buttons="...">，
 * 由 win11-window.css 里的属性选择器切换具体视觉，避免运行时改组件状态。
 */
const WINDOW_BUTTON_STYLE_KEY = 'sky:window-button-style';

const WINDOW_BUTTON_STYLE_WINDOWS = 'windows';
const WINDOW_BUTTON_STYLE_MAC = 'mac';

const DEFAULT_WINDOW_BUTTON_STYLE = WINDOW_BUTTON_STYLE_WINDOWS;

const normalizeWindowButtonStyle = style => (
    style === WINDOW_BUTTON_STYLE_MAC ? WINDOW_BUTTON_STYLE_MAC : WINDOW_BUTTON_STYLE_WINDOWS
);

/**
 * 把样式写入 html 属性，CSS 据此切换。
 * @param {string} style 'windows' | 'mac'
 */
const applyWindowButtonStyle = style => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-sky-window-buttons', normalizeWindowButtonStyle(style));
};

/* 切换过渡编排（四步）：
   ① out 相位（out-<目标样式>）：按钮簇与标题组（窗口图标 + 标题文字）一起淡出，
      标题组同时水平轻退 10px，给位移一个起势；
   ② 全透明后换 data-sky-window-buttons：按钮落到另一侧、标题落到靠左 / 居中 的新位置；
   ③ 保持期（WINDOW_BUTTONS_FLIP_HOLD_MS）：仍留在 out 相位，先让新配色的按钮被完整
      绘制至少一帧，避免淡入首帧复用上一套（mac 交通灯）的合成结果；
   ④ in 相位（in-<目标样式>）：标题组在自己的新位置上滑回原位并淡入，按钮同步淡入。
   位置切换与配色切换都只发生在内容不可见时，因此既不会出现新旧两端同时可见的错位
   闪烁，也不会出现错误配色；标题也不会从左侧「瞬移」到中间，图标是标题的子节点，
   位移与显隐天然同步。 */
const WINDOW_BUTTONS_SWITCHING_ATTR = 'data-sky-window-buttons-switching';
// 必须与 win11-window.css 里按钮 / 标题的 opacity 过渡时长一致
const WINDOW_BUTTONS_FADE_OUT_MS = 130;
// 必须与 win11-window.css 里标题的 opacity / transform 过渡时长一致
const WINDOW_BUTTONS_FADE_IN_MS = 180;
// 换位后到淡入之间的「保持期」：这段时间按钮簇仍处于 out 相位（opacity 为 0），
// 但 data-sky-window-buttons 已经换成目标值，用于让新配色被完整绘制至少一帧。
// 34ms 覆盖 60Hz 下 2 帧 / 120Hz 下 4 帧，够一次 style+layout+paint，
// 又短到肉眼只当作淡出与淡入之间的正常间隙。
const WINDOW_BUTTONS_FLIP_HOLD_MS = 34;

let windowButtonsSwitchTimer = null;
let windowButtonsPhaseTimer = null;

// 是否处于"减少动态效果"偏好；为真时直接换位，不播放过渡
const prefersReducedMotion = () => {
    try {
        return typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
};

const clearWindowButtonsSwitchTimer = () => {
    if (windowButtonsSwitchTimer) {
        clearTimeout(windowButtonsSwitchTimer);
        windowButtonsSwitchTimer = null;
    }
};

const clearWindowButtonsPhaseTimer = () => {
    if (windowButtonsPhaseTimer) {
        clearTimeout(windowButtonsPhaseTimer);
        windowButtonsPhaseTimer = null;
    }
};

const setWindowButtonsSwitchingPhase = phase => {
    const root = document.documentElement;
    if (phase) {
        root.setAttribute(WINDOW_BUTTONS_SWITCHING_ATTR, phase);
    } else {
        root.removeAttribute(WINDOW_BUTTONS_SWITCHING_ATTR);
    }
};

/**
 * 应用按钮风格；animate=true 时走两段式过渡。
 * @param {string} style 'windows' | 'mac'
 * @param {boolean} [animate] 是否播放切换过渡（首次初始化不播放）
 */
const applyWindowButtonStyleAnimated = (style, animate) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const value = normalizeWindowButtonStyle(style);
    const current = root.getAttribute('data-sky-window-buttons');
    clearWindowButtonsSwitchTimer();
    clearWindowButtonsPhaseTimer();
    if (!animate || !current || current === value || prefersReducedMotion()) {
        if (current === value) return;
        // 直接换位（首次初始化 / 减少动效 / 无既有值）：不播放淡出淡入，但同样不能
        // 让 background-color 参与补间 —— .win11-button 带有 transition: background-color
        // .15s ease，若直接改 data-sky-window-buttons，mac → Windows 时按钮底色会从
        // 红黄绿交通灯渐变到透明，肉眼就是「Windows 按钮先闪一下 mac 颜色」。
        // 这里临时挂 in 相位借用 [data-sky-window-buttons-switching] .win11-button
        // 的 transition:none，换完再等两帧（新配色已切图绘制）撤除相位。
        setWindowButtonsSwitchingPhase(`in-${value}`);
        root.setAttribute('data-sky-window-buttons', value);
        let raf = cb => setTimeout(cb, 16);
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            raf = window.requestAnimationFrame.bind(window);
        }
        raf(() => raf(() => {
            // 期间若又发起新的切换，交由新流程管理相位，避免提前撤除相位
            if (windowButtonsSwitchTimer || windowButtonsPhaseTimer) return;
            setWindowButtonsSwitchingPhase(null);
        }));
        return;
    }
    // 相位值带上目标样式（out-mac / out-windows），CSS 用前缀匹配（^='out' / ^='in'）
    setWindowButtonsSwitchingPhase(`out-${value}`);
    windowButtonsSwitchTimer = setTimeout(() => {
        windowButtonsSwitchTimer = null;
        // ② 换值仍在 out 相位里进行：此刻按钮簇 opacity 为 0，配色翻转肉眼不可见
        root.setAttribute('data-sky-window-buttons', value);
        // 同步强制一次样式计算与布局，确认新配色已进入渲染树（读取布局属性即触发）
        void root.offsetWidth;
        // ③ 保持期：先不进入 in 相位，让新配色的按钮被完整绘制至少一帧，
        //    否则淡入首帧可能复用上一套（mac 交通灯）的合成结果而闪一下错误颜色
        windowButtonsPhaseTimer = setTimeout(() => {
            windowButtonsPhaseTimer = null;
            setWindowButtonsSwitchingPhase(`in-${value}`);
            // ④ 淡入动画结束后撤除相位，避免相位样式长期挂在 <html> 上
            windowButtonsPhaseTimer = setTimeout(() => {
                windowButtonsPhaseTimer = null;
                setWindowButtonsSwitchingPhase(null);
            }, WINDOW_BUTTONS_FADE_IN_MS);
        }, WINDOW_BUTTONS_FLIP_HOLD_MS);
    }, WINDOW_BUTTONS_FADE_OUT_MS);
};

/**
 * 读取已保存的样式并立即应用；读不到或非法值时回退默认（Windows）。
 * @returns {string} 当前生效的样式
 */
const detectWindowButtonStyle = () => {
    let style = DEFAULT_WINDOW_BUTTON_STYLE;
    try {
        const stored = window.localStorage.getItem(WINDOW_BUTTON_STYLE_KEY);
        if (stored === WINDOW_BUTTON_STYLE_MAC || stored === WINDOW_BUTTON_STYLE_WINDOWS) {
            style = stored;
        }
    } catch (e) {
        // localStorage 不可用时静默回退默认样式
    }
    applyWindowButtonStyle(style);
    return style;
};

/**
 * 保存样式并立即应用（带切换过渡）。
 * @param {string} style 'windows' | 'mac'
 */
const persistWindowButtonStyle = style => {
    const value = normalizeWindowButtonStyle(style);
    try {
        window.localStorage.setItem(WINDOW_BUTTON_STYLE_KEY, value);
    } catch (e) {
        // 忽略写入失败，仍保证当次生效
    }
    applyWindowButtonStyleAnimated(value, true);
};

/* ==================== 主题色窗口标签栏 ==================== */
/**
 * 主题色窗口标签栏持久化
 * ---------------------------------------------------------------------------
 * 控制 SKYEditor 主题下窗口顶部标签栏（Win11Window 标题栏）是否使用主题色：
 *   - 'themed'：使用主题色着色（默认值，保持既有外观）；
 *   - 'white' ：强制显示为白色标签栏。
 *
 * 生效方式：把取值写进 <html data-sky-tab-bar-theme="...">，
 * 由 win11-window.css 的属性选择器切换标签栏背景，避免运行时改组件状态。
 */
const WINDOW_TAB_BAR_THEME_KEY = 'sky:window-tab-bar-theme';

const WINDOW_TAB_BAR_THEME_THEMED = 'themed';
const WINDOW_TAB_BAR_THEME_WHITE = 'white';

const DEFAULT_WINDOW_TAB_BAR_THEME = WINDOW_TAB_BAR_THEME_THEMED;

// 取值变化时广播的自定义事件，供窗口组件订阅后立刻刷新标题栏配色。
const WINDOW_TAB_BAR_THEME_EVENT = 'sky:tab-bar-theme-change';

const normalizeWindowTabBarTheme = value => (
    value === WINDOW_TAB_BAR_THEME_WHITE ? WINDOW_TAB_BAR_THEME_WHITE : WINDOW_TAB_BAR_THEME_THEMED
);

/**
 * 把取值写入 html 属性，CSS 据此切换标签栏背景。
 * @param {string} value 'themed' | 'white'
 */
const applyWindowTabBarTheme = value => {
    if (typeof document === 'undefined') return;
    const normalized = normalizeWindowTabBarTheme(value);
    const previous = document.documentElement.getAttribute('data-sky-tab-bar-theme');
    document.documentElement.setAttribute('data-sky-tab-bar-theme', normalized);
    // 广播变更：标题栏的内联样式需要由 JS 侧让步，CSS 才能接管配色，
    // 因此各窗口组件订阅该事件后立即重渲染。取值未变化时不广播，
    // 避免组件初始化读取取值（渲染期）时触发多余的跨组件更新。
    if (previous !== normalized &&
        typeof window !== 'undefined' &&
        typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(WINDOW_TAB_BAR_THEME_EVENT, {detail: normalized}));
    }
};

/**
 * 读取已保存的取值并立即应用；读不到或非法值时回退默认（主题色）。
 * @returns {string} 当前生效的取值
 */
const detectWindowTabBarTheme = () => {
    let value = DEFAULT_WINDOW_TAB_BAR_THEME;
    try {
        const stored = window.localStorage.getItem(WINDOW_TAB_BAR_THEME_KEY);
        if (stored === WINDOW_TAB_BAR_THEME_THEMED || stored === WINDOW_TAB_BAR_THEME_WHITE) {
            value = stored;
        }
    } catch (e) {
        // localStorage 不可用时静默回退默认取值
    }
    applyWindowTabBarTheme(value);
    return value;
};

/**
 * 保存取值并立即应用。
 * @param {string} value 'themed' | 'white'
 */
const persistWindowTabBarTheme = value => {
    const normalized = normalizeWindowTabBarTheme(value);
    try {
        window.localStorage.setItem(WINDOW_TAB_BAR_THEME_KEY, normalized);
    } catch (e) {
        // 忽略写入失败，仍保证当次生效
    }
    applyWindowTabBarTheme(normalized);
};

/* ==================== 编辑器菜单栏主题色 ==================== */
/**
 * 编辑器菜单栏主题色持久化
 * ---------------------------------------------------------------------------
 * 与「主题色窗口标签栏」彻底独立的一条设置，只控制编辑器顶栏（.menu-bar）：
 *   - 'themed'：顶栏使用主题色（浅色模式亮蓝，暗色模式深蓝）；
 *   - 'plain' ：顶栏不使用主题色，改为跟随界面底色
 *               —— 浅色模式白底黑字、暗色模式深底浅字。
 *
 * 生效方式：把取值写进 <html data-sky-menubar-theme="...">，
 * 由 menu-bar.css 的属性选择器切换顶栏背景与前景色（文字、按钮走 inherit，
 * 图标由 iconContrast.js 按实际背景明暗自动反色），避免运行时改组件状态。
 */
const MENU_BAR_THEME_KEY = 'sky:menu-bar-theme';

const MENU_BAR_THEME_THEMED = 'themed';
const MENU_BAR_THEME_PLAIN = 'plain';

const DEFAULT_MENU_BAR_THEME = MENU_BAR_THEME_THEMED;

// 取值变化时广播，供图标自适应等模块重新判定背景明暗。
const MENU_BAR_THEME_EVENT = 'sky:menubar-theme-change';

const normalizeMenuBarTheme = value => (
    value === MENU_BAR_THEME_PLAIN ? MENU_BAR_THEME_PLAIN : MENU_BAR_THEME_THEMED
);

/**
 * 把取值写入 html 属性，CSS 据此切换顶栏配色。
 * @param {string} value 'themed' | 'plain'
 */
const applyMenuBarTheme = value => {
    if (typeof document === 'undefined') return;
    const normalized = normalizeMenuBarTheme(value);
    const previous = document.documentElement.getAttribute('data-sky-menubar-theme');
    document.documentElement.setAttribute('data-sky-menubar-theme', normalized);
    if (previous !== normalized &&
        typeof window !== 'undefined' &&
        typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(MENU_BAR_THEME_EVENT, {detail: normalized}));
    }
};

/**
 * 读取已保存的取值并立即应用；读不到或非法值时回退默认（使用主题色）。
 * @returns {string} 当前生效的取值
 */
const detectMenuBarTheme = () => {
    let value = DEFAULT_MENU_BAR_THEME;
    try {
        const stored = window.localStorage.getItem(MENU_BAR_THEME_KEY);
        if (stored === MENU_BAR_THEME_THEMED || stored === MENU_BAR_THEME_PLAIN) {
            value = stored;
        }
    } catch (e) {
        // localStorage 不可用时静默回退默认取值
    }
    applyMenuBarTheme(value);
    return value;
};

/**
 * 保存取值并立即应用。
 * @param {string} value 'themed' | 'plain'
 */
const persistMenuBarTheme = value => {
    const normalized = normalizeMenuBarTheme(value);
    try {
        window.localStorage.setItem(MENU_BAR_THEME_KEY, normalized);
    } catch (e) {
        // 忽略写入失败，仍保证当次生效
    }
    applyMenuBarTheme(normalized);
};

export {
    // 高级声音编辑器样式
    detectAudioEditorStyle,
    persistAudioEditorStyle,
    // 右键菜单样式
    detectContextMenuStyle,
    persistContextMenuStyle,
    applyContextMenuStyle,
    // 菜单栏位置
    detectMenuBarPosition,
    persistMenuBarPosition,
    // 标签栏布局
    detectTabLayout,
    persistTabLayout,
    // 窗口按钮样式
    detectWindowButtonStyle,
    persistWindowButtonStyle,
    // 主题色窗口标签栏
    WINDOW_TAB_BAR_THEME_THEMED,
    WINDOW_TAB_BAR_THEME_WHITE,
    WINDOW_TAB_BAR_THEME_EVENT,
    detectWindowTabBarTheme,
    persistWindowTabBarTheme,
    // 编辑器菜单栏主题色（与窗口标签栏相互独立）
    MENU_BAR_THEME_THEMED,
    MENU_BAR_THEME_PLAIN,
    MENU_BAR_THEME_EVENT,
    detectMenuBarTheme,
    persistMenuBarTheme
};
