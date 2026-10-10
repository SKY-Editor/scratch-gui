/*
 * bilup 独立功能模块 — 菜单集成与窗口调度
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 挂载方式：由 components/menu-bar/menu-bar.jsx 在 uiTheme === 'bilup'
 *   时渲染本组件（一行挂载，不触碰 turbowarp/sky-editor 存量开关）。
 * 菜单：新增「工具」分组与「书签」分组（复用 MenuLabel/MenuBarMenu 组件，
 *   与现有菜单视觉一致）。
 * 全部功能窗口：仅当 data-ui-theme 为 bilup 时渲染（isUiTheme 判定），
 *   非 bilup 主题零影响、零回归；窗口显隐由 reducers/bilup.js 控制。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';

import {MenuItem, MenuSection} from '../../../components/menu/menu.jsx';
import {isUiTheme} from '../../public/ui-theme-registry.js';
import {
    OPEN_BILUP_WINDOW,
    CLOSE_BILUP_WINDOW
} from '../bilup-reducer.js';

import BilupMenuLabel from './bilup-menu-label.jsx';
import GitWindow from './windows/git-window.jsx';
import DebuggerWindow from './windows/debugger-window.jsx';
import TerminalWindow from './windows/terminal-window.jsx';
import VariableManagerWindow from './windows/variable-manager-window.jsx';
import ProjectDataWindow from './windows/project-data-window.jsx';
import TodoWindow from './windows/todo-window.jsx';
import RestorePointsWindow from './windows/restore-points-window.jsx';
import CollabWindow from './windows/collab-window.jsx';
import PluginStoreWindow from './windows/plugin-store-window.jsx';
import BookmarksWindow from './windows/bookmarks-window.jsx';

import '../styles/bilup-modules.css';

// 窗口默认位置（错开摆放）
const WINDOW_POSITIONS = {
    git: {x: 60, y: 80},
    debugger: {x: 90, y: 110},
    terminal: {x: 120, y: 140},
    variableManager: {x: 150, y: 170},
    projectData: {x: 180, y: 200},
    todo: {x: 210, y: 230},
    restorePoints: {x: 240, y: 260},
    collab: {x: 270, y: 290},
    pluginStore: {x: 300, y: 320},
    bookmarks: {x: 330, y: 350}
};

class BilupMenuBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'openWindow',
            'closeWindow',
            'handleBookmarkAdd',
            'handleOpenGit',
            'handleOpenTerminal',
            'handleOpenCollab',
            'handleOpenProjectData',
            'handleOpenDebugger',
            'handleOpenVariableManager',
            'handleOpenTodo',
            'handleOpenPluginStore',
            'handleOpenBookmarks',
            'handleCloseGit',
            'handleCloseDebugger',
            'handleCloseTerminal',
            'handleCloseVariableManager',
            'handleCloseProjectData',
            'handleCloseTodo',
            'handleCloseRestorePoints',
            'handleCloseCollab',
            'handleClosePluginStore',
            'handleCloseBookmarks'
        ]);
    }

    openWindow (id) {
        this.props.onOpenWindow(id);
    }

    closeWindow (id) {
        this.props.onCloseWindow(id);
    }

    handleBookmarkAdd () {
        this.openWindow('bookmarks');
    }

    handleOpenGit () {
        this.openWindow('git');
    }

    handleOpenTerminal () {
        this.openWindow('terminal');
    }

    handleOpenCollab () {
        this.openWindow('collab');
    }

    handleOpenProjectData () {
        this.openWindow('projectData');
    }

    handleOpenDebugger () {
        this.openWindow('debugger');
    }

    handleOpenVariableManager () {
        this.openWindow('variableManager');
    }

    handleOpenTodo () {
        this.openWindow('todo');
    }

    handleOpenPluginStore () {
        this.openWindow('pluginStore');
    }

    handleOpenBookmarks () {
        this.openWindow('bookmarks');
    }

    handleCloseGit () {
        this.closeWindow('git');
    }

    handleCloseDebugger () {
        this.closeWindow('debugger');
    }

    handleCloseTerminal () {
        this.closeWindow('terminal');
    }

    handleCloseVariableManager () {
        this.closeWindow('variableManager');
    }

    handleCloseProjectData () {
        this.closeWindow('projectData');
    }

    handleCloseTodo () {
        this.closeWindow('todo');
    }

    handleCloseRestorePoints () {
        this.closeWindow('restorePoints');
    }

    handleCloseCollab () {
        this.closeWindow('collab');
    }

    handleClosePluginStore () {
        this.closeWindow('pluginStore');
    }

    handleCloseBookmarks () {
        this.closeWindow('bookmarks');
    }

    renderWindows () {
        const w = this.props.windows;
        return (
            <React.Fragment>
                <GitWindow
                    open={w.git}
                    onClose={this.handleCloseGit}
                    initialPosition={WINDOW_POSITIONS.git}
                />
                <DebuggerWindow
                    open={w.debugger}
                    onClose={this.handleCloseDebugger}
                    initialPosition={WINDOW_POSITIONS.debugger}
                />
                <TerminalWindow
                    open={w.terminal}
                    onClose={this.handleCloseTerminal}
                    initialPosition={WINDOW_POSITIONS.terminal}
                />
                <VariableManagerWindow
                    open={w.variableManager}
                    onClose={this.handleCloseVariableManager}
                    initialPosition={WINDOW_POSITIONS.variableManager}
                />
                <ProjectDataWindow
                    open={w.projectData}
                    onClose={this.handleCloseProjectData}
                    initialPosition={WINDOW_POSITIONS.projectData}
                />
                <TodoWindow
                    open={w.todo}
                    onClose={this.handleCloseTodo}
                    initialPosition={WINDOW_POSITIONS.todo}
                />
                <RestorePointsWindow
                    open={w.restorePoints}
                    onClose={this.handleCloseRestorePoints}
                    initialPosition={WINDOW_POSITIONS.restorePoints}
                />
                <CollabWindow
                    open={w.collab}
                    onClose={this.handleCloseCollab}
                    initialPosition={WINDOW_POSITIONS.collab}
                />
                <PluginStoreWindow
                    open={w.pluginStore}
                    onClose={this.handleClosePluginStore}
                    initialPosition={WINDOW_POSITIONS.pluginStore}
                />
                <BookmarksWindow
                    open={w.bookmarks}
                    onClose={this.handleCloseBookmarks}
                    initialPosition={WINDOW_POSITIONS.bookmarks}
                />
            </React.Fragment>
        );
    }

    render () {
        const {uiTheme} = this.props;
        if (!isUiTheme(uiTheme, 'bilup')) return null;
        return (
            <React.Fragment>
                <BilupMenuLabel
                    label="工具"
                    place="right"
                >
                    <MenuSection>
                        <MenuItem onClick={this.handleOpenGit}>{'Git 仓库'}</MenuItem>
                        <MenuItem onClick={this.handleOpenTerminal}>{'终端'}</MenuItem>
                        <MenuItem onClick={this.handleOpenCollab}>{'实时协作'}</MenuItem>
                        <MenuItem onClick={this.handleOpenProjectData}>{'项目数据'}</MenuItem>
                        <MenuItem onClick={this.handleOpenDebugger}>{'调试器'}</MenuItem>
                        <MenuItem onClick={this.handleOpenVariableManager}>{'变量管理器'}</MenuItem>
                        <MenuItem onClick={this.handleOpenTodo}>{'待办'}</MenuItem>
                        <MenuItem onClick={this.handleOpenProjectData}>{'SPA 简易作品分析器'}</MenuItem>
                        <MenuItem onClick={this.handleOpenPluginStore}>{'添加扩展'}</MenuItem>
                        <MenuItem onClick={this.handleOpenPluginStore}>{'管理扩展'}</MenuItem>
                    </MenuSection>
                </BilupMenuLabel>
                <BilupMenuLabel
                    label="书签"
                    place="right"
                >
                    <MenuSection>
                        <MenuItem onClick={this.handleBookmarkAdd}>{'添加当前位置'}</MenuItem>
                        <MenuItem onClick={this.handleOpenBookmarks}>{'书签列表'}</MenuItem>
                        <MenuItem onClick={this.handleOpenBookmarks}>{'导出'}</MenuItem>
                        <MenuItem onClick={this.handleOpenBookmarks}>{'导入'}</MenuItem>
                        <MenuItem onClick={this.handleOpenBookmarks}>{'全部清除'}</MenuItem>
                    </MenuSection>
                </BilupMenuLabel>
                {this.renderWindows()}
            </React.Fragment>
        );
    }
}

BilupMenuBar.propTypes = {
    onCloseWindow: PropTypes.func,
    onOpenWindow: PropTypes.func,
    uiTheme: PropTypes.string,
    windows: PropTypes.object
};

const mapStateToProps = state => ({
    uiTheme: state.scratchGui.uiTheme,
    windows: state.scratchGui.bilup.windows
});

const mapDispatchToProps = dispatch => ({
    onOpenWindow: id => dispatch({type: OPEN_BILUP_WINDOW, windowId: id}),
    onCloseWindow: id => dispatch({type: CLOSE_BILUP_WINDOW, windowId: id})
});

export default connect(mapStateToProps, mapDispatchToProps)(BilupMenuBar);
