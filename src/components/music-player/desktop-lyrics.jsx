import React, {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage, displayArtist} from './i18n';
import {CloseIcon} from './icons.jsx';
import TrackCover from './cover.jsx';
import {parseLRC} from './lyric-page.jsx';

// 桌面歌词：通过 React portal 渲染到 document.body 顶层的置顶小窗（类似网易云桌面歌词），
// 覆盖编辑器所有 UI。支持鼠标拖动改变位置。
// 歌词来源与歌词页一致：LRC 时间轴(跟随播放高亮当前句) / 纯文本(静态首行) / 无歌词显示「纯音乐」。
const DesktopLyrics = function ({intl, track, audioRef, onClose, fontSize, align, opacity}) {
    const t = (key, values) => mpMessage(intl, key, values);
    const [pos, setPos] = useState(null);
    const [lineIndex, setLineIndex] = useState(-1);
    const barRef = useRef(null);
    const offsetRef = useRef(null);

    const lyrics = useMemo(() => (
        track && track.lyrics ? parseLRC(track.lyrics) : []
    ), [track]);

    // 桌面歌词当前显示文本：内部 rAF 逐帧读 audio.currentTime，
    // 仅在换句时 setState，实时跟手且不拖累父组件渲染。
    // 切歌时父级用 key 强制重挂本组件（行号状态清零）；useLayoutEffect + 同步定位
    // 保证首帧绘制前就落到正确歌词句，不会闪现上一首的残留行号/首句。
    useLayoutEffect(() => {
        if (!track || lyrics.length === 0) { setLineIndex(-1); return; }
        let raf = 0;
        let lastIdx = -1;
        const locate = () => {
            const audio = audioRef && audioRef.current;
            if (!audio) return -1;
            const now = audio.currentTime || 0;
            for (let i = lyrics.length - 1; i >= 0; i--) {
                if (now >= lyrics[i].time) return i;
            }
            return -1;
        };
        const tick = () => {
            const idx = locate();
            if (idx !== lastIdx) {
                lastIdx = idx;
                setLineIndex(idx);
            }
            raf = requestAnimationFrame(tick);
        };
        // 首帧先同步定位一次（新 audio.src 已同步把 currentTime 归零），
        // 避免 rAF 首 tick 前按初始 -1 渲染出首句造成闪烁。
        const initIdx = locate();
        lastIdx = initIdx;
        setLineIndex(initIdx);
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [audioRef, track, lyrics]);

    let displayText = t('instrumental');
    if (track && lyrics.length > 0) {
        displayText = lyrics[Math.max(0, lineIndex)].text;
    } else if (track && track.lyrics) {
        const first = track.lyrics.split('\n').map(s => s.trim()).filter(Boolean)[0];
        displayText = first || t('instrumental');
    }

    // 拖动：mousedown 记录点击偏移，document 级 mousemove/mouseup 实现移动
    const handleMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        const rect = barRef.current.getBoundingClientRect();
        offsetRef.current = {offX: e.clientX - rect.left, offY: e.clientY - rect.top};
        document.body.style.userSelect = 'none';
        const onMove = ev => {
            const off = offsetRef.current;
            if (!off) return;
            setPos({x: ev.clientX - off.offX, y: ev.clientY - off.offY});
        };
        const onUp = () => {
            offsetRef.current = null;
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

    // 未拖动过：CSS 保持顶部居中（top/left:50% + translateX），左边 title 拖动冲突，
    // 因此拖动触发后内联覆盖 left/top 并取消 translateX。
    const style = pos ? {left: pos.x, top: pos.y, transform: 'none'} : null;
    // 歌词样式（来自设置 > 歌词）：字号 / 对齐 / 透明度，仅作用在歌词文本行，不影响外壳拖动
    const textStyle = {};
    if (fontSize) textStyle.fontSize = `${fontSize}px`;
    if (align) textStyle.textAlign = align;
    if (typeof opacity === 'number') {
        textStyle.opacity = Math.max(0.3, Math.min(1, opacity / 100));
    }

    return ReactDOM.createPortal(
        <div
            ref={barRef}
            className={styles.desktopLyrics}
            style={style}
            onMouseDown={handleMouseDown}
            title={t('desktopLyricsDragTip')}
        >
            <TrackCover
                track={track}
                className={styles.desktopLyricsCover}
                iconSize={18}
            />
            <div className={styles.desktopLyricsRight}>
                <div className={styles.desktopLyricsTitle}>
                    {track ? track.title : t('notPlaying')}
                    {track && track.artist ? (
                        <span className={styles.desktopLyricsArtist}>{displayArtist(intl, track.artist)}</span>
                    ) : null}
                </div>
                <div className={styles.desktopLyricsText} style={textStyle}>{displayText}</div>
            </div>
            <button
                className={styles.desktopLyricsClose}
                onMouseDown={e => e.stopPropagation()}
                onClick={onClose}
                title={t('desktopLyricsOff')}
            >
                <CloseIcon size={12} />
            </button>
        </div>,
        document.body
    );
};

export default injectIntl(DesktopLyrics);
