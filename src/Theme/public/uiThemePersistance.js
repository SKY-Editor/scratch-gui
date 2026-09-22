import {UI_THEME_STORAGE_KEY, getUiThemeById, applyUiThemeChrome} from './ui-theme-registry.js';

const STORAGE_KEY = UI_THEME_STORAGE_KEY;
const DEFAULT_UI_THEME = 'sky-editor';

/**
 * @returns {string} detected UI theme id
 */
const detectUiTheme = () => {
    let value = DEFAULT_UI_THEME;
    try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local && getUiThemeById(local).id === local) {
            value = local;
        }
    } catch (e) {
        // ignore
    }
    // 应用启动即把主题同步到 <html data-ui-theme> 与命名空间类：
    // 主题切换时（tw-ui-theme.jsx / settings-window.jsx）虽已写入该属性，但刷新后需重新同步，
    // 否则依赖该属性的 CSS 选择器（如 sky-context-menu.css 的 sky-editor 主题限定）会失效。
    // 专属 CSS 变量（明暗）由 tw-theme-manager-hoc 在 applyGuiColors 链路补注入。
    if (typeof document !== 'undefined') {
        applyUiThemeChrome(value);
    }
    return value;
};

/**
 * @param {string} themeId UI theme id
 */
const persistUiTheme = themeId => {
    try {
        localStorage.setItem(STORAGE_KEY, themeId);
    } catch (e) {
        // ignore
    }
};

export {
    detectUiTheme,
    persistUiTheme,
    DEFAULT_UI_THEME
};
