import { onPauseChanged, isPaused } from "./module.js";
import { translateKey, registerLanguageRefresh } from "./module.js";
import "../../libraries/thirdparty/cs/chart.min.js";

// SKYEditor：性能页从"两卡流式"升级成可个性化仪表盘 ——
//   · 指标扩到 5 张卡（帧率 / 克隆体 / CPU / GPU / 网络延迟）；
//   · 每张卡可右键：进入编辑、前移一格、右移一格、移到最前、移到最后、切大中小；
//   · 编辑模式下卡片可自由拖动、右下角可拖拽改尺寸（hover 出现蓝色倒角提示）；
//   · 布局（顺序 / 尺寸 / 自由坐标）持久化到 localStorage，重开窗口仍在。
// 布局用"半格网格 + 自由坐标"混合：未拖动过的卡片按顺序自动排进网格，
// 拖动过的卡片（free）保留自己的像素坐标，网格排布会绕开它。

const GAP = 12;
// 中号卡基准尺寸（对齐改造前的 grid 观感：宽 272~320、高 178）
const BASE_CARD_WIDTH = 300;
const BASE_CARD_HEIGHT = 178;
// v2：尺寸口径改为「中/大 同宽、大 = 中两倍高」，旧版存下的自由尺寸可能不符合新口径，
// 换 key 让老布局自动作废一次，用户看到的就是标准三档。
const STORAGE_KEY = "sky:debugger-performance-layout:v2";
const NUMBER_OF_POINTS = 20;
const NETWORK_PROBE_MS = 4000;

// 三档尺寸的网格跨度（单位：半列 / 半行）
//   宽度只由 cols 决定：小 = 半列；中 / 大 = 整列 —— 所以「大」与「中」宽度完全一致；
//   高度由 rows 决定：1 = 半张卡高、2 = 一张卡高、4 = 两张卡高。
//   即：小 = 中号的四分之一，大 = 中号的两倍高、宽度不变。
const SIZE_SPANS = {
  small: {cols: 1, rows: 1},
  medium: {cols: 2, rows: 2},
  large: {cols: 2, rows: 4},
};
const SIZE_ORDER = ["small", "medium", "large"];

// 档位 → 像素尺寸（唯一的尺寸口径，relayout / 手动缩放吸附 / class 判定都走这里，
// 避免三处各算一套导致尺寸跑偏）
const spanWidth = (span, cellW, colW) => (span.cols === 1 ? cellW : colW);
const spanHeight = (span, cellH) => {
  if (span.rows === 1) return cellH;
  if (span.rows === 2) return BASE_CARD_HEIGHT;
  return BASE_CARD_HEIGHT * 2;
};

// 判定某个实际尺寸属于哪一档（手动拖出来的自由尺寸也要落到视觉档位上）
const rectSizeClass = (w, h) => {
  if (w < BASE_CARD_WIDTH * 0.72) return "small";
  if (h >= BASE_CARD_HEIGHT * 1.75) return "large";
  return "medium";
};

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export default async function createPerformanceTab({ debug, addon, console }) {
  const vm = addon.tab.traps.vm;

  // In optimized graphs everything still looks good
  const fancyGraphs = addon.settings.get("fancy_graphs");
  const lineWidth = fancyGraphs ? 1.6 : 2;
  const lineColor = getComputedStyle(document.documentElement).getPropertyValue("--looks-secondary").trim() || "#29beb8";

  const tab = debug.createHeaderTab({
    text: translateKey("debugger/tab-performance"),
    icon: addon.self.getResource("/icons/performance.svg") /* rewritten by pull.js */,
  });

  const content = Object.assign(document.createElement("div"), {
    className: "sa-performance-tab-content",
  });

  // 卡片画布：卡片全部 absolute 定位在这层里，父级只负责滚动。
  const canvas = Object.assign(document.createElement("div"), {
    className: "sa-perf-canvas",
  });
  content.appendChild(canvas);

  // SKYEditor：把颜色统一转成带透明度的 rgba，供 canvas 渐变使用（canvas 不认 color-mix）。
  const withAlpha = (color, alpha) => {
    const value = String(color).trim();
    if (value.startsWith("#")) {
      let hex = value.slice(1);
      if (hex.length === 3) {
        hex = hex
          .split("")
          .map((part) => part + part)
          .join("");
      }
      const num = parseInt(hex.slice(0, 6), 16);
      if (Number.isNaN(num)) return value;
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(",").map((part) => part.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
    return value;
  };

  const now = () => performance.now();

  // We'll guess that requestAnimationFrame is probably 60, but even if it's not, it's not a big deal.
  const getMaxFps = () => (vm.runtime.frameLoop.framerate === 0 ? 60 : vm.runtime.frameLoop.framerate);

  // An array like [19, 18, ..., 1, 0]
  const labels = Array.from(Array(NUMBER_OF_POINTS).keys()).reverse();

  // SKYEditor：每秒一次的数据更新用短促缓动（约 420ms）而不是默认 1s 动画，
  // 让曲线"滑过去"而不是每秒抖一下；x 轴不做动画，避免整条线横移。
  const chartAnimation = fancyGraphs
    ? {
        duration: 420,
        easing: "easeOutQuart",
      }
    : false;

  const plotBackground = (context) => {
    const chart = context.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) {
      // 首次渲染时 chartArea 还不存在，回退成纯色，下一帧自动换成渐变。
      return withAlpha(lineColor, 0.18);
    }
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, withAlpha(lineColor, 0.26));
    gradient.addColorStop(0.65, withAlpha(lineColor, 0.08));
    gradient.addColorStop(1, withAlpha(lineColor, 0));
    return gradient;
  };

  const sharedScales = (suggestedMax) => ({
    x: {
      grid: {
        display: false,
      },
      border: {
        display: false,
      },
      ticks: {
        display: false,
      },
    },
    y: {
      suggestedMax,
      min: 0,
      grid: {
        color: withAlpha(getComputedStyle(document.documentElement).getPropertyValue("--ui-modal-foreground").trim() || "#575e75", 0.12),
        drawTicks: false,
      },
      border: {
        display: false,
      },
      ticks: {
        maxTicksLimit: 3,
        padding: 4,
        font: {
          size: 9,
        },
      },
    },
  });

  const sharedPlugins = (tooltipLabel) => ({
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: "rgba(24, 26, 32, 0.92)",
      padding: 8,
      cornerRadius: 8,
      displayColors: false,
      titleFont: {
        size: 11,
      },
      bodyFont: {
        size: 12,
      },
      callbacks: {
        label: tooltipLabel,
      },
    },
  });

  const datasetDefaults = () => ({
    data: Array(NUMBER_OF_POINTS).fill(null),
    borderWidth: lineWidth,
    fill: true,
    backgroundColor: plotBackground,
    borderColor: lineColor,
    tension: 0.35,
    // 只让最新那个点显形（其余为 0），曲线末端有明确的"当前位置"锚点
    pointRadius: (context) => {
      const data = context.dataset.data;
      return context.dataIndex === data.length - 1 && context.raw !== null ? 2.6 : 0;
    },
    pointBackgroundColor: lineColor,
    pointBorderColor: "rgba(255, 255, 255, 0.85)",
    pointBorderWidth: 1.2,
    pointHoverRadius: 3.4,
    pointHitRadius: 12,
    borderCapStyle: "round",
    borderJoinStyle: "round",
  });

  const cards = [];
  const cardByKey = new Map();

  // SKYEditor：卡片化布局 —— 标题 + 实时数值（滚动动画）+ 图表，一张卡一个指标。
  const createMetricCard = ({ key, titleKey, unit, tooltipKey, tooltipVar, suggestedMax, index }) => {
    const element = Object.assign(document.createElement("div"), {
      className: "sa-perf-card",
    });
    element.dataset.metric = key;
    element.style.setProperty("--sa-perf-index", String(index));

    const head = Object.assign(document.createElement("div"), {
      className: "sa-perf-card-head",
    });
    const titleElement = Object.assign(document.createElement("span"), {
      className: "sa-perf-card-title",
      textContent: translateKey(titleKey),
    });
    const metric = Object.assign(document.createElement("div"), {
      className: "sa-perf-card-metric",
    });
    const valueElement = Object.assign(document.createElement("span"), {
      className: "sa-perf-card-value",
      textContent: "–",
    });
    valueElement.dataset.numeric = "0";
    metric.appendChild(valueElement);
    const unitElement = Object.assign(document.createElement("span"), {
      className: "sa-perf-card-unit",
      textContent: unit || "",
    });
    metric.appendChild(unitElement);
    head.appendChild(titleElement);
    head.appendChild(metric);

    const plot = Object.assign(document.createElement("div"), {
      className: "sa-perf-card-plot",
    });
    const chartCanvas = Object.assign(document.createElement("canvas"), {
      className: "sa-debugger-chart",
    });
    plot.appendChild(chartCanvas);

    // 右下角缩放手柄：平时透明，编辑模式 hover 卡片浮现蓝色倒角。
    const resizer = Object.assign(document.createElement("div"), {
      className: "sa-perf-resize",
    });
    resizer.title = translateKey("debugger/performance-menu-resize-hint");

    element.appendChild(head);
    element.appendChild(plot);
    element.appendChild(resizer);
    canvas.appendChild(element);

    const chart = new Chart(chartCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [datasetDefaults()],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnimation,
        animations: {
          x: {
            duration: 0,
          },
        },
        layout: {
          padding: {
            top: 4,
            right: 4,
            bottom: 0,
            left: 0,
          },
        },
        scales: sharedScales(suggestedMax),
        plugins: sharedPlugins((context) => translateKey(tooltipKey, {[tooltipVar]: context.parsed.y})),
      },
    });

    const card = {
      key,
      element,
      head,
      title: titleElement,
      value: valueElement,
      unit: unitElement,
      plot,
      canvas: chartCanvas,
      chart,
      resizer,
      titleKey,
      tooltipKey,
      tooltipVar,
      // 布局状态
      size: "medium",
      free: false,
      x: 0,
      y: 0,
      w: BASE_CARD_WIDTH,
      h: BASE_CARD_HEIGHT,
    };
    cards.push(card);
    cardByKey.set(key, card);
    return card;
  };

  const fpsCard = createMetricCard({
    key: "fps",
    titleKey: "debugger/performance-framerate-title",
    unit: "FPS",
    tooltipKey: "debugger/performance-framerate-graph-tooltip",
    tooltipVar: "fps",
    suggestedMax: getMaxFps(),
    index: 0,
  });
  const clonesCard = createMetricCard({
    key: "clones",
    titleKey: "debugger/performance-clonecount-title",
    unit: translateKey("debugger/performance-clonecount-unit"),
    tooltipKey: "debugger/performance-clonecount-graph-tooltip",
    tooltipVar: "clones",
    suggestedMax: 300,
    index: 1,
  });
  const cpuCard = createMetricCard({
    key: "cpu",
    titleKey: "debugger/performance-cpu-title",
    unit: "%",
    tooltipKey: "debugger/performance-cpu-graph-tooltip",
    tooltipVar: "value",
    suggestedMax: 100,
    index: 2,
  });
  const gpuCard = createMetricCard({
    key: "gpu",
    titleKey: "debugger/performance-gpu-title",
    unit: "%",
    tooltipKey: "debugger/performance-gpu-graph-tooltip",
    tooltipVar: "value",
    suggestedMax: 100,
    index: 3,
  });
  const networkCard = createMetricCard({
    key: "network",
    titleKey: "debugger/performance-network-title",
    unit: "ms",
    tooltipKey: "debugger/performance-network-graph-tooltip",
    tooltipVar: "value",
    suggestedMax: 500,
    index: 4,
  });

  // ---------------------------------------------------------------- 布局引擎
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const findSlot = (placed, w, h, stepX, stepY, width) => {
    for (let row = 0; row < 400; row++) {
      const y = row * stepY;
      for (let x = 0; x <= width - w + 0.5; x += stepX) {
        const rect = {x, y, w, h};
        if (!placed.some((other) => overlaps(other, rect))) return rect;
      }
    }
    return {x: 0, y: 0, w, h};
  };

  const applyRect = (card, rect) => {
    card.rect = rect;
    const style = card.element.style;
    style.left = `${Math.round(rect.x)}px`;
    style.top = `${Math.round(rect.y)}px`;
    style.width = `${Math.round(rect.w)}px`;
    style.height = `${Math.round(rect.h)}px`;
    const sizeClass = rectSizeClass(rect.w, rect.h);
    const small = sizeClass === "small";
    card.element.classList.toggle("sa-perf-card-small", small);
    card.element.classList.toggle("sa-perf-card-large", sizeClass === "large");
    // 图表吃掉卡片剩余高度；小卡头部更紧凑，留白更少。
    const chromeHeight = small ? 40 : 47;
    style.setProperty("--sa-perf-plot-h", `${Math.max(22, Math.round(rect.h - chromeHeight))}px`);
  };

  // 当前画布度量（拖动吸附 / 缩放吸附都要用，relayout 时刷新）
  let layoutMetrics = {width: 320, cols: 1, colW: 320, cellW: 154, cellH: 83, stepX: 166, stepY: 95};

  const relayout = () => {
    const width = canvas.clientWidth || 320;
    const cols = Math.max(1, Math.floor((width + GAP) / (BASE_CARD_WIDTH + GAP)));
    const colW = (width - GAP * (cols - 1)) / cols;
    const cellW = (colW - GAP) / 2;
    const cellH = (BASE_CARD_HEIGHT - GAP) / 2;
    const stepX = cellW + GAP;
    const stepY = cellH + GAP;
    layoutMetrics = {width, cols, colW, cellW, cellH, stepX, stepY};

    const placed = [];
    let bottom = 0;
    for (const card of cards) {
      let rect;
      if (card.free) {
        const w = clamp(card.w, 120, width);
        const h = Math.max(86, card.h);
        rect = {
          x: clamp(card.x, 0, Math.max(0, width - w)),
          y: Math.max(0, card.y),
          w,
          h,
        };
        card.w = rect.w;
        card.x = rect.x;
      } else {
        const span = SIZE_SPANS[card.size] || SIZE_SPANS.medium;
        // 宽度中/大一致（=整列），高度大卡严格等于中卡两倍
        const w = spanWidth(span, cellW, colW);
        const h = spanHeight(span, cellH);
        rect = findSlot(placed, w, h, stepX, stepY, width);
      }
      placed.push(rect);
      applyRect(card, rect);
      bottom = Math.max(bottom, rect.y + rect.h);
    }
    canvas.style.height = `${Math.max(bottom, 140)}px`;
    requestAnimationFrame(() => {
      if (isVisible) cards.forEach((card) => card.chart.resize());
    });
  };

  const redrawCharts = () => {
    if (!isVisible) return;
    cards.forEach((card) => card.chart.update());
  };

  // ------------------------------------------------------------ 布局持久化
  const saveLayout = () => {
    try {
      const state = {order: cards.map((card) => card.key), cards: {}};
      for (const card of cards) {
        state.cards[card.key] = {
          size: card.size,
          free: card.free,
          x: card.x,
          y: card.y,
          w: card.w,
          h: card.h,
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // localStorage 被禁用时静默降级（布局本次有效，不持久化）
    }
  };

  const loadLayout = () => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
      saved = null;
    }
    if (!saved) return;
    if (Array.isArray(saved.order)) {
      const rank = new Map();
      saved.order.forEach((key, index) => rank.set(key, index));
      cards.sort((a, b) => (rank.has(a.key) ? rank.get(a.key) : 999) - (rank.has(b.key) ? rank.get(b.key) : 999));
    }
    if (saved.cards && typeof saved.cards === "object") {
      for (const card of cards) {
        const state = saved.cards[card.key];
        if (!state) continue;
        if (SIZE_ORDER.includes(state.size)) card.size = state.size;
        if (typeof state.free === "boolean") card.free = state.free;
        if (Number.isFinite(state.x)) card.x = state.x;
        if (Number.isFinite(state.y)) card.y = state.y;
        if (Number.isFinite(state.w)) card.w = state.w;
        if (Number.isFinite(state.h)) card.h = state.h;
      }
    }
  };

  // ------------------------------------------------------------- 右键菜单
  const menu = Object.assign(document.createElement("div"), {
    className: "sa-perf-menu",
  });
  menu.setAttribute("role", "menu");
  document.body.appendChild(menu);

  let menuCard = null;
  let menuOpen = false;

  const closeMenu = () => {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove("sa-perf-menu-open");
    // 菜单开着时高亮对应卡片（避免记错在操作哪一张）
    if (menuCard) menuCard.element.classList.remove("sa-perf-card-menu-open");
    menuCard = null;
  };

  const menuItem = ({label, hint, checked, disabled, onSelect}) => {
    const item = Object.assign(document.createElement("div"), {
      className: "sa-perf-menu-item",
    });
    if (checked) item.classList.add("sa-perf-menu-item-checked");
    if (disabled) item.classList.add("sa-perf-menu-item-disabled");
    const text = Object.assign(document.createElement("span"), {
      className: "sa-perf-menu-label",
      textContent: label,
    });
    item.appendChild(text);
    if (hint) {
      item.appendChild(
        Object.assign(document.createElement("span"), {
          className: "sa-perf-menu-hint",
          textContent: hint,
        })
      );
    }
    if (!disabled) {
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        onSelect();
      });
    }
    menu.appendChild(item);
    return item;
  };

  const menuDivider = () => {
    menu.appendChild(
      Object.assign(document.createElement("div"), {
        className: "sa-perf-menu-divider",
      })
    );
  };

  const menuCaption = (label) => {
    menu.appendChild(
      Object.assign(document.createElement("div"), {
        className: "sa-perf-menu-caption",
        textContent: label,
      })
    );
  };

  // 顺序类操作：index 是卡片在当前顺序里的位置
  const moveCard = (card, delta) => {
    const index = cards.indexOf(card);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= cards.length) return;
    cards.splice(index, 1);
    cards.splice(target, 0, card);
    relayout();
    saveLayout();
  };

  const sendToEdge = (card, toFront) => {
    const index = cards.indexOf(card);
    if (index < 0) return;
    cards.splice(index, 1);
    if (toFront) cards.unshift(card);
    else cards.push(card);
    relayout();
    saveLayout();
  };

  const setCardSize = (card, size) => {
    if (!SIZE_SPANS[size]) return;
    card.size = size;
    // 切档位回到自动网格：档位本身就是网格语义，保留自由坐标会和用户预期打架。
    card.free = false;
    relayout();
    saveLayout();
  };

  // 一键回到出厂布局：全部中号、自动网格排布（拖乱了不用手动一个个调）
  const resetLayout = () => {
    for (const card of cards) {
      card.size = "medium";
      card.free = false;
      card.x = 0;
      card.y = 0;
      card.w = 0;
      card.h = 0;
    }
    relayout();
    saveLayout();
  };

  const buildMenu = (card) => {
    menu.textContent = "";
    const index = cards.indexOf(card);

    menuItem({
      label: translateKey(editing ? "debugger/performance-menu-exit-edit" : "debugger/performance-menu-edit"),
      hint: "E",
      onSelect: () => setEditing(!editing),
    });
    menuDivider();
    menuItem({
      label: translateKey("debugger/performance-menu-move-prev"),
      disabled: index <= 0,
      onSelect: () => moveCard(card, -1),
    });
    menuItem({
      label: translateKey("debugger/performance-menu-move-next"),
      disabled: index >= cards.length - 1,
      onSelect: () => moveCard(card, 1),
    });
    menuItem({
      label: translateKey("debugger/performance-menu-move-first"),
      disabled: index <= 0,
      onSelect: () => sendToEdge(card, true),
    });
    menuItem({
      label: translateKey("debugger/performance-menu-move-last"),
      disabled: index >= cards.length - 1,
      onSelect: () => sendToEdge(card, false),
    });
    menuDivider();
    menuCaption(translateKey("debugger/performance-menu-size"));
    for (const size of SIZE_ORDER) {
      menuItem({
        label: translateKey(`debugger/performance-size-${size}`),
        checked: !card.free && card.size === size,
        onSelect: () => setCardSize(card, size),
      });
    }
    menuDivider();
    menuItem({
      label: translateKey("debugger/performance-menu-reset-layout"),
      hint: "R",
      onSelect: resetLayout,
    });
  };

  const openMenu = (card, clientX, clientY) => {
    if (!content.isConnected) return;
    if (menuCard && menuCard !== card) menuCard.element.classList.remove("sa-perf-card-menu-open");
    menuCard = card;
    card.element.classList.add("sa-perf-card-menu-open");
    buildMenu(card);
    menu.classList.add("sa-perf-menu-open");
    menuOpen = true;
    // 先显示再量尺寸，保证贴边翻转时不会闪一下
    const rect = menu.getBoundingClientRect();
    const left = clamp(clientX, 8, window.innerWidth - rect.width - 8);
    const top = clamp(clientY, 8, window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (menuOpen && !menu.contains(event.target)) closeMenu();
    },
    true
  );
  window.addEventListener("resize", closeMenu);
  window.addEventListener("blur", closeMenu);
  // 滚动条在窗口内容区（外层 tab-content）上，滚动时菜单不能再跟着漂：
  // 用 document 捕获阶段统一监听，内层/外层任何滚动都能收起菜单。
  document.addEventListener(
    "scroll",
    () => {
      if (menuOpen) closeMenu();
    },
    true
  );
  // Esc / E / R 的键盘处理统一放在编辑模式段落之后注册（见下方快捷键监听），
  // 这里只保留"点空白收菜单"与滚动收菜单。

  // ---------------------------------------------------------- 编辑模式 / 拖动
  let editing = false;

  const setEditing = (value) => {
    editing = value;
    content.classList.toggle("sa-perf-editing", editing);
    if (!editing) saveLayout();
  };

  // ---------------------------------------------------------- 键盘操作
  // 只在本页可见、且焦点不在输入类控件上时接管，避免干扰滑块键盘微调与其它页签。
  const isPerfTabActive = () => content.isConnected && content.offsetHeight > 0 && !content.closest("[hidden]");
  document.addEventListener(
    "keydown",
    (event) => {
      if (!isPerfTabActive()) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

      // Esc 分两级：第一下只收菜单，第二下退出编辑模式；两级都拦下冒泡，
      // 不会顺手把调试器窗口也关掉（关窗要再按一次 Esc）。
      if (event.key === "Escape") {
        if (menuOpen) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          return;
        }
        if (editing) {
          event.preventDefault();
          event.stopPropagation();
          setEditing(false);
        }
        return;
      }

      // E：进入/退出自由编辑；R：把所有卡片恢复成默认中号布局
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        closeMenu();
        setEditing(!editing);
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        closeMenu();
        resetLayout();
      }
    },
    true
  );

  // 画布坐标系取点：以 canvas 左上角为原点。这样内容区一旦滚动，canvas 的
  // getBoundingClientRect 会同步变化，卡片的位移计算自动把滚动量算进去，
  // 不会出现"滚动之后卡片从手指上飞走"。
  const toCanvasPoint = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return {x: clientX - rect.left, y: clientY - rect.top};
  };

  // 拖动/缩放时指针贴近内容区上下边缘，就让内容区自己滚（长列表里把卡片
  // 挪到视口外不必反复松手）。只在指针进入边缘带时滚，避免一直滚过头。
  const edgeScroll = clientY => {
    let node = content.parentElement;
    let scroller = null;
    while (node && node !== document.body) {
      const {overflowY} = getComputedStyle(node);
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
        scroller = node;
        break;
      }
      node = node.parentElement;
    }
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const EDGE = 44;
    const SPEED = 16;
    if (clientY < rect.top + EDGE) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop - SPEED);
    } else if (clientY > rect.bottom - EDGE) {
      scroller.scrollTop = Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + SPEED);
    }
  };

  const beginDrag = (card, event) => {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startPoint = toCanvasPoint(event.clientX, event.clientY);
    const originX = card.rect.x;
    const originY = card.rect.y;
    const maxX = Math.max(0, (canvas.clientWidth || 320) - card.rect.w);
    let cancelled = false;
    card.element.classList.add("sa-perf-card-dragging");
    card.element.setPointerCapture(event.pointerId);

    const onMove = moveEvent => {
      edgeScroll(moveEvent.clientY);
      const point = toCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      const x = clamp(originX + point.x - startPoint.x, 0, maxX);
      const y = Math.max(0, originY + point.y - startPoint.y);
      card.element.style.left = `${Math.round(x)}px`;
      card.element.style.top = `${Math.round(y)}px`;
    };

    const cleanup = () => {
      card.element.removeEventListener("pointermove", onMove);
      card.element.removeEventListener("pointerup", onUp);
      card.element.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown, true);
      card.element.classList.remove("sa-perf-card-dragging");
    };

    const onUp = upEvent => {
      if (card.element.hasPointerCapture(upEvent.pointerId)) {
        card.element.releasePointerCapture(upEvent.pointerId);
      }
      cleanup();
      // Esc 取消：回到拖动前的位置，不写入布局
      if (cancelled) {
        relayout();
        return;
      }
      // 只是点了一下（没有实际位移）就不要把卡片改成自由布局，双击切档也依赖这一点
      const endPoint = toCanvasPoint(upEvent.clientX, upEvent.clientY);
      const moved = Math.abs(endPoint.x - startPoint.x) + Math.abs(endPoint.y - startPoint.y) > 3;
      if (!moved) {
        relayout();
        return;
      }
      // 松手吸附到半格网格（与小/中/大三档同一套格子），位置更齐整、也更贴近档位节奏
      const toStep = (value, step) => Math.round(value / step) * step;
      card.free = true;
      card.x = clamp(toStep(parseFloat(card.element.style.left) || 0, layoutMetrics.stepX), 0, maxX);
      card.y = Math.max(0, toStep(parseFloat(card.element.style.top) || 0, layoutMetrics.stepY));
      relayout();
      saveLayout();
    };

    // Esc 中止本次拖动（捕获阶段拦下，避免顺带把调试器窗口也关掉）
    const onKeyDown = keyEvent => {
      if (keyEvent.key !== "Escape" || cancelled) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancelled = true;
      cleanup();
      relayout();
    };

    card.element.addEventListener("pointermove", onMove);
    card.element.addEventListener("pointerup", onUp);
    card.element.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown, true);
  };

  const beginResize = (card, event) => {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startPoint = toCanvasPoint(event.clientX, event.clientY);
    const originW = card.rect.w;
    const originH = card.rect.h;
    const maxW = canvas.clientWidth || 320;
    let cancelled = false;
    card.element.classList.add("sa-perf-card-resizing", "sa-perf-card-dragging");
    card.resizer.setPointerCapture(event.pointerId);

    let frame = 0;
    const onMove = moveEvent => {
      edgeScroll(moveEvent.clientY);
      const point = toCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      const w = clamp(originW + point.x - startPoint.x, 132, Math.max(132, maxW - card.rect.x));
      const h = Math.max(86, originH + point.y - startPoint.y);
      card.element.style.width = `${Math.round(w)}px`;
      card.element.style.height = `${Math.round(h)}px`;
      card.element.style.setProperty("--sa-perf-plot-h", `${Math.max(22, Math.round(h - (w < BASE_CARD_WIDTH * 0.72 ? 40 : 47)))}px`);
      const sizeClass = rectSizeClass(w, h);
      card.element.classList.toggle("sa-perf-card-small", sizeClass === "small");
      card.element.classList.toggle("sa-perf-card-large", sizeClass === "large");
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          card.chart.resize();
        });
      }
    };

    const cleanup = () => {
      card.resizer.removeEventListener("pointermove", onMove);
      card.resizer.removeEventListener("pointerup", onUp);
      card.resizer.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown, true);
      card.element.classList.remove("sa-perf-card-resizing", "sa-perf-card-dragging");
    };

    const onUp = upEvent => {
      if (card.resizer.hasPointerCapture(upEvent.pointerId)) {
        card.resizer.releasePointerCapture(upEvent.pointerId);
      }
      cleanup();
      // Esc 取消：尺寸回到缩放前，不写入布局
      if (cancelled) {
        relayout();
        card.chart.resize();
        return;
      }
      card.free = true;
      // 松手吸附：宽度贴近半列 / 整列、高度贴近半卡 / 一张 / 两张卡高时，
      // 直接落到标准档位尺寸，手动拖出来的卡片也能和"小/中/大"对齐。
      const m = layoutMetrics;
      let w = Math.round(parseFloat(card.element.style.width) || originW);
      let h = Math.round(parseFloat(card.element.style.height) || originH);
      const widthHit = [m.cellW, m.colW].find(value => Math.abs(w - value) <= 10);
      if (widthHit) w = Math.round(widthHit);
      const heightHit = [m.cellH, BASE_CARD_HEIGHT, BASE_CARD_HEIGHT * 2].find(value => Math.abs(h - value) <= 14);
      if (heightHit) h = Math.round(heightHit);
      card.w = w;
      card.h = h;
      card.x = card.rect.x;
      card.y = card.rect.y;
      relayout();
      saveLayout();
      card.chart.resize();
    };

    const onKeyDown = keyEvent => {
      if (keyEvent.key !== "Escape" || cancelled) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancelled = true;
      cleanup();
      relayout();
      card.chart.resize();
    };

    card.resizer.addEventListener("pointermove", onMove);
    card.resizer.addEventListener("pointerup", onUp);
    card.resizer.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown, true);
  };

  // 卡片交互统一挂一次：右键开菜单、编辑态按下拖动、手柄拖动改尺寸、双击循环切档
  for (const card of cards) {
    card.element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(card, event.clientX, event.clientY);
    });
    card.element.addEventListener("pointerdown", (event) => beginDrag(card, event));
    card.element.addEventListener("dblclick", (event) => {
      if (!editing) return;
      event.preventDefault();
      event.stopPropagation();
      // 小 → 中 → 大 → 小 循环，改尺寸不用再走右键菜单
      const index = SIZE_ORDER.indexOf(card.size);
      const next = SIZE_ORDER[(index < 0 ? 1 : index + 1) % SIZE_ORDER.length];
      setCardSize(card, next);
    });
    card.resizer.addEventListener("pointerdown", (event) => beginResize(card, event));
  }

  // ------------------------------------------------------------ 指标采集
  // CPU：包一层 runtime._step 测主线程每帧耗时（userscript 已有的包装在内层，
  //      这里只做计时，不改变调用语义）。
  // GPU：包一层 renderer.draw 测每帧渲染提交耗时。浏览器不暴露真实 GPU 占用，
  //      这层耗时是页面侧唯一可测的渲染成本，工具提示里标明"估算"。
  const timing = {stepCost: 0, renderCost: 0, ready: false};

  if (!vm.runtime.__saPerfTiming) {
    const innerStep = vm.runtime._step;
    vm.runtime._step = function (...args) {
      const start = now();
      try {
        return innerStep.apply(this, args);
      } finally {
        timing.stepCost = now() - start;
        const renderer = vm.runtime.renderer;
        if (renderer && typeof renderer.draw === "function" && !renderer.__saPerfPatched) {
          renderer.__saPerfPatched = true;
          const innerDraw = renderer.draw;
          renderer.draw = function (...drawArgs) {
            const drawStart = now();
            try {
              return innerDraw.apply(this, drawArgs);
            } finally {
              timing.renderCost = now() - drawStart;
              timing.ready = true;
            }
          };
        }
      }
    };
    vm.runtime.__saPerfTiming = timing;
  } else {
    Object.assign(timing, vm.runtime.__saPerfTiming);
  }

  // 网络：优先 navigator.connection 的 rtt，取不到就自己发一个 HEAD 探测回环。
  const network = {rtt: 0, type: "", online: navigator.onLine};
  const readConnection = () =>
    navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

  const probeNetwork = async () => {
    network.online = navigator.onLine;
    if (!network.online) {
      network.rtt = 0;
      network.type = translateKey("debugger/performance-network-offline");
      return;
    }
    const connection = readConnection();
    network.type = connection && connection.effectiveType ? connection.effectiveType : "";
    if (connection && Number.isFinite(connection.rtt) && connection.rtt > 0) {
      network.rtt = Math.round(connection.rtt);
      return;
    }
    try {
      const start = now();
      await fetch(`${location.href.split("#")[0]}?sa-perf-probe=${start}`, {
        method: "HEAD",
        cache: "no-store",
      });
      network.rtt = Math.round(now() - start);
    } catch (e) {
      network.rtt = 0;
    }
  };
  probeNetwork();
  const networkTimer = window.setInterval(probeNetwork, NETWORK_PROBE_MS);

  // SKYEditor：卡片右上角的实时数值 —— 数字变化时做 420ms 缓动滚动，
  // 与图表动画同节奏，避免"数字瞬间跳、曲线慢慢滑"的割裂感。
  const tweenValue = (element, to) => {
    const target = Math.round(Number(to) || 0);
    const from = Number(element.dataset.numeric || 0);
    element.dataset.numeric = String(target);
    if (from === target) {
      element.textContent = String(target);
      return;
    }
    element.classList.add("sa-perf-card-value-tween");
    const start = now();
    const DURATION = 420;
    const step = (time) => {
      const progress = Math.min(1, (time - start) / DURATION);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.classList.remove("sa-perf-card-value-tween");
      }
    };
    requestAnimationFrame(step);
  };

  const pushSample = (card, value) => {
    const data = card.chart.data.datasets[0].data;
    data.shift();
    data.push(value);
    tweenValue(card.value, value);
  };

  // Holds the times of each frame drawn in the last second.
  // The length of this list is effectively the FPS.
  const renderTimes = [];

  // The last time we pushed a new datapoint to the graph
  let lastFpsTime = now() + 3000;
  let cpuAccum = 0;
  let gpuAccum = 0;
  let costSamples = 0;

  debug.addAfterStepCallback(() => {
    if (isPaused()) {
      return;
    }
    const time = now();

    // Remove all frame times older than 1 second in renderTimes
    while (renderTimes.length > 0 && renderTimes[0] <= time - 1000) renderTimes.shift();
    renderTimes.push(time);

    const budget = 1000 / getMaxFps();
    if (timing.ready) {
      cpuAccum += Math.min(1, timing.stepCost / budget) * 100;
      gpuAccum += Math.min(1, timing.renderCost / budget) * 100;
      costSamples++;
    }

    if (time - lastFpsTime > 1000) {
      lastFpsTime = time;

      const maxFps = getMaxFps();
      const currentFps = Math.min(renderTimes.length, maxFps);
      pushSample(fpsCard, currentFps);
      // Incase we switch between 30FPS and 60FPS, update the max height of the chart.
      fpsCard.chart.options.scales.y.suggestedMax = maxFps;

      pushSample(clonesCard, vm.runtime._cloneCounter);
      pushSample(cpuCard, costSamples ? Math.round(cpuAccum / costSamples) : 0);
      pushSample(gpuCard, costSamples ? Math.round(gpuAccum / costSamples) : 0);
      pushSample(networkCard, network.rtt || 0);
      cpuAccum = 0;
      gpuAccum = 0;
      costSamples = 0;

      redrawCharts();
    }
  });

  let pauseTime = 0;
  onPauseChanged((paused) => {
    if (paused) {
      pauseTime = now();
    } else {
      const dt = now() - pauseTime;
      lastFpsTime += dt;
      for (var i = 0; i < renderTimes.length; i++) {
        renderTimes[i] += dt;
      }
    }
  });

  // SKYEditor：切回性能页时的一次性展开动画 —— x 轴一次性给 520ms（平时为 0，
  // 否则每秒的 shift/push 会让整条线横着抖），播完立即恢复，后续更新照旧只有 y 缓动。
  const playIntro = (chart) => {
    if (!fancyGraphs) {
      chart.update();
      return;
    }
    chart.options.animations.x.duration = 520;
    chart.update();
    setTimeout(() => {
      chart.options.animations.x.duration = 0;
    }, 560);
  };

  let isVisible = false;

  // 容器宽度变化（窗口缩放 / 侧栏开合）时重排：拖动过的卡片保持自己的坐标。
  let resizeFrame = 0;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      relayout();
    });
  });

  const show = () => {
    isVisible = true;
    // SKYEditor：每次切回性能页时重放一次卡片入场 + 图表重绘动画，让页面"醒过来"。
    if (content.isConnected) {
      content.classList.remove("sa-perf-enter");
      // 强制回流，保证同名动画能重新触发。
      void content.offsetWidth;
      content.classList.add("sa-perf-enter");
    }
    relayout();
    if (canvas.isConnected && !resizeObserver.__saAttached) {
      resizeObserver.observe(canvas);
      resizeObserver.__saAttached = true;
    }
    requestAnimationFrame(() => {
      cards.forEach((card) => card.chart.resize());
      // 首次/切回时让曲线从左往右"拉"出来，之后每秒更新恢复成短促缓动。
      cards.forEach((card) => playIntro(card.chart));
    });
  };
  const hide = () => {
    isVisible = false;
    closeMenu();
  };

  // 语言热同步：页签名、五张卡标题、单位随编辑器语言重绘
  //（tooltip 与右键菜单在求值时按需 translateKey，不需要额外注册）。
  registerLanguageRefresh(() => {
    tab.text.textContent = translateKey("debugger/tab-performance");
    for (const card of cards) {
      card.title.textContent = translateKey(card.titleKey);
    }
    clonesCard.unit.textContent = translateKey("debugger/performance-clonecount-unit");
  });

  loadLayout();
  relayout();

  // tab 内容被复用（窗口反复开关），卸载时清掉定时器与全局菜单
  const teardown = () => {
    window.clearInterval(networkTimer);
    if (menu.isConnected) menu.remove();
    closeMenu();
  };
  if (typeof content.addEventListener === "function") {
    content.addEventListener("sa-perf-teardown", teardown, {once: true});
  }

  return {
    tab,
    content,
    buttons: [],
    show,
    hide,
  };
}
