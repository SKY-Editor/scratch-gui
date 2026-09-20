/*
 * bilup 独立功能模块 — Redux reducer（窗口显隐控制）
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 职责：仅控制 bilup 功能窗口的开关状态。全部窗口仅在
 *       uiTheme === 'bilup' 时由 bilup-menu-bar.jsx 渲染（isUiTheme 判定），
 *       非 bilup 主题下本 reducer 状态不影响任何现有 UI，零回归。
 * ---------------------------------------------------------------------------
 */

// 窗口 id 白名单（与 bilup-menu-bar.jsx 渲染表一一对应）
const BILUP_WINDOW_IDS = [
    'git',
    'debugger',
    'terminal',
    'variableManager',
    'projectData',
    'todo',
    'restorePoints',
    'collab',
    'pluginStore',
    'bookmarks'
];

const bilupInitialState = {
    windows: BILUP_WINDOW_IDS.reduce((acc, id) => {
        acc[id] = false;
        return acc;
    }, {})
};

const OPEN_BILUP_WINDOW = 'OPEN_BILUP_WINDOW';
const CLOSE_BILUP_WINDOW = 'CLOSE_BILUP_WINDOW';
const TOGGLE_BILUP_WINDOW = 'TOGGLE_BILUP_WINDOW';
const CLOSE_ALL_BILUP_WINDOWS = 'CLOSE_ALL_BILUP_WINDOWS';

const bilupReducer = (state = bilupInitialState, action) => {
    switch (action.type) {
    case OPEN_BILUP_WINDOW:
        if (!BILUP_WINDOW_IDS.includes(action.windowId)) return state;
        return {
            ...state,
            windows: {
                ...state.windows,
                [action.windowId]: true
            }
        };
    case CLOSE_BILUP_WINDOW:
        if (!BILUP_WINDOW_IDS.includes(action.windowId)) return state;
        return {
            ...state,
            windows: {
                ...state.windows,
                [action.windowId]: false
            }
        };
    case TOGGLE_BILUP_WINDOW:
        if (!BILUP_WINDOW_IDS.includes(action.windowId)) return state;
        return {
            ...state,
            windows: {
                ...state.windows,
                [action.windowId]: !state.windows[action.windowId]
            }
        };
    case CLOSE_ALL_BILUP_WINDOWS:
        return bilupInitialState;
    default:
        return state;
    }
};

export {
    bilupReducer as default,
    bilupInitialState,
    BILUP_WINDOW_IDS,
    OPEN_BILUP_WINDOW,
    CLOSE_BILUP_WINDOW,
    TOGGLE_BILUP_WINDOW,
    CLOSE_ALL_BILUP_WINDOWS
};
