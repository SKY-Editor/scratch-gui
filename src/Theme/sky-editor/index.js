/**
 * src/Theme/sky-editor 主题差异包统一出口
 * ---------------------------------------------------------------------------
 * 「嵌套式主题」落地文件：
 *   本文件是 sky-editor 主题外壳（shell-registry 中 'sky-editor' 外壳的 loadGui
 *   目标），加载本模块即完成：
 *     1) 注册本主题的嵌套零件树（part-registry，嵌套式主题的元素/原件）；
 *     2) 导出 PARTS 声明，供装配器/文档按主题展开零件树；
 *     3) （后续迁移）把散落在业务组件中的 sky-editor 差异化收拢为单独组件，
 *        统一从 components/ 引用，业务侧只留插槽。
 *
 * 零件树结构（一层窗口外壳，内嵌各窗口内容零件；另有菜单栏零件与令牌零件）：
 *
 *   sky-editor
 *   ├── sky-window-shell (component: Win11Window 窗口外壳)
 *   │     ├── settings-window          设置窗口
 *   │     ├── addons-window            Addons 窗口
 *   │     ├── custom-procedures-window 自定义积木窗口
 *   │     ├── confirm-dialog           确认框
 *   │     ├── prompt                   输入框
 *   │     ├── username-window          用户名窗口
 *   │     ├── restore-point-window     恢复点窗口
 *   │     └── extension-library-windowed  扩展库窗口化
 *   ├── sky-menu-bar (component: 菜单栏差异化，待抽成单独组件)
 *   └── sky-surface-tokens (tokens: --sky-theme-surface / --sky-theme-border)
 *
 * 铁律（对齐 editor-framework-core）：
 *   - 零件只声明「组件 / 按钮 / 颜色背景」等视觉单元，文本不映射；
 *   - 组件零件不含业务逻辑（业务组件侧由插槽按需渲染，零件是纯声明）；
 *   - 差异化逻辑必须限定 html.sky-editor-theme 作用域，严禁影响其它主题。
 * ---------------------------------------------------------------------------
 */
import {registerParts} from '../../editor-framework-core/part-registry';

/**
 * 本主题的零件定义。
 * 约定：子零件定义放在父零件之前，避免注册时引用未注册 id 产生告警。
 * load 为延迟加载函数（业务插槽按需渲染时使用）；目前业务组件仍由原路径
 * 直接引用，物理收拢到 components/ 的迁移路径见 components/README.md。
 */
const PART_DEFS = [
    // ── 窗口外壳的嵌套子零件（窗口内容）────────────────────────────
    {
        id: 'settings-window',
        type: 'component',
        slot: 'settings',
        load: () => import('./components/settings-window/settings-window.jsx'),
        note: '设置窗口：uiTheme===\'sky-editor\' 时以 Win11Window 外壳呈现'
    },
    {
        id: 'addons-window',
        type: 'component',
        slot: 'addons',
        load: () => import('./components/addons-window/addons-window.jsx'),
        note: 'Addons 窗口'
    },
    {
        id: 'custom-procedures-window',
        type: 'component',
        slot: 'custom-procedures',
        load: () => import('./components/custom-procedures/custom-procedures.jsx'),
        note: '自定义积木窗口（三选一模式）'
    },
    {
        id: 'confirm-dialog',
        type: 'component',
        slot: 'confirm-dialog',
        load: () => import('./components/confirm-dialog/confirm-dialog.jsx'),
        note: '确认框（三选一模式）'
    },
    {
        id: 'prompt',
        type: 'component',
        slot: 'prompt',
        load: () => import('./components/prompt/prompt.jsx'),
        note: '输入框（三选一模式）'
    },
    {
        id: 'username-window',
        type: 'component',
        slot: 'username',
        load: () => import('./components/username-window/username-window.jsx'),
        note: '用户名窗口'
    },
    {
        id: 'restore-point-window',
        type: 'component',
        slot: 'restore-point',
        load: () => import('./components/restore-point-window/restore-point-window.jsx'),
        note: '恢复点窗口'
    },
    {
        id: 'extension-library-windowed',
        type: 'component',
        slot: 'extension-library',
        load: null,
        note: '扩展库 windowed：待把现有差异化收拢为单独组件后填入 load'
    },

    // ── 窗口外壳（Win11Window）─────────────────────────────────────
    {
        id: 'sky-window-shell',
        type: 'component',
        slot: 'modal-shell',
        load: () => import('./components/win11-window/win11-window.jsx'),
        children: [
            'settings-window',
            'addons-window',
            'custom-procedures-window',
            'confirm-dialog',
            'prompt',
            'username-window',
            'restore-point-window',
            'extension-library-windowed'
        ],
        note: '窗口外壳零件：SE 下所有弹窗复用该外壳（对齐《SKYEditor 窗口化规范》）'
    },

    // ── 菜单栏差异化 ───────────────────────────────────────────────
    {
        id: 'sky-menu-bar',
        type: 'component',
        slot: 'menu-bar',
        load: null,
        note: '菜单栏 SKY 差异化（SKY 按钮等）：现有逻辑在 menu-bar.jsx 的 uiTheme===\'sky-editor\' 分支，待抽成单独组件后填入 load'
    },

    // ── 视觉令牌零件（tokens）──────────────────────────────────────
    {
        id: 'sky-surface-tokens',
        type: 'tokens',
        tokens: [
            '--sky-theme-surface',
            '--sky-theme-border',
            '--sky-accent',
            '--sky-accent-strong',
            '--sky-accent-soft',
            '--sky-text-on-accent'
        ],
        scope: 'namespace',
        selector: ':root',
        note: 'SKYEditor 表面令牌 + 主色板：主题注册表 variables 注入的专属变量（明暗自动适配），供按钮模板 / 窗口外壳 / 面板等统一取色'
    }
];

// 装配本主题时自动登记零件（幂等：已注册零件仅补登 children）
registerParts(PART_DEFS);

// 导出零件声明（供装配器 / 文档按主题展开）
export const PARTS = PART_DEFS;

export default PARTS;
