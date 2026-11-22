import { isPaused, setPaused, onPauseChanged, setup } from "./module.js";
import {
  translateKey,
  registerLanguageRefresh,
  installLanguageSync,
  syncLanguageFromRedux,
  refreshLanguageTexts,
  reportL10nState,
} from "./module.js";
import createLogsTab from "./logs.js";
import createThreadsTab from "./threads.js";
import createPerformanceTab from "./performance.js";
import Utils from "../find-bar/blockly/Utils.js";
import addSmallStageClass from "../../libraries/common/cs/small-stage.js";

const removeAllChildren = (element) => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

export default async function ({ addon, console, msg }) {
  setup(addon);

  // 语言运行时必须在任何文案创建之前完成首次对齐：api.js 的 msg() 按页面启动时
  // 的语言求值，若 UI 先用 msg() 生成再等 installLanguageSync 补刷，一旦启动
  // 语言与 msg 判定语言不一致（实测 addon 注入时 redux locale 仍为 en），页签、
  // 空态、菜单项等就会固化成英文。此处提前安装监听并同步当前 locale，使后续所有
  // translateKey() 从一开始就取到正确语言。
  // installLanguageSync 内部会订阅 window.ReduxStore 原生 redux（叠加 statechanged
  // 事件、<html lang> 观察、500ms 轮询兜底），且每次 translateKey() 求值前都会惰性
  // 对齐 redux 最新 locale——因此切换语言后无需刷新即可热同步，重开窗口也读当前语言。
  installLanguageSync(addon);

  let logsTab;
  const messagesLoggedBeforeLogsTabLoaded = [];
  const logMessage = (...args) => {
    if (logsTab) {
      logsTab.addLog(...args);
    } else {
      messagesLoggedBeforeLogsTabLoaded.push(args);
    }
  };

  let hasLoggedPauseError = false;
  const pause = (_, thread) => {
    if (addon.tab.redux.state.scratchGui.mode.isPlayerOnly) {
      if (!hasLoggedPauseError) {
        logMessage(translateKey("debugger/cannot-pause-player"), thread, "error");
        hasLoggedPauseError = true;
      }
      return;
    }
    setPaused(true);
    setInterfaceVisible(true);
  };
  addon.tab.addBlock("\u200B\u200Bbreakpoint\u200B\u200B", {
    args: [],
    displayName: translateKey("debugger/block-breakpoint"),
    callback: pause,
  });
  addon.tab.addBlock("\u200B\u200Blog\u200B\u200B %s", {
    args: ["content"],
    displayName: translateKey("debugger/block-log"),
    callback: ({ content }, thread) => {
      logMessage(content, thread, "log");
    },
  });
  addon.tab.addBlock("\u200B\u200Bwarn\u200B\u200B %s", {
    args: ["content"],
    displayName: translateKey("debugger/block-warn"),
    callback: ({ content }, thread) => {
      logMessage(content, thread, "warn");
    },
  });
  addon.tab.addBlock("\u200B\u200Berror\u200B\u200B %s", {
    args: ["content"],
    displayName: translateKey("debugger/block-error"),
    callback: ({ content }, thread) => {
      logMessage(content, thread, "error");
    },
  });

  const vm = addon.tab.traps.vm;
  await new Promise((resolve, reject) => {
    if (vm.editingTarget) return resolve();
    vm.runtime.once("PROJECT_LOADED", resolve);
  });
  const ScratchBlocks = await addon.tab.traps.getBlockly();

  const debuggerButtonOuter = document.createElement("div");
  debuggerButtonOuter.className = "sa-debugger-container";
  const debuggerButton = document.createElement("div");
  debuggerButton.className = addon.tab.scratchClass("button_outlined-button", "stage-header_stage-button");
  const debuggerButtonContent = document.createElement("div");
  debuggerButtonContent.className = addon.tab.scratchClass("button_content");
  const debuggerButtonImage = document.createElement("img");
  debuggerButtonImage.className = addon.tab.scratchClass("stage-header_stage-button-icon");
  debuggerButtonImage.draggable = false;
  debuggerButtonImage.src = addon.self.getResource("/icons/debug.svg") /* rewritten by pull.js */;
  debuggerButtonContent.appendChild(debuggerButtonImage);
  debuggerButton.appendChild(debuggerButtonContent);
  debuggerButtonOuter.appendChild(debuggerButton);
  debuggerButton.addEventListener("click", () => setInterfaceVisible(true));

  const setHasUnreadMessage = (unreadMessage) => {
    debuggerButtonContent.classList.toggle("sa-debugger-unread", unreadMessage);
  };

  const interfaceContainer = Object.assign(document.createElement("div"), {
    className: addon.tab.scratchClass("card_card", { others: "sa-debugger-interface" }),
  });
  const interfaceHeader = Object.assign(document.createElement("div"), {
    className: addon.tab.scratchClass("card_header-buttons"),
  });

  // 页签(.sa-debugger-tabs)：SE 下作为窗口内容区顶部的普通页签行，
  // 与窗口标题栏解耦（标题栏由 React 壳渲染，不再承载页签）；非 SE 下由
  // syncSkyChrome 移回 card 头部恢复原版排布。不使用独立工具栏容器。
  const tabListElement = Object.assign(document.createElement("ul"), {
    className: "sa-debugger-tabs",
  });
  const buttonContainerElement = Object.assign(document.createElement("div"), {
    className: addon.tab.scratchClass("card_header-buttons-right", { others: "sa-debugger-header-buttons" }),
  });
  const tabContentContainer = Object.assign(document.createElement("div"), {
    className: "sa-debugger-tab-content",
  });

  // SKYEditor 主题：编译器提示条跳转 SE 自身的高级设置窗口（与菜单栏
  // "Advanced" 按钮 handleClickAdvanced 同路径：SE 分支打开
  // SettingsWindow defaultTab='advanced'）；非 SE 主题保持 TurboWarp
  // 原行为（dispatch settingsModal 打开原生设置弹窗）。
  // 稳定定位 SKYEditor 菜单栏「高级」入口：不依赖图标 URL（旧实现用
  // img[src*="tw-advanced"]，图标改为打包后随机命名的 svg 后选择器恒为空）、
  // 也不依赖界面文案。优先通过 React fiber 拿到 MenuBar 组件实例，直接调用其
  // 公开方法 handleOpenSettingsWindow('advanced')（与菜单栏「高级」项完整同路径：
  // 先 onRequestCloseEdit 关闭作品编辑态，再打开 SettingsWindow defaultTab='advanced'）。
  const REACT_FIBER_KEY_PATTERNS = [/^__reactInternalInstance\$/, /^__reactFiber\$/];
  const getReactFiber = (element) => {
    if (!element) return null;
    for (const key of Object.keys(element)) {
      if (REACT_FIBER_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        return element[key];
      }
    }
    return null;
  };
  const getFiberProps = (fiber) =>
    fiber && (fiber.memoizedProps || fiber.pendingProps) ? fiber.memoizedProps || fiber.pendingProps : null;
  const findMenuBarInstance = () => {
    const anchors = [
      document.querySelector('[class*="menu-bar_menu-bar_"]'),
      document.querySelector('[class*="menu-bar_menu-bar-item"]'),
    ].filter(Boolean);
    for (const anchor of anchors) {
      let fiber = getReactFiber(anchor);
      let depth = 0;
      // 沿 fiber 树向上回溯，找到暴露 handleOpenSettingsWindow 的 MenuBar 实例
      while (fiber && depth < 300) {
        const instance = fiber.stateNode;
        if (instance && typeof instance.handleOpenSettingsWindow === "function") {
          return instance;
        }
        fiber = fiber.return || fiber._debugOwner;
        depth++;
      }
    }
    return null;
  };
  const clickMenuBarItemByHandlerName = (namePattern) => {
    const itemClass = addon.tab.scratchClass("menu-bar_menu-bar-item");
    if (!itemClass) return false;
    for (const element of document.querySelectorAll(`.${itemClass}`)) {
      const props = getFiberProps(getReactFiber(element));
      if (
        props &&
        typeof props.onClick === "function" &&
        namePattern.test(props.onClick.name || "")
      ) {
        element.click();
        return true;
      }
    }
    return false;
  };
  // 兜底②：按菜单项文本点击（不依赖 fiber / 函数名，仅比对可见文本）。
  const clickMenuBarItemByText = (labels) => {
    const itemClass = addon.tab.scratchClass("menu-bar_menu-bar-item");
    if (!itemClass) return false;
    for (const element of document.querySelectorAll(`.${itemClass}`)) {
      const label = (element.textContent || "").trim();
      if (labels.some((candidate) => label === candidate || label.includes(candidate))) {
        element.click();
        return true;
      }
    }
    return false;
  };
  // SKYEditor 主题：编译器提示条跳转 SE 自身的高级设置窗口（非 SE 主题保持
  // TurboWarp 原行为：dispatch settingsModal 打开原生设置弹窗）。
  const openSkyEditorAdvancedSettings = () => {
    const menuBar = findMenuBarInstance();
    if (menuBar) {
      if (typeof menuBar.props.onRequestCloseEdit === "function") {
        menuBar.props.onRequestCloseEdit();
      }
      menuBar.handleOpenSettingsWindow("advanced");
      return;
    }
    // 兜底①：按点击处理器名匹配（lodash bindAll 后名称形如 "bound handleClickAdvanced"）。
    if (clickMenuBarItemByHandlerName(/advanced/i)) {
      return;
    }
    // 兜底②：按菜单项可见文本匹配（界面语言不同则形如「高级 / 高級 / Advanced」）。
    if (clickMenuBarItemByText(["高级", "高級", "Advanced"])) {
      return;
    }
    console.warn("Debugger: could not find the SKYEditor advanced settings entry");
  };
  const compilerWarning = document.createElement("a");
  compilerWarning.addEventListener("click", () => {
    if (isSkyWindow()) {
      openSkyEditorAdvancedSettings();
    } else {
      addon.tab.redux.dispatch({
        type: "scratch-gui/modals/OPEN_MODAL",
        modal: "settingsModal"
      });
    }
  });
  compilerWarning.className = "sa-debugger-log sa-debugger-compiler-warning";
  compilerWarning.textContent = translateKey("debugger/compiler-warning");
  const updateCompilerWarningVisibility = () => {
    compilerWarning.hidden = !vm.runtime.compilerOptions.enabled;
  };
  vm.on("COMPILER_OPTIONS_CHANGED", updateCompilerWarningVisibility);
  updateCompilerWarningVisibility();

  // 语言热同步：窗口标题 / 页签文字按钮 / 编译器提示条注册到 module.js 刷新器。
  // 启动时若当前语言非 en（且 installLanguageSync 尚未执行），首次 apply 会
  // 触发一次重绘——此时元素刚由 msg() 按启动语言生成，文本保持一致，无副作用。
  registerLanguageRefresh(() => {
    unpauseButton.text.textContent = translateKey("debugger/unpause");
    closeButton.text.textContent = translateKey("debugger/close");
    compilerWarning.textContent = translateKey("debugger/compiler-warning");
  });

  let isInterfaceVisible = false;
  const setInterfaceVisible = (_isVisible) => {
    isInterfaceVisible = _isVisible;
    // 显隐统一由 inline display 控制：非 sky 下本容器常驻页面，必须显式写 none 兜底。
    interfaceContainer.style.display = isInterfaceVisible ? "flex" : "none";
    if (isInterfaceVisible) {
      // 重新显示时按编辑器当前语言整体对齐一次：窗口关闭只是 display:none，
      // DOM 不销毁，若期间切过语言，复用旧 DOM 会保留旧语言文本。
      // refreshLanguageTexts 内部先读最新 locale（redux → localStorage → <html lang>，
      // 幂等），再重绘页签/占位/菜单/按钮；reportL10nState 留一条诊断快照。
      reportL10nState("window-shown");
      refreshLanguageTexts();
      // 打开动画、Esc、拖拽由 React 壳的 Win11Window 提供，宿主桥在挂载时
      // 就会重放一致的打开动画；非 sky-editor 主题下完全不触碰宿主与引擎，
      // 保持 TurboWarp 原版行为。
      if (useHostedWindow()) mountSkyWindowHost();
      activeTab.show();
    } else {
      activeTab.hide();
      // 关闭即从宿主卸载：React 侧 Win11Window 随之卸载，共享焦点管理器会自动把
      // active 交还给剩余 z-index 最高的窗口，不会留下占位的隐藏窗口。
      if (useHostedWindow()) unmountSkyWindowHost();
    }
  };

  let mouseOffsetX = 0;
  let mouseOffsetY = 0;
  let lastX = 0;
  let lastY = 0;
  const handleStartDrag = (e) => {
    e.preventDefault();
    mouseOffsetX = e.clientX - interfaceContainer.offsetLeft;
    mouseOffsetY = e.clientY - interfaceContainer.offsetTop;
    lastX = e.clientX;
    lastY = e.clientY;
    document.addEventListener("mouseup", handleStopDrag);
    document.addEventListener("mousemove", handleDragInterface);
  };
  const handleStopDrag = () => {
    document.removeEventListener("mouseup", handleStopDrag);
    document.removeEventListener("mousemove", handleDragInterface);
  };
  const moveInterface = (x, y) => {
    lastX = x;
    lastY = y;
    const width = (document.documentElement.clientWidth || document.body.clientWidth) - 1;
    const height = (document.documentElement.clientHeight || document.body.clientHeight) - 1;
    const clampedX = Math.max(0, Math.min(x - mouseOffsetX, width - interfaceContainer.offsetWidth));
    const clampedY = Math.max(0, Math.min(y - mouseOffsetY, height - interfaceContainer.offsetHeight));
    interfaceContainer.style.left = clampedX + "px";
    interfaceContainer.style.top = clampedY + "px";
  };
  const handleDragInterface = (e) => {
    e.preventDefault();
    moveInterface(e.clientX, e.clientY);
  };
  window.addEventListener("resize", () => {
    if (!useHostedWindow()) {
      moveInterface(lastX, lastY);
    }
  });

  // SKYEditor 模式：页签作为窗口内容区顶部的普通页签行挂载在 container
  // （syncSkyChrome 内按当前主题在头部 / 内容区之间移动），不使用独立
  // 工具栏容器，也不存在插件自建窗口标签栏。
  interfaceContainer.append(interfaceHeader, tabListElement, compilerWarning, tabContentContainer);
  document.body.append(interfaceContainer);
  // 初始即隐藏：容器一进文档就先置 display:none，避免初始化完成前短暂可见，
  // 造成"进入编辑器即自动弹窗"观感。后续 setInterfaceVisible(true) 会显式
  // 覆盖回 flex。sky 主题下容器随后会被宿主搬进窗口 body，此处同样先隐藏。
  interfaceContainer.style.display = "none";

  const createHeaderButton = ({ text, icon, description }) => {
    const button = Object.assign(document.createElement("div"), {
      className: addon.tab.scratchClass("card_shrink-expand-button"),
      draggable: false,
    });
    if (description) {
      button.title = description;
    }
    const imageElement = Object.assign(document.createElement("img"), {
      src: icon,
      draggable: false,
    });
    const textElement = Object.assign(document.createElement("span"), {
      textContent: text,
    });
    button.appendChild(imageElement);
    button.appendChild(textElement);
    return {
      element: button,
      image: imageElement,
      text: textElement,
    };
  };

  // "更多"下拉按钮：返回 { element, image, text }（与 createHeaderButton 同构），
  // 点击弹出 fixed 定位下拉浮层（.sa-debugger-dropdown），点击项执行 onClick 并关闭；
  // 点击外部 / 再次点击按钮 / redux 状态变化时自动关闭。
  const createHeaderDropdown = ({ text, icon, items }) => {
    const button = Object.assign(document.createElement("div"), {
      className:
        addon.tab.scratchClass("card_shrink-expand-button") + " sa-debugger-dropdown-button",
      draggable: false,
    });
    const imageElement = Object.assign(document.createElement("img"), {
      src: icon,
      draggable: false,
    });
    const textElement = Object.assign(document.createElement("span"), {
      textContent: text,
    });
    button.appendChild(imageElement);
    button.appendChild(textElement);

    const menu = Object.assign(document.createElement("div"), {
      className: "sa-debugger-dropdown",
    });
    menu.style.display = "none";
    const menuItemTexts = [];
    for (const item of items) {
      const itemElement = Object.assign(document.createElement("div"), {
        className: "sa-debugger-dropdown-item",
        textContent: item.text,
      });
      menuItemTexts.push(itemElement);
      itemElement.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        item.onClick(e);
      });
      menu.appendChild(itemElement);
    }
    document.body.appendChild(menu);

    const closeMenu = () => {
      menu.style.display = "none";
    };
    const positionMenu = () => {
      const rect = button.getBoundingClientRect();
      menu.style.left = Math.max(0, Math.min(rect.left, window.innerWidth - 180)) + "px";
      menu.style.top = rect.bottom + 4 + "px";
    };
    const toggleMenu = (e) => {
      e.stopPropagation();
      if (menu.style.display === "block") {
        closeMenu();
        return;
      }
      positionMenu();
      menu.style.display = "block";
    };
    button.addEventListener("click", toggleMenu);
    // 点击浮层/按钮以外的任意处关闭
    document.addEventListener("mousedown", (e) => {
      if (
        menu.style.display === "block" &&
        !menu.contains(e.target) &&
        !button.contains(e.target)
      ) {
        closeMenu();
      }
    });
    // 编辑器状态变化（切 tab / 窗口隐藏 / 主题切换）时关闭浮层，避免残留
    addon.tab.redux.addEventListener("statechanged", closeMenu);

    return {
      element: button,
      image: imageElement,
      text: textElement,
      // 供语言热同步重绘下拉项文本（menu/menuItemTexts 为内部引用）
      menu,
      menuItemTexts,
    };
  };

  const createHeaderTab = ({ text, icon }) => {
    const tab = document.createElement("li");
    const imageElement = Object.assign(addon.tab.recolorable(), {
      src: icon,
      draggable: false,
    });
    const textElement = Object.assign(document.createElement("span"), {
      textContent: text,
    });
    tab.appendChild(imageElement);
    tab.appendChild(textElement);
    return {
      element: tab,
      image: imageElement,
      text: textElement,
    };
  };

  const unpauseButton = createHeaderButton({
    text: translateKey("debugger/unpause"),
    icon: addon.self.getResource("/icons/play.svg") /* rewritten by pull.js */,
  });
  unpauseButton.element.classList.add("sa-debugger-unpause");
  unpauseButton.element.addEventListener("click", () => setPaused(false));
  const updateUnpauseVisibility = (paused) => {
    unpauseButton.element.style.display = paused ? "" : "none";
  };
  updateUnpauseVisibility(isPaused());
  onPauseChanged(updateUnpauseVisibility);

  const closeButton = createHeaderButton({
    text: translateKey("debugger/close"),
    icon: addon.self.getResource("/icons/close.svg") /* rewritten by pull.js */,
  });
  closeButton.element.addEventListener("click", () => setInterfaceVisible(false));

  // ===== SKYEditor 统一窗口：宿主桥交给 React 主体系渲染（仅 sky-editor 主题启用）=====
  // sky 主题下调试器不再自建窗口壳，也不再调用 DOM 引擎
  // （addons/libraries/common/sky-win11-window.js）。做法是把内容 DOM 交给
  // window.__skyAddonWindow（components/gui/sky-addon-window-bridge.js），
  // 由 React 侧 sky-addon-window-host.jsx 用与设置窗口 / Packager 完全相同的
  // Win11Window 组件渲染：标题栏、三按钮、拖拽、缩放、Esc、最大最小化全部由它提供，
  // 并纳入同一 windowFocusManager 与同一窗口层容器。
  // 非 sky 主题完全不触碰宿主，保持插件原版外观与全局拖拽。
  const SKY_HOST_ID = "debugger";
  const SKY_WINDOW_WIDTH = 720;
  const SKY_WINDOW_HEIGHT = 512;
  let skyHosted = false;
  let skyDragBound = false;
  const isSkyWindow = () =>
    !!(addon.tab.redux.state.scratchGui &&
      addon.tab.redux.state.scratchGui.uiTheme === "sky-editor");
  // 窗口托管开关：两种主题都把内容交给宿主 React 渲染，外壳由 ThemedWindow 按主题
  // 自动分发（SKY → Win11 窗口；TurboWarp → 官方 Modal 弹窗）。插件侧不再区分主题，
  // 也不自建标题栏 / 拖拽 / 窗口壳。
  const useHostedWindow = () => true;
  const skyWindowHost = () => (typeof window === "undefined" ? null : window.__skyAddonWindow);
  const unmountSkyWindowHost = () => {
    if (!skyHosted) return;
    skyHosted = false;
    const host = skyWindowHost();
    if (host) host.unmount(SKY_HOST_ID);
    // sky 下容器的唯一挂载点是宿主窗口 body：卸载后把节点摘出文档，
    // 避免 body 里留下一个 display:none 的隐藏残壳（验收要求"关闭后无残留节点"）。
    // 下次 mount 时由宿主把它搬回去；切回非 sky 主题时 syncSkyChrome 会重新挂到 body。
    if (interfaceContainer.parentNode) interfaceContainer.remove();
  };
  const mountSkyWindowHost = () => {
    const host = skyWindowHost();
    if (!host) return;
    host.mount({
      id: SKY_HOST_ID,
      // 标题与图标由 React 壳渲染；语言切换时 SPAWN 后 textContent 会被刷新逻辑覆盖，
      // 因此这里在每次挂载时按当前语言重新取一次。
      title: translateKey("debugger/window-title"),
      icon: addon.self.getResource("/icons/debug.svg") /* rewritten by pull.js */,
      width: SKY_WINDOW_WIDTH,
      height: SKY_WINDOW_HEIGHT,
      actions: buttonContainerElement,
      body: interfaceContainer,
      onClose: () => setInterfaceVisible(false),
    });
    skyHosted = true;
  };
  const syncSkyChrome = () => {
    const isSky = useHostedWindow();
    // 宿主壳自带标题栏：原 card 头部整块隐藏，页签行移到内容区顶部。
    interfaceHeader.style.display = isSky ? "none" : "";
    closeButton.element.style.display = isSky ? "none" : "";
    interfaceContainer.classList.toggle("sa-debugger-hosted", isSky);
    // 布局外壳化（hosted）两主题都要；SKY 专属视觉现代化（字体口径、下划线页签等）
    // 只在 SKY 主题挂载，避免 TurboWarp 弹窗里残留 SKY 观感。
    interfaceContainer.classList.toggle("sa-debugger-hosted-sky", isSkyWindow());
    // 动作区在 sky 下被搬进 React 标题栏（已不在 interfaceContainer 内），
    // 因此单独打一个 sky 专属类名给 CSS 限位，非 sky 主题零影响。
    buttonContainerElement.classList.toggle("sa-debugger-hosted-actions", isSky);
    if (isSky) {
      if (tabListElement.parentNode !== interfaceContainer) {
        interfaceContainer.insertBefore(tabListElement, tabContentContainer);
      }
      // 窗口已打开（用户切换主题的瞬间）才挂宿主；关闭状态交由 setInterfaceVisible
      // 再次挂载，此时容器保持在文档之外，body 里不留隐藏残壳。
      if (isInterfaceVisible) mountSkyWindowHost();
      else if (!skyHosted && interfaceContainer.isConnected) interfaceContainer.remove();
    } else {
      unmountSkyWindowHost();
      // 恢复原版排布：页签行与功能按钮回到 card 头部；容器本身回到 body。
      interfaceHeader.append(tabListElement, buttonContainerElement);
      if (!interfaceContainer.isConnected) document.body.append(interfaceContainer);
    }
    // 全局拖拽仅在非 sky 下使用；sky 的拖动由 React Win11Window 提供。
    if (isSky && skyDragBound) {
      interfaceHeader.removeEventListener("mousedown", handleStartDrag);
      skyDragBound = false;
    } else if (!isSky && !skyDragBound) {
      interfaceHeader.addEventListener("mousedown", handleStartDrag);
      skyDragBound = true;
    }
  };
  addon.tab.redux.addEventListener("statechanged", syncSkyChrome);
  syncSkyChrome();

  const originalStep = vm.runtime._step;
  const afterStepCallbacks = [];
  vm.runtime._step = function (...args) {
    const ret = originalStep.call(this, ...args);
    for (const cb of afterStepCallbacks) {
      cb();
    }
    return ret;
  };
  const addAfterStepCallback = (cb) => {
    afterStepCallbacks.push(cb);
  };

  const getBlock = (target, id) => target.blocks.getBlock(id) || vm.runtime.flyoutBlocks.getBlock(id);

  const getTargetInfoById = (id) => {
    const target = vm.runtime.getTargetById(id);
    if (target) {
      let name = target.getName();
      let original = target;
      if (!target.isOriginal) {
        name = translateKey("debugger/clone-of", {
          sprite: name,
        });
        original = target.sprite.clones[0];
      }
      return {
        exists: true,
        originalId: original.id,
        name,
      };
    }
    return {
      exists: false,
      original: null,
      name: translateKey("debugger/unknown-sprite"),
    };
  };

  const createBlockLink = (targetInfo, blockId) => {
    const link = document.createElement("a");
    link.className = "sa-debugger-log-link";

    const { exists, name, originalId } = targetInfo;
    link.textContent = name;
    if (exists) {
      // We use mousedown instead of click so that you can still go to blocks when logs are rapidly scrolling
      link.addEventListener("mousedown", () => {
        switchToSprite(originalId);
        activateCodeTab();
        goToBlock(blockId);
      });
    } else {
      link.classList.add("sa-debugger-log-link-unknown");
    }

    return link;
  };

  const switchToSprite = (targetId) => {
    if (targetId !== vm.editingTarget.id) {
      if (vm.runtime.getTargetById(targetId)) {
        vm.setEditingTarget(targetId);
      }
    }
  };

  const activateCodeTab = () => {
    const redux = addon.tab.redux;
    if (redux.state.scratchGui.editorTab.activeTabIndex !== 0) {
      redux.dispatch({
        type: "scratch-gui/navigation/ACTIVATE_TAB",
        activeTabIndex: 0,
      });
    }
  };

  const goToBlock = (blockId) => {
    const workspace = Blockly.getMainWorkspace();
    const block = workspace.getBlockById(blockId);
    if (!block) return;

    // Don't scroll to blocks in the flyout
    if (block.workspace.isFlyout) return;

    new Utils(addon).scrollBlockIntoView(blockId);
  };

  /**
   * @param {string} procedureCode
   * @returns {string}
   */
  const formatProcedureCode = (procedureCode) => {
    const customBlock = addon.tab.getCustomBlock(procedureCode);
    if (customBlock) {
      procedureCode = customBlock.displayName;
    }
    // May be slightly incorrect in some edge cases.
    return procedureCode.replace(/%[nbs]/g, "()");
  };

  // May be slightly incorrect in some edge cases.
  const formatBlocklyBlockData = (jsonData) => {
    // For sample jsonData, see:
    // https://github.com/scratchfoundation/scratch-blocks/blob/0bd1a17e66a779ec5d11f4a00c43784e3ac7a7b8/blocks_vertical/motion.js
    // https://github.com/scratchfoundation/scratch-blocks/blob/0bd1a17e66a779ec5d11f4a00c43784e3ac7a7b8/blocks_vertical/control.js

    const processSegment = (index) => {
      const message = jsonData[`message${index}`];
      const args = jsonData[`args${index}`];
      if (!message) {
        return null;
      }
      const parts = message.split(/%\d+/g);
      let formattedMessage = "";
      for (let i = 0; i < parts.length; i++) {
        formattedMessage += parts[i];
        const argInfo = args && args[i];
        if (argInfo) {
          const type = argInfo.type;
          if (type === "field_vertical_separator") {
            // no-op
          } else if (type === "field_image") {
            const src = argInfo.src;
            if (src.endsWith("rotate-left.svg")) {
              formattedMessage += translateKey("_general/blocks/anticlockwise");
            } else if (src.endsWith("rotate-right.svg")) {
              formattedMessage += translateKey("_general/blocks/clockwise");
            } else if (src.endsWith("green-flag.svg")) {
              formattedMessage += translateKey("_general/blocks/green-flag");
            }
          } else {
            formattedMessage += "()";
          }
        }
      }
      return formattedMessage;
    };

    const parts = [];
    let i = 0;
    // The jsonData doesn't directly tell us how many segments it has, so we have to
    // just keep looping until one doesn't exist.
    while (true) {
      const nextSegment = processSegment(i);
      if (nextSegment) {
        parts.push(nextSegment);
      } else {
        break;
      }
      i++;
    }
    return parts.join(" ");
  };

  const createBlockPreview = (targetId, blockId) => {
    const target = vm.runtime.getTargetById(targetId);
    if (!target) {
      return null;
    }

    const block = getBlock(target, blockId);
    if (!block || block.opcode === "text") {
      return null;
    }

    let text;
    let category;
    let shape;
    let color;
    if (
      block.opcode === "data_variable" ||
      block.opcode === "data_listcontents" ||
      block.opcode === "argument_reporter_string_number" ||
      block.opcode === "argument_reporter_boolean"
    ) {
      text = Object.values(block.fields)[0].value;
      if (block.opcode === "data_variable") {
        category = "data";
      } else if (block.opcode === "data_listcontents") {
        category = "list";
      } else {
        category = "more";
      }
      shape = "round";
    } else if (block.opcode === "procedures_call") {
      const proccode = block.mutation.proccode;
      text = formatProcedureCode(proccode);
      const customBlock = addon.tab.getCustomBlock(proccode);
      if (customBlock) {
        category = "addon-custom-block";
      } else {
        category = "more";
      }
    } else if (block.opcode === "procedures_definition") {
      const prototypeBlockId = block.inputs.custom_block.block;
      const prototypeBlock = getBlock(target, prototypeBlockId);
      const proccode = prototypeBlock.mutation.proccode;
      text = ScratchBlocks.ScratchMsgs.translate("PROCEDURES_DEFINITION", "define %1").replace(
        "%1",
        formatProcedureCode(proccode)
      );
      category = "more";
    } else {
      // Try to call things like https://github.com/scratchfoundation/scratch-blocks/blob/0bd1a17e66a779ec5d11f4a00c43784e3ac7a7b8/blocks_vertical/operators.js#L36
      var jsonData;
      const fakeBlock = {
        jsonInit(data) {
          jsonData = data;
        },
      };
      const blockConstructor = ScratchBlocks.Blocks[block.opcode];
      if (blockConstructor) {
        try {
          blockConstructor.init.call(fakeBlock);
        } catch (e) {
          // ignore
        }
      }
      if (!jsonData) {
        return null;
      }
      text = formatBlocklyBlockData(jsonData);
      if (!text) {
        return null;
      }
      category = jsonData?.extensions.includes("default_extension_colors") ? "pen" : jsonData.category;
      const isStatement =
        (jsonData.extensions &&
          (jsonData.extensions.includes("shape_statement") ||
            jsonData.extensions.includes("shape_hat") ||
            jsonData.extensions.includes("shape_end"))) ||
        "previousStatement" in jsonData ||
        "nextStatement" in jsonData;
      shape = isStatement ? "stacked" : "round";
      color = jsonData.colour;
    }

    if (!text) {
      return null;
    }

    const element = document.createElement("span");
    element.className = "sa-debugger-block-preview sa-block-color";
    element.textContent = text;
    element.dataset.shape = shape;

    const COLOR_CLASSES = [
      "motion",
      "looks",
      "sounds",
      "events",
      "control",
      "sensing",
      "operators",
      "data",
      "data-lists",
      "list",
      "more",
      "pen",
      "addon-custom-block"
    ];
    if (COLOR_CLASSES.includes(category)) {
      element.classList.add(`sa-block-color-${category}`);
    } else if (color) {
      element.style.setProperty('--sa-block-colored-background', color);
    }

    return element;
  };

  const api = {
    debug: {
      createHeaderButton,
      createHeaderDropdown,
      createHeaderTab,
      setHasUnreadMessage,
      addAfterStepCallback,
      getBlock,
      getTargetInfoById,
      createBlockLink,
      createBlockPreview,
    },
    addon,
    msg,
    console,
  };
  logsTab = await createLogsTab(api);
  const threadsTab = await createThreadsTab(api);
  const performanceTab = await createPerformanceTab(api);
  const allTabs = [logsTab, threadsTab, performanceTab];

  for (const message of messagesLoggedBeforeLogsTabLoaded) {
    logsTab.addLog(...message);
  }
  messagesLoggedBeforeLogsTabLoaded.length = 0;

  let activeTab;
  const setActiveTab = (tab) => {
    if (tab === activeTab) return;
    const selectedClass = "sa-debugger-tab-selected";
    if (activeTab) {
      activeTab.hide();
      activeTab.tab.element.classList.remove(selectedClass);
    }
    tab.tab.element.classList.add(selectedClass);
    activeTab = tab;

    removeAllChildren(tabContentContainer);
    tabContentContainer.appendChild(tab.content);
    // SKYEditor：切页时重放内容入场动画（淡入 + 轻微上移）。
    // 先移除类再强制回流，才能让同名 CSS 动画重新触发。
    tab.content.classList.remove("sa-tab-enter");
    void tab.content.offsetWidth;
    tab.content.classList.add("sa-tab-enter");

    removeAllChildren(buttonContainerElement);
    buttonContainerElement.appendChild(unpauseButton.element);
    for (const button of tab.buttons) {
      buttonContainerElement.appendChild(button.element);
    }
    buttonContainerElement.appendChild(closeButton.element);

    if (isInterfaceVisible) {
      activeTab.show();
    }
  };
  for (const tab of allTabs) {
    tab.tab.element.addEventListener("click", () => {
      setActiveTab(tab);
    });
    tabListElement.appendChild(tab.tab.element);
  }
  setActiveTab(allTabs[0]);
  // 初始化完成（activeTab / 宿主桥均已就绪）：显式对齐隐藏态。
  // SE 主题下若只靠 JS 布尔 isInterfaceVisible=false 而从不执行隐藏动作，容器
  // 会以其默认 display 一直可见，表现为"打开编辑器自动弹调试器"。此处收口：
  // DOM 隐藏 + activeTab.hide() + 卸载宿主（未挂载时无操作），与状态机一致。
  setInterfaceVisible(false);

  addSmallStageClass();

  const ogGreenFlag = vm.runtime.greenFlag;
  vm.runtime.greenFlag = function (...args) {
    if (addon.settings.get("log_clear_greenflag")) {
      logsTab.clearLogs();
    }
    if (addon.settings.get("log_greenflag")) {
      logsTab.addLog(translateKey("debugger/log-msg-flag-clicked"), null, "internal");
    }
    return ogGreenFlag.call(this, ...args);
  };

  const ogMakeClone = vm.runtime.targets[0].constructor.prototype.makeClone;
  vm.runtime.targets[0].constructor.prototype.makeClone = function (...args) {
    if (addon.settings.get("log_failed_clone_creation") && !vm.runtime.clonesAvailable()) {
      logsTab.addLog(
        translateKey("debugger/log-msg-clone-cap", { sprite: this.getName() }),
        vm.runtime.sequencer.activeThread,
        "internal-warn"
      );
    }
    var clone = ogMakeClone.call(this, ...args);
    if (addon.settings.get("log_clone_create") && clone) {
      logsTab.addLog(
        translateKey("debugger/log-msg-clone-created", { sprite: this.getName() }),
        vm.runtime.sequencer.activeThread,
        "internal"
      );
    }
    return clone;
  };

  const ogStartHats = vm.runtime.startHats;
  vm.runtime.startHats = function (hat, optMatchFields, ...args) {
    if (addon.settings.get("log_broadcasts") && hat === "event_whenbroadcastreceived") {
      logsTab.addLog(
        translateKey("debugger/log-msg-broadcasted", { broadcast: optMatchFields.BROADCAST_OPTION }),
        vm.runtime.sequencer.activeThread,
        "internal"
      );
    }
    return ogStartHats.call(this, hat, optMatchFields, ...args);
  };

  // 窗口仅允许在用户点击入口按钮（.sa-debugger-container）时打开：
  // - 首次进入编辑器：不自动弹窗（本 addon 无任何模块级"打开过"状态）。
  // - 从播放器/全屏切回编辑器：窗口已在非编辑器视图被临时隐藏并释放焦点，
  //   切回时同样不自动弹出，需要时用户再点入口按钮重新打开（打开即重新
  //   注册焦点并置顶，与用户预期一致）。
  // 因此不再维护 pendingRestoreVisible 恢复标记——"切出自动隐藏、切回自动
  // 恢复"正是用户反馈的"启动编辑器自动弹窗"观感来源，此处彻底移除。
  // 初始化收口：调试器全部 UI 与语言刷新注册器均已就绪，此处按当前编辑器语言
  // 强制重绘一次，保证页签/空态/按钮/菜单项与编辑器语言严格一致；
  // refreshLanguageTexts 幂等，syncLanguageFromRedux 负责语言变化时的即时同步。
  syncLanguageFromRedux(addon);
  refreshLanguageTexts();
  while (true) {
    await addon.tab.waitForElement(
      '[class^="stage-header_stage-size-row"], [class^="stage-header_fullscreen-buttons-row_"]',
      {
        markAsSeen: true,
        reduxEvents: [
          "scratch-gui/mode/SET_PLAYER",
          "scratch-gui/mode/SET_FULL_SCREEN",
          "fontsLoaded/SET_FONTS_LOADED",
          "scratch-gui/locales/SELECT_LOCALE",
        ],
      }
    );
    if (addon.tab.editorMode === "editor") {
      addon.tab.appendToSharedSpace({ space: "stageHeader", element: debuggerButtonOuter, order: 0 });
    } else {
      // 非编辑器视图（播放器/全屏预览）：移除入口按钮，若窗口仍打开则隐藏并
      // 卸载宿主壳（setInterfaceVisible(false) 内部已调用 unmountSkyWindowHost），
      // 避免隐藏窗口继续占用管理器 active 焦点、挡住后方窗口去遮罩。
      debuggerButtonOuter.remove();
      if (isInterfaceVisible) {
        setInterfaceVisible(false);
      }
    }
  }
}
