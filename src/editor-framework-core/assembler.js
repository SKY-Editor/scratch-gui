/**
 * editor-framework-core / assembler
 * 装配器（把当前主题的「外壳 + 嵌套零件树」装配到编辑器）
 * ---------------------------------------------------------------------------
 * 装配流程：
 *   1. 从主题清单读取当前主题（未知 id 自动归一化到默认主题）；
 *   2. 注入主题 chrome（data-ui-theme / namespace / 专属变量）；
 *   3. 注入零件令牌（tokens 型零件：按钮/背景等视觉变量）；
 *   4. 加载主题外壳 GUI（仅当前主题加载 UI；非当前主题不加载）。
 *      主题目录在加载时注册自己的零件（registerParts），并导出 PARTS 声明；
 *   5. 展开当前主题的零件树（getThemePartTree，component 零件按需由业务插槽渲染）；
 *   6. 加载主题外壳 VM 差异（扩展块/资产注册）。
 *
 * 崩溃降级链（用户已确认）：
 *   当前主题外壳装配失败 → 依次尝试其它主题外壳，失败时弹通知提示；
 *   全部失败 → 启用 TurboWarp 原生 UI 兼容模式（最底层兼容层）并弹窗。
 * ---------------------------------------------------------------------------
 */
import {
    getUiThemeById,
    normalizeUiThemeId,
    applyUiThemeChrome,
    UI_THEME_REGISTRY
} from './theme-registry';
import {
    getThemeShellIds,
    getShellById
} from './shell-registry';
import {applyPartTokens, getThemePartTree} from './part-registry';

/**
 * 装配一个主题外壳（加载 GUI/VM 差异）
 * @param {string} shellId 外壳 id
 * @returns {Promise<boolean>} 是否装配成功
 */
const mountShell = async shellId => {
    const shell = getShellById(shellId);
    if (!shell) return false;
    try {
        if (typeof shell.loadGui === 'function') {
            const mod = await shell.loadGui();
            if (!mod) return false;
        }
        if (typeof shell.loadVm === 'function') {
            await shell.loadVm();
        }
        return true;
    } catch (e) {
        // 外壳损坏：记录并交由降级链处理
        console.warn(`[editor-framework] shell "${shellId}" 装配失败:`, e);
        return false;
    }
};

/**
 * 完整装配当前主题
 * @param {string} themeId 主题 id
 * @param {boolean} [isDark] 是否深色（缺省不注入专属变量）
 * @returns {Promise<{ok: boolean, themeId: string, degradedTo: string|null, fallback: boolean}>}
 */
const assembleTheme = async (themeId, isDark) => {
    const current = getUiThemeById(themeId);
    const ids = [current.id, ...UI_THEME_REGISTRY.map(t => t.id).filter(id => id !== current.id)];

    // 1) 注入 chrome 与零件令牌（幂等）
    applyUiThemeChrome(current.id, isDark);
    if (typeof isDark === 'boolean') {
        applyPartTokens(current.id, isDark);
    }

    // 2) 尝试装配当前主题外壳；失败则沿降级链尝试其它主题
    for (const candidateId of ids) {
        const shellIds = getThemeShellIds(candidateId);
        if (shellIds.length === 0) continue;
        const results = await Promise.all(shellIds.map(mountShell));
        if (results.every(Boolean)) {
            return {
                ok: true,
                themeId: current.id,
                degradedTo: candidateId === current.id ? null : candidateId,
                fallback: false
            };
        }
    }

    // 3) 全部失败：TurboWarp 原生 UI 兼容模式兜底（最底层兼容层）
    applyUiThemeChrome('turbowarp', isDark);
    return {
        ok: false,
        themeId: current.id,
        degradedTo: null,
        fallback: true
    };
};

export {assembleTheme, mountShell};
