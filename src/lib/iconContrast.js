/**
 * 单色图标明暗自适应（深底转白 / 浅底转黑）
 * ---------------------------------------------------------------------------
 * 问题：编辑器里的图标大多是「纯白」或「纯黑」的单色 SVG（logo、工具栏图标、
 *       窗口标题图标、菜单勾选图标……），写死了颜色。这些图标一旦落到与自己
 *       同色的背景上（白图标压白底、黑图标压深底）就彻底看不见。
 * 方案：不做人工逐张配图，而是运行时读取图标"背后的实际背景色"，
 *       按背景明暗把图标统一滤镜成纯白或纯黑：
 *         - 背景深 → brightness(0) invert(1)  = 纯白
 *         - 背景浅 → brightness(0)             = 纯黑
 *       单色图标经过 brightness(0) 后只剩 alpha（轮廓），再决定是否 invert，
 *       因此不管原图标是白是黑，结果都正确，天然满足"白/黑都自适应"。
 *
 * 接入方式（三种，任一即可）：
 *   1) 容器加属性 data-sky-icon-adaptive-root —— 其内部 <img> 自动纳入管理；
 *   2) 单个图标加属性 data-sky-icon-adaptive；
 *   3) 命中内置默认根（顶栏 .menu-bar、窗口标题栏 .win11-titlebar、
 *      窗口右键菜单 .win11-context-menu、下拉浮层 [data-sky-popover]）自动接管。
 *
 * 跳过规则（避免误伤彩色素材）：
 *   - 元素或祖先带 data-sky-icon-color（声明"我是彩色图，别动"）；
 *   - 位图（png/jpg/jpeg/webp/gif/bmp）默认跳过，只处理 SVG（可确认是单色矢量）；
 *     位图若确实是单色图，可加 data-sky-icon-adaptive 强制接管；
 *   - 载入后尺寸超过 48px 的图（多为插图 / 头像），跳过。
 *
 * 刷新时机：DOM 变化（MutationObserver）、窗口尺寸变化、滚动、配色事件，
 *           统一以 rAF 合并，避免频繁重排。
 */

import {isDarkColor, parseColor} from './windowColor.js';

export const ADAPTIVE_ICON_ATTR = 'data-sky-icon-adaptive';
export const ADAPTIVE_ICON_ROOT_ATTR = 'data-sky-icon-adaptive-root';
export const DECORATIVE_ICON_ATTR = 'data-sky-icon-color';

// 内置自动接管容器
// 说明：不能写 CSS Modules 的类名（.menu-bar 在运行时被编译成
//       menu-bar_menu-bar_1gLUp），因此统一用属性选择器标注；
//       [data-sky-popover] 是 SkyPopover 渲染的浮层自带属性。
const DEFAULT_ROOTS = [
    `[${ADAPTIVE_ICON_ROOT_ATTR}]`,
    '[data-sky-popover]'
];

const FILTER_WHITE = 'brightness(0) invert(1)';
// 浅底不做纯黑剪影：brightness(0) 叠 72% 不透明度 ≈ #474747 中性深灰，
// 比纯黑柔和，也不与深色正文（#33363F）抢对比；彩色图标仍由
// data-sky-icon-color 声明保持原色，不进这里。
const FILTER_BLACK = 'brightness(0) opacity(0.72)';
const MAX_SINGLE_COLOR_ICON_SIZE = 48;
const TRANSPARENT_THRESHOLD = 0.05;

// 记录每个图标上一次施加的滤镜，避免无变化时反复写 style 触发重排
const appliedFilter = new WeakMap();

const isBitmapSource = src => {
    if (!src) return false;
    return /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i.test(src);
};

// 用户头像等个性化图片：即使恰好是 SVG 也不能被改成单色剪影
const isPersonalImage = src => !!src && /avatar|head-?img|portrait/i.test(src);

const hasAncestorWithAttr = (element, attr, stopAt) => {
    let node = element;
    while (node && node !== stopAt && node.nodeType === 1) {
        if (node.hasAttribute && node.hasAttribute(attr)) return true;
        node = node.parentElement;
    }
    return false;
};

/**
 * 取元素背后最近的一层"实色"背景
 * 说明：渐变 / 图片背景无法做亮度判定，遇到就继续向上找，
 *       最终兜底为白色（编辑器主体底色）。
 * @param {Element} element
 * @returns {string} 形如 'rgb(r, g, b)'
 */
const resolveBackdropColor = element => {
    let node = element;
    while (node && node.nodeType === 1) {
        const style = window.getComputedStyle(node);
        const bg = style.backgroundColor;
        const rgb = parseColor(bg);
        if (rgb) {
            const alphaMatch = /rgba?\([^)]*[,\s]([\d.]+)\s*\)$/i.exec(bg.trim());
            const alpha = alphaMatch ? Number(alphaMatch[1]) : 1;
            if (alpha > TRANSPARENT_THRESHOLD) return bg;
        }
        // 有背景图（渐变也算）时无法可靠算亮度，继续向上
        node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
};

const shouldHandle = img => {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.hasAttribute(DECORATIVE_ICON_ATTR)) return false;
    if (hasAncestorWithAttr(img, DECORATIVE_ICON_ATTR, null)) return false;
    const forced = img.hasAttribute(ADAPTIVE_ICON_ATTR) ||
        hasAncestorWithAttr(img, ADAPTIVE_ICON_ROOT_ATTR, null);
    const src = img.getAttribute('src');
    if (isPersonalImage(src)) return false;
    if (!forced && isBitmapSource(src)) return false;
    if (img.naturalWidth > MAX_SINGLE_COLOR_ICON_SIZE &&
        img.naturalHeight > MAX_SINGLE_COLOR_ICON_SIZE) return false;
    return true;
};

const applyToImage = img => {
    const backdrop = resolveBackdropColor(img.parentElement || img);
    const filter = isDarkColor(backdrop) ? FILTER_WHITE : FILTER_BLACK;
    if (appliedFilter.get(img) === filter) return;
    appliedFilter.set(img, filter);
    img.style.filter = filter;
    img.setAttribute('data-sky-icon-tone', isDarkColor(backdrop) ? 'dark' : 'light');
};

/**
 * 立即重算一次（内部使用；外部一般用 refreshAdaptiveIcons）
 */
const runRefresh = () => {
    const selector = DEFAULT_ROOTS
        .map(root => `${root} img`)
        .concat([`img[${ADAPTIVE_ICON_ATTR}]`])
        .join(', ');
    let candidates = [];
    try {
        candidates = Array.prototype.slice.call(document.querySelectorAll(selector));
    } catch (e) {
        return;
    }
    candidates.forEach(img => {
        try {
            if (shouldHandle(img)) applyToImage(img);
        } catch (e) {
            // 单个图标判定失败不影响其它图标
            if (window.__skyIconContrastDebug) window.console.warn('[sky-icon-contrast]', e);
        }
    });
};

let scheduled = false;
const scheduleRefresh = () => {
    if (scheduled) return;
    scheduled = true;
    const raf = window.requestAnimationFrame || (cb => window.setTimeout(cb, 16));
    raf(() => {
        scheduled = false;
        runRefresh();
    });
};

/**
 * 立即刷新图标明暗（供外部在配色 / 主题变化后主动触发）
 */
export const refreshAdaptiveIcons = () => {
    scheduleRefresh();
};

let initialized = false;

/**
 * 初始化图标明暗自适应
 * @returns {Function} 释放函数
 */
export const initAdaptiveIcons = () => {
    if (initialized) return () => {};
    initialized = true;
    // 调试标记：排查时可在控制台执行 refreshAdaptiveIcons() 手动重算
    window.__skyIconContrastReady = true;
    window.refreshAdaptiveIcons = refreshAdaptiveIcons;

    scheduleRefresh();

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'class', 'style']
    });

    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('scroll', scheduleRefresh, true);
    // 窗口配色 / 标签栏主题变化都会改变背景明暗，需要重新判定
    const COLOR_EVENTS = [
        'sky:window-color-change',
        'sky:tab-bar-theme-change',
        'sky:menubar-theme-change',
        'sky:theme-change'
    ];
    COLOR_EVENTS.forEach(name => window.addEventListener(name, scheduleRefresh));

    return () => {
        initialized = false;
        observer.disconnect();
        window.removeEventListener('resize', scheduleRefresh);
        window.removeEventListener('scroll', scheduleRefresh, true);
        COLOR_EVENTS.forEach(name => window.removeEventListener(name, scheduleRefresh));
    };
};

export default initAdaptiveIcons;
