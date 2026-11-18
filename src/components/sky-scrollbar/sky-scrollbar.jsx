import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';

import styles from './sky-scrollbar.css';

const MIN_THUMB_HEIGHT = 32;

/**
 * SKYEditor 统一滚动条组件（全项目唯一模板）
 *
 * 两种接入方式：
 *   1) 组件接管滚动条（支持「鼠标碰到变深 + 按下变粗 + 过渡动画」）：
 *      <SkyScrollContainer className={styles.list}>...</SkyScrollContainer>
 *      或自行布局：<div className={styles.wrap}><div ref={...}>...</div><SkyScrollbar target={el} /></div>
 *   2) 仅要统一皮肤（零改造）：容器什么都不用做，继承 sky-scrollbar-global.css 的原生皮肤。
 *
 * 规范文档：docs/SKY-SCROLLBAR-SPEC.md
 */
class SkyScrollbar extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            active: false,
            visible: false,
            thumbHeight: 0,
            thumbTop: 0
        };
        this.trackRef = React.createRef();
        this.frame = null;
        this.dragState = null;
        this.resizeObserver = null;
        this.mutationObserver = null;
        bindAll(this, [
            'attach',
            'detach',
            'scheduleSync',
            'sync',
            'handleScroll',
            'handleResize',
            'handleThumbPointerDown',
            'handlePointerMove',
            'handlePointerUp',
            'handleTrackPointerDown'
        ]);
    }

    componentDidMount () {
        this.attach();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.target !== this.props.target) {
            this.detach(prevProps.target);
            this.attach();
        }
    }

    componentWillUnmount () {
        this.detach();
        if (this.frame) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }

    attach () {
        const {target} = this.props;
        if (!target) return;
        // 打标：本容器原生 thumb 退回透明（保留 10px 占位），视觉交给自绘条，避免双条同框
        target.setAttribute('data-sky-sb-managed', '1');
        target.addEventListener('scroll', this.handleScroll, {passive: true});
        window.addEventListener('resize', this.handleResize);
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.scheduleSync);
            this.resizeObserver.observe(target);
        }
        if (typeof MutationObserver !== 'undefined') {
            this.mutationObserver = new MutationObserver(this.scheduleSync);
            this.mutationObserver.observe(target, {
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden'],
                childList: true,
                subtree: true
            });
        }
        this.sync();
    }

    detach (target = this.props.target) {
        if (target) {
            target.removeAttribute('data-sky-sb-managed');
            target.removeEventListener('scroll', this.handleScroll);
        }
        window.removeEventListener('resize', this.handleResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerUp);
        this.dragState = null;
    }

    handleScroll () {
        this.sync();
    }

    handleResize () {
        this.sync();
    }

    /* 合并同一帧内的多次同步请求，避免内容变化时反复重排 */
    scheduleSync () {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.sync();
        });
    }

    sync () {
        const {target, minThumbHeight} = this.props;
        const track = this.trackRef.current;
        if (!track) return;
        if (!target) {
            if (this.state.visible) this.setState({visible: false});
            return;
        }
        const trackHeight = track.clientHeight;
        const scrollable = target.scrollHeight - target.clientHeight;
        if (trackHeight <= 0 || scrollable <= 1) {
            if (this.state.visible) {
                this.setState({visible: false, active: false});
            }
            return;
        }
        const ratio = target.clientHeight / target.scrollHeight;
        const thumbHeight = Math.max(
            Math.min(minThumbHeight, trackHeight),
            Math.min(trackHeight, Math.round(trackHeight * ratio))
        );
        const maxTop = Math.max(0, trackHeight - thumbHeight);
        const progress = target.scrollTop / Math.max(1, scrollable);
        const thumbTop = Math.round(maxTop * Math.min(1, Math.max(0, progress)));
        if (
            this.state.visible === true &&
            this.state.thumbHeight === thumbHeight &&
            this.state.thumbTop === thumbTop
        ) {
            return;
        }
        this.setState({visible: true, thumbHeight, thumbTop});
    }

    handleThumbPointerDown (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const {target} = this.props;
        if (!target) return;
        this.dragState = {
            startY: e.clientY,
            startScrollTop: target.scrollTop
        };
        this.setState({active: true});
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerUp);
    }

    handlePointerMove (e) {
        const {target} = this.props;
        const track = this.trackRef.current;
        if (!target || !track || !this.dragState) return;
        const maxTop = Math.max(0, track.clientHeight - this.state.thumbHeight);
        if (maxTop <= 0) return;
        const scrollable = target.scrollHeight - target.clientHeight;
        const delta = e.clientY - this.dragState.startY;
        target.scrollTop = this.dragState.startScrollTop + ((delta / maxTop) * scrollable);
    }

    handlePointerUp () {
        this.dragState = null;
        this.setState({active: false});
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerUp);
    }

    handleTrackPointerDown (e) {
        if (e.button !== 0) return;
        const {target} = this.props;
        const track = this.trackRef.current;
        if (!target || !track) return;
        e.preventDefault();
        const rect = track.getBoundingClientRect();
        const usable = Math.max(1, rect.height - this.state.thumbHeight);
        const ratio = (e.clientY - rect.top - (this.state.thumbHeight / 2)) / usable;
        const scrollable = target.scrollHeight - target.clientHeight;
        target.scrollTop = Math.max(0, Math.min(scrollable, ratio * scrollable));
        this.setState({active: true});
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerUp);
    }

    render () {
        const {className, light, style} = this.props;
        const {active, thumbHeight, thumbTop, visible} = this.state;
        return (
            <div
                className={classNames(styles.skyScrollbar, className, {
                    [styles.skyScrollbarHidden]: !visible
                })}
                style={style}
                onPointerDown={this.handleTrackPointerDown}
                ref={this.trackRef}
            >
                <div
                    className={classNames(styles.skyScrollbarThumb, {
                        [styles.skyScrollbarThumbLight]: light,
                        [styles.skyScrollbarThumbActive]: active
                    })}
                    style={{
                        height: `${thumbHeight}px`,
                        top: `${thumbTop}px`
                    }}
                    onPointerDown={this.handleThumbPointerDown}
                />
            </div>
        );
    }
}

SkyScrollbar.propTypes = {
    className: PropTypes.string,
    light: PropTypes.bool,
    minThumbHeight: PropTypes.number,
    style: PropTypes.object,
    target: PropTypes.object
};

SkyScrollbar.defaultProps = {
    className: '',
    light: false,
    minThumbHeight: MIN_THUMB_HEIGHT,
    style: null,
    target: null
};

/**
 * 开箱即用的滚动容器：wrap + 滚动区 + 统一滚动条
 * 用法：<SkyScrollContainer className={styles.list} light>...</SkyScrollContainer>
 */
class SkyScrollContainer extends React.Component {
    constructor (props) {
        super(props);
        this.state = {el: null};
        bindAll(this, ['handleRef']);
    }

    handleRef (node) {
        if (node !== this.state.el) this.setState({el: node});
    }

    render () {
        const {
            children,
            className,
            contentGap,
            contentStyle,
            insetX,
            insetY,
            light,
            minThumbHeight,
            style,
            wrapClassName
        } = this.props;
        const barStyle = {};
        if (typeof insetX === 'number') barStyle['--sky-scrollbar-inset-x'] = `${insetX}px`;
        if (typeof insetY === 'number') barStyle['--sky-scrollbar-inset-y'] = `${insetY}px`;
        // 内容与滚动条之间的留白：用内联样式写死，避免被业务 CSS 的 padding 简写覆盖
        const viewStyle = {...contentStyle};
        if (typeof contentGap === 'number' && contentGap > 0) {
            viewStyle.paddingRight = contentGap;
        }
        return (
            <div
                className={classNames(styles.skyScrollWrap, wrapClassName)}
                style={style}
            >
                <div
                    className={classNames(styles.skyScrollView, className)}
                    data-sky-scrollbar={'none'}
                    style={viewStyle}
                    ref={this.handleRef}
                >
                    {children}
                </div>
                <SkyScrollbar
                    light={light}
                    minThumbHeight={minThumbHeight}
                    style={barStyle}
                    target={this.state.el}
                />
            </div>
        );
    }
}

SkyScrollContainer.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    contentGap: PropTypes.number,
    contentStyle: PropTypes.object,
    insetX: PropTypes.number,
    insetY: PropTypes.number,
    light: PropTypes.bool,
    minThumbHeight: PropTypes.number,
    style: PropTypes.object,
    wrapClassName: PropTypes.string
};

SkyScrollContainer.defaultProps = {
    children: null,
    className: '',
    contentGap: 20,
    contentStyle: null,
    insetX: 6,
    insetY: 6,
    light: false,
    minThumbHeight: MIN_THUMB_HEIGHT,
    style: null,
    wrapClassName: ''
};

export {SkyScrollbar as default, SkyScrollbar, SkyScrollContainer};
