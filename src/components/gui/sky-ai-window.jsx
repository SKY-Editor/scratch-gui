import PropTypes from 'prop-types';
import React, {useEffect, useMemo, useRef, useState} from 'react';

// 主题感知窗口：SKYEditor 主题 → Win11 窗口外壳；TurboWarp 主题 → 官方 Modal 弹窗。
// SKY 新增功能在官方主题下必须以官方形态出现，故一律走 ThemedWindow，禁止直接用 Win11Window。
import ThemedWindow from '../tw-themed-window/themed-window.jsx';

import skyAiIcon from './icon--sky-ai.svg';

// skyeditor-agent UMD 脚本路径：经 scratch-gui 静态目录（static/ 由 server.js 托管）
const AGENT_SCRIPT_URL = '/static/skyeditor-agent.js';
// 默认尺寸交给统一窗口壳（ThemedWindow）管理，与 Packager / 设置窗口同源。
// 数值按参考图（2560×1440 物理像素、DPR 1.25 → 2048×1152 CSS 视口）实测换算：
//   窗口外框 1426×878 物理 px → 1141×702 CSS px，即视口宽 55.71%、高 60.94%。
// 小视口按同一比例收缩，并保证四周各留 AGENT_VIEWPORT_GAP 不贴边、不溢出视口。
const AGENT_WIDTH_RATIO = 0.5571;
const AGENT_HEIGHT_RATIO = 0.72;
const AGENT_MIN_WIDTH = 680;
const AGENT_MIN_HEIGHT = 420;
const AGENT_VIEWPORT_GAP = 24;

const getDefaultWindowSize = () => {
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const maxWidth = Math.max(320, vw - AGENT_VIEWPORT_GAP * 2);
    const maxHeight = Math.max(240, vh - AGENT_VIEWPORT_GAP * 2);
    const width = Math.min(Math.max(Math.round(vw * AGENT_WIDTH_RATIO), AGENT_MIN_WIDTH), maxWidth);
    const height = Math.min(Math.max(Math.round(vh * AGENT_HEIGHT_RATIO), AGENT_MIN_HEIGHT), maxHeight);
    return {width, height};
};

// 内容容器：外壳负责标题栏/三按钮/拖拽/缩放，这里只负责把 agent 根节点撑满
const CONTENT_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    height: '100%',
    position: 'relative'
};

// agent 挂载宿主节点：createRoot 独占此节点，窗口打开期间的加载动画由 React 兄弟节点渲染，
// 两者互不干扰（避免 createRoot 清空 React 子节点后卸载期 removeChild 报错）。
const MOUNT_STYLE = {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
};

// 窗口打开加载态：与 agent 内部加载动画同一套视觉（品牌折面标 + 三点弱脉冲，纯色、圆润、
// 无渐变 / 无玻璃拟态 / 无弹跳；缓动 cubic-bezier(.2,.8,.2,1) 与 agent 的 --sea-ease 同值）。
// 样式用内联 <style> 注入：宿主页面此时尚未加载 agent 的 ai-window.css，不能依赖其类名。
const BOOT_CSS = `
.sky-agent-boot {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  user-select: none;
  --sky-agent-dot-idle: 0.32;
  animation: sky-agent-boot-in 160ms cubic-bezier(.2,.8,.2,1) both;
}
.sky-agent-boot-body {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #3b86e0;
}
.sky-agent-boot-mark svg {
  display: block;
  width: 20px;
  height: 20px;
}
.sky-agent-boot-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sky-agent-boot-dots i {
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: var(--sky-agent-dot-idle);
  animation: sky-agent-boot-pulse 1080ms cubic-bezier(.2,.8,.2,1) infinite;
}
.sky-agent-boot-dots i:nth-child(2) { animation-delay: 150ms; }
.sky-agent-boot-dots i:nth-child(3) { animation-delay: 300ms; }
.sky-agent-boot-label {
  font-size: 12.5px;
  line-height: 1.2;
  letter-spacing: 0.2px;
  color: #44423f;
}
.sky-agent-boot-error {
  font-size: 12.5px;
  color: #b3261e;
  padding: 0 24px;
  text-align: center;
}
@keyframes sky-agent-boot-pulse {
  0%, 100% { opacity: var(--sky-agent-dot-idle); }
  45% { opacity: 1; }
}
@keyframes sky-agent-boot-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
html[data-ui-dark="true"] .sky-agent-boot { --sky-agent-dot-idle: 0.72; }
html[data-ui-dark="true"] .sky-agent-boot-body { color: #7ab4fc; }
html[data-ui-dark="true"] .sky-agent-boot-label { color: #cfcfc9; }
html[data-ui-dark="true"] .sky-agent-boot-error { color: #f2b8b5; }
@media (prefers-reduced-motion: reduce) {
  .sky-agent-boot { animation: none !important; }
  .sky-agent-boot-dots i { animation: none !important; opacity: 0.72; }
}
`;

// 加载中的品牌标记：与 agent 侧 SeaLoader 的折面标同一路径，保证窗口打开 → 内容接管视觉连续
const BOOT_MARK = (
    <span className="sky-agent-boot-mark" aria-hidden="true">
        <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
            viewBox="0 0 16 16"
        >
            <path d="M8 1.9 13.6 5v6L8 14.1 2.4 11V5z" />
            <path d="M8 8v6.1M8 8 13.6 5M8 8 2.4 5" />
        </svg>
    </span>
);

// SKY Agent 窗口：外壳统一走 ThemedWindow（与 Packager / 设置窗口同款），
// 标题栏、最小化/最大化/关闭三按钮、拖拽、缩放、Esc 关窗、焦点置顶
// 全部由外壳提供；agent 端以 chrome:false 只渲染内容区。
const SkyAiWindow = ({onClose, vm}) => {
    const contentRef = useRef(null);
    // agent 独占挂载节点（createRoot 目标）
    const mountRef = useRef(null);
    // 打开期加载态：loading（脚本/启动中）→ done（agent 已接管，animation 卸载）｜error（失败文案）
    const [boot, setBoot] = useState({state: 'loading', text: 'SKY Agent 正在启动…'});
    const vmRef = useRef(vm);
    vmRef.current = vm;
    // 窗口壳只在挂载时读取一次 defaultWidth/defaultHeight，这里按当前视口算一次
    const defaultSize = useMemo(getDefaultWindowSize, []);

    useEffect(() => {
        const host = mountRef.current;

        let disposed = false;
        let agentInstance = null;
        let script = null;

        // 失败/异常统一走加载态文案（不再直接改 DOM，避免与 createRoot 抢同一节点）
        const showMessage = text => {
            if (!disposed) setBoot({state: 'error', text});
        };

        // 动态加载 skyeditor-agent UMD 脚本（<script> 标签）。
        // 缓存防护：脚本 URL 追加构建版本参数（见下方 /__sky_build），
        // 避免普通模式（非无痕）复用旧 JS 缓存导致"改了不生效"。
        const appendScriptWithVersion = suffix => {
            if (disposed) return;
            script = document.createElement('script');
            script.async = true;
            script.src = `${AGENT_SCRIPT_URL}?v=${encodeURIComponent(suffix)}`;
            script.onload = () => {
                if (disposed) return;
                const api = window.SkyEditorAgent;
                if (!api || typeof api.mount !== 'function') {
                    showMessage('skyeditor-agent 加载失败：未找到 window.SkyEditorAgent');
                    return;
                }
                let bridge;
                try {
                    // bridge 为真实 EditorBridge 实例，包装 scratch-vm（来自 redux
                    // state.scratchGui.vm），向 SKY Agent 提供项目读取 / 舞台快照能力。
                    const EditorBridge = api.EditorBridge;
                    if (typeof EditorBridge === 'function') {
                        bridge = new EditorBridge(vmRef.current);
                    } else {
                        bridge = {vm: vmRef.current};
                    }
                } catch (e) {
                    showMessage(`EditorBridge 初始化失败：${e.message}`);
                    return;
                }
                try {
                    // chrome:false —— 不再让 agent 自绘标题栏，只输出内容区
                    agentInstance = api.mount(host, bridge, {chrome: false});
                    // agent 首屏已交给 React 渲染，撤掉打开期动画（agent 内部自带首屏加载态接续）
                    setBoot(prev => (prev.state === 'error' ? prev : {state: 'done', text: ''}));
                } catch (e) {
                    showMessage(`SkyEditorAgent.mount 失败：${e.message}`);
                }
            };
            script.onerror = () => showMessage('skyeditor-agent 脚本加载失败：/static/skyeditor-agent.js');
            document.head.appendChild(script);
        };

        // /__sky_build 由 server.js 依据 bundle mtime+size 生成构建版本号；
        // 接口不可用时退化为时间戳，保证每次打开都取最新脚本。
        fetch('/__sky_build', {cache: 'no-store'})
            .then(response => (response.ok ? response.json() : null))
            .then(data => appendScriptWithVersion((data && data.buildId) || Date.now()))
            .catch(() => appendScriptWithVersion(Date.now()));

        return () => {
            disposed = true;
            if (agentInstance && typeof agentInstance.unmount === 'function') {
                try {
                    agentInstance.unmount();
                } catch (e) {
                    // 卸载期异常不应阻塞窗口关闭
                }
            }
            if (script && script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, []);

    return (
        <ThemedWindow
            windowId="sky-agent"
            defaultHeight={defaultSize.height}
            defaultWidth={defaultSize.width}
            icon={skyAiIcon}
            onClose={onClose}
            title="SKY Agent"
            flushBody
        >
            <div
                ref={contentRef}
                style={CONTENT_STYLE}
            >
                {/* agent 独占节点：createRoot 目标，React 不在此节点内放任何子元素 */}
                <div
                    ref={mountRef}
                    style={MOUNT_STYLE}
                />
                {boot.state !== 'done' && (
                    <div
                        aria-busy={boot.state === 'loading'}
                        aria-live="polite"
                        className="sky-agent-boot"
                        role="status"
                    >
                        <style>{BOOT_CSS}</style>
                        {boot.state === 'loading' ? (
                            <React.Fragment>
                                <span className="sky-agent-boot-body">
                                    {BOOT_MARK}
                                    <span className="sky-agent-boot-dots" aria-hidden="true">
                                        <i />
                                        <i />
                                        <i />
                                    </span>
                                </span>
                                <span className="sky-agent-boot-label">{boot.text}</span>
                            </React.Fragment>
                        ) : (
                            <span className="sky-agent-boot-error">{boot.text}</span>
                        )}
                    </div>
                )}
            </div>
        </ThemedWindow>
    );
};

SkyAiWindow.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(PropTypes.any) // scratch-vm 实例（redux state.scratchGui.vm）
};

export default SkyAiWindow;
