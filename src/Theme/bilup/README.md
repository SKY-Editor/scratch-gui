---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_05e5baecc4c011f1a08152540064ee0f
    ReservedCode1: cFZUwelXcTKPtDun06CbF8469w5r1cfmd/JM7/UvIbTtYRF/Idx6bVct8r8W+Q8SdJqRPnj93Z1GcBd785DXaIv8Hu4gtgmQdnVnIMz99IqRlV1jIcSOvzoudxhrmERzD0dacHbRJ5Zkk445zRW2y+cM0ZhMw55g5OPUi/dGwxF70gLB2nEq6P7FT/c=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_05e5baecc4c011f1a08152540064ee0f
    ReservedCode2: cFZUwelXcTKPtDun06CbF8469w5r1cfmd/JM7/UvIbTtYRF/Idx6bVct8r8W+Q8SdJqRPnj93Z1GcBd785DXaIv8Hu4gtgmQdnVnIMz99IqRlV1jIcSOvzoudxhrmERzD0dacHbRJ5Zkk445zRW2y+cM0ZhMw55g5OPUi/dGwxF70gLB2nEq6P7FT/c=
---

# Theme/bilup —— Bilup 主题差异包

SKY Editor 新框架架构下**第一个完整主题**（外壳）。本目录是 Bilup 主题相对
TurboWarp 基线的全部差异（GUI 组件 / 样式 / reducer），文件与其它主题物理隔离，
数据经 `editor-framework-core/shared-data.js` 互通。

## 主题定位

- 注册表：`src/editor-framework-core/theme-registry.js` 中的 `id: 'bilup'` 条目
- 命名空间：`html.bilup-theme` + `data-ui-theme="bilup"`
- 强调色：青绿 `#75c1c4`，页面底色浅蓝 `#E6F0FF`（参考 com.bilup.org/editor 视觉）
- 外壳：已在 `shell-registry.js` 注册（`id: 'bilup'`，GUI 差异包，VM 无差异，仅 GUI Chrome）

## 文件清单

| 文件 | 职责 |
| --- | --- |
| `index.js` | 外壳入口：导出 `BilupMenuBar` / `BilupWindow` 等 GUI 差异，挂载点见 `components/menu-bar/menu-bar.jsx`（仅 `uiTheme === 'bilup'` 时渲染） |
| `bilup-reducer.js` | 主题专属 redux 状态 |
| `ui-bilup.css` | 主题专属样式（选择器统一带 `html.bilup-theme` 或 `[data-ui-theme='bilup']` 限定） |
| `components/` | Bilup 菜单栏 / 窗口 / 标签组件 |
| `components/windows/` | 各功能窗口差异包（书签 / 协作 / 调试器 / git / 插件商店 / 项目数据 / 恢复点 / 终端 / 待办 / 变量管理器） |
| `styles/bilup-modules.css` | 模块化样式补充 |

## 许可证与来源声明（重要）

本主题是对第三方开源项目 **Bilup** 的**功能参考实现**，非逐字复制。涉及到的上游许可证如下：

| 上游项目 | 许可证 | 说明 |
| --- | --- | --- |
| Bilup scratch-gui（github.com/Bilup/scratch-gui） | **GPL-3.0** | 仅作功能参考（行为/视觉风格），不复制其受 GPL 约束的源码；如需直接复用其代码，衍生作品须以 GPL-3.0 开源 |
| BilupBlocks / bilupblocks（scratchblocks 衍生） | **MIT** | 积木造型/分类参考，MIT 允许自由使用（保留版权声明） |
| scratch-blocks（Scratch 官方） | **MPL-2.0** | 积木注册层基于官方 MPL-2.0 代码扩展，修改部分按 MPL-2.0 保持文件级开源 |

**使用约束**：
1. 本目录内自行实现的差异代码不构成对上游 GPL 代码的衍生；若后续需要直接搬运 Bilup 的
   GUI 源码，必须先评估并遵循 GPL-3.0 传染条款（涉及发布时开源义务）。
2. bilupblocks / scratch-blocks 层按 MIT / MPL-2.0 各自条款保留版权声明。
3. 任何对外发布版本须在本 README 与仓库 LICENSE 声明中同步上述许可证信息。

## 铁律

- 差异化逻辑严格限定 `html.bilup-theme` 作用域，严禁影响其它主题（TurboWarp 零回归）。
- 非当前主题仅预加载框架，不加载本主题 UI；本主题崩溃时走 assembler 降级链。
- 文本不映射（零件只注册按钮 / 颜色背景），按钮文案由本主题自行提供。
*（内容由AI生成，仅供参考）*
*（内容由AI生成，仅供参考）*
