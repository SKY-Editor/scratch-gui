/*
 * bilup 独立功能模块 — 项目数据窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 标签页：项目 / 概览 / 内容 / 技术元数据 / 分析 / 大小分析。
 * 数据来源：redux（projectTitle、targets）+ localStorage 记录首次打开时间。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import {connect} from 'react-redux';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const FIRST_OPEN_KEY = 'blp-project-first-open';
const LAST_OPEN_KEY = 'blp-project-last-open';

const countBlocks = targetList => {
    let count = 0;
    (targetList || []).forEach(t => {
        if (!t.blocks || typeof t.blocks.getBlocks !== 'function') return;
        t.blocks.getBlocks().forEach(b => {
            if (b && b.opcode && b.opcode !== '') count++;
        });
    });
    return count;
};

class ProjectDataWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleTab']);
        this.state = {tab: 'project'};
        const now = new Date().toISOString();
        if (!localStorage.getItem(FIRST_OPEN_KEY)) {
            try {
                localStorage.setItem(FIRST_OPEN_KEY, now);
                localStorage.setItem(LAST_OPEN_KEY, now);
            } catch (e) {
                // ignore
            }
        }
    }

    handleTab (tab) {
        this.setState({tab});
    }

    renderTabs () {
        const tabs = [
            ['project', '项目'],
            ['overview', '概览'],
            ['content', '内容'],
            ['metadata', '技术元数据'],
            ['analysis', '分析'],
            ['size', '大小分析']
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

    renderProject () {
        const {projectTitle, targetList} = this.props;
        return (
            <div className="blp-kv">
                <span className="blp-kv-key">{'标题'}</span>
                <span className="blp-kv-value">{projectTitle || '未命名'}</span>
                <span className="blp-kv-key">{'作者'}</span>
                <span className="blp-kv-value">{'本地用户（未登录）'}</span>
                <span className="blp-kv-key">{'角色数'}</span>
                <span className="blp-kv-value">{(targetList || []).length}</span>
                <span className="blp-kv-key">{'积木数（估算）'}</span>
                <span className="blp-kv-value">{countBlocks(targetList)}</span>
                <span className="blp-kv-key">{'格式版本'}</span>
                <span className="blp-kv-value">3.0.0</span>
            </div>
        );
    }

    renderOverview () {
        const {targetList} = this.props;
        return (
            <div className="blp-list">
                {(targetList || []).map((t, i) => (
                    <div
                        key={i}
                        className="blp-list-item"
                    >
                        <span><strong>{t.name || '(unnamed)'}</strong>
                            <span style={{color: '#8a97a5', marginLeft: 6}}>{t.isStage ? '舞台' : '角色'}</span>
                        </span>
                        <span>{t.variables ? Object.keys(t.variables).length : 0} 个变量</span>
                    </div>
                ))}
                {(!targetList || targetList.length === 0) && <div className="blp-empty">{'空工程'}</div>}
            </div>
        );
    }

    renderContent () {
        const {targetList} = this.props;
        const lines = [];
        (targetList || []).forEach(t => {
            lines.push(`【${t.name || '(unnamed)'}】${t.isStage ? '舞台' : '角色'}`);
            const blocks = (t.blocks && typeof t.blocks.getBlocks === 'function') ? t.blocks.getBlocks() : [];
            const opcodes = blocks.map(b => (b && b.opcode) || '').filter(Boolean);
            const grouped = opcodes.reduce((acc, o) => {
                acc[o] = (acc[o] || 0) + 1;
                return acc;
            }, {});
            Object.keys(grouped).forEach(o => lines.push(`  ${o} × ${grouped[o]}`));
        });
        return (
            <pre style={{background: '#f9f9f9', borderRadius: 6, padding: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                {lines.join('\n') || '空工程'}
            </pre>
        );
    }

    renderMetadata () {
        const first = localStorage.getItem(FIRST_OPEN_KEY);
        const last = localStorage.getItem(LAST_OPEN_KEY);
        return (
            <div className="blp-kv">
                <span className="blp-kv-key">{'格式版本'}</span>
                <span className="blp-kv-value">3.0.0</span>
                <span className="blp-kv-key">{'创建时间'}</span>
                <span className="blp-kv-value">{first ? new Date(first).toLocaleString() : '—'}</span>
                <span className="blp-kv-key">{'最近编辑'}</span>
                <span className="blp-kv-value">{last ? new Date(last).toLocaleString() : '—'}</span>
                <span className="blp-kv-key">{'编辑器'}</span>
                <span className="blp-kv-value">{'SKYEditor（scratch-gui 派生）'}</span>
            </div>
        );
    }

    renderAnalysis () {
        return (
            <div className="blp-note">{'作品分析器（SPA）需接入 scratch-vm 运行时静态分析（变量使用率、积木覆盖度等）。 当前为界面预览：上方「内容」标签页已展示各角色积木分布统计。'}</div>
        );
    }

    renderSize () {
        return (
            <div className="blp-note">{'大小分析需统计资源（造型/声音）体积。当前为界面预览， 工程 JSON 长度可在 Git 窗口「差异」页查看。'}</div>
        );
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="项目数据"
                width={560}
                height={440}
                onClose={onClose}
            >
                {this.renderTabs()}
                {this.state.tab === 'project' && this.renderProject()}
                {this.state.tab === 'overview' && this.renderOverview()}
                {this.state.tab === 'content' && this.renderContent()}
                {this.state.tab === 'metadata' && this.renderMetadata()}
                {this.state.tab === 'analysis' && this.renderAnalysis()}
                {this.state.tab === 'size' && this.renderSize()}
            </BilupWindow>
        );
    }
}

ProjectDataWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    projectTitle: PropTypes.string,
    targetList: PropTypes.arrayOf(PropTypes.object)
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    targetList: state.scratchGui.targets.targetList
});

export default connect(mapStateToProps)(ProjectDataWindow);
