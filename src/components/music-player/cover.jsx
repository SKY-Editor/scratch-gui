import React, {forwardRef, useEffect, useState} from 'react';
import styles from './music-player.css';
import {NoteIcon} from './icons.jsx';

// 歌曲封面：track 含 cover 字段时渲染图片（网易云专辑封面 URL / 本地上传图片 dataURL），
// 此时**隐藏容器的纯色渐变背景**并裁切圆角——图片完全接管封面区域，
// 避免图片加载中/透明 PNG/圆角抗锯齿缝透出底色；图片加载失败自动回退 c1/c2 渐变 + 音符。
// 无 cover 时保持既有渐变占位。容器 div 由调用方传入 className（.cover / .now-cover /
// .lyric-cover / .desktop-lyrics-cover 等），并透传 onClick/title 等挂到容器上；
// forwardRef 供 FLIP 动画等需要拿容器引用的场景使用。
const TrackCover = forwardRef(function TrackCover ({track, className, iconSize, children, ...rest}, ref) {
    const [failed, setFailed] = useState(false);
    // 切歌/换封面时重置失败标记：避免上一首加载失败导致下一首新封面被错误回退
    useEffect(() => {
        setFailed(false);
    }, [track && track.cover]);
    const hasCover = !!(track && track.cover && !failed);
    const style = hasCover ?
        {background: 'none', overflow: 'hidden'} :
        {'--c1': track && track.c1, '--c2': track && track.c2};
    return (
        <div
            ref={ref}
            className={className}
            style={style}
            {...rest}
        >
            {hasCover ? (
                <img
                    className={styles.coverImg}
                    src={track.cover}
                    alt=""
                    draggable={false}
                    onError={() => setFailed(true)}
                />
            ) : (
                <NoteIcon size={iconSize} />
            )}
            {children}
        </div>
    );
});

export default TrackCover;
