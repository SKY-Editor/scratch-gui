---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_2ac32cdbe24211f18c5752540024e231
    ReservedCode1: ZQIgEn45HNl4/7is/fx5kYVtwzzIoqrrl2V4BxE49xefgz1NCmB9ncZo94ydctYpGWy1NgzU3BLE2GDYMdKf6OMploR/5wO4pmGHwean6jIEiqYb8/A2KHQj/MEmwGY8wFhLAPRRhft/seb3eaovlms579vrsmhsThnqFDRgQHNWLQU5XqocMAfub5I=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_2ac32cdbe24211f18c5752540024e231
    ReservedCode2: ZQIgEn45HNl4/7is/fx5kYVtwzzIoqrrl2V4BxE49xefgz1NCmB9ncZo94ydctYpGWy1NgzU3BLE2GDYMdKf6OMploR/5wO4pmGHwean6jIEiqYb8/A2KHQj/MEmwGY8wFhLAPRRhft/seb3eaovlms579vrsmhsThnqFDRgQHNWLQU5XqocMAfub5I=
---



# SKYEditor 滚动条组件规范

> 状态：**强制规范**（自 v0.1 起）
> 唯一实现：`src/components/sky-scrollbar/`
> 适用范围：SKYEditor 全部界面（工作区、菜单、设置窗口、弹窗、插件面板、调试器……）

---

## 1. 一句话结论

**项目内所有滚动条，只准使用本规范提供的三个入口之一，禁止任何组件自行编写 `::-webkit-scrollbar` 外观样式。**

| 层级 | 入口 | 适用场景 |
| --- | --- | --- |
| L0 | 全局皮肤（自动生效） | 任意原生可滚动容器，无需改 JSX |
| L1 | `<SkyScrollContainer>` | **推荐默认**。需要「按下变粗 + 过渡动画」的区块滚动 |
| L2 | `<SkyScrollbar>` | 已有滚动容器（如第三方组件、无法包裹 DOM），只挂一条滚动条 |

三者共用**同一组 CSS 变量**，视觉 100% 一致，不得各自调参。

---

## 2. 设计规格（视觉与交互唯一事实来源）

### 2.1 尺寸

| 项目 | 值 | 变量 |
| --- | --- | --- |
| 轨道宽度 | 10px | `--sky-scrollbar-track-width` |
| thumb 常态宽度 | 4px | `--sky-scrollbar-thumb-width` |
| thumb 按下宽度 | 8px | `--sky-scrollbar-thumb-width-active` |
| thumb 与轨道左右留白 | 3px | `--sky-scrollbar-gap` |
| thumb 与轨道上下留白 | 6px | `--sky-scrollbar-gap-y` |
| 圆角 | 999px（全圆） | `--sky-scrollbar-radius` |
| thumb 最小高度 | 32px（全局皮肤与组件态统一） | `--sky-scrollbar-thumb-min`；组件常量 `MIN_THUMB_HEIGHT` |
| 滚动条距容器右边缘 | 6px | `--sky-scrollbar-inset-x` |
| 滚动条距容器上下边缘 | 6px | `--sky-scrollbar-inset-y` |
| 动画时长 | 180ms ease | `--sky-scrollbar-transition` |

### 2.2 颜色

深色 / 中性容器（默认）：

| 状态 | 颜色 | 变量 |
| --- | --- | --- |
| 常态 | `rgba(127, 127, 127, 0.38)` | `--sky-scrollbar-thumb-color` |
| 鼠标悬停 | `rgba(127, 127, 127, 0.58)` | `--sky-scrollbar-thumb-color-hover` |
| 按下 / 拖动 | `rgba(127, 127, 127, 0.74)` | `--sky-scrollbar-thumb-color-active` |

浅色容器（白底面板，如设置窗口侧栏）：

| 状态 | 颜色 | 变量 |
| --- | --- | --- |
| 常态 | `rgba(0, 0, 0, 0.18)` | `--sky-scrollbar-thumb-color-light` |
| 鼠标悬停 | `rgba(0, 0, 0, 0.32)` | `--sky-scrollbar-thumb-color-light-hover` |
| 按下 / 拖动 | `rgba(0, 0, 0, 0.42)` | `--sky-scrollbar-thumb-color-light-active` |

轨道始终**透明**，不画底色，避免与面板背景撞色。

### 2.3 交互行为（必须逐条对齐）

| 状态 | 行为 | 说明 |
| --- | --- | --- |
| 常态 | 4px 细线，半透明 | —— |
| **鼠标碰到滚动条** | **只加深颜色，宽度不变** | 不变粗是为了避免布局抖动；这是硬性规定 |
| 鼠标离开 | 颜色回到常态 | 180ms 过渡 |
| **按下 / 拖动** | **变粗到 8px + 更深** | 视口内 thumb 变粗，不挤压内容 |
| 松开 | 180ms 内回到 4px 常态 | 过渡曲线 `ease` |
| 内容不溢出 | 滚动条整体淡出（`opacity: 0`，不占点击） | 组件态由 `visible` 控制 |
| 细线命中 | 视觉 4px，实际命中区左右各外扩 3px（共 10px） | 提升可点性，视觉不变 |

#### 2.3.1 L0 全局皮肤（原生）的能力边界 —— 实测结论

原生 `::-webkit-scrollbar` 不是完整 CSS 环境，以下能力它**做不到**，只有换成 L1/L2 组件态才能获得。
（下表为 Chromium 实测结果，不是未实现，是浏览器不支持）

| 能力 | L0 全局皮肤 | L1 / L2 组件态 |
| --- | --- | --- |
| 常态 4px 半透明细线 | ✅ 已对齐 | ✅ |
| 悬停只加深颜色、宽度不变 | ✅ 已对齐 | ✅ |
| 轨道透明、thumb 上下留白不顶边 | ✅ 已对齐（透明 border 裁切） | ✅ |
| thumb 最短 32px | ✅ 已对齐（`--sky-scrollbar-thumb-min`） | ✅ |
| 浅色容器变体（`data-sky-scrollbar="light"`） | ✅ 已对齐 | ✅ |
| **按下 / 拖动变粗到 8px** | ❌ Chromium 不在滚动条伪元素上匹配 `:active` | ✅ |
| **180ms 过渡动画** | ❌ 伪元素不支持 `transition` | ✅ |
| **相对容器右边缘内缩 6px** | ❌ 原生滚动条必然贴边 | ✅ |
| 不占布局宽度 | ❌ 固定占 10px 宽 | ✅ 悬浮，零占位 |

> 结论：L0 与组件态在**静态视觉上完全一致**（粗细、颜色、圆角、留白、最短长度），
> 差异只存在于**拖动过程的动效**与**是否占位**。若要连这两项也对齐同一容器，
> 该容器必须升级为 L1/L2，不能靠改 CSS 达成。

### 2.4 间距规则

- 滚动条相对容器**右边缘内缩 6px**（`--sky-scrollbar-inset-x`），不与面板边框、内容贴边。
- thumb 在 10px 轨道内再左右留白 3px，最终视觉上距容器右边缘约 8px。
- **内容与滚动条必须分离**：`<SkyScrollContainer>` 默认 `contentGap={20}`，即滚动区右内侧留 20px padding，内容右边界与 thumb 左边缘保持 **7px** 视觉间距。L0/L2 场景由容器自身的 `padding-right: 20px` 实现同样留白（不要给滚动区写 `box-sizing: content-box`，否则 padding 会把容器撑宽、内容反而更靠近滚动条）。
- ⚠️ **禁止给"本来不滚动"的容器补 padding**：内容不溢出时原生滚动条根本不出现，此时任何 `padding-right` 补偿都会变成一条凭空多出来的白边（已发生过一次全站事故并回滚）。只有确认该容器**常态就会溢出滚动**时，才给它加 `padding-right`。
- **纵向同样留白**：滚动条首尾各内缩 6px（`--sky-scrollbar-inset-y` / `--sky-scrollbar-gap-y`），thumb 顶端不贴容器上沿、底端不贴下沿。上下留白由 thumb 的**透明 border 裁切**实现（`border-width: 6px 3px` + `background-clip: padding-box`），不改变轨道占位，也不改变容器布局。
- 需要更贴边 / 更内缩时，**改 `contentGap` / `insetX` / `insetY` 属性或该容器的 CSS 变量**，不要改全局默认值。

---

## 3. 用法

### 3.1 L0：全局皮肤（默认继承）

全项目只有一处引入，位置固定在 `src/components/gui/gui.css`：

```css
@import "../../css/units.css";
@import "../../css/colors.css";
@import "../../css/z-index.css";
@import "../sky-scrollbar/sky-scrollbar-global.css";
```

引入后，**任何** `overflow: auto/scroll` 的元素自动获得统一外观，不需要写任何代码。

被 L1/L2 自绘条接管的容器由组件自动打 `data-sky-sb-managed` 标记，原生 thumb 保持占位但隐形（零布局位移），避免双条同框；组件卸载时自动摘标恢复 L0 外观。

按容器底色切换/关闭皮肤（在容器 DOM 上加属性即可）：

```jsx
{/* 浅色面板：滚动条转为黑色半透明 */}
<div className={styles.panel} data-sky-scrollbar="light">…</div>

{/* 需要彻底隐藏滚动条：舞台、画布、代码区等 */}
<div className={styles.canvas} data-sky-scrollbar="none">…</div>
```

> 为什么用 `data-` 属性而不是类名：本项目 `css-loader` 开启了 `modules: true`，所有 `.css` 里的类名都会被哈希化，跨组件类名无法命中；因此全局选择器一律使用**元素 / 通配 / 属性选择器**。

### 3.2 L1：`SkyScrollContainer`（推荐默认）

开箱即用的滚动区：自带承载层、隐藏原生滚动条、挂载统一滚动条。

```jsx
import {SkyScrollContainer} from '../../components/sky-scrollbar/sky-scrollbar';

<SkyScrollContainer
    className={styles.myContent}
    wrapClassName={styles.myWrap}
    light
>
    {/* 长内容 */}
</SkyScrollContainer>
```

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `children` | node | — | 滚动内容 |
| `className` | string | — | 加到**滚动区**（`.sky-scroll-view`）上，控制 padding、布局 |
| `wrapClassName` | string | — | 加到**承载层**（`.sky-scroll-wrap`，`position: relative`）上，控制外层尺寸 |
| `contentGap` | number | `20` | **内容与滚动条之间的留白**（px），实现为滚动区 `padding-right`，用内联样式写入，不会被业务 CSS 的 `padding` 简写覆盖 |
| `contentStyle` | object | — | 滚动区内联样式 |
| `style` | object | — | 承载层内联样式 |
| `light` | bool | `false` | 浅色面板配色 |
| `insetX` | number | `6` | 滚动条距右边缘（px） |
| `insetY` | number | `6` | 滚动条距上下边缘（px） |
| `minThumbHeight` | number | `32` | thumb 最小高度（px） |

注意：承载层必须是**有确定高度**的父级环境（flex 子项或固定高度），否则无法产生滚动。组件内部已设置 `min-height: 0`，可直接作为 flex 子项使用。

### 3.3 L2：`SkyScrollbar`（接管已有容器）

容器已经是别人的（第三方库、不能包一层 DOM）时，只挂滚动条：

```jsx
import {SkyScrollbar} from '../../components/sky-scrollbar/sky-scrollbar';

// target 必须是「真正产生滚动」的那个元素
<div ref={this.handleRef} className={styles.scrollArea} data-sky-scrollbar="none">
    {content}
</div>
<SkyScrollbar target={this.state.el} light insetX={6} minThumbHeight={32} />
```

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `target` | HTMLElement | — | **必填**，被接管的滚动元素 |
| `light` | bool | `false` | 浅色配色 |
| `insetX` / `insetY` | number | 变量值 | 同 L1 |
| `minThumbHeight` | number | `32` | thumb 最小高度 |
| `className` / `style` | — | — | 滚动条本体样式覆盖 |

`SkyScrollbar` 使用 `ResizeObserver` + `MutationObserver` + `requestAnimationFrame` 合并同步，内容变化、容器缩放都会自动重算，无需手动刷新。

---

## 4. 禁止事项（Review 必查项）

1. ❌ 任何组件、插件、页面**自行编写 `::-webkit-scrollbar` 外观样式**（颜色、宽度、圆角、轨道背景）。
2. ❌ 使用 `scrollbar-width` / `scrollbar-color` / `-ms-overflow-style` 做外观定制。
3. ❌ 在 `@supports not selector(::-webkit-scrollbar)` 里写滚动条规则 —— postcss-loader 会解析失败导致**全站白屏**。
4. ❌ 修改本规范的默认尺寸 / 颜色常量来"适配某个页面"；要适配就改该容器的 `insetX` 或在容器上加 `data-sky-scrollbar`。
5. ❌ hover 时改变宽度（除按下态外）。hover 只允许改颜色。
6. ❌ 重复引入 `sky-scrollbar-global.css`（只允许 `gui.css` 一处 `@import`）。
7. ❌ 让内容（列表项背景、高亮块、分类行、分隔线）伸进滚动条所在区域并与之相贴 —— 必须留出 `contentGap` 的右内边距。
8. ❌ 给滚动区写 `box-sizing: content-box` 后靠 padding 做留白 —— 会把滚动区撑宽，导致内容反而更靠近滚动条。
9. ❌ 用 `background-clip: content-box` 做 thumb 留白 —— Chromium 的滚动条伪元素**只认 `padding-box`**，`content-box` 会被直接丢弃，结果 thumb 铺满 10px 轨道并上下顶边（已像素实测验证）。
10. ❌ 写 `border: 2px 3px solid transparent` 这类二维简写 —— 必须拆成 `border-style` + `border-color` + `border-width: 6px 3px`，否则整条声明失效。
11. ❌ 在独立 UMD 脚本产物里继续用旧的 8px / content-box 方案 —— 它不经过 `gui.css`，不继承全局皮肤，必须手工对齐同一套几何（详见 5.3）。

**唯一允许保留的原生滚动条规则**：纯隐藏类，即 `display: none` / `width: 0`，用于 Blockly 工具箱、弹出层等必须隐藏滚动条的场景。推荐改写为 `data-sky-scrollbar="none"`。

---

## 5. 迁移指南（存量代码改造）

### 5.1 判断走哪一层

```
容器可滚动？
├─ 是我自己写的 JSX 结构 → 用 <SkyScrollContainer> 包住内容（L1）
├─ 是第三方 / 不便改结构 → 给容器加 data-sky-scrollbar="none"，旁边挂 <SkyScrollbar target>（L2）
└─ 只是想统一外观、不需要按下变粗 → 什么都不做，全局皮肤已生效（L0）
```

### 5.2 改造步骤

1. 搜索存量规则：`grep -rn "::-webkit-scrollbar" src/`
2. 逐块判断：
   - 外观美化类（`background`、`border-radius`、`width: 8px` 之类）→ **整块删除**
   - 纯隐藏类（`display: none` / `width: 0`）→ 保留，或换成 `data-sky-scrollbar="none"`
3. 检查容器底色，浅色面板加 `light` 或 `data-sky-scrollbar="light"`。
4. 删除后核对花括号配平；回归验证滚动、拖拽、悬停、按下四个状态。

### 5.3 已完成迁移

| 范围 | 处理方式 |
| --- | --- |
| 设置窗口侧栏（`Theme/sky-editor/components/settings-window`） | 旧自绘组件 `sidebar-scrollbar.jsx` → `<SkyScrollContainer light contentGap={20}>`，旧组件已删除 |
| 30 个文件的 `::-webkit-scrollbar` 规则（共 105 条） | 批量清理美化类外观规则，保留纯隐藏规则 |
| 插件面板（sprite-folders、variable-manager、editor-compact、dev-inspector、simple-project-analyzer、tw-comment-markdown-editor 等） | 外观规则已删除，统一继承全局皮肤 |
| 窗口系统（`window-manager.js` 的 `.addon-window-content` 与内联 style） | 删除 `scrollbar-width: thin` / `scrollbar-color`，统一继承全局皮肤 |
| 全站原生滚动条**纵向留白** | 全局皮肤 thumb 增加上下 6px 裁切；实测 thumb 顶端距容器上沿 5~6px，首尾不再顶边 |
| SKY Agent 聊天窗（UMD `static/skyeditor-agent.js`，源 `skyeditor-agent/src/ui/ai-window.css`） | 旧 8px / content-box 方案 → 10px 轨道 + 4px 细线 + 上下 6px / 左右 3px 留白 + `padding-box`；两套重复的暗色规则合并为一套（`#64645c` / hover `#767670`）；删除 `scrollbar-width: thin` 与 `scrollbar-color` |

**仍然例外**：`skyeditor-agent/` 是独立 UMD 包（webpack 单独构建），CSS 内联打包进 JS，不经过 `gui.css` 的 `@import`。改动流程必须是：改源 `skyeditor-agent/src/ui/ai-window.css` → `npm run build` → 把 `dist/skyeditor-agent.js` 同步到 `scratch-gui/static/`（`build/` 与 `build/static/` 一并同步）。**直接改 `static/` 下的产物会在下次构建时被覆盖。**

---

## 6. 验收清单

改动滚动条相关代码后，必须逐项确认：

- [ ] 常态是 4px 细线，颜色半透明，轨道透明
- [ ] 鼠标移到滚动条上：**变深但不变粗**
- [ ] 按下 / 拖动：变粗到 8px 且颜色更深
- [ ] 松开：180ms 内恢复 4px
- [ ] 滚动条距容器右边缘 6px，内容不被压住
- [ ] **滚动条首尾不顶边**：thumb 顶端 / 底端与容器上下沿各留约 6px
- [ ] 独立 UMD 脚本（SKY Agent 聊天窗）与主应用的粗细、颜色、留白完全一致
- [ ] **内容右边界与滚动条有明显留白**（按钮/高亮块/分类行都不与滚动条相贴，`contentGap` 默认 20 时视觉间距约 7px）
- [ ] 浅色面板用的是黑色半透明（`light`），不是中性灰
- [ ] 内容不溢出时滚动条不显示
- [ ] 拖到底部/右侧能准确到达终点（thumb 高度换算正确）
- [ ] 无新增 `::-webkit-scrollbar` 规则（`grep` 复核）
- [ ] 无 `@supports not selector(::-webkit-scrollbar)`（会导致白屏）

---

## 7. 文件清单

| 文件 | 职责 |
| --- | --- |
| `src/components/sky-scrollbar/sky-scrollbar-global.css` | 全局皮肤 + **CSS 变量唯一声明处** |
| `src/components/sky-scrollbar/sky-scrollbar.css` | React 组件样式（`.sky-scroll-wrap` / `.sky-scroll-view` / `.sky-scrollbar` / `.sky-scrollbar-thumb`） |
| `src/components/sky-scrollbar/sky-scrollbar.jsx` | `SkyScrollbar` / `SkyScrollContainer` 实现 |
| `skyeditor-agent/src/ui/ai-window.css` | 独立 UMD 包（SKY Agent 聊天窗）滚动条样式，须手工对齐本文档几何；改后需重新构建并同步 dist |
| `src/components/gui/gui.css` | 全局皮肤唯一引入点 |
| `docs/SKY-SCROLLBAR-SPEC.md` | 本文档 |

---

_修改本规范需同步更新：两个 CSS 文件、`sky-scrollbar.jsx` 默认值、本文档表格。四者不一致视为缺陷。_
*（内容由AI生成，仅供参考）*
*（内容由AI生成，仅供参考）*
