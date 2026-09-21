/*
 * bilup 独立功能模块 — 调试器窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 标签页：日志 / 线程 / 性能 / 内存。
 * 日志数据接入点：组件挂载时暴露 window.__blupDebugger.addLog(level, text)，
 *   外部（如 scratch-vm 运行时事件、扩展代码）可调用注入真实日志；
 *   当前内置示例数据用于演示。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const SAMPLE_LOGS = [
    {id: 1, level: 'info', text: '虚拟机已启动（示例日志）'},
    {id: 2, level: 'info', text: '项目加载完成，格式 3.0.0'},
    {id: 3, level: 'warn', text: '检测到未使用的变量：temp（示例）'},
    {id: 4, level: 'error', text: '扩展加载失败：com.bilup.org/demo（示例）'},
    {id: 5, level: 'info', text: '渲染帧率 60 FPS（示例）'}
];

const LEVELS = {info: '日志', warn: '警告', error: '错误'};

class DebuggerWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleTab',
            'handleTabClick',
            'handleSearch',
            'handleFilter',
            'handleClear',
            'handleExport',
            'addLog',
            'registerBridge'
        ]);
        this.state = {
            tab: 'log',
            logs: SAMPLE_LOGS,
            search: '',
            filter: 'all'
        };
        this.nextId = SAMPLE_LOGS.length + 1;
    }

    componentDidMount () {
        // 接入点：外部可通过 window.__blupDebugger.addLog('warn', 'xxx') 注入运行时日志
        this.registerBridge();
    }

    registerBridge () {
        if (!window.__blupDebugger) {
            window.__blupDebugger = {
                addLog: this.addLog
            };
        }
    }

    addLog (level, text) {
        const id = this.nextId++;
        this.setState(state => ({
            logs: [{id, level, text}].concat(state.logs).slice(0, 500)
        }));
    }

    handleTab (tab) {
        this.setState({tab});
    }

    handleTabClick (e) {
        this.handleTab(e.currentTarget.dataset.tabId);
    }

    handleSearch (e) {
        this.setState({search: e.target.value});
    }

    handleFilter (e) {
        this.setState({filter: e.target.value});
    }

    handleClear () {
        this.setState({logs: []});
    }

    handleExport () {
        const {logs} = this.state;
        const content = logs.map(l => `[${l.level.toUpperCase()}] ${l.text}`).join('\n');
        const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bilup-debugger-log.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    renderTabs () {
        const tabs = [
            ['log', '日志'],
            ['threads', '线程'],
            ['performance', '性能'],
            ['memory', '内存']
        ];
        return (
            <div className="blp-tabs">
                {tabs.map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        className={classNames('blp-tab', {'blp-tab-active': this.state.tab === id})}
                        data-tab-id={id}
                        onClick={this.handleTabClick}
                    >
                        {label}
                    </button>
                ))}
            </div>
        );
    }

    renderLog () {
        const {logs, search, filter} = this.state;
        const filtered = logs.filter(l => {
            if (filter !== 'all' && l.level !== filter) return false;
            if (search && !l.text.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
        return (
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}>
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <input
                        className="blp-input"
                        style={{flex: 1, minWidth: 120}}
                        placeholder="搜索日志…"
                        value={search}
                        onChange={this.handleSearch}
                    />
                    <select
                        className="blp-select"
                        value={filter}
                        onChange={this.handleFilter}
                    >
                        <option value="all">{'全部'}</option>
                        <option value="info">{'仅日志'}</option>
                        <option value="warn">{'仅警告'}</option>
                        <option value="error">{'仅错误'}</option>
                    </select>
                    <button
                        type="button"
                        className="blp-btn"
                        onClick={this.handleExport}
                    >{'导出'}</button>
                    <button
                        type="button"
                        className="blp-btn blp-btn-danger"
                        onClick={this.handleClear}
                    >{'清除'}</button>
                </div>
                <div className="blp-list">
                    {filtered.length === 0 && <div className="blp-empty">{'暂无日志'}</div>}
                    {filtered.map(l => (
                        <div
                            key={l.id}
                            className={classNames('blp-log-line', `blp-log-${l.level}`)}
                        >
                            <span className="blp-badge">{LEVELS[l.level] || l.level}</span> {l.text}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    renderThreads () {
        return (
            <div>
                <div
                    className="blp-note"
                    style={{marginBottom: 8}}
                >{'线程视图需接入 scratch-vm 运行时调度信息。当前为界面预览，接入点：vm.runtime 事件（见 debugger-window.jsx 注释）。'}</div>
                <div className="blp-list">
                    <div
                        className="blp-list-item"
                    >
                        <span>{'主线程（render）'}</span>
                        <span className="blp-badge">{'运行中'}</span>
                    </div>
                    <div
                        className="blp-list-item"
                    >
                        <span>{'工作线程（worker）'}</span>
                        <span className="blp-badge">{'空闲'}</span>
                    </div>
                </div>
            </div>
        );
    }

    renderPerformance () {
        return (
            <div>
                <div
                    className="blp-note"
                    style={{marginBottom: 8}}
                >{'性能面板需接入 vm.runtime 帧率与耗时统计。当前为界面预览。'}</div>
                <div className="blp-kv">
                    <span className="blp-kv-key">{'目标帧率'}</span><span className="blp-kv-value">{'60 FPS'}</span>
                    <span className="blp-kv-key">{'渲染耗时'}</span><span className="blp-kv-value">{'—（待接入）'}</span>
                    <span className="blp-kv-key">{'脚本耗时'}</span><span className="blp-kv-value">{'—（待接入）'}</span>
                </div>
            </div>
        );
    }

    renderMemory () {
        return (
            <div>
                <div
                    className="blp-note"
                    style={{marginBottom: 8}}
                >{'内存面板展示当前工程占用（估算）。数据来自项目 JSON 与运行时代理，仅供预览。'}</div>
                <div className="blp-kv">
                    <span className="blp-kv-key">{'工程 JSON'}</span><span className="blp-kv-value">{'—（待接入）'}</span>
                    <span className="blp-kv-key">{'堆内存'}</span><span className="blp-kv-value">{'—（待接入）'}</span>
                </div>
            </div>
        );
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="调试器"
                width={560}
                height={430}
                onClose={onClose}
            >
                {this.renderTabs()}
                {this.state.tab === 'log' && this.renderLog()}
                {this.state.tab === 'threads' && this.renderThreads()}
                {this.state.tab === 'performance' && this.renderPerformance()}
                {this.state.tab === 'memory' && this.renderMemory()}
            </BilupWindow>
        );
    }
}

DebuggerWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

export default DebuggerWindow;
