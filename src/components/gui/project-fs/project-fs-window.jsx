// SKYEditor：项目资源虚拟文件系统（测试版）—— 窗口主体
// 职责：承载文件树，窗口外壳复用 SKY 主题统一的 Win11 窗口组件。
// 渲染层级：通过 Portal 挂到 document.body，脱离舞台容器的层叠上下文，
//           使标题栏与最小化/最大化/关闭按钮始终位于编辑器菜单栏之上、可正常点击。
// 数据：每次打开、以及 VM 结构变化（PROJECT_CHANGED / targetsUpdate）时重建，
//       保证树内容始终映射当前项目中真实的 target / 造型 / 声音。
//       角色切换造型时 scratch-vm 不派发任何事件（只改写 sprite.currentCostume），
//       故额外用轻量签名轮询感知造型索引变化，使角色节点缩略图自动跟随。
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';

// 主题感知窗口：SKYEditor 主题 → Win11 窗口外壳；TurboWarp 主题 → 官方 Modal 弹窗。
// 一律走 ThemedWindow，保证 TW 主题下不出现 SKY 专属窗口外壳。
import ThemedWindow from '../../tw-themed-window/themed-window.jsx';
import ProjectFsContextMenu from './project-fs-context-menu.jsx';
import {downloadNode} from './project-fs-download.js';
import {buildProjectFileTree} from './project-fs-tree.js';
import ProjectFsTreeView from './project-fs-tree-view.jsx';
import styles from './project-fs.css';

const WINDOW_WIDTH = 520;

// 右键菜单动作（与 project-fs-context-menu 中的 action 常量保持一致）
const ACTION_DOWNLOAD = 'download';
const ACTION_TOGGLE = 'toggle';

// 顶部菜单栏高约 48px。Win11Window 的初始 top 由 (视口高 - 窗口高)/2 - 40 推导，
// 因此把窗口高限制在 视口高 - 220 以内，即可保证初始位置落在菜单栏下方。
const computeWindowHeight = () => {
    const viewportHeight = (typeof window === 'undefined' ? 0 : window.innerHeight) || 720;
    const available = viewportHeight - 220;
    return Math.max(300, Math.min(600, available));
};

// 默认展开：根节点与舞台（与需求图初始可见层级一致）
const buildInitialExpanded = () => new Set(['/', '/舞台']);

// 造型签名：角色 id + 当前造型索引。仅用于比对是否发生造型切换，
// 不生成缩略图、不做资源编码，开销可忽略。
const buildCostumeSignature = vm => {
    const targets = (vm && vm.runtime && vm.runtime.targets) || [];
    return targets
        .filter(target => target && !target.isStage && target.isOriginal !== false)
        .map(target => `${target.id}:${target.currentCostume}`)
        .join('|');
};

// 造型切换感知间隔（毫秒）：仅在窗口打开期间运行
const COSTUME_POLL_INTERVAL = 400;

const ProjectFsWindow = ({vm, projectTitle, onClose}) => {
    const [root, setRoot] = useState(() => buildProjectFileTree(vm, projectTitle));
    const [expandedIds, setExpandedIds] = useState(buildInitialExpanded);
    const [windowHeight] = useState(computeWindowHeight);
    // 右键菜单状态：{node, x, y}；null 表示未打开
    const [menuState, setMenuState] = useState(null);

    const rebuild = useCallback(() => {
        setRoot(buildProjectFileTree(vm, projectTitle));
    }, [vm, projectTitle]);

    // 项目标题变化（如另存为 / 重命名）时同步树
    useEffect(() => {
        rebuild();
    }, [rebuild]);

    // 项目结构变化时同步树（增删角色、改名、增删造型/声音等）
    useEffect(() => {
        if (!vm || !vm.runtime) return null;
        const runtime = vm.runtime;
        const handler = () => rebuild();
        runtime.on('PROJECT_CHANGED', handler);
        if (typeof vm.on === 'function') vm.on('targetsUpdate', handler);
        return () => {
            runtime.removeListener('PROJECT_CHANGED', handler);
            if (typeof vm.removeListener === 'function') vm.removeListener('targetsUpdate', handler);
        };
    }, [vm, rebuild]);

    // 补齐造型切换：scratch-vm 仅在增删/重命名 target 时派发 targetsUpdate，
    // setCostume 只改写 currentCostume 并重绘（不派发事件），
    // 因此用签名轮询感知造型索引变化，使角色节点缩略图自动跟随当前造型。
    useEffect(() => {
        if (!vm || !vm.runtime) return null;
        let lastSignature = buildCostumeSignature(vm);
        const timer = setInterval(() => {
            const nextSignature = buildCostumeSignature(vm);
            if (nextSignature === lastSignature) return;
            lastSignature = nextSignature;
            rebuild();
        }, COSTUME_POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [vm, rebuild]);

    const handleToggle = useCallback(id => {
        setExpandedIds(previous => {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // 右键菜单：记录被点击的节点 + 鼠标视口坐标
    const handleNodeContextMenu = useCallback((node, event) => {
        setMenuState({
            node,
            x: event.clientX,
            y: event.clientY
        });
    }, []);

    const handleMenuClose = useCallback(() => {
        setMenuState(null);
    }, []);

    const handleMenuAction = useCallback(action => {
        if (!menuState) return;
        const target = menuState.node;
        setMenuState(null);
        if (action === ACTION_DOWNLOAD) {
            // 下载为异步动作（.sprite3 需要 zip 打包），失败时静默不产生文件
            downloadNode(vm, target);
        } else if (action === ACTION_TOGGLE) {
            handleToggle(target.id);
        }
    }, [menuState, vm, handleToggle]);

    const menuExpanded = menuState ? expandedIds.has(menuState.node.id) : false;

    const windowNode = (
        <ThemedWindow
            windowId="project-fs"
            title="项目资源（文件系统 · 测试）"
            onClose={onClose}
            defaultWidth={WINDOW_WIDTH}
            defaultHeight={windowHeight}
            flushBody
        >
            <div className={styles.windowBody}>
                <div className={styles.toolbar}>
                    <span className={styles.toolbarHint}>
                        {'当前项目资源已按文件结构映射，仅供效果核对'}
                    </span>
                    <button
                        className={styles.toolbarButton}
                        onClick={rebuild}
                        type="button"
                    >
                        {'刷新'}
                    </button>
                </div>
                <div className={styles.treeScroll}>
                    {root ? (
                        <ProjectFsTreeView
                            root={root}
                            expandedIds={expandedIds}
                            onToggle={handleToggle}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ) : (
                        <div className={styles.emptyHint}>
                            {'尚未加载项目'}
                        </div>
                    )}
                </div>
            </div>
            {menuState ? (
                <ProjectFsContextMenu
                    node={menuState.node}
                    x={menuState.x}
                    y={menuState.y}
                    isExpanded={menuExpanded}
                    onClose={handleMenuClose}
                    onAction={handleMenuAction}
                />
            ) : null}
        </ThemedWindow>
    );

    // 无 document（理论上的非浏览器环境）时退回普通渲染
    if (typeof document === 'undefined') return windowNode;

    return createPortal(
        <div className={styles.portalLayer}>
            {windowNode}
        </div>,
        document.body
    );
};

ProjectFsWindow.propTypes = {
    vm: PropTypes.shape({
        runtime: PropTypes.shape({
            targets: PropTypes.array,
            on: PropTypes.func,
            removeListener: PropTypes.func
        }),
        on: PropTypes.func,
        removeListener: PropTypes.func
    }),
    projectTitle: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

ProjectFsWindow.defaultProps = {
    vm: null,
    projectTitle: ''
};

export default ProjectFsWindow;
