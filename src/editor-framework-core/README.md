---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_5fe27c53c58811f1820a525400638852
    ReservedCode1: HUzTjwy+jkENBLgW1bWfGzKaTgWnnxpB6ZRWLG3GL9jq7/EN+5rMmDPIPBmG/3xIHz8h+W+P88dpW5F5oF8cf3d1fYkmsHgNHq2k7ORfCKq4MA4hbDniFlhG2+2X7ohAv7mizqXDYZP9a8d2rwjJcm2nPt9R5W+4/z/g9JLRrTX/jw2s8n/u18fkwvY=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_5fe27c53c58811f1820a525400638852
    ReservedCode2: HUzTjwy+jkENBLgW1bWfGzKaTgWnnxpB6ZRWLG3GL9jq7/EN+5rMmDPIPBmG/3xIHz8h+W+P88dpW5F5oF8cf3d1fYkmsHgNHq2k7ORfCKq4MA4hbDniFlhG2+2X7ohAv7mizqXDYZP9a8d2rwjJcm2nPt9R5W+4/z/g9JLRrTX/jw2s8n/u18fkwvY=
---



# editor-framework-core（SKY Editor 多主题框架核心）

SKY Editor 新框架架构的共享内容核心目录。所有主题共用、与具体主题无关的机制一律放这里；
`src/Theme/` 下只放各主题的差异包，二者职责严格分离。

## 架构总览：「外壳 + 插槽」

- **外壳（Shell）**：一个完整主题 = 一个外壳。主题目录 `src/Theme/<id>/` 内是相对
  TurboWarp 基线的差异文件（GUI 组件 / 样式 / reducer / VM 扩展注册点），文件物理隔离。
- **插槽（Slot）**：框架预留的装配点（菜单栏、面板、按钮、颜色背景等）。
  零件只注册「按钮 / 颜色背景」等视觉零件，**文本不映射**（各主题自行提供文案）。
- **最底层兼容层**：原版 TurboWarp 仅作兜底，不常驻、不默认运行，省性能。
- **数据互通**：主题间不互相 import，数据走 `shared-data.js` 共享通道。

## 目录与职责

| 文件 | 职责 |
| --- | --- |
| `theme-registry.js` | **主题清单唯一真源**：全部主题的 id / name / iconColor / attribute / namespace / accent / gui / variables / shells，以及 `<html>` 作用域同步接口（`applyUiThemeChrome`）。新增主题只改本文件 + 挂载专属样式 import。 |
| `shell-registry.js` | 外壳注册：记录主题外壳的 GUI/VM 差异加载方式（`loadGui` / `loadVm`），以及外壳损坏时的 fallback。 |
| `part-registry.js` | 零件注册：可复用 UI 零件的声明（按钮 / 面板背景等），只含样式令牌，不含业务逻辑。 |
| `assembler.js` | 装配器：装配当前主题的 chrome + 零件令牌 + 外壳 GUI/VM；崩溃降级链：当前主题失败 → 依次尝试其它主题 → 全部失败则启用 TurboWarp 原生兼容模式弹窗提示。 |
| `shared-data.js` | 共享数据层：跨主题数据互通的唯一通道（会话级，不落盘）。 |
| `index.js` | 统一出口。 |

## 主题生命周期（装配流程）

1. 启动时 `detectUiTheme()` 读取持久化主题（`Theme/public/uiThemePersistance.js`）。
2. 主题清单从 `theme-registry.js` 读取（`Theme/public` 只做读取当前主题 + 切换，从 core 读清单）。
3. `assembleTheme(themeId, isDark)`：
   - 注入 `<html data-ui-theme>` + namespace 类 + 专属 CSS 变量；
   - 注入零件令牌（`applyPartTokens`）；
   - 加载当前主题外壳 GUI（**非当前主题仅预加载框架，不加载 UI**）；
   - 加载外壳 VM 差异（扩展块 / 资产注册）。
4. 装配失败走降级链（见 assembler.js 注释）。

## 铁律

1. 差异化逻辑严格限定本主题作用域（`data` 属性 + namespace 类），严禁影响其它主题（TurboWarp 零回归）。
2. namespace 类 / 变量前缀全局唯一，主题间互不串扰。
3. 业务代码禁止直接读取其它主题目录内部文件；数据互通走 `shared-data.js`。
4. 原版 TurboWarp 是最底层兼容层，仅兜底时启用。

## 新增主题的标准流程（嵌套式主题）

1. 新建 `src/Theme/<id>/` 差异包（组件 / 样式 / reducer / VM 注册点）。
2. 在 `theme-registry.js` 加一条注册记录 + import 专属样式。
3. 若有 GUI/VM 差异外壳，在 `shell-registry.js` 注册外壳。
4. 在主题目录 `index.js` 用 `registerParts()` 声明**嵌套零件树**（component 零件 + tokens 零件，
   通过 `children` 嵌套）；在 `theme-registry.js` 主题条目的 `parts` 字段引用零件树根 id。
5. 选择入口 / 持久化 / reducer / 作用域标记 / 专属变量自动生效，业务代码零改动。
6. 业务组件侧需要差异化渲染时，在预留插槽处按 `uiTheme` 三选一渲染（仅 SE 场景），
   组件物理收拢到主题目录 `components/`（迁移路径见 `src/Theme/sky-editor/components/README.md`）。

> 完整操作指南见《SKYEditor-单独组件化GUI指南.md》（`文档/组件化规范/`，仓库外，不随源码分发）。
*（内容由AI生成，仅供参考）*
*（内容由AI生成，仅供参考）*
