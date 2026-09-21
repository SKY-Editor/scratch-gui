/*
 * bilup 独立功能模块 — 通用浮动窗口外壳
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 形态：白底圆角 8px 浮动窗口，青绿标题栏，可拖动，带最小化/关闭按钮。
 * 样式全部限定在 html.bilup-theme 作用域（styles/bilup-modules.css）。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';

import '../styles/bilup-modules.css';

class BilupWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleMouseDown',
            'handleMouseMove',
            'handleMouseUp',
            'handleClose',
            'handleMinimize',
            'handleStopMouseDown'
        ]);
        this.state = {
            pos: props.initialPosition,
            dragging: false
        };
        this.dragOffset = {x: 0, y: 0};
    }

    handleStopMouseDown (e) {
        e.stopPropagation();
    }

    componentWillUnmount () {
        this.removeDragListeners();
    }

    removeDragListeners () {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseDown (e) {
        // 仅标题栏可拖动
        if (e.button !== 0) return;
        this.dragOffset = {
            x: e.clientX - this.state.pos.x,
            y: e.clientY - this.state.pos.y
        };
        this.setState({dragging: true});
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseMove (e) {
        if (!this.state.dragging) return;
        this.setState({
            pos: {
                x: Math.max(0, e.clientX - this.dragOffset.x),
                y: Math.max(0, e.clientY - this.dragOffset.y)
            }
        });
    }

    handleMouseUp () {
        this.setState({dragging: false});
        this.removeDragListeners();
    }

    handleClose () {
        if (this.props.onClose) this.props.onClose();
    }

    handleMinimize () {
        if (this.props.onMinimize) this.props.onMinimize();
    }

    render () {
        const {
            title,
            width,
            height,
            minimized,
            children
        } = this.props;
        const {pos} = this.state;

        if (minimized) return null;

        return (
            <div
                className={classNames('blp-window', this.props.className)}
                style={{
                    left: pos.x,
                    top: pos.y,
                    width: width,
                    height: height
                }}
            >
                <div
                    className="blp-window-header"
                    onMouseDown={this.handleMouseDown}
                >
                    <span className="blp-window-title">{title}</span>
                    <span className="blp-window-controls">
                        <button
                            type="button"
                            className="blp-window-btn"
                            title="最小化"
                            onMouseDown={this.handleStopMouseDown}
                            onClick={this.handleMinimize}
                        >
                            {'–'}
                        </button>
                        <button
                            type="button"
                            className={classNames('blp-window-btn', 'blp-window-btn-close')}
                            title="关闭"
                            onMouseDown={this.handleStopMouseDown}
                            onClick={this.handleClose}
                        >
                            {'×'}
                        </button>
                    </span>
                </div>
                <div className="blp-window-body">
                    {children}
                </div>
            </div>
        );
    }
}

BilupWindow.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    minimized: PropTypes.bool,
    onClose: PropTypes.func,
    onMinimize: PropTypes.func,
    title: PropTypes.string,
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
};

BilupWindow.defaultProps = {
    initialPosition: {x: 220, y: 90},
    width: 480,
    height: 420,
    minimized: false
};

export default BilupWindow;
