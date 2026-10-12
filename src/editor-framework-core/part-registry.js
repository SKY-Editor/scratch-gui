/**
 * editor-framework-core / part-registry
 * 零件注册（Part = 可复用的「单独组件」/ 视觉令牌，按主题嵌套装配）
 * ---------------------------------------------------------------------------
 * 「嵌套式主题」：一个主题外壳（Shell）由一棵零件树（Part Tree）嵌套组装，
 * 就像搭积木——大积木里嵌套小积木，小积木里还可以再嵌更小的积木。
 *
 * 零件分两类（type 字段）：
 *   - 'component' 零件：一个可复用 React 组件（窗口外壳 / 菜单栏 / 面板等），
 *     通过 children 声明其嵌套的子零件，形成树形结构（嵌套式主题的元素）；
 *   - 'tokens' 零件：一组视觉令牌（按钮 / 面板背景等 CSS 变量），无组件，
 *     装配时把当前主题的变量值注入文档。
 *
 * 规则（用户已确认）：
 *   - 零件只注册「组件 / 按钮 / 颜色背景」等视觉单元，文本不映射（避免国际化混乱）；
 *   - 组件零件本身不含业务逻辑（业务逻辑留在业务组件 / 插槽侧，零件是纯声明）；
 *   - 零件按 id 全局唯一；主题通过 theme-registry 的 parts 字段引用零件根；
 *   - 装配统一由 assembler 驱动（tokens 注入 + 外壳 GUI 加载）。
 * ---------------------------------------------------------------------------
 */
import {getUiThemeNamespace, getUiThemeVariables} from './theme-registry';

/**
 * 零件描述结构：
 *   id        零件唯一标识（全局唯一）
 *   type      'component' | 'tokens'（缺省 'tokens'，兼容旧注册表）
 *   slot      插槽名：业务组件中预留的装配点（仅 component 零件使用，文档/挂载定位用）
 *   load      异步加载组件函数 () => Promise<{default: Component}>（仅 component 零件）
 *   tokens    该零件用到的主题 CSS 变量名列表（写入作用域时按需注入，仅 tokens 零件）
 *   scope     作用域（'root' | 'namespace'），namespace 表示限定在主题命名空间类下
 *   selector  可选的落点选择器（scope=namespace 时相对 html.{namespace}）
 *   children  嵌套的子零件：数组元素可以是「零件对象」或「已注册零件的 id 字符串」
 *   note      说明文案
 */
const PART_REGISTRY = [
    {
        id: 'themed-window',
        type: 'component',
        slot: 'themed-window',
        load: () => import('../components/tw-themed-window/themed-window.jsx'),
        note: '主题感知窗口包裹层（公共）：功能开发者只需写内部排版 + 标题 + 图标，按当前主题自动套外壳（SE→Win11Window，其它→原生Modal）'
    },
    {
        id: 'themed-button',
        type: 'component',
        slot: 'themed-button',
        load: () => import('../components/tw-themed-button/themed-button.jsx'),
        note: '主题统一按钮模板（公共）：primary/secondary/danger，颜色取主题变量，非 SE 主题中性兜底'
    },
    {
        id: 'accent-button',
        type: 'tokens',
        tokens: [
            '--bilup-accent',
            '--bilup-accent-strong',
            '--bilup-accent-soft'
        ],
        scope: 'namespace',
        selector: '.button-accent, button.primary',
        note: '主操作按钮：使用主题强调色背景，文本色不映射（按钮文本由各主题自行提供）'
    },
    {
        id: 'surface-panel',
        type: 'tokens',
        tokens: [
            '--bilup-surface-page',
            '--bilup-surface-sprite',
            '--bilup-surface-panel',
            '--bilup-surface-flyout'
        ],
        scope: 'namespace',
        selector: '.panel, .sprite-selector, .flyout',
        note: '面板/精灵区/积木盒背景：只改颜色背景，不改文本'
    }
];

/**
 * 取全部零件
 * @returns {Array} 零件注册表副本
 */
const getParts = () => PART_REGISTRY.slice();

/**
 * 按 id 取零件
 * @param {string} partId 零件 id
 * @returns {object|undefined} 零件条目
 */
const getPartById = partId => PART_REGISTRY.find(part => part.id === partId);

/**
 * 把「零件数组」扁平化为注册条目（内联对象就地登记，id 字符串直接引用已注册零件）
 * @param {Array} parts 零件数组
 * @returns {Array<string>} 规范化后的零件 id 列表
 */
const normalizePartRefs = parts => {
    if (!Array.isArray(parts)) return [];
    return parts.map(item => {
        if (typeof item === 'string') {
            // 已是 id：校验存在，缺失仅告警不中断
            if (!getPartById(item)) {
                console.warn(`[editor-framework] 零件 "${item}" 未注册，已跳过`);
            }
            return item;
        }
        if (item && typeof item === 'object' && item.id) {
            registerPart(item);
            return item.id;
        }
        return null;
    }).filter(Boolean);
};

/**
 * 解析某零件的嵌套树（含子零件递归展开）
 * @param {string} partId 根零件 id
 * @returns {object|null} {part, children: [...]} 树形结构
 */
const getPartTree = partId => {
    const part = getPartById(partId);
    if (!part) return null;
    const children = (part.children || [])
        .map(childId => getPartTree(childId))
        .filter(Boolean);
    return {part, children};
};

/**
 * 取某主题启用的零件树（theme-registry 主题条目的 parts 字段为根）
 * @param {string} themeId 主题 id
 * @returns {Array<object>} 零件树列表
 */
const getThemePartTree = themeId => {
    const theme = getUiThemeById(themeId);
    const roots = (theme && Array.isArray(theme.parts)) ? theme.parts : [];
    return roots.map(rootId => getPartTree(rootId)).filter(Boolean);
};

/**
 * 将零件的主题令牌注入到文档（供装配器调用；仅处理 tokens 型零件）
 * @param {string} themeId 主题 id
 * @param {boolean} isDark 是否深色
 * @returns {void}
 */
const applyPartTokens = (themeId, isDark) => {
    const variables = getUiThemeVariables(themeId, isDark);
    const doc = document.documentElement;
    PART_REGISTRY.forEach(part => {
        if (part.type === 'component') return;
        (part.tokens || []).forEach(token => {
            if (Object.prototype.hasOwnProperty.call(variables, token)) {
                doc.style.setProperty(token, variables[token]);
            }
        });
    });
};

/**
 * 注册新零件（供主题 / 第三方扩展；支持嵌套：children 中的内联对象会被自动登记）
 * @param {object} part 零件描述（见 PART_REGISTRY 注释）
 * @returns {object|undefined} 已登记零件条目
 */
const registerPart = part => {
    if (!part || !part.id) return undefined;
    const existing = getPartById(part.id);
    if (!existing) {
        const normalized = {
            type: 'tokens',
            ...part,
            children: normalizePartRefs(part.children)
        };
        PART_REGISTRY.push(normalized);
        return normalized;
    }
    // 已存在：仅允许补登 children（避免覆盖既有声明）
    const extra = normalizePartRefs(part.children);
    if (extra.length > 0) {
        existing.children = [...(existing.children || []), ...extra];
    }
    return existing;
};

/**
 * 批量注册零件（自动处理嵌套）
 * @param {Array<object>} parts 零件描述数组
 * @returns {Array<string>} 已登记根零件 id 列表
 */
const registerParts = parts => {
    if (!Array.isArray(parts)) return [];
    return parts.map(part => registerPart(part)).filter(Boolean).map(p => p.id);
};

export {
    PART_REGISTRY,
    getParts,
    getPartById,
    getPartTree,
    getThemePartTree,
    applyPartTokens,
    registerPart,
    registerParts
};
