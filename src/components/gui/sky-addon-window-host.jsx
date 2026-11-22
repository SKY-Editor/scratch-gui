import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import ThemedWindow from '../tw-themed-window/themed-window.jsx';
import skyAddonWindowBridge from './sky-addon-window-bridge.js';

// 把 addon 传入的真实 DOM 节点挂进 React 渲染出来的占位容器：
// React 不接管这些节点的内部结构（不做虚拟 DOM 对比），只把节点对象搬进占位容器；
// 节点被搬走后 addon 侧引用依然有效，事件监听与内容全部保留。卸载时 React 移除
// 占位容器，节点随之离开文档；addon 侧再次 mount 即可把同一节点交回来，状态不丢。
const DomSlot = ({node, style, className}) => {
    const hostRef = useRef(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        // 只保留当前节点：addon 可能反复上交新的内容节点（例如连续点按录制按钮每次都
        // 新建一份选项页 DOM），必须先摘掉上一次搬进来的旧节点，否则同一窗口内会叠加
        // 多份页面。这里按"清空再挂"处理，宿主与 addon 之间始终是 1:1。
        Array.from(host.childNodes).forEach(child => {
            if (child !== node) host.removeChild(child);
        });
        if (node && node.parentNode !== host) host.appendChild(node);
    }, [node]);

    return (
        <div
            className={className}
            ref={hostRef}
            style={style}
        />
    );
};

DomSlot.propTypes = {
    node: PropTypes.any,
    style: PropTypes.object,
    className: PropTypes.string
};

const CONTENT_SLOT_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    height: '100%',
    position: 'relative'
};

const ACTIONS_SLOT_STYLE = {
    display: 'flex',
    alignItems: 'stretch',
    height: '100%'
};

// addon 窗口宿主：订阅 sky-addon-window-bridge，用编辑器主体系的 ThemedWindow 渲染
// addon 内容。放在 React 树里渲染，是为了让 addon 窗口和设置窗口 / Packager 完全同级：
// 同一个窗口外壳（标题栏、关闭、拖拽/缩放/最大最小化按主题取舍）、同一个
// windowFocusManager（点击互相置顶）、同一窗口层容器（gui.jsx 末尾）。
//
// 双主题：外壳由 ThemedWindow 按当前主题分发——SKY 主题是 Win11 窗口，TurboWarp
// 主题是官方 Modal 弹窗（标题取 addon 的窗口标题、工具栏按钮落在官方标题栏左列、
// 内容区去内边距以保持插件原有布局比例与尺寸）。插件侧只交标题 + 内容 DOM + 工具栏，
// 不感知主题，也不重写各自的功能 CSS。
const SkyAddonWindowHost = () => {
    const [spec, setSpec] = useState(skyAddonWindowBridge.getCurrent());

    useEffect(() => {
        const unsubscribe = skyAddonWindowBridge.subscribe(setSpec);
        return () => {
            unsubscribe();
        };
    }, []);

    const currentId = spec ? spec.id : null;
    const handleClose = useCallback(() => {
        skyAddonWindowBridge.close(currentId);
    }, [currentId]);

    if (!spec) return null;

    const actions = spec.actions ? (
        <DomSlot
            node={spec.actions}
            style={ACTIONS_SLOT_STYLE}
        />
    ) : null;

    return (
        <ThemedWindow
            windowId={currentId ? `addon:${currentId}` : null}
            width={spec.width}
            height={spec.height}
            icon={spec.icon}
            onClose={handleClose}
            title={spec.title}
            titlebarActions={actions}
            flushBody
        >
            <DomSlot
                node={spec.body}
                style={CONTENT_SLOT_STYLE}
            />
        </ThemedWindow>
    );
};

export default SkyAddonWindowHost;
