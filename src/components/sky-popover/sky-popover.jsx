import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import styles from './sky-popover.css';

/**
 * SKY 浮层基座（Portal 弹层）
 * ---------------------------------------------------------------------------
 * 解决的问题：
 *   1. 窗口（Win11Window）容器是 `overflow: hidden`，任何留在窗口 DOM 内的
 *      下拉菜单一旦超出窗口边界就会被裁掉，窗口一小就完全看不到选项；
 *   2. 下拉菜单留在窗口内容区里参与布局，还会把窗口的滚动高度撑大，
 *      凭空多出一条滚动条。
 *
 * 实现方式：
 *   把浮层 Portal 到 `document.body` 下的独立容器 `#sky-popover-root`，
 *   用 fixed 定位跟随锚点元素（anchorRef）的实时位置。
 *   这样浮层：
 *     - 不在窗口 DOM 内，永远不会被窗口 overflow 裁剪；
 *     - 不参与窗口内容布局，不会撑出滚动条；
 *     - 层叠上下文独立于窗口，层级天然高于任意窗口（含主题色窗口 z-index 链）。
 */

export const SKY_POPOVER_ROOT_ID = 'sky-popover-root';

// 浮层层级：低于自绘滚动条（2147483000），高于编辑器内一切窗口与顶栏。
export const SKY_POPOVER_Z_INDEX = 2147482500;

// 锚点与浮层之间的间隙
const GAP = 2;
// 与视口边缘的最小安全距离
const VIEWPORT_PADDING = 8;
// 浮层不得越出「所属窗口」，选择器指向窗口根节点（win11-window 已打标记）
const BOUNDARY_SELECTOR = '[data-sky-popover-boundary]';
const BOUNDARY_PADDING = 6;
// 浮层最小可用高度，翻转判定时不会被压成一条缝
const MIN_HEIGHT = 48;
// 退出动画时长，需与 sky-popover.css 中 --sky-popover-exit-duration 保持一致
const EXIT_DURATION = 140;

const ensurePopoverRoot = () => {
    if (typeof document === 'undefined') return null;
    let root = document.getElementById(SKY_POPOVER_ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = SKY_POPOVER_ROOT_ID;
        root.setAttribute('data-sky-popover-root', '');
        document.body.appendChild(root);
    }
    return root;
};

/**
 * 锚点定位计算：
 *   - matchWidth：浮层与锚点同宽（左侧内缩 8px，与旧下拉菜单 left/right: 8px 对齐）
 *   - 下方空间不足且上方更宽裕时自动向上翻转展开
 *   - 高度受视口可用空间限制，超出后由浮层内部滚动，绝不超出屏幕
 */
const computePosition = ({anchor, panel, matchWidth, maxHeight, align}) => {
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

    // 边界盒：浮层默认只受视口限制，但锚点在窗口内时应以「窗口可视区」为界，
    // 否则枚举类下拉会一路铺到窗口外、压住窗口下方的内容（表现为「错位/遮挡」）。
    const boundaryEl = anchor.closest ? anchor.closest(BOUNDARY_SELECTOR) : null;
    let boundLeft = VIEWPORT_PADDING;
    let boundRight = viewportWidth - VIEWPORT_PADDING;
    let boundTop = VIEWPORT_PADDING;
    let boundBottom = viewportHeight - VIEWPORT_PADDING;
    if (boundaryEl) {
        const b = boundaryEl.getBoundingClientRect();
        boundLeft = Math.max(boundLeft, b.left + BOUNDARY_PADDING);
        boundRight = Math.min(boundRight, b.right - BOUNDARY_PADDING);
        boundTop = Math.max(boundTop, b.top + BOUNDARY_PADDING);
        boundBottom = Math.min(boundBottom, b.bottom - BOUNDARY_PADDING);
    }

    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;

    const width = matchWidth ? Math.max(rect.width - 16, 120) : panelWidth;
    let left = matchWidth ? rect.left + 8 : rect.left;
    // align='right'：浮层右边缘与锚点右边缘对齐（用于从左往右展开会超出屏幕的菜单）
    if (!matchWidth && align === 'right') left = rect.right - width;
    if (left + width > boundRight) left = boundRight - width;
    if (left < boundLeft) left = boundLeft;


    const spaceBelow = boundBottom - rect.bottom - GAP;
    const spaceAbove = rect.top - boundTop - GAP;
    const flip = panelHeight > spaceBelow && spaceAbove > spaceBelow;
    const available = Math.max(MIN_HEIGHT, flip ? spaceAbove : spaceBelow);

    // 上下两端都要夹死：只按 available 反推 top 时，一旦可用空间被 MIN_HEIGHT
    // 兜底抬高（锚点贴近窗口上沿/下沿），面板顶部就会顶出边界上沿——窗口是
    // overflow:hidden，上半截被裁掉，滚动顶部内容看起来「跑出窗口外」。
    // 这里先把 top 夹进 [boundTop, boundBottom - MIN_HEIGHT]，再用夹取后的
    // top 反算高度上限，保证上下两端同时落在窗口内。
    let top = flip ? rect.top - GAP - Math.min(panelHeight, available) : rect.bottom + GAP;
    top = Math.max(boundTop, Math.min(top, boundBottom - MIN_HEIGHT));
    const heightLimit = boundBottom - top;

    return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        maxHeight: Math.min(maxHeight || available, available, heightLimit),
        flip
    };
};

export const SkyPopover = ({
    open,
    anchorRef,
    children,
    className,
    matchWidth,
    maxHeight,
    align,
    entrance,
    scrollable,
    variant
}) => {
    const panelRef = useRef(null);
    const [root, setRoot] = useState(null);
    const [visible, setVisible] = useState(open);
    const [leaving, setLeaving] = useState(false);
    const [position, setPosition] = useState(null);

    useEffect(() => {
        setRoot(ensurePopoverRoot());
    }, []);

    // 打开：立即挂载并播放入场动画；关闭：先播放退场动画再卸载。
    useEffect(() => {
        if (open) {
            setVisible(true);
            setLeaving(false);
            return undefined;
        }
        let timer = null;
        setVisible(current => {
            if (!current) return current;
            setLeaving(true);
            timer = window.setTimeout(() => {
                setVisible(false);
                setLeaving(false);
            }, EXIT_DURATION);
            return current;
        });
        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [open]);

    const updatePosition = useCallback(() => {
        const anchor = anchorRef && anchorRef.current;
        const panel = panelRef.current;
        if (!anchor || !panel) return;
        const next = computePosition({anchor, panel, matchWidth, maxHeight, align});
        setPosition(prev => (
            prev &&
            prev.left === next.left &&
            prev.top === next.top &&
            prev.width === next.width &&
            prev.maxHeight === next.maxHeight &&
            prev.flip === next.flip
                ? prev
                : next
        ));
    }, [anchorRef, matchWidth, maxHeight, align]);

    // 首次渲染先量尺寸再定位：避免先出现在错误位置再跳动。
    useLayoutEffect(() => {
        if (!visible) {
            setPosition(null);
            return;
        }
        updatePosition();
        // 字体、图标、子项尺寸在下一帧才稳定，补一次纠偏，避免菜单/下拉首次展开时错位。
        const raf = window.requestAnimationFrame(() => updatePosition());
        return () => window.cancelAnimationFrame(raf);
    });

    // 跟随锚点：窗口拖动/缩放、页面滚动、视口尺寸变化时同步位置。
    useEffect(() => {
        if (!visible) return undefined;
        const handle = () => updatePosition();
        window.addEventListener('scroll', handle, true);
        window.addEventListener('resize', handle);
        const anchor = anchorRef && anchorRef.current;
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handle) : null;
        if (observer) {
            if (anchor) observer.observe(anchor);
            if (panelRef.current) observer.observe(panelRef.current);
        }
        // 拖动/缩放窗口只会改变锚点位置，不产生 scroll/resize 事件，
        // 监听事件会漏掉这类位移，浮层就停在旧坐标上（错位、选项点不到）。
        // 打开期间逐帧比对锚点矩形，位移了才重算，开销可忽略。
        let lastRect = null;
        let raf = 0;
        const tick = () => {
            const anchorEl = anchorRef && anchorRef.current;
            if (anchorEl) {
                const r = anchorEl.getBoundingClientRect();
                if (!lastRect ||
                    Math.abs(r.left - lastRect.left) > 0.5 ||
                    Math.abs(r.top - lastRect.top) > 0.5 ||
                    Math.abs(r.width - lastRect.width) > 0.5 ||
                    Math.abs(r.height - lastRect.height) > 0.5) {
                    lastRect = {left: r.left, top: r.top, width: r.width, height: r.height};
                    updatePosition();
                }
            }
            raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('scroll', handle, true);
            window.removeEventListener('resize', handle);
            if (observer) observer.disconnect();
        };
    }, [visible, anchorRef, updatePosition]);

    // 浮层在 Portal 里，不属于触发它的组件 DOM 子树。
    // 父组件普遍用 document 上的 mousedown/click 做「点击外部关闭」，
    // 若不在浮层内截断冒泡，点选项会先被判定为「外部点击」而提前卸载。
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel || !visible) return undefined;
        const stop = event => event.stopPropagation();
        // 只拦「按下」类事件：既挡住外层 document 的「点外部关闭」，
        // 又必须放行 click —— React 的合成事件监听挂在 Portal 容器上，
        // 一旦在面板上连 click 一起 stopPropagation，选项的 onClick 永远不会触发（历史踩坑）。
        const events = ['mousedown', 'pointerdown', 'touchstart'];
        events.forEach(name => panel.addEventListener(name, stop));
        return () => {
            events.forEach(name => panel.removeEventListener(name, stop));
        };
    }, [visible]);

    if (!visible || !root) return null;

    return createPortal(
        <div
            ref={panelRef}
            className={[styles.skyPopover, className].filter(Boolean).join(' ')}
            data-sky-popover=""
            data-sky-popover-entrance={entrance || 'dropdown'}
            data-sky-popover-leaving={leaving ? 'true' : 'false'}
            data-sky-popover-scrollable={scrollable ? 'true' : 'false'}
            data-sky-popover-variant={variant || 'panel'}
            style={{
                left: position ? position.left : -9999,
                top: position ? position.top : -9999,
                width: position ? position.width : 'auto',
                maxHeight: position && scrollable ? position.maxHeight : 'none',
                zIndex: SKY_POPOVER_Z_INDEX,
                visibility: position ? 'visible' : 'hidden'
            }}
        >
            {children}
        </div>,
        root
    );
};

SkyPopover.propTypes = {
    open: PropTypes.bool,
    anchorRef: PropTypes.shape({current: PropTypes.any}),
    children: PropTypes.node,
    className: PropTypes.string,
    matchWidth: PropTypes.bool,
    maxHeight: PropTypes.number,
    align: PropTypes.oneOf(['left', 'right']),
    entrance: PropTypes.oneOf(['dropdown', 'menu', 'fade']),
    scrollable: PropTypes.bool,
    variant: PropTypes.oneOf(['panel', 'bare'])
};

SkyPopover.defaultProps = {
    open: false,
    anchorRef: null,
    children: null,
    className: '',
    matchWidth: false,
    maxHeight: null,
    align: 'left',
    entrance: 'dropdown',
    scrollable: true,
    variant: 'panel'
};

/**
 * 下拉菜单浮层：与锚点同宽、带展开/收起动画，供各窗口内的自绘下拉复用。
 * className 由调用方传原有的菜单样式（如 styles.languageDropdownMenu），
 * 外观完全保留，只是渲染位置搬到了 body 下的浮层容器里。
 */
export const SkyDropdownMenu = ({open, anchorRef, children, className, maxHeight}) => (
    <SkyPopover
        open={open}
        anchorRef={anchorRef}
        className={className}
        matchWidth
        maxHeight={maxHeight}
        entrance="dropdown"
        variant="panel"
    >
        {children}
    </SkyPopover>
);

SkyDropdownMenu.propTypes = {
    open: PropTypes.bool,
    anchorRef: PropTypes.shape({current: PropTypes.any}),
    children: PropTypes.node,
    className: PropTypes.string,
    maxHeight: PropTypes.number
};

SkyDropdownMenu.defaultProps = {
    open: false,
    anchorRef: null,
    children: null,
    className: '',
    maxHeight: null
};

export default SkyPopover;
