# 双主题呈现适配（Theme Surface Adapter）

> 适用范围：SKYEditor 对 TurboWarp/scratch-gui 的所有新增功能
> 代码位置：`src/editor-framework-core/theme-adapter.js`、`src/editor-framework-core/feature-surfaces.js`、`src/components/tw-themed-window/`
> 本文是**接入契约**：新功能只要按第 3 节三步走，两个主题自动适配，无需再写主题判断。

---

## 1. 目标与铁律

1. **TurboWarp 主题 = 官方原样**。SKYEditor 的一切视觉（Win11 窗口、竖向标签、SKY 圆角皮肤、自绘滚动条、SKY 右键菜单）在 TW 主题下必须消失，换成官方对应形态。
2. **同一功能只写一份内容与交互**，形态差异全部由「surface（呈现策略）」决定，业务组件里禁止出现 `uiTheme === 'sky-editor'` 之类长相判断。
3. **新增功能必须登记**，登记表是唯一事实源，不登记就按官方形态渲染（宁可官方，不可残留 SKY）。
4. **只叠加、不改 TW 底座**：TW 主题的复原通过「作用域覆盖」完成，不修改官方组件源码。

---

## 2. 形态对照表（SKY → TurboWarp 官方）

| 元素 | SKYEditor 主题 | TurboWarp 主题（官方对应） | 落地位置 |
| --- | --- | --- | --- |
| 独立窗口外壳 | Win11Window（蓝色标题栏、三按钮、可拖拽缩放） | 官方 Modal 弹窗（深灰标题栏、标题居中、右上圆形关闭） | `ThemedWindow` → `TWWindowShell` |
| 竖向标签栏 | 左侧竖排标签 + 分组折叠 | 顶部一行横排标签（可横向滚动） | 设置窗口 / 音乐播放器 CSS |
| 设置界面 | 独立 Win11 设置窗口（左竖栏 + 右内容） | 官方弹窗 + 顶部横标签（内容区走官方控件口径） | `settings-window.jsx` + `settings-menu.css` |
| 音乐播放器 | Win11 窗口 + 左侧 220px 导航栏 | 官方弹窗 + 顶部横标签（导航栏横移） | `music-player.css` |
| 设置入口 | 菜单栏图标 → 直接开窗口 | 官方设置下拉菜单（原样）+ 末尾「设置…」进 SKY 设置弹窗 | `settings-menu.jsx` |
| 输入框 / 确认框 | Win11 圆角对话框 | 官方 prompt / confirm 弹窗 | `dialogSurface` |
| 右键菜单 | SKY 圆角独立项皮肤 | 官方菜单皮肤 | `contextMenuSurface` |
| 滚动条 | 自绘 SKY 滚动条 | 浏览器原生滚动条 | `scrollbarStyle` |
| 浮层 / 提示 | SKY 圆角浮层 | 官方 popover | `popoverSurface` |

---

## 3. 新功能接入三步（唯一流程）

### 第一步：在外壳上包一层 `ThemedWindow`

```jsx
import ThemedWindow from '../tw-themed-window/themed-window.jsx';

<ThemedWindow
    windowId="my-feature"
    title="我的功能"
    defaultWidth={880}
    defaultHeight={560}
    onClose={onClose}
>
    {/* 功能内容，一份，不写主题判断 */}
</ThemedWindow>
```

- SKYEditor 主题 → 自动 Win11 窗口；TW 主题 → 自动官方弹窗。
- **禁止**新功能直接 `import Win11Window`，否则 TW 主题下必然残留 SKY 外壳。

### 第二步：在 `feature-surfaces.js` 登记形态

```js
import {registerFeatureSurface} from './theme-adapter.js';

registerFeatureSurface('my-feature', {
    kind: 'window',                                     // window | dialog | panel
    sky: {shell: 'win11', tabsAxis: 'vertical'},
    tw:  {shell: 'tw-modal', tabsAxis: 'horizontal'}
});
```

- 未写的键自动继承 `DEFAULT_SURFACE`（官方形态）。
- `kind` 决定默认语义：`window` 独立窗口、`dialog` 短暂交互、`panel` 内联面板。
- **加载时机**：`feature-surfaces.js` 由 `src/containers/tw-theme-manager-hoc.jsx` 副作用导入（编辑器启动即登记）。新增登记不必改动该处；但**不要**把登记表 import 进 `theme-adapter.js`（会形成循环依赖）。

### 第三步：组件内取形态（需要按形态改布局时）

```jsx
import {useFeatureSurface} from '../../editor-framework-core/theme-adapter';

const surface = useFeatureSurface('my-feature');
// surface.kind       → 'window' | 'dialog' | 'panel'
// surface.shell      → 'win11' | 'modal'
// surface.chrome     → 'win11' | 'classic'
// surface.tabsAxis   → 'vertical' | 'horizontal'
// surface.tone       → 'sky' | 'classic'
// surface.role       → 'sky' | 'classic'（= 骨架类名前缀）
```

非 React 场景（class 组件 / 工具函数）：

```js
import {getSurface, getFeatureSurface, isWin11Shell, isHorizontalTabs} from '.../theme-adapter';
```

---

## 4. 接口清单

### `theme-adapter.js`（主题级）

| 接口 | 作用 |
| --- | --- |
| `getSurface(uiTheme)` | 取主题完整呈现策略（DEFAULT_SURFACE 为底） |
| `getSurfaceValue(uiTheme, key)` | 取单个语义键 |
| `getWindowKind(uiTheme)` | `'win11'` / `'tw-modal'` |
| `isWin11Shell(uiTheme)` | 是否 Win11 外壳 |
| `isHorizontalTabs(uiTheme)` | 是否横向标签 |
| `registerSurface(themeId, patch)` | 运行时登记/覆盖新主题 |
| `resolveWindowMetrics(props)` | 窗口尺寸与 id 的别名归一 |
| `withThemeSurface(Component)` | HOC：注入 `props.surface` + `props.uiTheme` |

语义键（`Theme` 层）：`windowKind`、`tabsAxis`、`settingsSurface`、`dialogSurface`、`menuSurface`、`contextMenuSurface`、`contentSurface`、`newFeatureShell`、`newFeatureChrome`、`tabStripStyle`、`popoverSurface`、`scrollbarStyle`。

### `theme-adapter.js`（功能级）

| 接口 | 作用 |
| --- | --- |
| `registerFeatureSurface(featureId, config)` | 登记功能在双主题下的形态 |
| `getFeatureSurface(uiTheme, featureId)` | 取功能在某主题下的形态 |
| `getSurfaceClassNames(uiTheme, featureId)` | 生成骨架类名（`sky-surface--window` / `tw-surface--window` 等） |
| `useFeatureSurface(featureId)` | React Hook，组件内直接取形态 |

### `ThemedWindow`（窗口外壳）

props：`title`、`icon`（仅 Win11 外壳使用，TW 官方弹窗无图标位）、`width` / `height`（或兼容旧名 `defaultWidth` / `defaultHeight`）、`windowId` / `id`、`onClose`、`disableMaximize`、`disableResize`、`className`、`children`。
外壳分发由 `getWindowKind(uiTheme)` 决定，业务侧不感知。

---

## 5. CSS 层规范（TW 复原的关键）

### 5.1 全局样式表（如 `settings-menu.css`）

```css
html[data-ui-theme='turbowarp'] .window-tab { /* 官方口径 */ }
```

### 5.2 CSS Modules（如 `music-player.css`，类名会被哈希）

必须用 `:global(...)` 包住属性选择器，类名仍参与模块化：

```css
:global(html[data-ui-theme='turbowarp']) .sidebar { flex-direction: row; }
```

### 5.3 禁止项

- TW 段**不得**引用 SKY 设计令牌（`--sk-*`、`--sky-radius`），一律用官方变量：`$ui-black-transparent`、`$text-primary`、`$text-primary-transparent`、`$looks-secondary`、`$ui-modal-foreground`、`$input-background`、`$ui-primary`。
- TW 段**不得**保留 SKY 特征：`border-radius` 大圆角、`box-shadow` 光环、`transform: translateY` 位移动效、左侧 3px 竖指示条。
- 新增 SKY 样式必须写在 `html[data-ui-theme='sky-editor']` 作用域内，禁止裸写（否则 TW 主题被污染）。

---

## 6. 当前适配状态

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 设置窗口 | 已适配 | TW 下官方弹窗外壳 + 顶部横标签 + 内容区官方控件口径 |
| 音乐播放器 | 已适配 | 外壳官方弹窗；左侧导航栏横移为顶栏、选中态改强调色文字 |
| 设置菜单入口 | 已适配 | TW 保留官方下拉菜单，末尾追加「设置…」进 SKY 设置弹窗 |
| SKY Agent 窗口 | 已适配 | 迁移至 `ThemedWindow` |
| 项目资源窗口 | 已适配 | 迁移至 `ThemedWindow` |
| 打包/解包器窗口 | 已适配 | 迁移至 `ThemedWindow`；`bringToFront` 在 TW 下为 no-op |
| 导出窗口 | 已使用 `ThemedWindow` | 需实机确认 TW 观感 |
| 舞台/移动端标签栏 | 已隔离 | TW 下由 `uiTheme === 'sky-editor' && tabLayout === 'vertical'` 判定，自动回横排 |
| addons 窗口（debugger / find-bar / media-recorder） | 待接入 | 走 `src/addons/libraries/common/sky-win11-window.js`，需在该库内按 `data-ui-theme` 分支到官方 DOM 结构 |
| bilup 主题分支（`src/bilup-ui/**`） | 不适用 | 属第三方主题独立实现，不在双主题契约内 |

---

## 7. 验收清单

1. 切到 TurboWarp 主题，逐个打开：设置、音乐播放器、SKY Agent、打包器、导出窗口 → **全部为官方弹窗**，无蓝色标题栏、无三按钮。
2. 设置弹窗内标签为**顶部横排**，内容区无大圆角卡片、无光环阴影、无位移动效。
3. 音乐播放器弹窗内导航为**顶部横排**，无左侧 220px 竖栏、无左侧竖指示条。
4. 编辑器主界面标签栏为**官方顶部横排**，无侧栏搜索/AI 图标。
5. 切回 SKYEditor 主题 → 上述全部恢复 SKY 形态，功能无缺失。
6. 控制台无报错，webpack `--mode development` 返回 0。

---

## 8. 变更记录

- 2026-11-21：建立 `theme-adapter` 语义键扩展（`newFeatureShell` / `tabStripStyle` / `popoverSurface` / `scrollbarStyle`）。
- 2026-11-22：新增功能级登记表 `feature-surfaces.js` 与 `useFeatureSurface`；设置窗口与音乐播放器完成 TW 横标签改造；AI 窗口、项目资源窗口、打包器窗口迁移至 `ThemedWindow`；TW 设置内容区官方化样式落地；webpack 开发编译通过（RC 0）。
- 2026-11-22（收尾）：登记表由 `tw-theme-manager-hoc.jsx` 副作用导入接入，结束「登记表无引用」状态；本文档建立并核对接口签名与 `DEFAULT_SURFACE` 实际键名；webpack 开发编译通过（RC 0）。
