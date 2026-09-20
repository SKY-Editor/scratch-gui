/*
 * bilup 独立功能模块 — 插件商店窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 内嵌展示 Bilup 插件市场入口（iframe 指向 https://com.bilup.org/addons），
 * 标注网络依赖；提供新窗口打开按钮作为 iframe 被 CSP 拦截时的兜底。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const ADDONS_URL = 'https://com.bilup.org/addons?locale=zh-cn';

class PluginStoreWindow extends React.Component {
    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="插件（Addons）商店"
                width={620}
                height={480}
                onClose={onClose}
            >
                <div
                    className="blp-note"
                    style={{marginBottom: 8}}
                >{'本窗口内嵌展示 Bilup 插件市场入口，需联网访问 com.bilup.org。 若 iframe 被浏览器 CSP 拦截，请使用下方「在新窗口打开」按钮。'}</div>
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <button
                        type="button"
                        className="blp-btn blp-btn-primary"
                        onClick={() => window.open(ADDONS_URL, '_blank', 'noopener')}
                    >{'在新窗口打开插件市场'}</button>
                </div>
                <iframe
                    title="Bilup Addons"
                    src={ADDONS_URL}
                    style={{flex: 1, width: '100%', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, minHeight: 300}}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                />
            </BilupWindow>
        );
    }
}

PluginStoreWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

export default PluginStoreWindow;
