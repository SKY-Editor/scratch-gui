---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_7c7d222ea93411f1bf99525400e6dd8f
    ReservedCode1: Y0Rlr1SRhZ37J1lbrARykHgnM/T6WeT+Sw3lhKXmI0QIKD0SqwO0Et+9c5Oxzdv6dlqkW/ax4oMhCxJHZDMfCOAPg/GIQ6r1N6eD8SImmWblrb6UKYFcCG3g8/81LrSU8MOIWVu4VnTBQgEaICfKC/oZHbaKVZAIlyLq8XI3zyf35CdCbyVdCFD/wLo=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_7c7d222ea93411f1bf99525400e6dd8f
    ReservedCode2: Y0Rlr1SRhZ37J1lbrARykHgnM/T6WeT+Sw3lhKXmI0QIKD0SqwO0Et+9c5Oxzdv6dlqkW/ax4oMhCxJHZDMfCOAPg/GIQ6r1N6eD8SImmWblrb6UKYFcCG3g8/81LrSU8MOIWVu4VnTBQgEaICfKC/oZHbaKVZAIlyLq8XI3zyf35CdCbyVdCFD/wLo=
---

# SKY Editor 竖向标签栏（Vertical Tab Bar）

本文档说明 SKY Editor 竖向标签栏的实现原理、搜索窗口及白条问题的成因与修复，以及如何**只写一个标签、同时适配竖向与横向两种标签栏**。

---

## 1. 背景

SKY Editor 在 `uiTheme === 'sky-editor' && tabLayout === 'vertical'` 时，把顶部横向标签栏改造成**左侧竖向侧边栏**：

- 竖向时挂载一个 `styles.tabsSkySidebar`（`.tabs-sky-sidebar`）容器，内部用原生 `react-tabs` 的 `TabList` 承载标签；
- 标签栏本体样式由 `.tab-list-sky-sidebar` 提供（固定 52px 宽、竖向 flex 列、图标 mask 渲染、明暗主题跟随）；
- 编辑器内容区被侧边栏自然挤到右侧。

与此配套的两个插件：

| 插件 | 作用 | 竖向布局下的表现 |
|------|------|------------------|
| `find-bar` | 注入全局搜索栏 `.sa-find-bar` | 独立成搜索窗口，点击「搜索」标签打开 |
| `variable-manager` | 注入变量面板 | 改为原生「变量」标签 + 第 4 个 TabPanel |

---

## 2. 涉及文件

| 文件 | 职责 |
|------|------|
| `src/components/gui/gui.jsx` | 竖向/横向标签栏渲染、横竖适配模板（`renderSkyActionTab` / `renderSkyContentTab`）、搜索窗口开关 |
| `src/components/gui/sky-search-window.jsx` | 独立搜索窗口：把 `.sa-find-bar` 移入/移出窗口、下拉菜单定位与还原 |
| `src/components/gui/gui.css` | 侧边栏布局、标签样式、搜索栏隐藏兜底、`.sky-find-host` 宿主样式、react-tabs 焦点白条压制 |
| `src/addons/addons/find-bar/userscript.js` | find-bar 插件：搜索栏注入点（竖向改为挂到隐藏宿主） |

---

## 3. 竖向标签栏实现

### 3.1 判断条件

```jsx
const isSkyVertical = uiTheme === 'sky-editor' && tabLayout === 'vertical';
```

`tabLayout` 来自 redux state（`state.scratchGui.tabLayout`），取值 `'horizontal'` / `'vertical'` / `'fullscreen'`。

### 3.2 Tab 与 TabPanel 渲染

竖向时 `TabList` 内渲染：代码标签（Code）→ 造型标签（Costumes）→ 声音标签（Sounds）→ **变量标签**（原生产物，见 3.3）→ **搜索按钮**（无面板的动作标签，见 3.4）。

每个面板各对应一个 `TabPanel`。**变量标签必须有第 4 个 TabPanel**，否则点击后 react-tabs 全部面板隐藏导致白屏（历史坑，已修复）。

### 3.3 变量标签（内容型标签）

变量面板由 `variable-manager` 插件提供，插件会自行向标签栏注入一个伪标签并挂载面板。为避免样式不统一与白屏，竖向布局下改为：

- `gui.jsx` 渲染一个原生 `<Tab>`（类名复用 `tabClassNames.tab`），第 4 个 `TabPanel` 加自定义类 `sky-variable-panel`；
- `gui.css` 用 `:global()` 隐藏插件自带的同名 DOM（`.addons-display-none-variable-manager`、`#react-tabs-sa-variable-manager`）；
- 插件把面板注入目标改为优先 `querySelector('[class*=sky-variable-panel]')`。

### 3.4 搜索按钮（动作标签，打开独立窗口）

搜索功能由 `find-bar` 插件提供，其全局唯一搜索栏 `.sa-find-bar` 平时藏在隐藏宿主中（见第 4 节）。竖向标签栏上的「搜索」是一个 `<button>`（复用 `tabClassNames.tab` 样式），点击后：

1. `handleSkySidebarSearch()` → `setSkySearchOpen(true)`；
2. 渲染 `SkySearchWindow`（基于 `Win11Window` 的独立窗口，`disableResize`、`disableMaximize`、默认 500×380，自带 0.18s 缩放入场动画）；
3. 窗口 `useEffect` 打开时：`document.querySelector('.sa-find-bar')` → 移入窗口 `bodyRef`，加 `sa-find-bar-in-sky-window` 标记类，强制 `focus()` 输入框；
4. 动画结束后接连派发 `sky-search-window-open` 事件（650ms、1200ms 两档兜底），由 find-bar 插件**不依赖焦点**强制展开下拉菜单；
5. 关闭窗口时：下拉菜单先还原回输入框容器并清空内联定位，搜索栏再移回隐藏宿主原位置（保持 before/after 兄弟关系，避免插入位置错乱）。

`Ctrl+F` 也能打开搜索窗口：find-bar 捕获 `Ctrl+F`，判断搜索栏不在窗口内时派发 `sky-open-search-window` 事件，gui 组件监听并打开窗口。

---

## 4. 白条问题：成因与修复

### 4.1 问题现象

竖向标签栏下，按住/点击「搜索」标签按钮的瞬间，**当前选中标签（蓝色高亮块）底边会闪现一条横贯侧边栏宽度的细白色横条**，松开/失焦后消失；深色主题下格外刺眼。

### 4.2 第一层根因：搜索栏被注入侧边栏（已根治）

find-bar 插件原本把全局搜索栏 `.sa-find-bar` 注入 `ul[class*=gui_tab-list_]`（标签栏 TabList 容器）。竖向布局下该容器就是侧边栏本身：

1. 搜索栏被挂到侧边栏末尾，平时靠 CSS `display: none` 隐藏；
2. 打开/关闭独立搜索窗口时，搜索栏被移进窗口又移回，与插件 `tabChanged()` 对 `hidden` 的控制产生竞争；
3. 竞争窗口期内白色输入条在侧边栏底部露出——第一版白条的来源。

**第一层修复（已生效）**：`find-bar/userscript.js` 新增 `getFindBarHost(root)`——竖向布局返回编辑器根部的隐藏宿主 `.sky-find-host`（`position: fixed; left: -9999px; 0 尺寸`），搜索栏不再进入侧边栏 DOM；`SkySearchWindow` 打开时从宿主取、关闭时还原。宿主化后实测 `.sa-find-bar` 始终不存在于侧边栏内部。

### 4.3 第二层根因（残留白条的真实来源）：react-tabs 焦点指示条

宿主化之后用户仍报告白条残留。浏览器自动化在真实深色环境按住搜索按钮，逐元素做计算样式与伪元素扫描，证据链闭合：

- 白条归属 = 侧边栏内任意处于 **`:focus`** 态的 tab 的 **`::after` 伪元素**；
- 该伪元素由 react-tabs 组件内置样式定义（编译产物）：

```css
.react-tabs__tab:focus::after {
  content: "";
  position: absolute;
  height: 5px;
  left: -4px;
  right: -4px;
  bottom: -5px;
  background: rgb(255, 255, 255);   /* 写死纯白，深浅主题下都是纯白 */
}
```

- 机制：mousedown 预聚焦让标签进入焦点态，伪元素即在标签底边下方渲染 5px 纯白横条（横贯侧边栏）；松开/焦点迁移后失焦，白条消失。
- 为什么原有的 `.tab.is-selected:focus:after { display: none }` 压不住：它只在**选中态**生效，而 react-tabs 的 `:focus::after` 对所有 tab 的 `:focus` 无差别生效，真实点击焦点场景下依旧会渲染。

### 4.4 最终修复（本次根治，已验证）

在 `gui.css` 竖向作用域内**无条件禁用 tab 的 `::after` 伪元素**：

```css
.tab-list-sky-sidebar .tab::after,
.tab-list-sky-sidebar :global([class*="react-tabs__tab"])::after {
    display: none !important;
}
```

要点：

- **选择器双重保险、不依赖 hash 细节**：`.tab` 是 module 类（编译后 `.gui_tab_xxx`，DOM 的 tab 元素真实带有，必然命中）；`:global([class*="react-tabs__tab"])` 属性选择器兜底匹配 hash 后的 `react-tabs_react-tabs__tab_xxx`。注意 react-tabs 原样类名在构建时被 css-module 哈希过，直接写 `.react-tabs__tab` 会匹配失败，必须用属性选择器；
- 特异性 (0,3,1) 高于 react-tabs 原版 `:focus::after` 的 (0,2,1)，且本文件加载顺序靠后，稳定覆盖；
- 作用域限定 `.tab-list-sky-sidebar`，**横向标签栏不受影响**（横向选中本就白底、指示条不可见，无需处理）。

> 验证结论（dev server 实测）：新规则已编译进产物；竖向 5 个标签在按住/焦点态下 `::after` 的 display 全部为 `none`；按住搜索按钮、选中块 `focus()`、按住其它标签三条路径均零白条；横向模式无副作用。

---

## 5. 横竖双适配：写一个标签同时适配两种标签栏

### 5.1 设计原则

**组件层不判断布局，布局差异全部交给 CSS。**

只有两类标签需要"附加"到标签栏，每种提供**一个渲染模板**，横竖通用：

| 模板 | 是什么 | 适用场景 | 点击行为 |
|------|--------|----------|----------|
| `renderSkyActionTab()`（动作型） | `<button>` | 打开独立窗口、执行命令、开关功能 | 不切换标签、不改变面板 |
| `renderSkyContentTab()`（内容型） | 原生 `<Tab>` | 承载自定义面板 / 替换插件伪标签 | React Tabs 正常切换对应 TabPanel |

因为这两种元素都复用 `tabClassNames.tab`（内部已按 `isSkyVertical` 区分 `.styles.tab` 与竖向样式），且图标渲染统一走 `renderSkyTabIcon()`（竖向 mask / 横向 img），所以**同一段 JSX 在横向与竖向下自动呈现两种正确的观感**。未来若新增布局（如 `fullscreen`），只需补对应 CSS 类，组件代码零改动。

### 5.2 如何新增一个「动作型」按钮（如新功能入口）

在 `gui.jsx` 的 `TabList` 内加一行调用即可（照抄现有搜索按钮）：

```jsx
{uiTheme === 'sky-editor' && renderSkyActionTab({
    key: 'my-new-action',                    // 必须唯一
    icon: someIcon,                          // svg 图标，导入或来自 lib
    title: '新功能标题',                      // 悬浮提示
    label: <FormattedMessage defaultMessage="新功能" id="gui.gui.myNewTab" />,
    onClick: handleMyNewAction               // 打开窗口/执行命令
})}
```

要点：

1. 若希望横竖都显示，不要写 `&& tabLayout === 'vertical'` 条件（如上面的例子）；仅竖向显示则保留该条件；
2. `onClick` 里要打开独立窗口时，参照 `setSkySearchOpen(true)` + `SkySearchWindow` 的范式（窗口组件、移入/移出搜索栏、派发事件强制展开下拉）；
3. `button` 的 `className` 已自动复用 `tabClassNames.tab`，不要手动加别的类破坏样式。

完整示例（带状态、带窗口）见 `gui.jsx` 中 `skySearchOpen` / `SkySearchWindow` / `handleSkySidebarSearch` 三处。

### 5.3 如何新增一个「内容型」标签（带面板）

面板已渲染在编辑器里（如插件注入）时，照抄变量标签：

```jsx
{uiTheme === 'sky-editor' && renderSkyContentTab({
    key: 'my-new-tab',
    icon: someIcon,
    label: <FormattedMessage defaultMessage="新面板" id="gui.gui.myNewPanelTab" />
})}
```

并务必在 `TabPanel` 序列中**追加对应数量的面板**（react-tabs 按下标对应，缺面板会白屏）：

```jsx
<TabPanel className={classNames(tabClassNames.tabPanel, styles.skyMyPanel)}>
    {/* 你的面板内容 */}
</TabPanel>
```

若面板来自插件且插件会自行注入伪标签，需像变量标签那样在 `gui.css` 用 `:global()` 隐藏插件自带 DOM，并让插件的注入目标指向自定义 TabPanel 类。

### 5.4 CSS 侧：横竖自动适配怎么来的

```css
.tab             /* 基础标签样式 */
.tab-list-sky-sidebar .tab { /* 竖向：2.25rem 方钮、竖排、纯图标 mask */ }
.tab-list-sky-sidebar .tab .sky-tab-icon { /* 竖向图标：mask 渲染，颜色跟主题 */ }
```

`tabClassNames.tab` 在横竖两种布局下都会命中 `.tab`；竖向时额外命中 `.tab-list-sky-sidebar .tab` 的覆盖规则。**新增标签不需要任何专属 CSS**，横竖外观开箱即得。

---

## 6. 常见问题速查

| 现象 | 原因 | 处理 |
|------|------|------|
| 竖向标签栏底部/选中标签底边白条 | ① 搜索栏 `.sa-find-bar` 曾被注入侧边栏（已宿主化根治）；② react-tabs 焦点指示条 `.react-tabs__tab:focus::after` 写死纯白 5px 横条 | ① 竖向挂隐藏宿主 `.sky-find-host`；② 竖向作用域禁用 tab `::after`（`display:none!important`，`.tab` + `[class*=react-tabs__tab]` 双保险防 hash 失效） |
| 变量标签点击白屏 | 只有 3 个 TabPanel，缺第 4 个 | `gui.jsx` 补第 4 个 `TabPanel`（`sky-variable-panel`） |
| 搜索窗口内下拉不显示 | 窗口焦点管理抢占输入框 focus | 窗口派发 `sky-search-window-open`，插件强制展开下拉（不依赖焦点） |
| 搜索窗口内二次点击后下拉消失 | focusout 被误触发 | find-bar 的 `focusout` 处理在 `isSkySearchWindow` 时直接 return |
| 下拉超出窗口被裁剪 | 窗口 `overflow:hidden` | MutationObserver + `attachDropdown()` 挂到 body 并按视口/窗口边界定位限高 |

---

## 7. 验证清单

- [ ] 竖向：按住/点按任意标签（尤其「搜索」与当前选中标签），**选中标签底边无白色焦点横条**，松开/聚焦切换均无；
- [ ] 竖向：搜索按钮点击弹出独立窗口，侧边栏底部**无搜索栏残留**；
- [ ] 竖向：窗口内搜索框自动聚焦、下拉展开、点击后不消失；
- [ ] 竖向：关闭窗口后搜索框还原、无残留；
- [ ] 横向：搜索功能不受影响（搜索栏正常在横向标签栏内，`Ctrl+F` 可用）；
- [ ] 竖向：变量标签点击显示变量面板、不白屏；
- [ ] 明暗主题下图标与侧边栏背景正确跟随（深色下无纯白焦点条）。
*（内容由AI生成，仅供参考）*
