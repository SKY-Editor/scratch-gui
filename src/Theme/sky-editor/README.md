---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_5f03a0a8c58811f1820a525400638852
    ReservedCode1: 9hzkNZYWuFEEx6VUWrfydmwAh2239l2WBwIclefJ4Te1q/lCZgNxwlqQnKqdVslTdW3jXrnbsho61/lDWhGsOel1kZPyHRkaxjqHDdyjH+7CPgingPW416wWOBhxhJSEar/Hn/eohBxQIrb03mHzP7t5mfQg19U+UEcSRyh9+7L4rCDZ21Ay6sMTMbw=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_5f03a0a8c58811f1820a525400638852
    ReservedCode2: 9hzkNZYWuFEEx6VUWrfydmwAh2239l2WBwIclefJ4Te1q/lCZgNxwlqQnKqdVslTdW3jXrnbsho61/lDWhGsOel1kZPyHRkaxjqHDdyjH+7CPgingPW416wWOBhxhJSEar/Hn/eohBxQIrb03mHzP7t5mfQg19U+UEcSRyh9+7L4rCDZ21Ay6sMTMbw=
---

# sky-editor 主题差异包

本目录存放 sky-editor 主题相对 TurboWarp 基线的差异文件，是**嵌套式主题**的第一个落地主题。

## 目录结构

```
src/Theme/sky-editor/
├── index.js          # 主题差异包统一出口：注册嵌套零件树 + 导出 PARTS 声明
├── components/       # 单独组件归属目录（含迁移步骤说明）
│   └── README.md
└── README.md         # 本文档
```

## 嵌套式主题（零件树）结构

sky-editor 主题的 GUI 由一棵**嵌套零件树**组成（对应「嵌套式主题的元素/原件」）：

```
sky-editor
├── sky-window-shell (component: Win11Window 窗口外壳)
│     ├── settings-window          设置窗口
│     ├── addons-window            Addons 窗口
│     ├── custom-procedures-window 自定义积木窗口
│     ├── confirm-dialog           确认框
│     ├── prompt                   输入框
│     ├── username-window          用户名窗口
│     ├── restore-point-window     恢复点窗口
│     └── extension-library-windowed  扩展库窗口化（待抽）
├── sky-menu-bar (component: 菜单栏差异化，待抽成单独组件)
└── sky-surface-tokens (tokens: --sky-theme-surface / --sky-theme-border)
```

- 零件声明与注册见 `index.js`；
- 框架侧定义见 `src/editor-framework-core/part-registry.js`（part / part tree / 嵌套 children）；
- 主题清单（唯一真源）见 `src/editor-framework-core/theme-registry.js`：
  - attribute: `sky-editor`（保持原值，现有 CSS 属性选择器零迁移）
  - namespace: `sky-editor-theme`
  - accent: `sky-editor`（复用 Theme accent 层）
  - variables: `--sky-theme-surface` / `--sky-theme-border`（light/dark 两套）
  - shells: `['sky-editor']`（已注册外壳）
  - parts: `['sky-window-shell', 'sky-menu-bar', 'sky-surface-tokens']`（零件树根）

## 现状

- sky-editor 的专属视觉差异**无独立 CSS 文件**：样式散落在业务组件中，
  通过 `html[data-ui-theme='sky-editor']` 属性选择器限定作用域，注册表迁移后零改动即生效；
- 零件树已完成**声明与注册**（index.js），组件物理文件暂未搬迁（避免破坏编译），
  迁移步骤见 `components/README.md`。

## 铁律

- 差异化逻辑必须限定 `html.sky-editor-theme` 或 `html[data-ui-theme='sky-editor']` 作用域，严禁影响其它主题；
- 新增 sky-editor 专属组件时放入 `components/`，并在 `index.js` 的零件树中声明后挂载；
- 新增主题 / 注册表改动只动 `editor-framework-core`，业务代码零改动（框架铁律）。
*（内容由AI生成，仅供参考）*
