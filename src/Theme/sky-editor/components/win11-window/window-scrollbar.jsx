import SkyScrollbar from '../../../../components/sky-scrollbar/sky-scrollbar.jsx';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import styles from './window-scrollbar.css';

/*
 * 窗口内滚动条 —— 与窗口同一个组件、同一棵 DOM、同一个层叠上下文。
 *
 * 为什么不用「轨道挂 body、逐帧追赶窗口」的全局挂载器方案（该方案已归档至 归档-20261118/）：
 *   旧方案把轨道 createElement 到 body，再每帧 getBoundingClientRect 去追赶窗口。
 *   窗口拖动是「窗口自身 CSS 布局变化」，浏览器在渲染阶段同帧完成；
 *   而挂到 body 的轨道必须等下一帧 rAF 才读到新的窗口坐标，
 *   于是永远慢一帧、且多帧合并时出现拖影（用户看到的「延迟拖尾」）。
 *   同时 body 下的独立节点无法与某个窗口共用 z-index，只能被顶到全局最高层，
 *   于是「滚动条压在所有窗口之上」。
 *
 *
 * 【2026-11 追加】外观与交互一律复用设置窗口左侧栏那根条：
 *   检测到可滚动框后，给每个框套一个等尺寸定位槽，槽内直接挂 <SkyScrollbar>。
 *   换句话说，窗口里的条与设置左侧栏是同一个 React 组件、同一份 CSS 变量，
 *   轨道 10px / thumb 4px / 悬停只加深 / 按下 8px / 上下内缩 6px 全部一致，
 *   本文件不再自己画 thumb，也不再自建 hover 颜色。
 *
 * 现在的做法：轨道作为 .win11-window 的绝对定位子节点，
 *   - 坐标是「相对窗口」的常量，窗口平移/缩放时无需任何 JS 参与 → 零延迟；
 *   - 层叠跟随窗口自身 z-index（510+），不会再压过别的窗口；
 *   - 超出窗口的部分被 .win11-window 的 overflow:hidden + 圆角自然裁掉。
 */

const TRACK_WIDTH = 10;
const INSET_X = 2;
// 与设置窗口左侧栏（SkyScrollContainer 默认值）保持一致的内缩
const SCROLLBAR_INSET = 6;
const SCAN_DEBOUNCE = 30;  // 仅 class/style 变化走此防抖；结构变化走下一帧立即重测（scheduleMeasureRaf）
const CONTENT_GAP = 20;     // 规范 §2.4：内容与滚动条的右内边距（L2 场景由容器自身 padding 实现）
const SKIP_TAGS = new Set(['TEXTAREA', 'SELECT', 'INPUT', 'IFRAME', 'IMG']);
// Blockly 自带滚动条与几何，绝不能被接管或补边距（补了会直接打乱工具箱布局）
const SKIP_SEL = '.blocklyWidgetDiv, .blocklyTooltipDiv, .blocklySvg, .blocklyFlyout, .blocklyTreeRow, [data-sky-auto-skip]';

const isScrollable = el => {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    // 自绘滚动条自身、以及明确声明「不要滚动条」的容器一律跳过
    if (el.hasAttribute('data-sky-window-bar')) return false;
    if (el.getAttribute('data-sky-scrollbar') === 'none') return false;
    if (el.hasAttribute('data-sky-scrollbar-wrap')) return false;
    // 祖先已由窗口内其它滚动条组件（SkyScrollContainer）接管时跳过，避免双层
    if (el.closest('[data-sky-scrollbar-wrap]')) return false;
    // Blockly / 显式豁免的容器一概不接管
    if (el.closest(SKIP_SEL)) return false;
    // 布局过滤前置：全量扫描后绝大多数元素先在布局行出局，只有可能溢出的少数
    // 元素才触发 getComputedStyle —— measure 从「逐元素样式重算」变便宜，
    // 防抖才敢从 120ms 收到 50ms（这是「状态更新延迟」的一半来源）。
    if (el.clientHeight < 24 || el.clientWidth < 24) return false;
    if (el.scrollHeight - el.clientHeight < 2) return false;
    const view = el.ownerDocument.defaultView;
    if (!view) return false;
    const st = view.getComputedStyle(el);
    if (!/(auto|scroll)/.test(st.overflowY)) return false;
    // 不可见（display:none / 被隐藏的 tab）不做轨道
    if (!el.getClientRects().length) return false;
    return true;
};

// contentGap（规范 §2.4）：常态溢出的容器补右内边距，让内容右边界与 thumb 留白 ——
// 否则 thumb 会压住列表行尾的按钮/图标（用户反馈的「滚动条覆盖其他控件」主源）。
// 只写一次并写后复核：被业务 !important 压制则回滚放弃，绝不与 MO 形成自激循环；
// 回收见 measure() 里的 data-sky-sb-pad 分支（可见却不再溢出 → 撤边距，防白边事故）。
const gapDone = new WeakSet();
function ensureContentGap(el) {
    if (gapDone.has(el)) return;
    const view = el.ownerDocument.defaultView;
    if (!view) return;
    let pr = 0;
    try {
        pr = parseFloat(view.getComputedStyle(el).paddingRight) || 0;
    } catch (e) {
        return;
    }
    if (pr >= CONTENT_GAP) {
        gapDone.add(el);
        return;
    }
    try {
        el.style.paddingRight = CONTENT_GAP + 'px';
    } catch (e) {
        gapDone.add(el);
        return;
    }
    let after = 0;
    try {
        after = parseFloat(view.getComputedStyle(el).paddingRight) || 0;
    } catch (e) {
        // ignore
    }
    if (after >= CONTENT_GAP - 0.5) {
        el.setAttribute('data-sky-sb-pad', '1');
    } else {
        el.style.paddingRight = '';
    }
    gapDone.add(el);
}

/**
 * 窗口内自绘滚动条。
 * @param {object} props
 * @param {object} props.hostRef 窗口根节点 ref（.win11-window）
 * @param {string} [props.revision] 任意会在窗口内部结构上触发重扫的标记（如当前 Tab）
 */
const WindowScrollbar = ({hostRef, light, revision}) => {
    const [bars, setBars] = useState([]);
    const barsRef = useRef([]);
    const scanTimerRef = useRef(0);
    const measureRafRef = useRef(0);
    const containerObserverRef = useRef(null);

    const measure = useCallback(() => {
        const host = hostRef && hostRef.current;
        if (!host) return;
        const hostRect = host.getBoundingClientRect();
        // 开窗动画（win11-open：scale 0.88→1）期间 getBoundingClientRect 会被 transform
        // 缩放：直接相减会把槽位记成「缩放后坐标」，动画结束后若无人重测，槽位就永久
        // 偏移 (1-s)×距离（远端容器可达几十 px，即用户反馈的「滚动条错位 / 图层显示错误」）。
        // 宿主 rect ÷ 自身布局宽求出当前缩放、换算回布局坐标 → 平移与缩放都免疫，
        // 动画期间测得的坐标也正确，不再依赖「动画结束后补测」这种碰运气的时序。
        const hostScale = host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1;
        const next = [];
        host.querySelectorAll('*').forEach(el => {
            // 回收：补过 contentGap、现在可见却不再溢出的容器 → 撤掉内边距。
            // 不回收会留下「滚动条没了、白边还在」的凭空留白（规范 2.4 禁止的事故）。
            if (el.hasAttribute('data-sky-sb-pad') && el.getClientRects().length) {
                let over = false;
                try {
                    over = (el.scrollHeight - el.clientHeight) > 1;
                } catch (err) {
                    over = true;
                }
                if (!over) {
                    el.style.paddingRight = '';
                    el.removeAttribute('data-sky-sb-pad');
                    gapDone.delete(el);
                }
            }
            if (!isScrollable(el)) return;
            // 内容与滚动条分离（规范 §2.4 L2 场景）
            ensureContentGap(el);
            const rect = el.getBoundingClientRect();
            // 尺寸取布局值（不随 transform 缩放）；坐标用缩放校正后的布局值：
            // 动画期间与动画结束后测得的槽位一致，key 因此稳定，不会逐帧重挂载。
            // 取整：拖窗时 rect 的亚像素抖动会变成槽位 style 每帧重写，
            // 表现为「拖动窗口时滚动条闪一下」；整数让 key 与 style 双双稳定。
            const top = Math.round((rect.top - hostRect.top) / hostScale);
            const rawLeft = Math.round((rect.left - hostRect.left) / hostScale);
            const bar = {
                el,
                key: `${Math.round(top)}:${Math.round(rawLeft)}:${el.scrollHeight}:${el.clientHeight}`,
                top,
                height: el.offsetHeight,
                width: el.offsetWidth,
                rawLeft,
                left: rawLeft + el.offsetWidth - TRACK_WIDTH - INSET_X,
                tag: `${(el.className || "").toString().split(" ")[0]}|${el.clientWidth}x${el.clientHeight}`
            };
            next.push(bar);
            // 每轮都把容器交给 ResizeObserver：只监听窗口根节点会漏掉
            //「容器在窗口内变高变矮」（切 Tab、内容撑开、窗口缩放）的情况，
            // 轨道高度会停在旧值，thumb 位置与拖动比例全部算错。
            if (containerObserverRef.current) containerObserverRef.current.observe(el);
        });
        barsRef.current = next;
        setBars(next);
    }, [hostRef]);

    const remeasureSoon = useCallback(() => {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = window.setTimeout(measure, SCAN_DEBOUNCE);
    }, [measure]);

    // 内容结构变化（子节点增删：切 Tab / 列表刷新 / 面板展开）→ 下一帧立即重测。
    // 这是「滚动条显示隐藏、位置慢半拍」的主要来源；rAF 合并保证每帧至多一次
    // measure（布局过滤前置后单次很便宜），既不掉帧也不空转。
    const scheduleMeasureRaf = useCallback(() => {
        if (measureRafRef.current) return;
        measureRafRef.current = window.requestAnimationFrame(() => {
            measureRafRef.current = 0;
            measure();
        });
    }, [measure]);

    // 首帧同步测量（useLayoutEffect：首帧绘制前完成 → 开窗第一帧滚动条就位，不"闪现"）
    // + revision（最大化/尺寸）变化时重扫；rAF 第二遍兜底首帧后的布局结算
    useLayoutEffect(() => {
        measure();
        const raf = window.requestAnimationFrame(measure);
        return () => window.cancelAnimationFrame(raf);
    }, [measure, revision]);

    // 内部结构变化（切 Tab、列表增删、折叠面板展开）→ 防抖重扫
    useEffect(() => {
        const host = hostRef && hostRef.current;
        if (!host || typeof MutationObserver === 'undefined') return undefined;
        const observer = new MutationObserver(records => {
            // 跳过自绘槽/条内部的样式回写（thumb 每次滚动都改 style，不跳过会形成
            // 「滚动 → thumb 更新 → 全量重测 → 重渲染」的空转循环）。
            let structural = false;
            let useful = false;
            for (let i = 0; i < records.length; i++) {
                const t = records[i].target;
                if (t && t.nodeType === 1 && t.closest && t.closest('[data-sky-window-bar]')) {
                    continue;
                }
                useful = true;
                if (records[i].type === 'childList') structural = true;
            }
            if (!useful) return;
            // 结构变化 → 下一帧立即重测（显示/隐藏延迟主源）；仅 class/style → 短防抖
            if (structural) scheduleMeasureRaf();
            else remeasureSoon();
        });
        observer.observe(host, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden']});
        return () => observer.disconnect();
    }, [hostRef, remeasureSoon, scheduleMeasureRaf]);

    // 窗口尺寸变化（缩放/最大化/内容撑开）→ 重扫
    useEffect(() => {
        const host = hostRef && hostRef.current;
        if (!host) return undefined;
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', scheduleMeasureRaf);
            return () => window.removeEventListener('resize', scheduleMeasureRaf);
        }
        // 布局尺寸变了要重测每个滚动框的坐标（不只是 thumb），否则轨道会停在旧位置
        const observer = new ResizeObserver(() => scheduleMeasureRaf());
        observer.observe(host);
        containerObserverRef.current = observer;
        barsRef.current.forEach(bar => bar.el && observer.observe(bar.el));
        return () => {
            containerObserverRef.current = null;
            observer.disconnect();
        };
    }, [hostRef, scheduleMeasureRaf]);

    useEffect(() => () => {
        window.clearTimeout(scanTimerRef.current);
        window.cancelAnimationFrame(measureRafRef.current);
    }, []);

    if (!bars.length) return null;

    /* 视觉与行为完全复用 SkyScrollbar —— 设置窗口左侧栏用的就是这个组件。
       每个可滚动框套一个等尺寸定位槽，槽内直接挂 SkyScrollbar，
       于是轨道宽度、thumb 粗细、hover 变粗、按下加深、拖动比例全部零差异。 */
    return (
        <div className={styles.windowScrollLayer} data-sky-window-bar-root="">
            {bars.map(bar => (
                <div
                    key={bar.key}
                    className={styles.windowScrollSlot}
                    data-sky-window-bar=""
                    data-sky-window-bar-target={bar.tag}
                    style={{
                        top: bar.top,
                        left: typeof bar.rawLeft === 'number' ? bar.rawLeft : bar.left,
                        width: bar.width || 0,
                        height: bar.height
                    }}
                    role="presentation"
                >
                    <SkyScrollbar
                        light={light}
                        target={bar.el}
                        style={{
                            '--sky-scrollbar-inset-x': `${SCROLLBAR_INSET}px`,
                            '--sky-scrollbar-inset-y': `${SCROLLBAR_INSET}px`
                        }}
                    />
                </div>
            ))}
        </div>
    );
};

WindowScrollbar.propTypes = {
    hostRef: PropTypes.shape({current: PropTypes.any}),
    light: PropTypes.bool,
    revision: PropTypes.string
};

WindowScrollbar.defaultProps = {
    hostRef: null,
    revision: ''
};

export default WindowScrollbar;

