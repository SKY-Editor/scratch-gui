/*
 * bilup 独立功能模块 — 菜单标签（复用 MenuLabel/MenuBarMenu 保持与现有菜单视觉一致）
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';

import MenuBarMenu from '../../../components/menu-bar/menu-bar-menu.jsx';
import MenuLabel from '../../../components/menu-bar/tw-menu-label.jsx';

class BilupMenuLabel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleOpen', 'handleClose']);
        this.state = {open: false};
    }

    handleOpen () {
        this.setState({open: true});
    }

    handleClose () {
        this.setState({open: false});
    }

    render () {
        return (
            <MenuLabel
                open={this.state.open}
                onOpen={this.handleOpen}
                onClose={this.handleClose}
            >
                <span>{this.props.label}</span>
                <MenuBarMenu
                    open={this.state.open}
                    place={this.props.place}
                    onClick={this.handleClose}
                >
                    {this.props.children}
                </MenuBarMenu>
            </MenuLabel>
        );
    }
}

BilupMenuLabel.propTypes = {
    children: PropTypes.node,
    label: PropTypes.string,
    place: PropTypes.string
};

export default BilupMenuLabel;
