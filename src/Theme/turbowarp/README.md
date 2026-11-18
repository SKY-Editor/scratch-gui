# turbowarp（经典主题 · 隔离基准）

本目录为 TurboWarp 原始 UI 隔离基准（零回归铁律对象），同时是**已框架化的完整主题**。

## 框架接入

- 策略：与 TW 上游一致的文件一律**不复制**，直接引用原路径（src/lib/themes 等）；
- 本目录仅登记 TW 主题的差异声明：**零件树（index.js）**——视觉零差异；
- 任何主题差异包不得修改此基准所依赖的公共文件。

## 零件树结构

```
turbowarp
├── tw-window-shell (component: 原生 Modal 窗口外壳)
│     （ThemedWindow 在非 SE 主题下自动返回原生 Modal：
│      深灰居中标题 + 圆形关闭 + 圆角矩形，即「图1」TW 风格；
│      TW 主题窗口内容由业务侧原生渲染，无专属窗口零件）
└── （无 tokens 零件：基准主题不覆盖默认语义变量）
```

- 零件声明与注册见 `index.js`；
- 外壳注册见 `src/editor-framework-core/shell-registry.js`（id: `turbowarp`）；
- 主题清单（唯一真源）见 `src/editor-framework-core/theme-registry.js`：
  - attribute: `turbowarp`（现有 CSS 属性选择器零迁移）
  - namespace: `tw-theme`
  - shells: `['turbowarp']`（已注册外壳）
  - parts: `['tw-window-shell']`（零件树根）

## 铁律

- 差异化逻辑严禁影响 TW 基准（零回归）；
- 公共文件（modal.css 等）不允许因主题差异被修改；
- 作为最底层兼容层：其它主题外壳装配失败时降级到本主题。
*（内容由AI生成，仅供参考）*
