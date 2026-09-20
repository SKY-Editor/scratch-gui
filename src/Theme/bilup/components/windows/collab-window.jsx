/*
 * bilup 独立功能模块 — 实时协作窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * UI 完整（房间 ID 加入 / 创建房间、成员列表示意）。
 * 需服务器支持，当前为界面预览：加入/创建不会真正建立连接。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const randomRoomId = () => `room-${Math.random().toString(36)
    .slice(2, 8)}`;

class CollabWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleJoin',
            'handleCreate',
            'handleRoomId'
        ]);
        this.state = {
            roomId: '',
            createdRoom: null,
            members: []
        };
    }

    handleRoomId (e) {
        this.setState({roomId: e.target.value});
    }

    handleJoin () {
        const roomId = this.state.roomId.trim();
        if (!roomId) return;
        this.setState({
            createdRoom: roomId,
            members: [
                {name: 'player3246（我）', ip: '本机'},
                {name: 'player1024', ip: '192.168.x.x（示意）'}
            ]
        });
    }

    handleCreate () {
        const roomId = randomRoomId();
        this.setState({
            createdRoom: roomId,
            roomId: roomId,
            members: [{name: 'player3246（我）', ip: '本机（房主）'}]
        });
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="实时协作"
                width={480}
                height={440}
                onClose={onClose}
            >
                <div
                    className="blp-note"
                    style={{marginBottom: 8}}
                >{'实时协作需服务器支持（房间同步、广播），当前为界面预览，不会建立真实连接。'}</div>
                <div className="blp-field">
                    <span className="blp-label">{'加入现有房间'}</span>
                    <div className="blp-row">
                        <input
                            className="blp-input"
                            style={{flex: 1, minWidth: 140}}
                            placeholder="房间 ID"
                            value={this.state.roomId}
                            onChange={this.handleRoomId}
                        />
                        <button
                            type="button"
                            className="blp-btn"
                            onClick={this.handleJoin}
                        >{'加入'}</button>
                    </div>
                </div>
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <button
                        type="button"
                        className="blp-btn blp-btn-primary"
                        onClick={this.handleCreate}
                    >{'创建新房间'}</button>
                </div>
                {this.state.createdRoom && (
                    <div>
                        <div className="blp-field">
                            <span className="blp-label">{'房间 ID / 邀请链接'}</span>
                            <input
                                className="blp-input"
                                readOnly
                                value={`${this.state.createdRoom}（邀请 URL 需服务器生成）`}
                            />
                        </div>
                        <div
                            className="blp-label"
                            style={{marginBottom: 4}}
                        >{'成员'}</div>
                        <div className="blp-list">
                            {this.state.members.map((m, i) => (
                                <div
                                    key={i}
                                    className="blp-list-item"
                                >
                                    <span>{m.name}</span>
                                    <span style={{color: '#8a97a5', fontSize: 11}}>{m.ip}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </BilupWindow>
        );
    }
}

CollabWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

export default CollabWindow;
