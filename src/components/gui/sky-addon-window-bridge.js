/**
 * React 侧「addon 窗口宿主桥」。
 *
 * 背景：addon（如调试器）运行在 React 之外，内容 DOM 由原生 DOM API 构建。
 * 为让这些窗口真正进入编辑器统一窗口体系（与设置窗口 / Packager 同一个
 * Win11Window 组件、同一套 windowFocusManager、同一窗口层容器），addon 不再
 * 自建窗口壳，只把自己的内容 DOM 节点交给本桥；由 React 侧
 * sky-addon-window-host.jsx 渲染 Win11Window 并把节点搬进窗口 body / 标题栏动作区。
 *
 * 本模块不依赖 React，也不依赖 addon 框架，addon 侧通过全局
 * window.__skyAddonWindow 访问：
 *
 *   window.__skyAddonWindow.mount({
 *       id: 'debugger',            // 唯一标识，同时只允许一个 addon 窗口占用宿主
 *       title: '调试器',            // 标题栏文字
 *       icon: '.../debug.svg',     // 标题栏图标 URL
 *       width: 720, height: 512,   // 窗口默认几何
 *       actions: domNode,          // 可选：标题栏右侧动作区节点
 *       body: domNode,             // 窗口内容节点（必需）
 *       onClose: () => {}          // 宿主标题栏关闭按钮 / Esc 触发时回调
 *   });
 *   window.__skyAddonWindow.unmount('debugger');
 *
 * 注意：宿主只负责「搬节点」，不复制节点；节点对象与 addon 侧完全同一引用，
 * 因此 addon 内部的事件监听、状态、日志内容都不受影响。
 */

const subscribers = new Set();
let currentSpec = null;

const emit = () => {
    subscribers.forEach(listener => {
        listener(currentSpec);
    });
};

const isSameSpec = id => !id || (currentSpec && currentSpec.id === id);

const skyAddonWindowBridge = {
    /**
     * 请求宿主渲染（或更新）一个 addon 窗口。
     * @param {object} spec 窗口描述，见文件头注释。
     * @returns {boolean} 宿主是否接手（宿主未挂载或参数非法时返回 false）。
     */
    mount (spec) {
        if (!spec || !spec.id || !spec.body) return false;
        currentSpec = spec;
        emit();
        return true;
    },

    /**
     * 撤销宿主渲染。传入 id 时只撤销匹配的窗口，避免主题切换时序错乱时误撤。
     * @param {string} [id] addon 窗口标识。
     * @returns {boolean} 是否发生了撤销。
     */
    unmount (id) {
        if (!currentSpec) return false;
        if (id && currentSpec.id !== id) return false;
        currentSpec = null;
        emit();
        return true;
    },

    /**
     * 由宿主标题栏关闭按钮 / Esc 调用：先清空宿主状态，再通知 addon 收起内容。
     * @param {string} [id] addon 窗口标识。
     */
    close (id) {
        if (!isSameSpec(id) || !currentSpec) return;
        const spec = currentSpec;
        currentSpec = null;
        emit();
        if (typeof spec.onClose === 'function') spec.onClose();
    },

    /**
     * 当前请求渲染的窗口描述（无则 null）。
     * @returns {object|null} 窗口描述。
     */
    getCurrent () {
        return currentSpec;
    },

    /**
     * 订阅宿主状态变化，订阅时立即回调一次当前值。
     * @param {Function} listener 回调，入参为窗口描述或 null。
     * @returns {Function} 取消订阅函数。
     */
    subscribe (listener) {
        subscribers.add(listener);
        listener(currentSpec);
        return () => {
            subscribers.delete(listener);
        };
    }
};

if (typeof window !== 'undefined') {
    window.__skyAddonWindow = skyAddonWindowBridge;
}

export default skyAddonWindowBridge;
