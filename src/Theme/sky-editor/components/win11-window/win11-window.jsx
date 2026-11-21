import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {connect} from 'react-redux';
import styles from './win11-window.css';
import WindowScrollbar from './window-scrollbar.jsx';
import twAdvancedIcon from '../../../../components/menu-bar/tw-advanced.svg';
import {ACCENT_MAP} from '../../../../lib/themes/index.js';
import {detectWindowButtonStyle} from '../../../../lib/sky-settings-store.js';
import {
    detectWindowTabBarTheme,
    WINDOW_TAB_BAR_THEME_EVENT,
    WINDOW_TAB_BAR_THEME_WHITE
} from '../../../../lib/sky-settings-store.js';
// 注意：本模块只保留「开发期配色解析」能力（resolveTitlebarTheme / normalizeHexColor）。
// 面向终端用户的逐窗口配色（localStorage + 右键色板）已废除：
// 窗口配色 = 开发时通过 <Win11Window windowColor="#xxxxxx"> 指定，不再暴露设置入口。
import {normalizeHexColor, resolveTitlebarTheme} from '../../../../lib/windowColor.js';

// 窗口按钮样式（Windows / Mac）在模块加载时立即应用到 <html>，
// 保证首个窗口打开时即为用户所选样式（默认 Windows）。
detectWindowButtonStyle();

// 主题色窗口标签栏开关同样在模块加载时应用，
// 保证首个窗口出现时标签栏即为用户所选配色（默认使用主题色）。
detectWindowTabBarTheme();

// Shared window focus manager: tracks every open Win11Window instance so that
// clicking any window brings it to the front, mirroring the focus behavior
// of a native multi-window desktop.
const windowFocusManager = (() => {
    let counter = 0;
    let topZIndex = 510;
    let activeId = null;
    const instances = new Map();

    const notifyAll = () => {
        instances.forEach((entry, id) => {
            entry.listener(id === activeId, entry.zIndex);
        });
    };

    return {
        register (listener) {
            const id = ++counter;
            const zIndex = ++topZIndex;
            instances.set(id, {listener, zIndex});
            activeId = id;
            notifyAll();
            return id;
        },
        unregister (id) {
            instances.delete(id);
            if (activeId !== id) return;
            activeId = null;
            let highestZIndex = -1;
            let highestId = null;
            instances.forEach((entry, entryId) => {
                if (entry.zIndex > highestZIndex) {
                    highestZIndex = entry.zIndex;
                    highestId = entryId;
                }
            });
            if (highestId !== null) activeId = highestId;
            notifyAll();
        },
        activate (id) {
            if (activeId === id || !instances.has(id)) return;
            const entry = instances.get(id);
            entry.zIndex = ++topZIndex;
            activeId = id;
            notifyAll();
        },
        getZIndex (id) {
            const entry = instances.get(id);
            return entry ? entry.zIndex : 0;
        }
    };
})();

if (typeof window !== 'undefined') {
    // 暴露共享焦点管理器给 DOM addon 窗口引擎（common/sky-win11-window.js）：
    // 插件窗口（如调试器）与 React 窗口共用同一 z-index 计数组件，实现互相遮挡
    // ——窗口显示/点击时置顶，其它窗口激活时可被覆盖；仅 sky-editor 主题下使用。
    window.__skyWin11FocusManager = windowFocusManager;
}

// 外围缩放热区厚度（px）：Windows 的调整大小命中区贴在窗口边框之外，
// 而不是窗口内部。热区层按此值把窗口矩形向外扩张一圈，窗口本体压在
// 热区之上，于是只有「边框外侧这一圈」可拖，窗口内部交互完全不受影响。
const RESIZE_ZONE_OUTSIDE = 8;

// Exposes window interaction state and a bring-to-front callback to child
// content. The addons window uses this to focus the iframe and bring the
// window forward even though iframe clicks do not bubble to the parent.
export const Win11WindowInteractionContext = React.createContext({
    interacting: false,
    bringToFront: () => {}
});

// 计算窗口标题栏最终配色，返回 {style, tone}：
//   tone = 'dark' | 'light'，表示背景明暗，决定标题文字 / 控制按钮 / 单色图标取色方向。
//   style = 内联样式（未命中任何配色时为 undefined，交由样式表兜底）。
// 优先级：本窗口自定义配色 > 主题色（仅"主题色窗口标签栏"开启时）> 纯白。
// 只有 uiTheme === 'sky-editor' 才接管配色，其余主题保持组件原有外观。
// 当前 UI 明暗（由 editor-framework-core/theme-registry.js 写 <html data-ui-dark>）
const detectUiDark = () => (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-ui-dark') === 'true'
);

const getTitlebarPresentation = (uiTheme, accent, tabBarTheme, customColor, uiDark) => {
    if (uiTheme !== 'sky-editor') return {style: undefined, tone: 'light'};
    const useAccent = tabBarTheme !== WINDOW_TAB_BAR_THEME_WHITE;
    let accentColor = '';
    if (useAccent) {
        const accentColors = ACCENT_MAP[accent] ? ACCENT_MAP[accent].guiColors : null;
        if (accentColors) {
            accentColor = accentColors['menu-bar-background-image'] ||
                accentColors['looks-secondary'] || '';
        }
    }
    const theme = resolveTitlebarTheme({customColor, accentColor, useAccent});
    // 主题色窗口标签栏关闭且本窗口没有自定义色 → 不注入内联样式，
    // 让样式表里 html[data-sky-tab-bar-theme='white'] 的白色规则生效
    // （内联样式优先级更高，不让步的话白色规则永远被压住）。
    if (!theme.background) {
        // 关闭「主题色窗口标签栏」且无自定义色时，背景由样式表接管：
        // 浅色模式 #f7f8fa 深字，深色模式还原 #1E2027 浅字。
        // 明暗基调必须跟随当前 UI 明暗，否则深色模式会停在浅色基调（深底黑字）。
        return {style: undefined, tone: uiDark ? 'dark' : 'light'};
    }
    return {
        style: {background: theme.background, color: theme.foreground},
        tone: theme.tone
    };
};

const Win11Window = ({
    title,
    onClose,
    children,
    icon,
    defaultWidth,
    defaultHeight,
    accent,
    uiTheme,
    disableMaximize,
    disableResize,
    titlebarCenter,
    titlebarActions,
    // windowId：窗口唯一标识（调试/焦点追踪用）。窗口配色不再持久化，
    // 该字段仅为兼容既有调用点保留。
    windowId,
    // windowColor：开发期写死的固定配色（如 windowColor="#1f2430"）。
    // 这是组件属性，不向终端用户暴露任何"自定义窗口颜色"的设置入口；
    // 不传则由样式表按「主题色窗口标签栏」开关决定主题色 / 纯白。
    windowColor
}) => {
    const [minimized, setMinimized] = useState(false);
    const [maximized, setMaximized] = useState(false);
    // Windows-style open/close animation: mount -> scale-up + fade-in;
    // close -> play scale-down + fade-out first, then really unmount.
    const [closing, setClosing] = useState(false);
    const closingRef = useRef(false);
    const [pos, setPos] = useState(() => ({
        left: Math.max(0, Math.round((window.innerWidth - defaultWidth) / 2)),
        top: Math.max(24, Math.round((window.innerHeight - defaultHeight) / 2 - 40))
    }));
    const [size, setSize] = useState({
        width: defaultWidth,
        height: defaultHeight
    });
    const [menu, setMenu] = useState(null);
    const [interactionMode, setInteractionMode] = useState(null);
    const [interacting, setInteracting] = useState(false);
    const [dragTransform, setDragTransform] = useState(null);
    const [dragging, setDragging] = useState(false);
    const preMaximizeRef = useRef(null);
    const dragRef = useRef(null);
    const dragListenersRef = useRef(null);
    const lastClickRef = useRef(null);
    const resizeRef = useRef(null);
    const interactionRef = useRef(null);
    const windowRef = useRef(null);
    const menuRef = useRef(null);
    const windowIdRef = useRef(null);
    const [windowZIndex, setWindowZIndex] = useState(510);
    // 订阅「主题色窗口标签栏」取值：切换开关后所有已打开窗口立即重算标题栏配色
    const [tabBarTheme, setTabBarTheme] = useState(() => detectWindowTabBarTheme());
    // 关闭「主题色窗口标签栏」后标题栏背景由样式表接管，前景色需跟随 UI 明暗切换，
    // 否则深色模式下标题仍是浅色基调（深底黑字不可读）。
    const [uiDark, setUiDark] = useState(detectUiDark);

    useEffect(() => {
        if (typeof MutationObserver === 'undefined') return undefined;
        const observer = new MutationObserver(() => setUiDark(detectUiDark()));
        observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-ui-dark']});
        return () => observer.disconnect();
    }, []);


    useEffect(() => {
        const handleTabBarThemeChange = event => {
            setTabBarTheme((event && event.detail) || detectWindowTabBarTheme());
        };
        window.addEventListener(WINDOW_TAB_BAR_THEME_EVENT, handleTabBarThemeChange);
        return () => window.removeEventListener(WINDOW_TAB_BAR_THEME_EVENT, handleTabBarThemeChange);
    }, []);

    useEffect(() => {
        const id = windowFocusManager.register((isActive, zIndex) => {
            setWindowZIndex(zIndex);
        });
        windowIdRef.current = id;
        return () => {
            windowFocusManager.unregister(id);
            windowIdRef.current = null;
        };
    }, []);

    const handleWindowPointerDown = () => {
        if (windowIdRef.current !== null) {
            windowFocusManager.activate(windowIdRef.current);
        }
    };

    const bringToFront = useCallback(() => {
        if (windowIdRef.current !== null) {
            windowFocusManager.activate(windowIdRef.current);
        }
    }, []);

    const interactionContextValue = useMemo(() => ({
        interacting,
        bringToFront
    }), [interacting, bringToFront]);

    const closeMenu = () => setMenu(null);

    // All close paths funnel through here so the close animation always plays:
    // set closing -> render scale-down + fade-out -> trigger onClose to unmount.
    const handleClose = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        setClosing(true);
    }, []);

    // Give the CSS close animation time to finish before really unmounting.
    const CLOSE_ANIMATION_MS = 160;
    useEffect(() => {
        if (!closing) return undefined;
        const timer = window.setTimeout(onClose, CLOSE_ANIMATION_MS);
        return () => window.clearTimeout(timer);
    }, [closing, onClose]);

    const handleToggleMaximize = () => {
        if (disableMaximize) return;
        if (maximized) {
            const pre = preMaximizeRef.current;
            if (pre) {
                setPos(pre.pos);
                setSize(pre.size);
            }
            setMaximized(false);
        } else {
            preMaximizeRef.current = {pos, size};
            setMaximized(true);
        }
    };

    const enterMoveMode = (startX, startY) => {
        if (maximized) return;
        interactionRef.current = {
            mode: 'move',
            startX, startY,
            dx: 0, dy: 0
        };
        setInteractionMode('move');
        setInteracting(true);
    };

    const enterResizeMode = (startX, startY) => {
        if (maximized) return;
        const rect = windowRef.current.getBoundingClientRect();
        interactionRef.current = {
            mode: 'resize',
            startX, startY,
            startLeft: rect.left, startTop: rect.top,
            startWidth: rect.width, startHeight: rect.height
        };
        setInteractionMode('resize');
        setInteracting(true);
    };

    const handleMenuRestore = () => {
        if (maximized) handleToggleMaximize();
        closeMenu();
    };
    const handleMenuMove = e => {
        enterMoveMode(e.clientX, e.clientY);
        closeMenu();
    };
    const handleMenuSize = e => {
        enterResizeMode(e.clientX, e.clientY);
        closeMenu();
    };
    const handleMenuMinimize = () => {
        setMinimized(true);
        closeMenu();
    };
    const handleMenuMaximize = () => {
        if (!maximized) handleToggleMaximize();
        closeMenu();
    };
    const handleMenuClose = () => {
        closeMenu();
        handleClose();
    };

    useEffect(() => {
        const handleKeyDown = e => {
            // 内容区自己消费过（preventDefault）的按键不再由窗口接管：
            // 避免窗口内浮层/菜单按 Esc 关闭时把整个窗口一起关掉。
            if (e.defaultPrevented) return;
            if (e.key === 'Escape') {
                if (interactionMode) {
                    const d = interactionRef.current;
                    const wasMove = d && d.mode === 'move';
                    if (wasMove) {
                        setPos(prev => ({left: prev.left + d.dx, top: prev.top + d.dy}));
                    }
                    setDragTransform(null);
                    setInteractionMode(null);
                    interactionRef.current = null;
                    if (wasMove) {
                        requestAnimationFrame(() => setInteracting(false));
                    } else {
                        setInteracting(false);
                    }
                } else if (menu) {
                    setMenu(null);
                } else {
                    handleClose();
                }
                return;
            }
            if (!menu) return;
            const getWindowCenter = () => {
                const rect = windowRef.current.getBoundingClientRect();
                return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            };
            switch (e.key) {
            case 'r':
            case 'R':
                if (maximized) {
                    handleMenuRestore();
                }
                break;
            case 'm':
            case 'M':
                if (!maximized) {
                    const center = getWindowCenter();
                    enterMoveMode(center.x, center.y);
                    setMenu(null);
                }
                break;
            case 's':
            case 'S':
                if (!maximized) {
                    const center = getWindowCenter();
                    enterResizeMode(center.x, center.y);
                    setMenu(null);
                }
                break;
            case 'n':
            case 'N':
                handleMenuMinimize();
                break;
            case 'x':
            case 'X':
                if (!maximized) {
                    handleMenuMaximize();
                }
                break;
            case 'c':
            case 'C':
                handleMenuClose();
                break;
            default:
                break;
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleClose, menu, interactionMode, maximized, pos, size]);

    useEffect(() => {
        if (!menu) return undefined;
        const handleMouseDown = e => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenu(null);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [menu]);

    useEffect(() => {
        if (!interactionMode) return undefined;
        const handleMouseMove = ev => {
            const d = interactionRef.current;
            if (!d) return;
            if (d.mode === 'move') {
                d.dx = ev.clientX - d.startX;
                d.dy = ev.clientY - d.startY;
                setDragTransform({dx: d.dx, dy: d.dy});
            } else {
                const dx = ev.clientX - d.startX;
                const dy = ev.clientY - d.startY;
                const MIN_W = 500;
                const MIN_H = 300;
                const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
                const width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - d.startLeft);
                const height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - d.startTop);
                setSize({width, height});
            }
        };
        const handleMouseDown = () => {
            const d = interactionRef.current;
            const wasMove = d && d.mode === 'move';
            if (wasMove) {
                setPos(prev => ({left: prev.left + d.dx, top: prev.top + d.dy}));
            }
            setDragTransform(null);
            setInteractionMode(null);
            interactionRef.current = null;
            if (wasMove) {
                requestAnimationFrame(() => setInteracting(false));
            } else {
                setInteracting(false);
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mousedown', handleMouseDown);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mousedown', handleMouseDown);
        };
    }, [interactionMode]);

    const beginDrag = (startX, startY) => {
        if (maximized) return;
        setInteracting(true);
        setDragging(true);
        dragRef.current = {startX, startY, dx: 0, dy: 0};
        // 每帧只提交一次位移：高回报率鼠标一帧内会派发多次 mousemove，
        // 逐次 setState 会造成多余渲染，合并到 rAF 里可显著提升拖动流畅度。
        let rafId = null;
        const handleMouseMove = ev => {
            const d = dragRef.current;
            if (!d) return;
            d.dx = ev.clientX - d.startX;
            d.dy = ev.clientY - d.startY;
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    const cur = dragRef.current;
                    if (!cur) return;
                    setDragTransform({dx: cur.dx, dy: cur.dy});
                });
            }
        };
        const handleMouseUp = () => {
            const d = dragRef.current;
            if (d) {
                setPos(prev => ({left: prev.left + d.dx, top: prev.top + d.dy}));
            }
            dragRef.current = null;
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            setDragTransform(null);
            setDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            dragListenersRef.current = null;
            // Keep transition:none for one more frame so the left/top write-back
            // happens instantly without a transition animation.
            requestAnimationFrame(() => setInteracting(false));
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        dragListenersRef.current = {handleMouseMove, handleMouseUp};
    };

    const cancelDrag = () => {
        const listeners = dragListenersRef.current;
        if (listeners) {
            document.removeEventListener('mousemove', listeners.handleMouseMove);
            document.removeEventListener('mouseup', listeners.handleMouseUp);
            dragListenersRef.current = null;
        }
        dragRef.current = null;
        setDragTransform(null);
        setDragging(false);
        setInteracting(false);
    };

    const handleTitlebarMouseDown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        const now = Date.now();
        const last = lastClickRef.current;
        const dx = last ? e.clientX - last.x : Infinity;
        const dy = last ? e.clientY - last.y : Infinity;
        const isDoubleClick = last &&
            (now - last.time) < 300 &&
            Math.sqrt(dx * dx + dy * dy) < 5;
        if (isDoubleClick) {
            lastClickRef.current = null;
            cancelDrag();
            handleToggleMaximize();
            return;
        }
        lastClickRef.current = {time: now, x: e.clientX, y: e.clientY};
        if (maximized) return;
        beginDrag(e.clientX, e.clientY);
    };

    const handleTitlebarContextMenu = e => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({
            left: Math.min(e.clientX, window.innerWidth - 180),
            top: Math.min(e.clientY, window.innerHeight - 240)
        });
    };

    const beginResize = (corner, startX, startY) => {
        if (maximized) return;
        setInteracting(true);
        const rect = windowRef.current.getBoundingClientRect();
        const startLeft = rect.left;
        const startTop = rect.top;
        const startWidth = rect.width;
        const startHeight = rect.height;
        const startRight = startLeft + startWidth;
        const startBottom = startTop + startHeight;
        resizeRef.current = {
            corner, startX, startY, startLeft, startTop, startWidth, startHeight,
            startRight, startBottom
        };
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        let rafId = null;
        const handleMouseMove = ev => {
            const d = resizeRef.current;
            if (!d) return;
            const dx = ev.clientX - d.startX;
            const dy = ev.clientY - d.startY;
            const MIN_W = 500;
            const MIN_H = 300;
            let left = d.startLeft;
            let top = d.startTop;
            let width = d.startWidth;
            let height = d.startHeight;
            switch (d.corner) {
            case 'e':
                width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - left);
                break;
            case 'w':
                width = clamp(d.startWidth - dx, MIN_W, d.startRight);
                left = d.startRight - width;
                break;
            case 's':
                height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - top);
                break;
            case 'n':
                height = clamp(d.startHeight - dy, MIN_H, d.startBottom);
                top = d.startBottom - height;
                break;
            case 'ne':
                width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - left);
                height = clamp(d.startHeight - dy, MIN_H, d.startBottom);
                top = d.startBottom - height;
                break;
            case 'sw':
                width = clamp(d.startWidth - dx, MIN_W, d.startRight);
                left = d.startRight - width;
                height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - top);
                break;
            case 'nw':
                width = clamp(d.startWidth - dx, MIN_W, d.startRight);
                left = d.startRight - width;
                height = clamp(d.startHeight - dy, MIN_H, d.startBottom);
                top = d.startBottom - height;
                break;
            default: // se
                width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - left);
                height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - top);
                break;
            }
            // 与拖动同理：按帧合并尺寸更新，避免一次 mousemove 触发多次布局。
            d.pending = {left, top, width, height};
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    const cur = resizeRef.current;
                    if (!cur || !cur.pending) return;
                    const next = cur.pending;
                    cur.pending = null;
                    setPos({left: next.left, top: next.top});
                    setSize({width: next.width, height: next.height});
                });
            }
        };
        const handleMouseUp = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            const d = resizeRef.current;
            if (d && d.pending) {
                setPos({left: d.pending.left, top: d.pending.top});
                setSize({width: d.pending.width, height: d.pending.height});
            }
            resizeRef.current = null;
            setInteracting(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleResizeMouseDown = corner => e => {
        if (maximized) return;
        e.preventDefault();
        e.stopPropagation();
        // 外围热区在窗口矩形之外，不经过窗口的 onMouseDownCapture，
        // 这里补一次置顶，让「拖边框」和「点窗口」一样把该窗口带到最前。
        bringToFront();
        beginResize(corner, e.clientX, e.clientY);
    };

    const baseWindowStyle = maximized ? {
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh'
    } : {
        left: pos.left,
        top: pos.top,
        width: size.width,
        height: size.height,
        ...(dragTransform ? {transform: `translate3d(${dragTransform.dx}px, ${dragTransform.dy}px, 0)`} : {})
    };
    const windowStyle = interacting ? {...baseWindowStyle, transition: 'none'} : baseWindowStyle;
    // 本窗口最终配色：只接受开发期通过 windowColor prop 指定的固定色，
    // 未传则由样式表接管（主题色 / 纯白），不再向用户暴露任何自定义入口。
    const resolvedCustomColor = windowColor ? normalizeHexColor(windowColor) : '';
    const titlebar = getTitlebarPresentation(uiTheme, accent, tabBarTheme, resolvedCustomColor, uiDark);
    const titlebarStyle = titlebar.style;

    // 外围缩放热区层：与窗口同一坐标系（fixed），按窗口矩形向外扩一圈。
    // 拖动时窗口靠 transform 平移（pos 尚未提交），热区层补同样的位移才跟手。
    const showResizeZone = !maximized && !minimized && !disableResize;
    const resizeZoneStyle = showResizeZone ? {
        left: pos.left - RESIZE_ZONE_OUTSIDE,
        top: pos.top - RESIZE_ZONE_OUTSIDE,
        width: size.width + (RESIZE_ZONE_OUTSIDE * 2),
        height: size.height + (RESIZE_ZONE_OUTSIDE * 2),
        ...(dragTransform ? {transform: `translate3d(${dragTransform.dx}px, ${dragTransform.dy}px, 0)`} : {})
    } : null;

    const resizeZone = (
        <div
            className={classNames(styles.win11ResizeZone, {
                // 交互中（拖动/缩放）窗口没有过渡，热区层也必须瞬时跟随
                [styles.win11ResizeZoneStatic]: interacting
            })}
            style={resizeZoneStyle}
        >
            <div
                className={styles.win11ResizeZoneN}
                onMouseDown={handleResizeMouseDown('n')}
            />
            <div
                className={styles.win11ResizeZoneS}
                onMouseDown={handleResizeMouseDown('s')}
            />
            <div
                className={styles.win11ResizeZoneW}
                onMouseDown={handleResizeMouseDown('w')}
            />
            <div
                className={styles.win11ResizeZoneE}
                onMouseDown={handleResizeMouseDown('e')}
            />
            {/* 四角放在最后：同一层内后者在上，保证角部命中优先于边部 */}
            <div
                className={styles.win11ResizeZoneNw}
                onMouseDown={handleResizeMouseDown('nw')}
            />
            <div
                className={styles.win11ResizeZoneNe}
                onMouseDown={handleResizeMouseDown('ne')}
            />
            <div
                className={styles.win11ResizeZoneSw}
                onMouseDown={handleResizeMouseDown('sw')}
            />
            <div
                className={styles.win11ResizeZoneSe}
                onMouseDown={handleResizeMouseDown('se')}
            />
        </div>
    );

    return (
        <div
            className={styles.win11Overlay}
            style={{zIndex: windowZIndex}}
        >
            {showResizeZone && resizeZone}
            <div
                ref={windowRef}
                className={classNames(styles.win11Window, {
                    [styles.win11Maximized]: maximized,
                    [styles.win11Interacting]: interacting,
                    [styles.win11Dragging]: dragging,
                    [styles.win11Closing]: closing
                })}
                style={windowStyle}
                data-sky-popover-boundary=""
                onMouseDownCapture={handleWindowPointerDown}
            >
                <div
                    className={styles.win11Titlebar}
                    data-sky-titlebar-tone={titlebar.tone}
                    data-sky-icon-adaptive-root=""
                    style={titlebarStyle}
                    onMouseDown={handleTitlebarMouseDown}
                    onContextMenu={handleTitlebarContextMenu}
                >
                    <div className={styles.win11Title}>
                        <img
                            className={styles.win11TitleIcon}
                            src={icon}
                            draggable={false}
                            alt=""
                        />
                        <span>{title}</span>
                    </div>
                    {titlebarCenter && (
                        <div
                            className={styles.win11TitlebarCenter}
                            onMouseDown={e => e.stopPropagation()}
                            onContextMenu={e => e.stopPropagation()}
                            onDoubleClick={e => e.stopPropagation()}
                        >
                            {titlebarCenter}
                        </div>
                    )}
                    <div
                        className={styles.win11Controls}
                        onMouseDown={e => e.stopPropagation()}
                        onContextMenu={e => e.stopPropagation()}
                    >
                        {titlebarActions && (
                            <div
                                className={styles.win11TitlebarActions}
                                onMouseDown={e => e.stopPropagation()}
                                onContextMenu={e => e.stopPropagation()}
                            >
                                {titlebarActions}
                            </div>
                        )}
                        {/* DOM 顺序沿用 Windows 口径：最小化 → 最大化 → 关闭（交互绑定与热区随结构，不随样式变）。
                            Mac 样式只用 CSS order 重排为交通灯 红(关闭) → 黄(最小化) → 绿(最大化)：
                            圆点为纯色，鼠标移入整组时在圆点内显示缩小版图标；
                            mac 下最大化/恢复图标改由 CSS 绘制（绿点内斜向双三角），此处 svg 结构不动。 */}
                        <button
                            className={classNames(styles.win11Button, styles.win11Minimize)}
                            onClick={() => setMinimized(m => !m)}
                            title="Minimize"
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10">
                                <line x1="0.5" y1="5" x2="9.5" y2="5" stroke="currentColor" strokeWidth="1" />
                            </svg>
                        </button>
                        {!disableMaximize && (
                        <button
                            className={classNames(styles.win11Button, styles.win11Maximize)}
                            onClick={handleToggleMaximize}
                            title="Maximize"
                        >
                            {maximized ? (
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                    <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
                                    <path d="M 0.5 0.5 H 7.5 V 2.5 H 2.5 V 7.5 H 0.5 Z" fill="none" stroke="currentColor" strokeWidth="1" />
                                </svg>
                            ) : (
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                    <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
                                </svg>
                            )}
                        </button>
                        )}
                        <button
                            className={classNames(styles.win11Button, styles.win11Close)}
                            onClick={handleClose}
                            title="Close"
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10">
                                <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
                                <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
                            </svg>
                        </button>
                    </div>
                </div>
                {!minimized && (
                    <div className={styles.win11Body}>
                        <Win11WindowInteractionContext.Provider value={interactionContextValue}>
                            {children}
                        </Win11WindowInteractionContext.Provider>
                    </div>
                )}
                {!maximized && !disableResize && (
                    <React.Fragment>
                        <div
                            className={styles.win11ResizeHandleN}
                            onMouseDown={handleResizeMouseDown('n')}
                        />
                        <div
                            className={styles.win11ResizeHandleS}
                            onMouseDown={handleResizeMouseDown('s')}
                        />
                        <div
                            className={styles.win11ResizeHandleW}
                            onMouseDown={handleResizeMouseDown('w')}
                        />
                        <div
                            className={styles.win11ResizeHandleE}
                            onMouseDown={handleResizeMouseDown('e')}
                        />
                        <div
                            className={styles.win11ResizeHandleNw}
                            onMouseDown={handleResizeMouseDown('nw')}
                        />
                        <div
                            className={styles.win11ResizeHandleNe}
                            onMouseDown={handleResizeMouseDown('ne')}
                        />
                        <div
                            className={styles.win11ResizeHandleSw}
                            onMouseDown={handleResizeMouseDown('sw')}
                        />
                        <div
                            className={styles.win11ResizeHandleSe}
                            onMouseDown={handleResizeMouseDown('se')}
                        />
                    </React.Fragment>
                )}
                <div className={styles.win11DimOverlay} />
                {/* 窗口内滚动条：与窗口同一个组件、同一个层叠上下文。
                    轨道坐标相对窗口恒定，窗口移动时不需要任何 JS 追赶，
                    因此不会出现「下一帧才追上」的拖尾；层级也只在本窗口内，
                    不再像旧的全局挂载方案那样压在所有窗口之上。 */}
                <WindowScrollbar
                    hostRef={windowRef}
                    light={tabBarTheme === WINDOW_TAB_BAR_THEME_WHITE}
                    revision={`${maximized ? 'max' : 'normal'}:${Math.round(size.width)}x${Math.round(size.height)}`}
                />
            </div>
            {menu && (
                <div
                    ref={menuRef}
                    className={styles.win11ContextMenu}
                    data-sky-icon-adaptive-root=""
                    style={{left: menu.left, top: menu.top}}
                >
                    <div
                        className={classNames(styles.win11MenuItem, {
                            [styles.win11MenuItemDisabled]: !maximized || disableMaximize
                        })}
                        onClick={maximized && !disableMaximize ? handleMenuRestore : undefined}
                    >
                        {'还原(R)'}
                    </div>
                    <div
                        className={classNames(styles.win11MenuItem, {
                            [styles.win11MenuItemDisabled]: maximized
                        })}
                        onClick={maximized ? undefined : handleMenuMove}
                    >
                        {'移动(M)'}
                    </div>
                    <div
                        className={classNames(styles.win11MenuItem, {
                            [styles.win11MenuItemDisabled]: maximized || disableResize
                        })}
                        onClick={!maximized && !disableResize ? handleMenuSize : undefined}
                    >
                        {'大小(S)'}
                    </div>
                    <div className={styles.win11MenuItemDivider} />
                    <div
                        className={styles.win11MenuItem}
                        onClick={handleMenuMinimize}
                    >
                        {'最小化(N)'}
                    </div>
                    <div
                        className={classNames(styles.win11MenuItem, {
                            [styles.win11MenuItemDisabled]: maximized || disableMaximize
                        })}
                        onClick={!maximized && !disableMaximize ? handleMenuMaximize : undefined}
                    >
                        {'最大化(X)'}
                    </div>
                    <div className={styles.win11MenuItemDivider} />
                    <div className={styles.win11MenuItem} onClick={handleMenuClose}>
                        {'关闭(C)'}
                    </div>
                </div>
            )}
        </div>
    );
};

Win11Window.propTypes = {
    title: PropTypes.node,
    onClose: PropTypes.func,
    children: PropTypes.node,
    icon: PropTypes.string,
    defaultWidth: PropTypes.number,
    defaultHeight: PropTypes.number,
    accent: PropTypes.string,
    uiTheme: PropTypes.string,
    disableMaximize: PropTypes.bool,
    disableResize: PropTypes.bool,
    titlebarCenter: PropTypes.node,
    titlebarActions: PropTypes.node,
    windowId: PropTypes.string,
    windowColor: PropTypes.string
};

Win11Window.defaultProps = {
    icon: twAdvancedIcon,
    defaultWidth: 750,
    defaultHeight: 820
};

const mapStateToProps = state => ({
    accent: state.scratchGui.theme.theme.accent,
    uiTheme: state.scratchGui.uiTheme
});

export default connect(mapStateToProps)(Win11Window);
