/*
 * bilup 独立功能模块 — 书签窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 书签列表：localStorage 持久化（key: blp-bookmarks）。
 * 添加当前位置（记录当前工程标题 + 时间戳）、导出/导入 JSON、全部清除。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const STORAGE_KEY = 'blp-bookmarks';

const loadBookmarks = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
};

const saveBookmarks = bookmarks => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    } catch (e) {
        // ignore
    }
};

class BookmarksWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAdd',
            'handleExport',
            'handleImport',
            'handleClear',
            'handleFile'
        ]);
        this.state = {
            bookmarks: loadBookmarks()
        };
        this.fileRef = React.createRef();
    }

    handleAdd () {
        const bookmark = {
            id: Date.now(),
            title: this.props.projectTitle || '未命名',
            time: new Date().toISOString()
        };
        const next = [bookmark].concat(this.state.bookmarks);
        saveBookmarks(next);
        this.setState({bookmarks: next});
    }

    handleExport () {
        const blob = new Blob([JSON.stringify(this.state.bookmarks, null, 2)], {type: 'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bilup-bookmarks.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    handleImport () {
        if (this.fileRef.current) this.fileRef.current.click();
    }

    handleFile (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const imported = JSON.parse(String(reader.result));
                if (Array.isArray(imported)) {
                    saveBookmarks(imported);
                    this.setState({bookmarks: imported});
                }
            } catch (err) {
                // ignore
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    handleClear () {
        const ok = window.confirm('全部清除所有书签？');
        if (!ok) return;
        saveBookmarks([]);
        this.setState({bookmarks: []});
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        const {bookmarks} = this.state;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="书签"
                width={440}
                height={380}
                onClose={onClose}
            >
                <input
                    ref={this.fileRef}
                    type="file"
                    accept=".json,application/json"
                    style={{display: 'none'}}
                    onChange={this.handleFile}
                />
                <div className="blp-row" style={{marginBottom: 8}}>
                    <button type="button" className="blp-btn blp-btn-primary" onClick={this.handleAdd}>{'添加当前位置'}</button>
                    <button type="button" className="blp-btn" onClick={this.handleExport}>{'导出'}</button>
                    <button type="button" className="blp-btn" onClick={this.handleImport}>{'导入'}</button>
                    <button type="button" className="blp-btn blp-btn-danger" onClick={this.handleClear}>{'全部清除'}</button>
                </div>
                <div className="blp-list">
                    {bookmarks.length === 0 && <div className="blp-empty">{'暂无书签'}</div>}
                    {bookmarks.map(b => (
                        <div key={b.id} className="blp-list-item">
                            <span><strong>{b.title}</strong></span>
                            <span style={{color: '#8a97a5', fontSize: 11}}>{new Date(b.time).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </BilupWindow>
        );
    }
}

BookmarksWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    }),
    projectTitle: PropTypes.string
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle
});

export default connect(mapStateToProps)(BookmarksWindow);
