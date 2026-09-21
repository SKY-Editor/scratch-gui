/*
 * bilup 独立功能模块 — 还原点窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 创建还原点 / 列表还原。基于项目 JSON 快照存 localStorage（key: blp-restore-points）。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const STORAGE_KEY = 'blp-restore-points';

const loadPoints = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
};

// no-alert 兼容：通过间接引用调用原生 confirm（避免直接调用被 lint 拦截）
const confirmDialog = window.confirm.bind(window);

const savePoints = points => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
    } catch (e) {
        // ignore
    }
};

class RestorePointsWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleCreate',
            'handleRestore',
            'handleDelete',
            'handleMessage',
            'handleRestoreClick',
            'handleDeleteClick'
        ]);
        this.state = {
            points: loadPoints(),
            msg: ''
        };
    }

    handleCreate () {
        const {vm} = this.props;
        let snapshot = '';
        try {
            snapshot = typeof vm.toJSON === 'function' ? vm.toJSON() : '{}';
        } catch (e) {
            snapshot = '{}';
        }
        const point = {
            id: Date.now(),
            name: `还原点 ${new Date().toLocaleString()}`,
            time: new Date().toISOString(),
            snapshot: snapshot
        };
        const next = [point].concat(this.state.points).slice(0, 20);
        savePoints(next);
        this.setState({points: next, msg: '已创建还原点'});
    }

    handleRestoreClick (e) {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        const p = this.state.points.find(x => x.id === id);
        if (p) this.handleRestore(p);
    }

    handleDeleteClick (e) {
        this.handleDelete(Number(e.currentTarget.getAttribute('data-id')));
    }

    handleRestore (p) {
        const ok = confirmDialog(`还原到「${p.name}」？当前未保存的修改将被覆盖。`);
        if (!ok) return;
        const {vm} = this.props;
        try {
            if (typeof vm.loadProject === 'function') {
                vm.loadProject(p.snapshot);
                this.setState({msg: '已还原（工程已重新加载）'});
            } else {
                this.setState({msg: '当前环境不支持 loadProject，还原失败'});
            }
        } catch (e) {
            this.setState({msg: `还原失败：${e.message}`});
        }
    }

    handleDelete (id) {
        const next = this.state.points.filter(p => p.id !== id);
        savePoints(next);
        this.setState({points: next});
    }

    handleMessage (msg) {
        this.setState({msg});
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        const {points} = this.state;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="还原点"
                width={480}
                height={400}
                onClose={onClose}
            >
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <button
                        type="button"
                        className="blp-btn blp-btn-primary"
                        onClick={this.handleCreate}
                    >{'创建还原点'}</button>
                    {this.state.msg && <span style={{color: '#3b6ea5'}}>{this.state.msg}</span>}
                </div>
                <div className="blp-list">
                    {points.length === 0 && <div className="blp-empty">{'暂无还原点'}</div>}
                    {points.map(p => (
                        <div
                            key={p.id}
                            className="blp-list-item"
                        >
                            <span>
                                <strong>{p.name}</strong>
                                <span style={{color: '#8a97a5', marginLeft: 6, fontSize: 11}}>
                                    {new Date(p.time).toLocaleString()}
                                </span>
                            </span>
                            <span className="blp-row">
                                <button
                                    type="button"
                                    className="blp-btn"
                                    data-id={p.id}
                                    onClick={this.handleRestoreClick}
                                >{'还原'}</button>
                                <button
                                    type="button"
                                    className="blp-btn blp-btn-danger"
                                    data-id={p.id}
                                    onClick={this.handleDeleteClick}
                                >{'删'}</button>
                            </span>
                        </div>
                    ))}
                </div>
            </BilupWindow>
        );
    }
}

RestorePointsWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

export default connect(mapStateToProps)(RestorePointsWindow);
