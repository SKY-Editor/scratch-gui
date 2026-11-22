/**
 * ThemedWindow —— 主题感知的窗口包裹层（开发者接入入口 · 唯一窗口入口）
 * ---------------------------------------------------------------------------
 * 给功能开发者用的「一句话套壳」：
 *   开发者只需要写好功能自己的内部排版（children）+ 标题（title）+
 *   图标（icon，可选），框架按当前主题自动套上对应风格的窗口外壳：
 *
 *     - SKYEditor 主题  → Win11Window 外壳（SE 风格）
 *        蓝色标题栏、左侧「图标 + 标题」、右侧 最小化/最大化/关闭 三按钮、
 *        直边无圆角、宽屏布局（示意图「图2」）；
 *     - TurboWarp 主题（及其它未登记主题）→ 官方 Modal 弹窗外壳（TW 风格）
 *        深灰标题栏、标题居中、右上角圆形关闭、$space 圆角、官方内边距
 *        （见 tw-window-shell.jsx，与上游视觉一致）。
 *
 * 外壳选择统一由 editor-framework-core/theme-adapter 决策：
 *   getWindowKind(uiTheme) === 'win11' → Win11Window
 *   其余                                 → TWWindowShell（官方 Modal 形态）
 * 新增主题只需在 theme-adapter 登记 surface，无需改动本文件。
 *
 * 业务侧不要再 import Win11Window / Modal 自行拼窗口，统一用本组件，
 * 否则该功能在 TurboWarp 主题下会残留 SKY 形态。
 *
 * 属性兼容：支持 Win11Window 旧命名 defaultWidth / defaultHeight / windowId，
 * 迁移时只需把组件名换成 ThemedWindow。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {
    getWindowKind,
    resolveWindowMetrics
} from '../../editor-framework-core/theme-adapter';
import Win11Window from '../../Theme/sky-editor/components/win11-window/win11-window.jsx';
import TWWindowShell from './tw-window-shell.jsx';

const ThemedWindowComponent = ({
    uiTheme,
    title,
    icon,
    width,
    height,
    defaultWidth,
    defaultHeight,
    onClose,
    disableMaximize,
    disableResize,
    className,
    id,
    windowId,
    titlebarActions,
    flushBody,
    children
}) => {
    const metrics = resolveWindowMetrics({id, windowId, width, height, defaultWidth, defaultHeight});

    if (getWindowKind(uiTheme) === 'win11') {
        // SKYEditor 风格：Win11Window 外壳（图标在标题栏左侧）
        return (
            <Win11Window
                windowId={metrics.id || (typeof title === 'string' ? `themed:${title}` : null)}
                title={title}
                icon={icon}
                defaultWidth={metrics.width}
                defaultHeight={metrics.height}
                onClose={onClose}
                disableMaximize={disableMaximize}
                disableResize={disableResize}
                accent="sky-editor"
                titlebarActions={titlebarActions}
                uiTheme={uiTheme}
            >
                {children}
            </Win11Window>
        );
    }

    // TurboWarp 等其它主题：官方 Modal 弹窗外壳（标题居中 + 圆形关闭，零 SKY 视觉）
    return (
        <TWWindowShell
            className={className}
            title={title}
            width={metrics.width}
            height={metrics.height}
            onClose={onClose}
            headerActions={titlebarActions}
            flushBody={flushBody}
        >
            {children}
        </TWWindowShell>
    );
};

ThemedWindowComponent.propTypes = {
    uiTheme: PropTypes.string,
    // ── 开发者接口 ─────────────────────────────────────────────
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
    icon: PropTypes.string, // 图标路径：图标文件放功能自己的文件夹，import 后传入
    width: PropTypes.number,
    height: PropTypes.number,
    // ── 旧属性名兼容（Win11Window 口径）─────────────────────────
    defaultWidth: PropTypes.number,
    defaultHeight: PropTypes.number,
    windowId: PropTypes.string,
    onClose: PropTypes.func,
    disableMaximize: PropTypes.bool,
    disableResize: PropTypes.bool,
    className: PropTypes.string,
    id: PropTypes.string,
    // 标题栏动作区（如插件窗口的工具栏按钮）：win11 侧并入标题栏右侧，
    // TW 侧渲染到官方弹窗标题栏左列，业务无需感知主题差异。
    titlebarActions: PropTypes.node,
    // TW 侧内容区是否去掉官方内边距（插件窗口自带完整布局时使用）。
    flushBody: PropTypes.bool,
    children: PropTypes.node
};

/**
 * 已连接主题状态的 ThemedWindow：
 * 开发者直接使用 <ThemedWindow ...>，无需关心当前主题是什么。
 */
const ThemedWindow = connect(
    state => ({
        uiTheme: state.scratchGui.uiTheme
    }),
    null
)(ThemedWindowComponent);

export default ThemedWindow;
