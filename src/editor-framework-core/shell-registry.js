/**
 * editor-framework-core / shell-registry
 * 外壳注册（Shell = 一个完整主题的 GUI + VM 差异包）
 * ---------------------------------------------------------------------------
 * 「外壳+插槽」架构：
 *   - 每个主题 = 一个外壳：主题目录（src/Theme/<id>/）内是相对 TurboWarp 基线的
 *     差异文件（GUI 组件 / 样式 / reducer / VM 扩展注册点），数据经 shared-data
 *     互通，文件与其它主题物理隔离；
 *   - 原版 TurboWarp 是最底层兼容层（不默认运行），仅当所有主题外壳均无法装配时
 *     降级使用（见 assembler.js）；作为「经典」主题被用户主动选中时同样走框架装配；
 *   - 非当前主题：只预加载框架（清单/注册表），不加载其 UI 外壳；
 *     当前主题才真正装配 GUI 差异。
 *
 * 外壳注册表：只记录「如何加载」的静态描述，不做副作用。
 * ---------------------------------------------------------------------------
 */
import {getUiThemeById} from './theme-registry';

/**
 * 主题外壳描述结构：
 *   id           外壳 id（通常与主题 id 一致）
 *   loadGui      异步加载 GUI 差异包的函数（返回 Promise<{default: Component} | null>）
 *   loadVm       异步加载 VM 差异注册函数（返回 Promise<Function | null>，
 *                vm 差异函数签名 (vm) => void，用于注册扩展块/资产等）
 *   guiChromeOnly 是否仅作用于 GUI 外观（无 VM 差异时置 true）
 *   fallback     外壳自身损坏时的备选外壳 id（可为空）
 */
const SHELL_REGISTRY = [
    {
        id: 'sky-editor',
        loadGui: () => import('../Theme/sky-editor'), // 嵌套零件树 + 现有单独组件的统一出口（见 src/Theme/sky-editor）
        loadVm: null,
        guiChromeOnly: true,
        fallback: 'turbowarp'
    },
    {
        id: 'bilup',
        loadGui: () => import('../Theme/bilup'), // BilupMenuBar 等 GUI 差异包
        loadVm: null,
        guiChromeOnly: true,
        fallback: 'turbowarp'
    },
    {
        id: 'turbowarp',
        loadGui: () => import('../Theme/turbowarp'), // TW「经典」零件树（tw-window-shell：原生 Modal 外壳，零视觉差异）
        loadVm: null,
        guiChromeOnly: true,
        fallback: null
    }
];

/**
 * 按外壳 id 取注册条目
 * @param {string} shellId 外壳 id
 * @returns {object|undefined} 外壳条目
 */
const getShellById = shellId => SHELL_REGISTRY.find(shell => shell.id === shellId);

/**
 * 取某主题已注册的外壳 id 列表（优先读 theme-registry 的 shells 字段）
 * @param {string} themeId 主题 id
 * @returns {string[]} 外壳 id 列表
 */
const getThemeShellIds = themeId => {
    const theme = getUiThemeById(themeId);
    return (theme && Array.isArray(theme.shells)) ? theme.shells : [];
};

/**
 * 注册新外壳（供第三方主题在运行时追加；静态主题直接写入 SHELL_REGISTRY 即可）
 * @param {object} shell 外壳描述（见上）
 */
const registerShell = shell => {
    if (!shell || !shell.id) return;
    if (!getShellById(shell.id)) {
        SHELL_REGISTRY.push(shell);
    }
};

export {
    SHELL_REGISTRY,
    getShellById,
    getThemeShellIds,
    registerShell
};
