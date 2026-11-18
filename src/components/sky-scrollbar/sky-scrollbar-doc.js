/*
 * SKYEditor 统一滚动条 —— 文档级（整页）自绘接管
 * ------------------------------------------------------------
 * 为什么需要这个文件：
 *   1. 窗口内 / 组件态滚动条都只管自己的容器，整页滚动一直没有统一外观
 *      （原容器级 body 挂载器方案已归档，见 归档-20261118/）；
 *   2. Chromium / Edge 的文档级滚动条走 overlay 渲染，::-webkit-scrollbar
 *      的透明 border 裁切与 transition 在文档级不生效 ——
 *      页面滚动条会紧贴右边缘、首尾顶到屏幕上下边、按下也不会变粗，
 *      看起来就是「没有 6px 间距、没有 180ms 动效」的旧版。
 *
 * 做法：隐藏原生文档滚动条 + 用与容器级完全相同的一套
 *      [data-sky-sb='track'|'thumb'] 自绘条接管（视觉/交互 100% 一致）。
 *      隐藏前先测量原生滚动条占位，用 padding-right 补偿，
 *      保证任何环境下内容宽度零变化。
 */

const TRACK_W = 10; // 轨道宽，与全局皮肤 --sky-scrollbar-track-width 一致
const INSET_RIGHT = 6; // 轨道距视口右边缘
const PAD_Y = 6; // 轨道上下留白
const MIN_THUMB = 32; // thumb 最小长度
const LIGHT_LUM = 0.62; // 背景亮度高于此值用浅色 tone

const STATE = {
    started: false,
    track: null,
    thumb: null,
    paintRaf: 0,
    timer: 0,
    ro: null,
    travel: 0,
    maxScroll: 0
};

function parseRgba(value) {
    const m = /rgba?\(([^)]+)\)/.exec(value || '');
    if (!m) return null;
    const parts = m[1].split(',').map(v => parseFloat(v));
    if (parts.length < 3 || parts.some(v => isNaN(v))) return null;
    const a = parts.length > 3 ? parts[3] : 1;
    return {r: parts[0], g: parts[1], b: parts[2], a};
}

// 判断视口背景是深还是浅，决定 thumb 用中性灰还是黑色半透明
function resolveTone() {
    const cands = [document.body, document.documentElement];
    for (const el of cands) {
        if (!el) continue;
        const c = parseRgba(getComputedStyle(el).backgroundColor);
        if (!c || c.a <= 0.05) continue;
        const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
        return lum > LIGHT_LUM ? 'light' : '';
    }
    return '';
}

function maxScrollOf() {
    const de = document.documentElement;
    const body = document.body;
    const sh = Math.max(
        de.scrollHeight,
        de.offsetHeight,
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0
    );
    return Math.max(0, sh - window.innerHeight);
}

function setHidden() {
    if (STATE.track) STATE.track.setAttribute('data-visible', '0');
}

function paint() {
    STATE.paintRaf = 0;
    const track = STATE.track;
    const thumb = STATE.thumb;
    if (!track || !thumb) return;

    const vh = window.innerHeight;
    const trackH = vh - PAD_Y * 2;
    track.style.top = PAD_Y + 'px';
    track.style.height = trackH + 'px';
    track.style.right = INSET_RIGHT + 'px';

    const maxScroll = maxScrollOf();
    if (maxScroll <= 1 || trackH <= 0) {
        STATE.maxScroll = 0;
        setHidden();
        return;
    }

    const sh = maxScroll + vh;
    const ratio = vh / sh;
    let thumbH = Math.round(trackH * ratio);
    if (thumbH < MIN_THUMB) thumbH = MIN_THUMB;
    if (thumbH > trackH) thumbH = trackH;

    const travel = Math.max(0, trackH - thumbH);
    const st = Math.min(Math.max(window.scrollY || window.pageYOffset || 0, 0), maxScroll);
    const y = travel > 0 ? (travel * st) / maxScroll : 0;

    STATE.travel = travel;
    STATE.maxScroll = maxScroll;

    const tone = resolveTone();
    if (tone) thumb.setAttribute('data-tone', tone);
    else thumb.removeAttribute('data-tone');

    thumb.style.top = '0px';
    thumb.style.height = thumbH + 'px';
    thumb.style.transform = `translate(-50%, ${y}px)`;
    track.setAttribute('data-visible', '1');
}

function markDirty() {
    if (STATE.paintRaf) return;
    STATE.paintRaf = window.requestAnimationFrame(paint);
}

function onThumbDown(e) {
    if (STATE.maxScroll <= 0 || STATE.travel <= 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startScroll = window.scrollY || window.pageYOffset || 0;
    const perPx = STATE.maxScroll / STATE.travel;
    const thumb = STATE.thumb;

    thumb.setAttribute('data-active', '1');
    document.body.style.userSelect = 'none';

    const onMove = ev => {
        const delta = ev.clientY - startY;
        let next = startScroll + delta * perPx;
        if (next < 0) next = 0;
        if (next > STATE.maxScroll) next = STATE.maxScroll;
        window.scrollTo(0, next);
    };
    const onUp = () => {
        thumb.removeAttribute('data-active');
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        markDirty();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
}

// 隐藏原生文档滚动条前先测占位，用 padding 补偿，保证内容宽度不变
function reserveGutter() {
    const de = document.documentElement;
    const sbw = de.offsetWidth - de.clientWidth;
    if (sbw > 0) {
        de.style.setProperty('--sky-doc-sbw', sbw + 'px');
        de.setAttribute('data-sky-doc-pad', '1');
    }
    de.setAttribute('data-sky-doc-sb', '1');
}

function start() {
    if (STATE.started) return;
    if (!document.body) {
        // body 还没解析出来：等 DOMContentLoaded 再来，避免静默失败
        document.addEventListener('DOMContentLoaded', start, {once: true});
        return;
    }
    STATE.started = true;

    const track = document.createElement('div');
    track.setAttribute('data-sky-sb', 'track');
    track.setAttribute('data-sky-doc-track', '1');
    track.setAttribute('data-visible', '0');

    const thumb = document.createElement('div');
    thumb.setAttribute('data-sky-sb', 'thumb');
    thumb.setAttribute('data-sky-doc-thumb', '1');
    thumb.setAttribute('aria-hidden', 'true');

    track.appendChild(thumb);
    document.body.appendChild(track);
    STATE.track = track;
    STATE.thumb = thumb;

    // 顺序很重要：先量原生占位，再隐藏原生条
    reserveGutter();

    thumb.addEventListener('pointerdown', onThumbDown);

    window.addEventListener('scroll', markDirty, {passive: true});
    window.addEventListener('resize', markDirty, {passive: true});

    if (typeof ResizeObserver === 'function') {
        STATE.ro = new ResizeObserver(markDirty);
        STATE.ro.observe(document.body);
    }

    // 低频兜底：内容异步变化（图片/远程数据/lazy 渲染）时保证长度正确
    STATE.timer = window.setInterval(markDirty, 400);

    markDirty();
}

function stop() {
    if (!STATE.started) return;
    STATE.started = false;

    window.removeEventListener('scroll', markDirty);
    window.removeEventListener('resize', markDirty);
    if (STATE.ro) {
        STATE.ro.disconnect();
        STATE.ro = null;
    }
    if (STATE.timer) {
        window.clearInterval(STATE.timer);
        STATE.timer = 0;
    }
    if (STATE.paintRaf) {
        window.cancelAnimationFrame(STATE.paintRaf);
        STATE.paintRaf = 0;
    }
    if (STATE.thumb) STATE.thumb.removeEventListener('pointerdown', onThumbDown);
    if (STATE.track && STATE.track.parentNode) STATE.track.parentNode.removeChild(STATE.track);
    STATE.track = null;
    STATE.thumb = null;

    const de = document.documentElement;
    de.removeAttribute('data-sky-doc-sb');
    de.removeAttribute('data-sky-doc-pad');
    de.style.removeProperty('--sky-doc-sbw');
}

/**
 * 启动整页滚动条接管。
 * @returns {function} dispose：卸载自绘条与全部监听
 */
function initSkyDocScrollbar() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }
    return stop;
}

export {initSkyDocScrollbar};
export default initSkyDocScrollbar;
