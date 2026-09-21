/*
 * bilup 独立功能模块 — 变量管理器窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 搜索栏 + 条件筛选（是/否）+ 变量列表。
 * 数据来源：redux targets.targetList 中各角色的 variables / lists。
 *   - 条件「是」= 变量（variable） / 「否」= 列表（list）
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const flattenVariables = targetList => {
    const out = [];
    (targetList || []).forEach(target => {
        const vars = target.variables || {};
        Object.keys(vars).forEach(id => {
            const v = vars[id];
            out.push({
                id: id,
                name: v.name || '(unnamed)',
                type: v.type || 'variable',
                value: v.value,
                target: target.name || '(stage)'
            });
        });
    });
    return out;
};

class VariableManagerWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSearch',
            'handleFilter'
        ]);
        this.state = {
            search: '',
            filter: 'all'
        };
    }

    handleSearch (e) {
        this.setState({search: e.target.value});
    }

    handleFilter (e) {
        this.setState({filter: e.target.value});
    }

    render () {
        const {open, onClose, targetList} = this.props;
        if (!open) return null;
        const {search, filter} = this.state;
        const all = flattenVariables(targetList);
        const filtered = all.filter(v => {
            if (filter === 'var' && v.type !== 'variable') return false;
            if (filter === 'list' && v.type !== 'list') return false;
            if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="变量"
                width={520}
                height={430}
                onClose={onClose}
            >
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <input
                        className="blp-input"
                        style={{flex: 1, minWidth: 120}}
                        placeholder="搜索变量名…"
                        value={search}
                        onChange={this.handleSearch}
                    />
                    <select
                        className="blp-select"
                        value={filter}
                        onChange={this.handleFilter}
                    >
                        <option value="all">{'全部'}</option>
                        <option value="var">{'是（变量）'}</option>
                        <option value="list">{'否（列表）'}</option>
                    </select>
                </div>
                <div className="blp-list">
                    {filtered.length === 0 && <div className="blp-empty">{'未找到变量'}</div>}
                    {filtered.map(v => (
                        <div
                            key={v.id}
                            className="blp-list-item"
                        >
                            <span>
                                <span className="blp-badge">{v.type === 'list' ? '列表' : '变量'}</span>{' '}
                                <strong>{v.name}</strong>
                                <span style={{color: '#8a97a5', marginLeft: 6}}>
                                    {'（'}{v.target}{'）'}
                                </span>
                            </span>
                            <span style={{color: '#575e75', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                
                                {String(v.value)}
                            </span>
                        </div>
                    ))}
                </div>
            </BilupWindow>
        );
    }
}

VariableManagerWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    targetList: PropTypes.arrayOf(PropTypes.object)
};

const mapStateToProps = state => ({
    targetList: state.scratchGui.targets.targetList
});

export default connect(mapStateToProps)(VariableManagerWindow);
