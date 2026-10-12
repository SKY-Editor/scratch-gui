/**
 * src/Theme/turbowarp 主题差异包统一出口
 * ---------------------------------------------------------------------------
 * TurboWarp「经典」主题接入框架的落地文件。
 *
 * 定位（对齐 editor-framework-core 铁律）：
 *   - TW 是隔离基准（零回归铁律对象）：与上游一致的文件一律不复制，
 *     直接引用原路径（src/lib/themes 等）；
 *   - 本主题视觉零差异，不注入任何专属 CSS 变量（variables 为空，
 *     applyPartTokens 无变量可注入，默认语义变量由 inheritsBase 链路下发）；
 *   - 框架化 = 拥有自己的零件树声明与外壳注册，被用户选中时走与
 *     sky-editor / bilup 相同的装配流程，而不是特殊例外。
 *
 * 零件树结构（轻量，零视觉差异）：
 *
 *   turbowarp
 *   ├── tw-window-shell (component: 原生 Modal 窗口外壳)
 *   │     （ThemedWindow 在非 SE 主题下自动返回原生 Modal，
 *   │      与 sky-editor 的 Win11Window 外壳平行；
 *   │      TW 主题窗口内容由业务侧原生渲染，无专属窗口零件）
 *   └── （无 tokens 零件：基准主题不覆盖默认语义变量）
 *
 * 铁律：
 *   - 零件只声明「组件 / 按钮 / 颜色背景」等视觉单元，文本不映射；
 *   - 组件零件不含业务逻辑（纯声明）；
 *   - 本主题不改任何公共文件，仅登记自身声明。
 * ---------------------------------------------------------------------------
 */
import {registerParts} from '../../editor-framework-core/part-registry';

/**
 * 本主题的零件定义（轻量：TW 无专属窗口内容与令牌）。
 * load 为延迟加载函数；公共零件 themed-window / themed-button 已在
 * part-registry.js 全局注册，本主题无需重复声明。
 */
const PART_DEFS = [
    // ── 窗口外壳（原生 Modal，由 ThemedWindow 在非 SE 主题下自动提供）──
    {
        id: 'tw-window-shell',
        type: 'component',
        slot: 'modal-shell',
        load: () => import('../../components/tw-themed-window/themed-window.jsx'),
        note: 'TW 窗口外壳零件：ThemedWindow 在非 SE 主题下自动返回原生 Modal（深灰居中标题 + 圆形关闭，图1），与 sky-editor 的 Win11Window 外壳（图2）平行'
    }
];

// 装配本主题时自动登记零件（幂等）
registerParts(PART_DEFS);

// 导出零件声明（供装配器 / 文档按主题展开）
export const PARTS = PART_DEFS;

export default PARTS;
