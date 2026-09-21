/*
 * bilup 独立功能模块 — 终端窗口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 类 shell 交互界面，内置基础命令（help/clear/echo/date/project/theme/whoami），
 * 输出可滚动。样式限定在 html.bilup-theme 作用域。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';

import BilupWindow from '../bilup-window.jsx';
import '../../styles/bilup-modules.css';

const BANNER = 'Bilup 终端（界面预览）\n输入 help 查看可用命令。';

const COMMANDS = [
    'help — 显示帮助',
    'clear — 清屏',
    'echo <文本> — 输出文本',
    'date — 显示当前时间',
    'project — 显示当前工程信息',
    'theme — 显示当前主题',
    'whoami — 显示当前用户'
];

class TerminalWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKeyDown',
            'handleInput'
        ]);
        this.state = {
            lines: [{text: BANNER, prompt: false}],
            input: ''
        };
        this.outputRef = React.createRef();
    }

    componentDidUpdate () {
        if (this.outputRef.current) {
            this.outputRef.current.scrollTop = this.outputRef.current.scrollHeight;
        }
    }

    handleInput (e) {
        this.setState({input: e.target.value});
    }

    handleKeyDown (e) {
        if (e.key !== 'Enter') return;
        const cmd = this.state.input.trim();
        const lines = this.state.lines.concat([{text: cmd, prompt: true}]);
        let output = '';
        if (cmd === '') {
            output = '';
        } else if (cmd === 'help') {
            output = COMMANDS.join('\n');
        } else if (cmd === 'clear') {
            this.setState({lines: [], input: ''});
            return;
        } else if (cmd.startsWith('echo ')) {
            output = cmd.slice(5);
        } else if (cmd === 'date') {
            output = new Date().toString();
        } else if (cmd === 'project') {
            output = `当前工程：${document.title || '未命名'}\n格式：3.0.0（scratch-gui 派生）`;
        } else if (cmd === 'theme') {
            output = `当前主题：${document.documentElement.getAttribute('data-ui-theme') || 'unknown'}`;
        } else if (cmd === 'whoami') {
            output = 'guest@bilup';
        } else {
            output = `command not found: ${cmd.split(' ')[0]}（输入 help 查看可用命令）`;
        }
        const next = output ? lines.concat([{text: output, prompt: false}]) : lines;
        this.setState({lines: next, input: ''});
    }

    render () {
        const {open, onClose} = this.props;
        if (!open) return null;
        return (
            <BilupWindow
                initialPosition={this.props.initialPosition}
                title="终端"
                width={540}
                height={380}
                onClose={onClose}
            >
                <div
                    className="blp-terminal"
                    ref={this.outputRef}
                >
                    {this.state.lines.map((l, i) => (
                        <div key={i}>
                            {l.prompt ? <span style={{color: '#8fe3e6'}}>{'/rep5 $ '}</span> : null}
                            {l.text}
                        </div>
                    ))}
                    <div className="blp-terminal-input">
                        <span>{'/rep5 $ '}</span>
                        <input
                            autoFocus
                            value={this.state.input}
                            onChange={this.handleInput}
                            onKeyDown={this.handleKeyDown}
                        />
                    </div>
                </div>
            </BilupWindow>
        );
    }
}

TerminalWindow.propTypes = {
    onClose: PropTypes.func,
    open: PropTypes.bool,
    initialPosition: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

export default TerminalWindow;
