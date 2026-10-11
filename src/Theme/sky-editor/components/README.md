---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_5e310e1ac58811f1820a525400638852
    ReservedCode1: +oOgDywi7YaYWDNwnT5bN0rxv5tDCgHJWprfQxeDuockRg1o0r/bzqtN5OgdiIVrSiElCDPeJqVlBTomM5oC3Hs6xiNqQO3CVL2B9hErMb8sdWt+fqdtAS//PdYOU+5CZl7qCxeuczE+a1hFAyVkYk7BiOG9BRcBp3rtYsbOUgFhi+w3AibPdl3ycwA=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_5e310e1ac58811f1820a525400638852
    ReservedCode2: +oOgDywi7YaYWDNwnT5bN0rxv5tDCgHJWprfQxeDuockRg1o0r/bzqtN5OgdiIVrSiElCDPeJqVlBTomM5oC3Hs6xiNqQO3CVL2B9hErMb8sdWt+fqdtAS//PdYOU+5CZl7qCxeuczE+a1hFAyVkYk7BiOG9BRcBp3rtYsbOUgFhi+w3AibPdl3ycwA=
---

# sky-editor / components —— 单独组件目录

本目录是 SKYEditor 主题「把所有涉及内容做成单独组件」的**归属地**。

## 目标结构（最终形态）

```
src/Theme/sky-editor/
├── index.js          # 主题差异包统一出口（零件树声明 + 注册）
├── components/       # ← 本目录：SKYEditor 全部自有单独组件
│   ├── win11-window/        # 窗口外壳（现位于 src/components/tw-win11-window/，迁移目标）
│   ├── settings-window/     # 设置窗口内容（迁移目标）
│   ├── addons-window/       # Addons 窗口内容（迁移目标）
│   ├── custom-procedures-window/
│   ├── confirm-dialog/
│   ├── prompt/
│   ├── username-window/
│   ├── restore-point-window/
│   ├── extension-library-windowed/  # 扩展库窗口化（待抽）
│   └── menu-bar-sky/               # 菜单栏 SKY 差异化（待抽）
└── README.md
```

## 当前阶段（已建立骨架）

- `index.js` 已声明完整零件树（嵌套式主题的元素/原件），子零件 `load` 指向现有业务组件路径；
- 组件**物理文件暂未搬迁**（业务组件仍由原路径 import，避免破坏编译），
  以 `load` 延迟引用代替，零件声明已生效，`getThemePartTree('sky-editor')` 可展开完整嵌套树。

## 迁移步骤（把内容做成真正单独组件）

对每个窗口零件（settings-window / addons-window / ...）：

1. 在 `components/` 下新建同名目录，把业务组件文件移入；
2. 把该组件里 `uiTheme === 'sky-editor'` 的差异化逻辑留在组件内部（或按插槽拆分），
   窗口外壳统一引用 `components/win11-window/` 下的 Win11Window；
3. 更新 `index.js` 对应零件的 `load` 指向新路径；
4. 全局 grep 旧 import 路径并批量替换为 `../../Theme/sky-editor/components/xxx`；
5. 跑 webpack 验证编译，确认 TW 主题零回归（非 sky 主题仍走原 Modal）。

## 铁律

- 所有组件样式必须限定 `html.sky-editor-theme` 或 `html[data-ui-theme='sky-editor']` 作用域；
- 文本不映射（零件只做视觉，文案由业务组件负责）；
- 迁移一次一个窗口，每步跑通编译再继续，严禁批量搬移。
*（内容由AI生成，仅供参考）*
