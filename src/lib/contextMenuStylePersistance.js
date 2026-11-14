const STORAGE_KEY = 'sky:context-menu-style';
const DEFAULT_STYLE = 'tw';

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
    let value = DEFAULT_STYLE;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
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

const persistContextMenuStyle = style => {
    try {
        localStorage.setItem(STORAGE_KEY, style);
    } catch (e) {
        // ignore
    }
};

export {
    STORAGE_KEY,
    DEFAULT_STYLE,
    detectContextMenuStyle,
    persistContextMenuStyle,
    applyContextMenuStyle
};
