/*
 * bilup 独立功能模块 — Git 仓库窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 本地实现说明：基于项目 JSON 快照的简易版本管理（纯前端，localStorage 持久化），
 *   标签页 更改/历史/分支/差异/远程/说明；
 *   Conventional Commits 类型下拉 + 提交信息 + 提交；
 *   撤销上次提交；危险区域删除仓库。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import {connect} from 'react-redux';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const STORAGE_KEY = 'blp-git-commits';
const COMMIT_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

const loadCommits = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
};

const saveCommits = commits => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(commits));
    } catch (e) {
        // localStorage 满时静默失败
    }
};

class GitWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleTab',
            'handleCommitType',
            'handleMessage',
            'handleCommit',
            'handleUndo',
            'handleDeleteRepo',
            'handleChangedDiff'
        ]);
        this.state = {
            tab: 'changes',
            commitType: 'feat',
            message: '',
            commits: loadCommits(),
            diff: ''
        };
    }

    handleTab (tab) {
        this.setState({tab});
    }

    handleCommitType (e) {
        this.setState({commitType: e.target.value});
    }

    handleMessage (e) {
        this.setState({message: e.target.value});
    }

    handleCommit () {
        const {vm} = this.props;
        const {commitType, message, commits} = this.state;
        if (!message.trim()) return;
        let snapshot = '';
        try {
            // 同步取得当前项目 JSON 快照
            snapshot = typeof vm.toJSON === 'function' ? vm.toJSON() : '{}';
        } catch (e) {
            snapshot = '{}';
        }
        const record = {
            id: Date.now(),
            type: commitType,
            message: message.trim(),
            time: new Date().toISOString(),
            snapshot: snapshot
        };
        const next = [record].concat(commits);
        saveCommits(next);
        this.setState({commits: next, message: ''});
    }

    handleUndo () {
        const {commits} = this.state;
        if (commits.length === 0) return;
        const next = commits.slice(1);
        saveCommits(next);
        this.setState({commits: next});
    }

    handleDeleteRepo () {
        const ok = window.confirm('危险区域：删除仓库将清空全部本地提交历史（不影响当前工程）。确定继续？');
        if (!ok) return;
        saveCommits([]);
        this.setState({commits: [], diff: ''});
    }

    handleChangedDiff () {
        // 简易差异：当前 JSON 与最近一次提交对比长度/轮廓
        const {vm} = this.props;
        const {commits} = this.state;
        try {
            const current = typeof vm.toJSON === 'function' ? vm.toJSON() : '{}';
            if (commits.length === 0) {
                this.setState({diff: '尚无提交记录。提交后即可与最近版本对比。'});
                return;
            }
            const last = commits[0].snapshot || '{}';
            const curLen = current.length;
            const lastLen = last.length;
            const changed = Math.abs(curLen - lastLen);
            this.setState({
                diff: `当前工程 JSON 长度：${curLen}\n最近提交（${commits[0].type}: ${commits[0].message}）长度：${lastLen}\n差异量：${changed} 字符\n（简易本地 diff：完整逐行 diff 需真实 Git 内核，此处展示轮廓级对比）`
            });
        } catch (e) {
            this.setState({diff: `生成差异失败：${e.message}`});
        }
    }

    renderTabs () {
        const tabs = [
            ['changes', '更改'],
            ['history', '历史'],
            ['branches', '分支'],
            ['diff', '差异'],
            ['remote', '远程'],
            ['about', '说明']
        ];
        return (
            <div className="blp-tabs">
                {tabs.map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        className={classNames('blp-tab', {'blp-tab-active': this.state.tab === id})}
                        onClick={() => this.handleTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>
        );
    }

    renderChanges () {
        return (
            <div>
                <div
                    className="blp-note"
                    style={{marginBottom: 8}}
                >{'本地简易版本管理：提交 = 保存当前工程 JSON 快照到浏览器本地（localStorage）。'}</div>
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <select
                        className="blp-select"
                        value={this.state.commitType}
                        onChange={this.handleCommitType}
                    >
                        {COMMIT_TYPES.map(t => (<option
                            key={t}
                            value={t}
                        >{t}</option>))}
                    </select>
                    <input
                        className="blp-input"
                        style={{flex: 1, minWidth: 160}}
                        placeholder="提交信息 (Conventional Commits)"
                        value={this.state.message}
                        onChange={this.handleMessage}
                        onKeyDown={e => {
                            if (e.key === 'Enter') this.handleCommit();
                        }}
                    />
                    <button
                        type="button"
                        className="blp-btn blp-btn-primary"
                        onClick={this.handleCommit}
                    >{'提交'}</button>
                </div>
                <div className="blp-row">
                    <button
                        type="button"
                        className="blp-btn"
                        onClick={this.handleUndo}
                        disabled={this.state.commits.length === 0}
                    >{'撤销上次提交'}</button>
                    <button
                        type="button"
                        className="blp-btn blp-btn-danger"
                        onClick={this.handleDeleteRepo}
                    >{'危险区域：删除仓库'}</button>
                </div>
            </div>
        );
    }

    renderHistory () {
        const {commits} = this.state;
        if (commits.length === 0) {
            return <div className="blp-empty">{'暂无提交历史'}</div>;
        }
        return (
            <div className="blp-list">
                {commits.map(c => (
                    <div
                        key={c.id}
                        className="blp-list-item"
                    >
                        <span><span className="blp-badge">{c.type}</span> {c.message}</span>
                        <span style={{color: '#8a97a5', fontSize: 11}}>{new Date(c.time).toLocaleString()}</span>
                    </div>
                ))}
            </div>
        );
    }

    renderBranches () {
        return (
            <div className="blp-list">
                <div className="blp-list-item">
                    <span><strong>main</strong>{'（当前分支）'}</span>
                    <span className="blp-badge">{'本地'}</span>
                </div>
                <div className="blp-empty">{'简易本地实现：暂不支持真实分支操作（需 Git 内核）。'}</div>
            </div>
        );
    }

    renderDiff () {
        return (
            <div>
                <button
                    type="button"
                    className="blp-btn"
                    style={{marginBottom: 8}}
                    onClick={this.handleChangedDiff}
                >{'生成与最近提交的差异'}</button>
                <pre style={{background: '#f9f9f9', borderRadius: 6, padding: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                    {this.state.diff || '点击按钮生成差异轮廓'}
                </pre>
            </div>
        );
    }

    renderRemote () {
        return (
            <div className="blp-empty">{'远程仓库需要真实 Git 服务与账号体系。当前为本地简易版本管理，暂无远程配置。'}</div>
        );
    }

    renderAbout () {
        return (
            <div className="blp-note">{'本窗口为 Bilup 编辑器中 Git 版本控制的本地实现（参考 github.com/Bilup/scratch-gui，GPL-3.0，仅作功能参考自行实现）。 提交历史以项目 JSON 快照形式保存在浏览器 localStorage，可随时撤销或对比。'}</div>
        );
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="Git 仓库"
                width={560}
                height={430}
                onClose={onClose}
            >
                {this.renderTabs()}
                {this.state.tab === 'changes' && this.renderChanges()}
                {this.state.tab === 'history' && this.renderHistory()}
                {this.state.tab === 'branches' && this.renderBranches()}
                {this.state.tab === 'diff' && this.renderDiff()}
                {this.state.tab === 'remote' && this.renderRemote()}
                {this.state.tab === 'about' && this.renderAbout()}
            </BilupWindow>
        );
    }
}

GitWindow.propTypes = {
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

export default connect(mapStateToProps)(GitWindow);
