// SKYEditor 仿 Win11 窗口交互引擎（纯 DOM，供 addons 复用）
// 逻辑逐行提炼自 src/components/tw-win11-window/win11-window.jsx（Win11Window）：
// 标题栏 transform 拖动 + mouseup 写回、双击最大化、右键系统菜单
// （还原/移动/大小/最小化/最大化/关闭 + 快捷键 m/s/n/x/c + Esc）、
// 8 向 resize（最小 500×300）、最小化仅标题栏、最大化铺满视口。
// 交互元素类名与 win11-window.css 语义一致：win11-controls / win11-button /
// win11-close / win11-resize-handle-* / win11-context-menu / win11-menu-item-*；
// 具体样式由宿主 addon 的 style.css 按 win11-window.css 观感提供。
// root 上由引擎维护 win11-maximized / win11-minimized / win11-interacting 状态类。

const MIN_W = 500;
const MIN_H = 300;
// React 侧 Win11Window 由 windowFocusManager 统一分配 z-index（起始 510）。
// 引擎优先接入同一份焦点管理器（见 win11-window.jsx 暴露的
// window.__skyWin11FocusManager），使 DOM 插件窗口（如调试器）与 React 窗口
// 共享同一条 z-index 计数组件：谁最后激活谁置顶、可互相遮挡，其它窗口激活时
// 本窗口可以被覆盖。仅在管理器缺失（非 sky-editor 构建/未加载）时回退到本地
// 计数器 skyDomWindowZTop 自增。
let skyDomWindowZTop = 510;
const getFocusManager = () =>
  (typeof window !== "undefined" && window.__skyWin11FocusManager) || null;
const CORNERS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const SVG = {
  min: '<svg width="10" height="10" viewBox="0 0 10 10"><line x1="0.5" y1="5" x2="9.5" y2="5" stroke="currentColor" stroke-width="1"/></svg>',
  max: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  restore: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><path d="M 0.5 0.5 H 7.5 V 2.5 H 2.5 V 7.5 H 0.5 Z" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  close: '<svg width="10" height="10" viewBox="0 0 10 10"><line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" stroke-width="1"/><line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" stroke-width="1"/></svg>',
};

// Windows-style open/close animation styles shared by every addon using this
// engine. Injected once globally so hosts do not need to repeat the CSS.
// Duration must match CLOSE_MS below.
const CLOSE_MS = 160;
const OPEN_MS = 180;
let win11AnimationStyleInjected = false;
const injectWin11AnimationStyle = () => {
  if (win11AnimationStyleInjected) return;
  win11AnimationStyleInjected = true;
  if (document.getElementById("sky-win11-window-animation-style")) return;
  const style = document.createElement("style");
  style.id = "sky-win11-window-animation-style";
  style.textContent = [
    ".win11-opening{animation:sky-win11-open " + OPEN_MS + "ms ease}",
    ".win11-closing{animation:sky-win11-close " + CLOSE_MS + "ms ease forwards!important;pointer-events:none!important}",
    "@keyframes sky-win11-open{from{transform:scale(.88);opacity:0}to{transform:scale(1);opacity:1}}",
    "@keyframes sky-win11-close{from{transform:scale(1);opacity:1}to{transform:scale(.88);opacity:0}}",
    // 窗口按钮样式：默认 Windows（满高方块按钮 + 悬停高亮 + 关闭红底）
    ".win11-controls{display:flex;align-items:center;height:100%;padding-right:0}",
    ".win11-button{width:46px;height:100%;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:0;background-color:transparent;color:inherit;cursor:default;transition:background-color .1s ease,filter .12s ease}",
    ".win11-button svg{display:block;width:7px;height:7px;opacity:1;pointer-events:none}",
    ".win11-button:hover{background-color:rgba(0,0,0,.06)}",
    ".win11-button:active{background-color:rgba(0,0,0,.1)}",
    ".win11-close:hover{background-color:#e81123;color:#fff}",
    // 设置里切换为 Mac 后（html[data-sky-window-buttons="mac"]）：三个纯色交通灯圆点，图标默认隐藏、悬停整组时浮现
    'html[data-sky-window-buttons="mac"] .win11-controls{gap:8px;padding-right:14px}',
        'html[data-sky-window-buttons="mac"] .win11-button{position:relative;width:12px;height:12px;margin:0;padding:0;border:0;border-radius:50%;transform:none;translate:none;filter:none;transition:background-color .1s ease,color .1s ease;background-color:rgba(0,0,0,.12);color:rgba(0,0,0,.55);box-shadow:inset 0 0 0 1px rgba(0,0,0,.09);}',,
    // 四枚控制图标（关闭/最小化/最大化/还原）统一重画：隐藏原有 svg，
    // 改用 ::before + data-URI SVG 的 mask 上色（currentColor）。12×12 画布 / 10×10px 显示框，
    // 图标绝对定位居中（不参与 flex 布局），几何与 React 版 win11-window.css 逐值一致。
    'html[data-sky-window-buttons="mac"] .win11-button > svg{display:none}',
        'html[data-sky-window-buttons="mac"] .win11-button::before{content:"";position:absolute;top:50%;left:50%;width:10px;height:10px;margin:-5px 0 0 -5px;background-color:currentColor;-webkit-mask-image:var(--sky-mac-icon);mask-image:var(--sky-mac-icon);-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:100% 100%;mask-size:100% 100%;pointer-events:none;opacity:1;transition:opacity .12s ease}',,
    'html[data-sky-window-buttons="mac"] .win11-maximize{background-color:#28c840}',
    'html[data-sky-window-buttons="mac"] .win11-minimize{background-color:#febc2e}',
    'html[data-sky-window-buttons="mac"] .win11-close{background-color:#ff5f57;color:rgba(110,0,0,.75)}',
    // 悬停 / 按下只做「变色」：同色系提亮 / 压暗，与 React 版 win11-window.css 逐值一致；
    // 12px 圆点上叠加 1px 内描边环会被读成边缘外扩，因此三态阴影恒定、绝不出现描边环。
    'html[data-sky-window-buttons="mac"] .win11-maximize:hover{background-color:#46d15c}',
    'html[data-sky-window-buttons="mac"] .win11-minimize:hover{background-color:#ffcd4d}',
    'html[data-sky-window-buttons="mac"] .win11-close:hover{background-color:#ff7b74}',
    'html[data-sky-window-buttons="mac"] .win11-maximize:active{background-color:#24b83a}',
    'html[data-sky-window-buttons="mac"] .win11-minimize:active{background-color:#f0ab1c}',
    'html[data-sky-window-buttons="mac"] .win11-close:active{background-color:#f04c45}',
    // 切换相位期间按钮底色瞬间翻转，避免淡入时带着上一套配色（mac 交通灯）浮现
    'html[data-sky-window-buttons-switching] .win11-button{transition:none !important}',
    // 与 React 壳（win11-window.css）对齐：淡出相位整簇归零后 JS 才换 data-sky-window-buttons，
    // 保证 DOM 窗口（调试器 / Agent）切换时配色翻转同样发生在不可见时，全程不出现错误配色
    '.win11-controls{transition:opacity .16s ease}',
    'html[data-sky-window-buttons-switching^="out"] .win11-controls{opacity:0;pointer-events:none;transition:opacity .12s ease}',
    // Mac 交通灯从左到右为 红 → 黄 → 绿：DOM 插入顺序保持不动，仅用 order 重排
    'html[data-sky-window-buttons="mac"] .win11-close{order:1}',
    'html[data-sky-window-buttons="mac"] .win11-minimize{order:2}',
    'html[data-sky-window-buttons="mac"] .win11-maximize{order:3}',
    // mac 关闭(×) / 最小化(—)：圆头线帽的线条图标，端点统一 2.30–9.70，
    // 含 round 线帽沿法向外扩 0.95 后墨迹横跨 1.35–10.65，与两枚三角同粗（stroke 1.9）。
    'html[data-sky-window-buttons="mac"] .win11-close::before{--sky-mac-icon:url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%2012%22%20fill=%22none%22%20stroke=%22%23fff%22%20stroke-width=%221.9%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%3E%3Cpath%20d=%22M2.3,2.3L9.7,9.7%22/%3E%3Cpath%20d=%22M9.7,2.3L2.3,9.7%22/%3E%3C/svg%3E")}',
    'html[data-sky-window-buttons="mac"] .win11-minimize::before{--sky-mac-icon:url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%2012%22%20fill=%22none%22%20stroke=%22%23fff%22%20stroke-width=%221.9%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%3E%3Cpath%20d=%22M2.3,6H9.7%22/%3E%3C/svg%3E")}',
    // mac 最大化：两枚直角三角沿「右上—左下」对角线分布，90° 角分别落在右上角
    // (10.00,2.00) 与左下角 (2.00,10.00)，两枚尖端各自朝所在角的外侧
    // → 两个箭头指向外（一个在右上方、一个在左下方）；
    // mac 还原：同样沿对角线分布，但每枚三角绕自身斜边中点翻转 180°（尖端移到中心侧），
    // 90° 角落在中心 (6,6) → 两个箭头指向内（一个右上方、一个左下方）；
    // 两态互为 180° 旋转，直角边同为 4.00，墨迹包围盒同为 2.00–10.00 × 2.00–10.00，
    // 显示框 10×10px（原 8×8px），切换最大化 / 还原时大小与粗细不跳动。
    'html[data-sky-window-buttons="mac"] .win11-maximize::before{--sky-mac-icon:url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%2012%22%20fill=%22%23fff%22%3E%3Cpath%20d=%22M10,2V6L6,2Z%22/%3E%3Cpath%20d=%22M2,10V6L6,10Z%22/%3E%3C/svg%3E")}',
    'html[data-sky-window-buttons="mac"] .win11-maximized .win11-maximize::before{--sky-mac-icon:url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%2012%22%20fill=%22%23fff%22%3E%3Cpath%20d=%22M6,6V2L10,6Z%22/%3E%3Cpath%20d=%22M6,6V10L2,6Z%22/%3E%3C/svg%3E")}',
    'html[data-sky-window-buttons="mac"] .win11-controls:hover .win11-button::before{opacity:1}',
    'html[data-sky-window-buttons="mac"] .win11-button:focus-visible::before{opacity:1}',
  ].join("\n");
  (document.head || document.documentElement).appendChild(style);
};

// 通用 win11 窗口外观（标题栏 / 标题 / 缩放热区 / 右键系统菜单）。
// 数值逐值对齐 React 版 win11-window.css，作为「DOM 窗口世界」的唯一来源：
// 使用本引擎的插件（当前为调试器）不再在自己的 style.css 里复刻外观。
// 选择器统一带 .win11-window 前缀（除挂到 body 的右键菜单），保证与宿主
// addon 样式（同样判定 0,2,0）竞争时不落下风。
let win11ChromeStyleInjected = false;
const injectWin11ChromeStyle = () => {
  if (win11ChromeStyleInjected) return;
  win11ChromeStyleInjected = true;
  if (document.getElementById("sky-win11-window-chrome-style")) return;
  const style = document.createElement("style");
  style.id = "sky-win11-window-chrome-style";
  style.textContent = [
    // 标题栏：恒定 40px、主题纯色、白字（与 React 版一致）
    ".win11-window .win11-titlebar{height:40px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding-left:16px;background:var(--looks-secondary,#855cd6);color:#fff;user-select:none;cursor:default}",
    ".win11-window .win11-title{display:flex;align-items:center;font-size:13px}",
    // 标题图标：标题栏为深色底，黑色线条图标需反白
    ".win11-window .win11-title-icon{width:16px;height:16px;margin-right:8px;display:block;flex-shrink:0;filter:brightness(0) invert(1)}",
    // 主题色窗口标签栏开关关闭时（设置 → 主题）：标题栏转白，文字转深色，图标取消反白
    "html[data-sky-tab-bar-theme='white'] .win11-window .win11-titlebar{background:#f7f8fa;color:#575e75;box-shadow:inset 0 -1px 0 rgba(0,0,0,.15)}",
    "html[data-sky-tab-bar-theme='white'] .win11-window .win11-title-icon{filter:none}",
    ".win11-window .win11-titlebar-actions{display:flex;align-items:center;height:100%}",
    // 右键系统菜单（引擎 append 到 body，故不带 .win11-window 前缀）
    ".win11-context-menu{position:fixed;min-width:var(--sky-ctx-menu-min-width,130px);padding:var(--sky-ctx-menu-padding,5px 0);margin:var(--sky-ctx-menu-margin,2px 0 0);font-size:var(--sky-ctx-menu-font-size,.85rem);text-align:left;background-color:var(--sky-ctx-menu-bg,#fff);border:1px solid var(--sky-ctx-menu-border,rgba(0,0,0,.15));border-radius:var(--sky-ctx-menu-radius,4px);box-shadow:var(--sky-ctx-menu-shadow,0 0 5px 1px rgba(0,0,0,.25));color:var(--sky-ctx-menu-fg,inherit);user-select:none;pointer-events:auto;z-index:var(--sky-ctx-menu-z-index,530)}",
    ".win11-menu-item{color:var(--sky-ctx-menu-fg,inherit);padding:var(--sky-ctx-menu-item-padding,8px 12px);border-radius:var(--sky-ctx-menu-item-radius,0);white-space:nowrap;cursor:pointer;transition:var(--sky-ctx-menu-item-transition,.1s ease)}",
    ".win11-menu-item:hover{background:var(--sky-ctx-menu-hover-bg,#855cd6);color:var(--sky-ctx-menu-hover-fg,#fff)}",
    ".win11-menu-item-divider{margin:4px 0;border-top:1px solid var(--sky-ctx-menu-divider,rgba(0,0,0,.15))}",
    ".win11-menu-item-disabled{opacity:var(--sky-ctx-menu-disabled-opacity,.5);cursor:default}",
    ".win11-menu-item-disabled:hover{background:var(--sky-ctx-menu-disabled-hover-bg,transparent);color:var(--sky-ctx-menu-disabled-hover-fg,inherit)}",
    // 8 向缩放热区：边 8px、角 18px（对齐 React 版，不再各自维护一套尺寸）
    ".win11-window .win11-resize-handle{position:absolute;z-index:2}",
    ".win11-window .win11-resize-handle-n{top:0;left:18px;right:18px;height:8px;cursor:ns-resize}",
    ".win11-window .win11-resize-handle-s{bottom:0;left:18px;right:18px;height:8px;cursor:ns-resize}",
    ".win11-window .win11-resize-handle-w{left:0;top:18px;bottom:18px;width:8px;cursor:ew-resize}",
    ".win11-window .win11-resize-handle-e{right:0;top:18px;bottom:18px;width:8px;cursor:ew-resize}",
    ".win11-window .win11-resize-handle-nw,.win11-window .win11-resize-handle-ne,.win11-window .win11-resize-handle-sw,.win11-window .win11-resize-handle-se{width:18px;height:18px}",
    ".win11-window .win11-resize-handle-nw{left:0;top:0;cursor:nwse-resize}",
    ".win11-window .win11-resize-handle-ne{right:0;top:0;cursor:nesw-resize}",
    ".win11-window .win11-resize-handle-sw{left:0;bottom:0;cursor:nesw-resize}",
    ".win11-window .win11-resize-handle-se{right:0;bottom:0;cursor:nwse-resize}",
  ].join("\n");
  (document.head || document.documentElement).appendChild(style);
};

export default function createSkyWin11Window (root, options) {
  const {
    headerElement,
    onClose,
    defaultWidth = 720,
    defaultHeight = 512,
    disableMaximize = false,
    disableResize = false,
  } = options;

  injectWin11AnimationStyle();
  injectWin11ChromeStyle();
  // 标题栏 / 右键菜单里的图标（单色 SVG）交给 src/lib/iconContrast.js 统一做
  // 明暗自适应（深底转白、浅底转黑）：这里只做根容器标注，不写死任何滤镜。
  if (root && root.querySelectorAll) {
    root.querySelectorAll(".win11-titlebar, .win11-title, .win11-titlebar-actions")
      .forEach((el) => el.setAttribute("data-sky-icon-adaptive-root", ""));
  }

  // All close paths go through requestClose so the shrink + fade-out animation
  // always plays before the host really removes the window via onClose.
  let closing = false;
  // 窗口是否处于「宿主认为打开」状态：requestClose 即视为请求关闭（置 false），
  // show() 重新打开时置 true。它用于化解「关闭动画未播完（延时回调未触发）时
  // 窗口又被重开」的竞态——此时旧 setTimeout 到点后不得 unregister 新注册的焦点号。
  let visible = false;
  const requestClose = () => {
    if (closing) return;
    closing = true;
    visible = false;
    root.classList.add("win11-closing");
    // 关闭动画（sky-win11-close，CLOSE_MS）播完后宿主才真正隐藏窗口。
    // 这里比动画长度多留 40ms 余量：若 setTimeout 抢先触发，宿主 display:none
    // 会立即对仍在播放的动画触发 animationcancel，把关闭动画“斩掉”造成丢失；
    // 且 closing 动画带 forwards!important 保持在终态，直到宿主隐藏窗口，
    // 再由下次 show()/setEnabled 统一清理（见 handleChromeAnimationEnd）。
    window.setTimeout(() => {
      onClose();
      // 释放共享焦点是宿主的职责（宿主所有 setInterfaceVisible(false) 路径都会
      // 调用 releaseFocus()，见宿主 userscript.js）；此处仅作为兜底：若窗口确实
      // 未被重开（visible 仍为 false）而焦点号仍挂着（例如宿主未调 releaseFocus），
      // 仍把它交还给共享 windowFocusManager，使后方窗口恢复置顶。
      // visible 守卫避免 200ms 内窗口被 show() 重开时误释放新注册的焦点号。
      if (!visible) unregisterFocus();
    }, CLOSE_MS + 40);
  };

  let enabled = false;
  let positioned = false;
  let minimized = false;
  let maximized = false;
  let pos = null;
  let size = { width: defaultWidth, height: defaultHeight };
  let preMaximize = null;
  let drag = null; // 标题栏拖动
  let interaction = null; // 菜单移动/大小
  let menuOpen = false;
  let lastClick = null;

  // ---- 标题栏窗口控件（最小化/最大化/关闭）----
  const controls = document.createElement("div");
  controls.className = "win11-controls";
  const makeButton = (html, title, cls, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = title;
    b.className = cls;
    b.innerHTML = html;
    b.addEventListener("click", onClick);
    return b;
  };
  // DOM 插入顺序沿用 Windows 口径：最大化 → 最小化 → 关闭（索引决定插入先后）；
  // mac 样式由上面的 CSS order 重排为交通灯 红(关闭) → 黄(最小化) → 绿(最大化)。
  const minButton = makeButton(SVG.min, "最小化", "win11-button win11-minimize", () => toggleMinimized());
  const maxButton = makeButton(SVG.max, "最大化", "win11-button win11-maximize", () => toggleMaximize());
  const closeButton = makeButton(SVG.close, "关闭", "win11-button win11-close", () => requestClose());
  controls.append(maxButton, minButton, closeButton);
  // 注入由 attachChrome/detachChrome 管理：仅 enabled（sky 主题）时挂载到 DOM，
  // 禁用时彻底移除，避免其他主题（如 TurboWarp）残留 win11 元素。
  ["mousedown", "contextmenu", "dblclick"].forEach((type) => {
    controls.addEventListener(type, (e) => e.stopPropagation());
  });

  // ---- 8 向 resize 热区 ----
  const resizeHandles = {};
  for (const corner of CORNERS) {
    const handle = document.createElement("div");
    handle.className = `win11-resize-handle win11-resize-handle-${corner}`;
    handle.addEventListener("mousedown", (e) => {
      if (!enabled || maximized || minimized) return;
      e.preventDefault();
      e.stopPropagation();
      beginResize(corner, e.clientX, e.clientY);
    });
    resizeHandles[corner] = handle;
  }

  // 已移除失焦暗化遮罩（win11-dim-overlay）：窗口不再在失焦时压黑。
  // ---- 右键系统菜单 ----
  const menu = document.createElement("div");
  menu.className = "win11-context-menu";
  menu.style.display = "none";
  const addDivider = () => {
    const d = document.createElement("div");
    d.className = "win11-menu-item-divider";
    menu.appendChild(d);
  };
  const menuItems = [];
  const addMenuItem = (label, onClick, isDisabled) => {
    const item = document.createElement("div");
    item.className = "win11-menu-item";
    item.textContent = label;
    item.addEventListener("click", (e) => {
      if (isDisabled()) return;
      e.stopPropagation();
      closeMenu();
      onClick(e);
    });
    menu.appendChild(item);
    // 记录菜单项与其禁用谓词：openMenu 时统一刷新 disabled 视觉类。
    // 引擎不在构建时固定类名，因为禁用条件随窗口状态（maximized 等）变化，
    // 需在每次打开菜单时按当前状态重新同步。
    menuItems.push({ item, isDisabled });
  };
  addMenuItem("还原(R)", () => toggleMaximize(), () => !maximized || disableMaximize);
  addMenuItem("移动(M)", (e) => enterMoveMode(e.clientX, e.clientY), () => maximized);
  addMenuItem("大小(S)", (e) => enterResizeMode(e.clientX, e.clientY), () => maximized || disableResize);
  addDivider();
  addMenuItem("最小化(N)", () => setMinimized(true), () => false);
  addMenuItem("最大化(X)", () => toggleMaximize(), () => maximized || disableMaximize);
  addDivider();
  addMenuItem("关闭(C)", () => requestClose(), () => false);

  const closeMenu = () => {
    menu.style.display = "none";
    menuOpen = false;
  };
  const openMenu = (x, y) => {
    drag && cancelDrag();
    commitInteraction();
    // disabled 菜单项灰显：每次打开时按当前窗口状态刷新
    // win11-menu-item-disabled 类（对齐 React win11-window.jsx 中
    // 还原/移动/大小/最大化 的动态禁用逻辑），类由宿主 CSS 实现灰显。
    for (const { item, isDisabled } of menuItems) {
      item.classList.toggle("win11-menu-item-disabled", isDisabled());
    }
    // 菜单 z-index 抬到窗口焦点层之上：窗口经共享计数持续激活递增后，
    // 定值 z-index 可能被自身/其它窗口压盖，故跟随当前窗口 z 动态抬升。
    const winZ = parseInt(root.style.zIndex, 10) || 0;
    menu.style.zIndex = winZ + 1000;
    menu.style.left = Math.min(x, window.innerWidth - 180) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 240) + "px";
    menu.style.display = "block";
    menuOpen = true;
  };
  document.addEventListener("mousedown", (e) => {
    if (menuOpen && !menu.contains(e.target)) closeMenu();
  });

  // ---- 布局 ----
  // 最大化：运行时直接读取视口尺寸像素级铺满（不再依赖 .win11-maximized 的 vw/vh 写死）
  const applyMaximizedPixels = () => {
    root.style.left = "0px";
    root.style.top = "0px";
    root.style.width = window.innerWidth + "px";
    root.style.height = window.innerHeight + "px";
    root.style.transform = "";
  };
  // resize 监听：仅最大化时跟随视口变化重设像素，还原时移除监听
  const handleViewportResize = () => {
    if (maximized) applyMaximizedPixels();
  };
  const applyLayout = () => {
    if (maximized) {
      applyMaximizedPixels();
      return;
    }
    root.style.left = (pos ? pos.left : 0) + "px";
    root.style.top = (pos ? pos.top : 0) + "px";
    root.style.width = size.width + "px";
    root.style.height = size.height + "px";
  };
  const setMinimized = (v) => {
    if (v && maximized) toggleMaximize(); // 最大化状态下最小化先还原
    minimized = v;
    root.classList.toggle("win11-minimized", minimized && !maximized);
    closeMenu();
  };
  const toggleMinimized = () => setMinimized(!minimized);
  const toggleMaximize = () => {
    if (disableMaximize) return;
    if (maximized) {
      if (preMaximize) {
        pos = preMaximize.pos;
        size = preMaximize.size;
      }
      maximized = false;
      root.classList.remove("win11-maximized");
      // 还原状态：最大化按钮切回"最大化"图标
      maxButton.innerHTML = SVG.max;
      maxButton.title = "最大化";
      window.removeEventListener("resize", handleViewportResize);
      applyLayout();
    } else {
      preMaximize = { pos: pos || { left: 0, top: 0 }, size };
      maximized = true;
      root.classList.add("win11-maximized");
      root.classList.remove("win11-minimized");
      minimized = false;
      // 最大化状态：像素级铺满视口并跟随 resize
      applyMaximizedPixels();
      window.addEventListener("resize", handleViewportResize);
      // 最大化状态：最大化按钮切换为"还原"图标（对齐 React 侧 Win11Window 图标切换）
      maxButton.innerHTML = SVG.restore;
      maxButton.title = "还原";
    }
    syncResizeHandles(); // 最大化卸下缩放手柄、还原后重新挂载（对齐 React 条件渲染）
    closeMenu();
  };

  // ---- 标题栏拖动（1:1 直接跟随指针：无弹簧/无缓动/无插值，mouseup 写回）----
  const beginDrag = (startX, startY) => {
    if (maximized) return;
    drag = { startX, startY, x: 0, y: 0, rafId: null };
    root.classList.add("win11-interacting");
    const handleMouseMove = (ev) => {
      if (!drag) return;
      // 边界 clamp：不允许拖出视口（对齐 win11-window.jsx）
      const maxX = Math.max(0, window.innerWidth - root.offsetWidth - pos.left);
      const maxY = Math.max(0, window.innerHeight - root.offsetHeight - pos.top);
      drag.x = Math.max(-pos.left, Math.min(ev.clientX - drag.startX, maxX));
      drag.y = Math.max(-pos.top, Math.min(ev.clientY - drag.startY, maxY));
      // 位移量直接等于指针位移，立即写入 transform（不做任何平滑/回弹）
      if (drag.rafId == null) {
        drag.rafId = requestAnimationFrame(() => {
          if (!drag) return;
          drag.rafId = null;
          root.style.transform = `translate(${drag.x}px, ${drag.y}px)`;
        });
      }
    };
    const handleMouseUp = () => {
      if (!drag) return;
      if (drag.rafId) cancelAnimationFrame(drag.rafId);
      pos = { left: pos.left + drag.x, top: pos.top + drag.y };
      root.style.left = pos.left + "px";
      root.style.top = pos.top + "px";
      drag = null;
      root.style.transform = "";
      cleanup();
      // 写回后下一帧再恢复 transition，保证跳变无动画
      requestAnimationFrame(() => root.classList.remove("win11-interacting"));
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    drag.cleanup = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };
  const cancelDrag = () => {
    if (drag) {
      if (drag.rafId) cancelAnimationFrame(drag.rafId);
      if (drag.cleanup) drag.cleanup();
      drag = null;
    }
    root.style.transform = "";
    root.classList.remove("win11-interacting");
  };

  // ---- 菜单移动/大小（document 级 mousedown 提交）----
  const commitInteraction = () => {
    if (!interaction) return;
    const d = interaction;
    const wasMove = d.mode === "move";
    if (wasMove) {
      if (d.rafId) cancelAnimationFrame(d.rafId);
      pos = { left: pos.left + d.x, top: pos.top + d.y };
      root.style.left = pos.left + "px";
      root.style.top = pos.top + "px";
    }
    root.style.transform = "";
    if (d.cleanup) d.cleanup();
    interaction = null;
    if (wasMove) {
      requestAnimationFrame(() => root.classList.remove("win11-interacting"));
    } else {
      root.classList.remove("win11-interacting");
    }
  };
  const enterMoveMode = (startX, startY) => {
    if (maximized) return;
    interaction = { mode: "move", startX, startY, x: 0, y: 0, rafId: null };
    root.classList.add("win11-interacting");
    const handleMouseMove = (ev) => {
      if (!interaction || interaction.mode !== "move") return;
      // 1:1 直接跟随：位移量立刻等于指针位移，无弹簧/缓动/插值
      interaction.x = ev.clientX - interaction.startX;
      interaction.y = ev.clientY - interaction.startY;
      if (interaction.rafId == null) {
        interaction.rafId = requestAnimationFrame(() => {
          if (!interaction || interaction.mode !== "move") return;
          interaction.rafId = null;
          root.style.transform = `translate(${interaction.x}px, ${interaction.y}px)`;
        });
      }
    };
    const handleMouseDown = () => commitInteraction();
    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
    };
    interaction.cleanup = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
  };
  const enterResizeMode = (startX, startY) => {
    if (maximized) return;
    const rect = root.getBoundingClientRect();
    interaction = { mode: "resize", startX, startY, startLeft: rect.left, startTop: rect.top, startWidth: rect.width, startHeight: rect.height };
    root.classList.add("win11-interacting");
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const handleMouseMove = (ev) => {
      if (!interaction || interaction.mode !== "resize") return;
      const dx = ev.clientX - interaction.startX;
      const dy = ev.clientY - interaction.startY;
      size = {
        width: clamp(interaction.startWidth + dx, MIN_W, window.innerWidth - interaction.startLeft),
        height: clamp(interaction.startHeight + dy, MIN_H, window.innerHeight - interaction.startTop),
      };
      applyLayout();
    };
    const handleMouseDown = () => commitInteraction();
    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
    };
    interaction.cleanup = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
  };

  // ---- 8 向 resize（四角/四边热区直接拖动）----
  const beginResize = (corner, startX, startY) => {
    if (maximized) return;
    const rect = root.getBoundingClientRect();
    const d = { corner, startX, startY, startLeft: rect.left, startTop: rect.top, startWidth: rect.width, startHeight: rect.height, startRight: rect.right, startBottom: rect.bottom };
    root.classList.add("win11-interacting");
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const handleMouseMove = (ev) => {
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      let left = d.startLeft;
      let top = d.startTop;
      let width = d.startWidth;
      let height = d.startHeight;
      switch (corner) {
      case "e":
        width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - left);
        break;
      case "w":
        width = clamp(d.startWidth - dx, MIN_W, d.startRight);
        left = d.startRight - width;
        break;
      case "s":
        height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - top);
        break;
      case "n":
        height = clamp(d.startHeight - dy, MIN_H, d.startBottom);
        top = d.startBottom - height;
        break;
      case "ne":
        width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - left);
        height = clamp(d.startHeight - dy, MIN_H, d.startBottom);
        top = d.startBottom - height;
        break;
      case "sw":
        width = clamp(d.startWidth - dx, MIN_W, d.startRight);
        left = d.startRight - width;
        height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - top);
        break;
      case "nw":
        width = clamp(d.startWidth - dx, MIN_W, d.startRight);
        left = d.startRight - width;
        height = clamp(d.startHeight - dy, MIN_H, d.startBottom);
        top = d.startBottom - height;
        break;
      default: // se
        width = clamp(d.startWidth + dx, MIN_W, window.innerWidth - left);
        height = clamp(d.startHeight + dy, MIN_H, window.innerHeight - top);
        break;
      }
      pos = { left, top };
      size = { width, height };
      applyLayout();
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      root.classList.remove("win11-interacting");
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // ---- 标题栏交互：双击最大化 + 拖动（排除控件/标签/按钮区）----
  const handleHeaderMouseDown = (e) => {
    if (!enabled) return;
    if (e.target.closest(".win11-controls")) return;
    if (e.target.closest(".sa-debugger-tabs")) return;
    if (e.target.closest(".sa-debugger-header-buttons")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const now = Date.now();
    const last = lastClick;
    const dx = last ? e.clientX - last.x : Infinity;
    const dy = last ? e.clientY - last.y : Infinity;
    const isDoubleClick = last && (now - last.time) < 300 && Math.sqrt(dx * dx + dy * dy) < 5;
    if (isDoubleClick) {
      lastClick = null;
      cancelDrag();
      toggleMaximize();
      return;
    }
    lastClick = { time: now, x: e.clientX, y: e.clientY };
    if (maximized) return;
    beginDrag(e.clientX, e.clientY);
  };
  const handleHeaderContextMenu = (e) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(e.clientX, e.clientY);
  };
  headerElement.addEventListener("mousedown", handleHeaderMouseDown);
  headerElement.addEventListener("contextmenu", handleHeaderContextMenu);

  // ---- 键盘：Esc（交互>菜单>关闭）+ 菜单快捷键 r/m/s/n/x/c ----
  const handleKeyDown = (e) => {
    if (!enabled) return;
    // 内容自己处理过（preventDefault）的按键不再由窗口消费：避免内嵌菜单/浮层
    // 按 Esc 关闭时把整个窗口一起关掉。
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      if (interaction) {
        commitInteraction();
      } else if (menuOpen) {
        closeMenu();
      } else {
        requestClose();
      }
      return;
    }
    if (!menuOpen) return;
    const getWindowCenter = () => {
      const rect = root.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    switch (e.key.toLowerCase()) {
    case "r":
      if (maximized) toggleMaximize();
      break;
    case "m":
      if (!maximized) {
        const c = getWindowCenter();
        closeMenu();
        enterMoveMode(c.x, c.y);
      }
      break;
    case "s":
      if (!maximized) {
        const c = getWindowCenter();
        closeMenu();
        enterResizeMode(c.x, c.y);
      }
      break;
    case "n":
      closeMenu();
      setMinimized(true);
      break;
    case "x":
      if (!maximized) {
        closeMenu();
        toggleMaximize();
      }
      break;
    case "c":
      closeMenu();
      requestClose();
      break;
    default:
      break;
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  // ---- 挂载/卸载引擎交互元素（对齐主题作用域）----
  // 焦点层级：优先接入 React 侧共享 windowFocusManager（win11-window.jsx 暴露
  // 于 window.__skyWin11FocusManager），DOM 窗口与 React 窗口共用同一 z-index
  // 计数器——窗口显示/点击时激活置顶，其它窗口激活时本窗口可被覆盖。
  // 管理器缺失时回退本地 skyDomWindowZTop 自增。焦点号在窗口真正「显示/点击」
  // 时惰性分配（show()/raiseRoot），避免窗口仅被 setEnabled 启用但未打开时
  // 抢占其它窗口焦点。
  let focusId = null;
  const applyFocusZIndex = (id) => {
    const fm = getFocusManager();
    if (fm && id !== null) {
      const z = fm.getZIndex(id);
      if (z) root.style.zIndex = z;
    }
  };
  const ensureRegistered = () => {
    const fm = getFocusManager();
    if (fm && focusId === null) {
      // 焦点回调只用于 zIndex 对齐；失焦压黑（win11-dimmed）已移除。
      focusId = fm.register(() => {});
      applyFocusZIndex(focusId);
    }
  };
  const activateWindow = () => {
    const fm = getFocusManager();
    if (fm) {
      ensureRegistered();
      if (focusId !== null) {
        fm.activate(focusId);
        applyFocusZIndex(focusId);
      }
    } else {
      skyDomWindowZTop += 1;
      root.style.zIndex = skyDomWindowZTop;
    }
  };
  const unregisterFocus = () => {
    const fm = getFocusManager();
    if (fm && focusId !== null) {
      fm.unregister(focusId);
      focusId = null;
    }
  };
  const raiseRoot = () => {
    activateWindow();
  };
  let rootRaiseBound = false;
  const bindRootRaise = () => {
    if (rootRaiseBound) return;
    rootRaiseBound = true;
    root.addEventListener("mousedown", raiseRoot, true);
  };
  // 8 向缩放手柄：仅窗口态挂载，对齐 win11-window.jsx 的
  // `!maximized && !disableResize` 条件渲染。最大化时彻底移除，
  // 避免顶边/四角热区盖住标题栏导致双击还原、三控件无法命中。
  const syncResizeHandles = () => {
    for (const corner of CORNERS) {
      const h = resizeHandles[corner];
      if (enabled && !maximized && h.parentNode !== root) {
        root.appendChild(h);
      } else if ((!enabled || maximized) && h.parentNode) {
        h.parentNode.removeChild(h);
      }
    }
  };
  const attachChrome = () => {
    if (controls.parentNode !== headerElement) {
      headerElement.appendChild(controls);
    }
    syncResizeHandles();
    if (menu.parentNode !== document.body) {
      document.body.appendChild(menu);
    }
  };
  const detachChrome = () => {
    if (controls.parentNode) {
      controls.parentNode.removeChild(controls);
    }
    for (const corner of CORNERS) {
      const h = resizeHandles[corner];
      if (h.parentNode) {
        h.parentNode.removeChild(h);
      }
    }
    if (menu.parentNode) {
      menu.parentNode.removeChild(menu);
    }
  };
  // ---- 动画收尾（对齐 win11-window.jsx：动画播放完必须回收状态类）----
  // `.win11-opening` 不会自动清除：若残留，窗口重开会与 `.win11-closing`
  // 叠加出错，故在动画结束/取消时移除开启动画类。
  // `.win11-closing` 不在 animationend 里回收：`.win11-closing` 的
  // `forwards !important` 动画（scale(0.88)/opacity:0 + pointer-events:none）
  // 必须保持到宿主 display:none（见 requestClose 的 CLOSE_MS+40 余量）。
  // 若在这里提前移除 closing 类，窗口会在 onClose 前瞬间闪回原尺寸一帧；
  // 关闭残留统一由下次 show()/setEnabled 清理，同时复位 closing 可再次关闭。
  const handleChromeAnimationEnd = (e) => {
    if (e.animationName === "sky-win11-open") {
      root.classList.remove("win11-opening");
    }
  };
  root.addEventListener("animationend", handleChromeAnimationEnd);
  root.addEventListener("animationcancel", handleChromeAnimationEnd);

  // ---- 对外 API ----
  const setEnabled = (on) => {
    const wasEnabled = enabled;
    enabled = on;
    if (!on) {
      cancelDrag();
      commitInteraction();
      closeMenu();
      closing = false;
      visible = false;
      root.classList.remove("win11-maximized", "win11-minimized", "win11-interacting", "win11-closing", "win11-opening");
      window.removeEventListener("resize", handleViewportResize);
      root.style.transform = "";
      root.style.left = "";
      root.style.top = "";
      root.style.width = "";
      root.style.height = "";
      detachChrome();
      // 退出引擎（非 sky-editor 主题）时交还共享焦点号，避免残留计数
      unregisterFocus();
      return;
    }
    attachChrome();
    bindRootRaise();
    // 焦点号惰性分配（见 activateWindow）：仅 setEnabled 启动不置顶、不抢焦
    if (!positioned) {
      positioned = true;
      pos = {
        left: Math.max(0, Math.round((window.innerWidth - defaultWidth) / 2)),
        top: Math.max(24, Math.round((window.innerHeight - defaultHeight) / 2 - 40)),
      };
    }
    applyLayout();
    // Play the scale-up + fade-in open animation only on the disabled→enabled
    // transition. Repeated calls with the same state (e.g. hosts re-syncing on
    // every redux statechanged) must stay idempotent, otherwise the window
    // appears to "restart" (replay its open animation) on unrelated page updates.
    if (!wasEnabled) {
      // 兜底复位关闭残留（异常时序下 closing 可能仍为 true），保证重开可交互。
      closing = false;
      root.classList.remove("win11-closing", "win11-opening");
      void root.offsetWidth;
      root.classList.add("win11-opening");
    }
  };
  // 宿主每次重新展示窗口时调用：清除关闭残留（closing 状态 + 关闭动画类，
  // 否则 `.win11-closing` 的 forwards !important 会把窗口压在 scale(0.88)/
  // opacity(0) 终态并与 pointer-events:none 叠加，导致重开不可见、整窗不可点），
  // 然后从 0 帧重放 Windows 式放缩淡入动画。允许在已 enabled 状态下被调用，
  // 语义区别于 setEnabled 的幂等过渡播放。
  const show = () => {
    closing = false;
    visible = true;
    // 重显窗口即置顶（对齐「打开/点击时置顶」的窗口焦点规范，与其它窗口互盖）
    activateWindow();
    root.classList.remove("win11-closing", "win11-opening");
    void root.offsetWidth;
    root.classList.add("win11-opening");
  };
  // 宿主在一切「窗口将隐藏/关闭」路径（含引擎 requestClose 之外的直接 display:none，
  // 如宿主自绘关闭按钮、切出编辑器/播放器临时隐藏）上调用，确保窗口一离开可见
  // 状态就从共享 windowFocusManager 注销焦点号，管理器随即把 active 交还给剩余
  // z-index 最高的窗口并 notifyAll。
  // 幂等：焦点号已释放（focusId === null）时无操作。下次 show() 会经
  // activateWindow→ensureRegistered 重新惰性注册并激活。
  const releaseFocus = () => {
    unregisterFocus();
  };
  const destroy = () => {
    setEnabled(false);
    detachChrome();
    root.removeEventListener("animationend", handleChromeAnimationEnd);
    root.removeEventListener("animationcancel", handleChromeAnimationEnd);
    headerElement.removeEventListener("mousedown", handleHeaderMouseDown);
    headerElement.removeEventListener("contextmenu", handleHeaderContextMenu);
    document.removeEventListener("keydown", handleKeyDown);
  };

  return { setEnabled, show, destroy, releaseFocus, isMaximized: () => maximized, isMinimized: () => minimized };
}
