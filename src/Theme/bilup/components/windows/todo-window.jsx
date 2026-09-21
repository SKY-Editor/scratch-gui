/*
 * bilup 独立功能模块 — 待办窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 任务增删改、勾选完成，localStorage 持久化（key: blp-todos）。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const STORAGE_KEY = 'blp-todos';

const loadTodos = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
};

const saveTodos = todos => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
        // ignore
    }
};

class TodoWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAdd',
            'handleInput',
            'handleToggle',
            'handleDelete',
            'handleEdit',
            'handleEditChange',
            'handleEditCommit',
            'handleInputKeyDown',
            'handleEditKeyDown',
            'handleToggleClick',
            'handleEditClick',
            'handleDeleteClick'
        ]);
        this.state = {
            todos: loadTodos(),
            input: '',
            editingId: null,
            editingText: ''
        };
    }

    handleInput (e) {
        this.setState({input: e.target.value});
    }

    handleAdd () {
        const text = this.state.input.trim();
        if (!text) return;
        const todo = {id: Date.now(), text: text, done: false};
        const next = this.state.todos.concat(todo);
        saveTodos(next);
        this.setState({todos: next, input: ''});
    }

    handleToggle (id) {
        const next = this.state.todos.map(t => (t.id === id ? {...t, done: !t.done} : t));
        saveTodos(next);
        this.setState({todos: next});
    }

    handleDelete (id) {
        const next = this.state.todos.filter(t => t.id !== id);
        saveTodos(next);
        this.setState({todos: next});
    }

    handleEdit (t) {
        this.setState({editingId: t.id, editingText: t.text});
    }

    handleEditChange (e) {
        this.setState({editingText: e.target.value});
    }

    handleInputKeyDown (e) {
        if (e.key === 'Enter') this.handleAdd();
    }

    handleEditKeyDown (e) {
        if (e.key === 'Enter') this.handleEditCommit();
    }

    handleToggleClick (e) {
        this.handleToggle(Number(e.currentTarget.getAttribute('data-id')));
    }

    handleEditClick (e) {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        const t = this.state.todos.find(x => x.id === id);
        if (t) this.handleEdit(t);
    }

    handleDeleteClick (e) {
        this.handleDelete(Number(e.currentTarget.getAttribute('data-id')));
    }

    handleEditCommit () {
        const text = this.state.editingText.trim();
        if (!text) return;
        const next = this.state.todos.map(t => (t.id === this.state.editingId ? {...t, text: text} : t));
        saveTodos(next);
        this.setState({todos: next, editingId: null, editingText: ''});
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        const {todos} = this.state;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="待办"
                width={460}
                height={380}
                onClose={onClose}
            >
                <div
                    className="blp-row"
                    style={{marginBottom: 8}}
                >
                    <input
                        className="blp-input"
                        style={{flex: 1, minWidth: 140}}
                        placeholder="添加待办…"
                        value={this.state.input}
                        onChange={this.handleInput}
                        onKeyDown={this.handleInputKeyDown}
                    />
                    <button
                        type="button"
                        className="blp-btn blp-btn-primary"
                        onClick={this.handleAdd}
                    >{'添加'}</button>
                </div>
                <div className="blp-list">
                    {todos.length === 0 && <div className="blp-empty">{'暂无待办'}</div>}
                    {todos.map(t => (
                        <div
                            key={t.id}
                            className="blp-list-item"
                        >
                            <input
                                type="checkbox"
                                className="blp-check"
                                checked={t.done}
                                data-id={t.id}
                                onChange={this.handleToggleClick}
                            />
                            {this.state.editingId === t.id ? (
                                <input
                                    className="blp-input"
                                    style={{flex: 1}}
                                    autoFocus
                                    value={this.state.editingText}
                                    onChange={this.handleEditChange}
                                    onKeyDown={this.handleEditKeyDown}
                                    onBlur={this.handleEditCommit}
                                />
                            ) : (
                                <span
                                    style={{flex: 1, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#8a97a5' : '#575e75'}}
                                    data-id={t.id}
                                    onDoubleClick={this.handleEditClick}
                                >
                                    {t.text}
                                </span>
                            )}
                            <button
                                type="button"
                                className="blp-btn"
                                data-id={t.id}
                                onClick={this.handleEditClick}
                            >{'改'}</button>
                            <button
                                type="button"
                                className="blp-btn blp-btn-danger"
                                data-id={t.id}
                                onClick={this.handleDeleteClick}
                            >{'删'}</button>
                        </div>
                    ))}
                </div>
            </BilupWindow>
        );
    }
}

TodoWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

export default TodoWindow;
