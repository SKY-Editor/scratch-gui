import EventTarget from "../../event-target.js"; /* inserted by pull.js */
import enMessages from "../../addons-l10n/en.json";
import zhCNMessages from "../../addons-l10n/zh-cn.json";
import zhTWMessages from "../../addons-l10n/zh-tw.json";

// https://github.com/scratchfoundation/scratch-vm/blob/bb352913b57991713a5ccf0b611fda91056e14ec/src/engine/thread.js#L198
const STATUS_RUNNING = 0;
const STATUS_PROMISE_WAIT = 1;
const STATUS_YIELD = 2;
const STATUS_YIELD_TICK = 3;
const STATUS_DONE = 4;

const REACT_INTERNAL_PREFIX = "__reactInternalInstance$";

let vm;

let paused = false;
let pausedThreadState = new WeakMap();
let pauseNewThreads = false;

let steppingThread = null;

const eventTarget = new EventTarget();

let audioContextStateChange = Promise.resolve();

export const isPaused = () => paused;

const pauseThread = (thread) => {
  if (thread.updateMonitor || pausedThreadState.has(thread)) {
    // Thread is already paused or shouldn't be paused.
    return;
  }

  const pauseState = {
    time: vm.runtime.currentMSecs,
    status: thread.status,
  };
  pausedThreadState.set(thread, pauseState);

  // Pausing a thread now works by just setting its status to STATUS_PROMISE_WAIT.
  // At the start of each frame, we make sure each paused thread is still paused.
  // This is really the best way to implement this.
  // Converting thread.status into a getter/setter causes Scratch's sequencer to permanently
  //    perform significantly slower in some projects. I think this is because it causes some
  //    very hot functions to be deoptimized.
  // Trapping sequencer.stepThread to no-op for a paused thread causes Scratch's sequencer
  //    to waste 24ms of CPU time every frame because it thinks a thread is running.
  thread.status = STATUS_PROMISE_WAIT;
};

const ensurePausedThreadIsStillPaused = (thread) => {
  if (thread.status === STATUS_DONE) {
    // If a paused thread is finished by single stepping, let it keep being done.
    return;
  }
  const pauseState = pausedThreadState.get(thread);
  if (pauseState) {
    if (thread.status !== STATUS_PROMISE_WAIT) {
      // We'll record the change so we can properly resume the thread, but the thread must still be paused for now.
      pauseState.status = thread.status;
      thread.status = STATUS_PROMISE_WAIT;
    }
  }
};

const setSteppingThread = (thread) => {
  steppingThread = thread;
};

const compensateForTimePassedWhilePaused = (thread, pauseState) => {
  // TW: Compiled threads store their timer in a different place.
  if (thread.timer) {
    thread.timer.startTime += vm.runtime.currentMSecs - pauseState.time;
  }
  if (thread.compatibilityStackFrame && thread.compatibilityStackFrame.timer) {
    thread.compatibilityStackFrame.timer.startTime += vm.runtime.currentMSecs - pauseState.time;
  }
  const stackFrame = thread.peekStackFrame();
  if (stackFrame && stackFrame.executionContext && stackFrame.executionContext.timer) {
    stackFrame.executionContext.timer.startTime += vm.runtime.currentMSecs - pauseState.time;
  }
};

const stepUnsteppedThreads = (lastSteppedThread) => {
  // If we paused in the middle of a tick, we need to make sure to step the scripts that didn't get
  // stepped in that tick to avoid affecting project behavior.
  const threads = vm.runtime.threads;
  const startingIndex = getThreadIndex(lastSteppedThread);
  if (startingIndex !== -1) {
    for (let i = startingIndex; i < threads.length; i++) {
      const thread = threads[i];
      const status = thread.status;
      if (status === STATUS_RUNNING || status === STATUS_YIELD || status === STATUS_YIELD_TICK) {
        vm.runtime.sequencer.activeThread = thread;
        vm.runtime.sequencer.stepThread(thread);
      }
    }
  }
};

export const setPaused = (_paused) => {
  const didChange = paused !== _paused;
  if (didChange) {
    paused = _paused;
    eventTarget.dispatchEvent(new CustomEvent("change"));

    // TW: events for extensions
    if (paused) {
      vm.runtime.emit("RUNTIME_PAUSED");
    } else {
      vm.runtime.emit("RUNTIME_UNPAUSED");
    }
  }

  // Don't check didChange as new threads could've started that we need to pause.
  if (paused) {
    audioContextStateChange = audioContextStateChange.then(() => {
      return vm.runtime.audioEngine.audioContext.suspend();
    });
    if (!vm.runtime.ioDevices.clock._paused) {
      vm.runtime.ioDevices.clock.pause();
    }
    vm.runtime.threads.forEach(pauseThread);

    const activeThread = vm.runtime.sequencer.activeThread;
    if (activeThread) {
      setSteppingThread(activeThread);
      eventTarget.dispatchEvent(new CustomEvent("step"));
    }
  }

  // Only run unpausing logic when pause state changed to avoid unnecessary work
  if (!paused && didChange) {
    audioContextStateChange = audioContextStateChange.then(() => {
      return vm.runtime.audioEngine.audioContext.resume();
    });
    vm.runtime.ioDevices.clock.resume();
    for (const thread of vm.runtime.threads) {
      const pauseState = pausedThreadState.get(thread);
      if (pauseState) {
        compensateForTimePassedWhilePaused(thread, pauseState);
        thread.status = pauseState.status;
      }
    }
    pausedThreadState = new WeakMap();

    const lastSteppedThread = steppingThread;
    // This must happen after the "change" event is fired to fix https://github.com/ScratchAddons/ScratchAddons/issues/4281
    stepUnsteppedThreads(lastSteppedThread);
    steppingThread = null;
  }
};

export const onPauseChanged = (listener) => {
  eventTarget.addEventListener("change", () => listener(paused));
};

export const onSingleStep = (listener) => {
  eventTarget.addEventListener("step", listener);
};

export const getRunningThread = () => steppingThread;

// A modified version of this function
// https://github.com/scratchfoundation/scratch-vm/blob/0e86a78a00db41af114df64255e2cd7dd881329f/src/engine/sequencer.js#L179
// Returns if we should continue executing this thread.
const singleStepThread = (thread) => {
  if (thread.status === STATUS_DONE) {
    return false;
  }
  // TW: Can't single-step compiled threads
  if (thread.isCompiled) {
    return false;
  }

  const currentBlockId = thread.peekStack();
  if (!currentBlockId) {
    thread.popStack();

    if (thread.stack.length === 0) {
      thread.status = STATUS_DONE;
      return false;
    }
  }

  pauseNewThreads = true;
  vm.runtime.sequencer.activeThread = thread;

  /*
    We need to call execute(this, thread) like the original sequencer. We don't
    have access to that method, so we need to force the original stepThread to run
    execute for us then exit before it tries to run more blocks.
    So, we make `thread.blockGlowInFrame = ...` throw an exception, so this line:
    https://github.com/scratchfoundation/scratch-vm/blob/bb352913b57991713a5ccf0b611fda91056e14ec/src/engine/sequencer.js#L214
    will end the function early. We then have to set it back to normal afterward.

    Why are we here just to suffer?
  */
  const specialError = ["special error used by Scratch Addons for implementing single-stepping"];
  Object.defineProperty(thread, "blockGlowInFrame", {
    set(_block) {
      throw specialError;
    },
  });

  try {
    thread.status = STATUS_RUNNING;

    // Restart the warp timer on each step.
    // If we don't do this, Scratch will think a lot of time has passed and may yield this thread.
    if (thread.warpTimer) {
      thread.warpTimer.start();
    }

    try {
      vm.runtime.sequencer.stepThread(thread);
    } catch (err) {
      if (err !== specialError) throw err;
    }

    if (thread.status !== STATUS_RUNNING) {
      return false;
    }

    if (thread.peekStack() === currentBlockId) {
      thread.goToNextBlock();
    }

    while (!thread.peekStack()) {
      thread.popStack();

      if (thread.stack.length === 0) {
        thread.status = STATUS_DONE;
        return false;
      }

      const stackFrame = thread.peekStackFrame();

      if (stackFrame.isLoop) {
        if (thread.peekStackFrame().warpMode) {
          continue;
        } else {
          return false;
        }
      } else if (stackFrame.waitingReporter) {
        return false;
      }

      thread.goToNextBlock();
    }

    return true;
  } finally {
    pauseNewThreads = false;
    vm.runtime.sequencer.activeThread = null;
    Object.defineProperty(thread, "blockGlowInFrame", {
      value: currentBlockId,
      configurable: true,
      enumerable: true,
      writable: true,
    });

    // Strictly this doesn't seem to be necessary, but let's make sure the thread is still paused after we step it.
    if (thread.status !== STATUS_DONE) {
      thread.status = STATUS_PROMISE_WAIT;
    }
  }
};

const getRealStatus = (thread) => {
  const pauseState = pausedThreadState.get(thread);
  if (pauseState) {
    return pauseState.status;
  }
  return thread.status;
};

const getThreadIndex = (thread) => {
  // We can't use vm.runtime.threads.indexOf(thread) because threads can be restarted.
  // This can happens when, for example, a "when I receive message1" script broadcasts message1.
  // The object in runtime.threads is replaced when this happens.
  if (!thread) return -1;
  return vm.runtime.threads.findIndex(
    (otherThread) =>
      otherThread.target === thread.target &&
      otherThread.topBlock === thread.topBlock &&
      otherThread.stackClick === thread.stackClick &&
      otherThread.updateMonitor === thread.updateMonitor
  );
};

const findNewSteppingThread = (startingIndex) => {
  const threads = vm.runtime.threads;
  for (let i = startingIndex; i < threads.length; i++) {
    const possibleNewThread = threads[i];
    if (possibleNewThread.updateMonitor) {
      // Never single-step monitor update threads.
      continue;
    }
    // TW: Can't single-step compiled threads
    if (possibleNewThread.isCompiled) {
      continue;
    }
    const status = getRealStatus(possibleNewThread);
    if (status === STATUS_RUNNING || status === STATUS_YIELD || status === STATUS_YIELD_TICK) {
      // Thread must not be running for single stepping to work.
      pauseThread(possibleNewThread);
      return possibleNewThread;
    }
  }
  return null;
};

export const singleStep = () => {
  if (steppingThread) {
    const pauseState = pausedThreadState.get(steppingThread);
    // We can assume pauseState is defined as any single stepping threads must already be paused.

    // Make it look like no time has passed
    compensateForTimePassedWhilePaused(steppingThread, pauseState);
    pauseState.time = vm.runtime.currentMSecs;

    // Execute the block
    const continueExecuting = singleStepThread(steppingThread);

    if (!continueExecuting) {
      // Try to move onto the next thread
      steppingThread = findNewSteppingThread(getThreadIndex(steppingThread) + 1);
    }
  }

  // If we don't have a thread, than we are between VM steps and should search for a new thread
  if (!steppingThread) {
    setSteppingThread(findNewSteppingThread(0));

    // End of VM step, emulate one frame of time passing.
    vm.runtime.ioDevices.clock._pausedTime += vm.runtime.currentStepTime;
    // Skip all sounds forward by vm.runtime.currentStepTime milliseconds so it's as
    //  if they where playing for one frame.
    const audioContext = vm.runtime.audioEngine.audioContext;
    for (const target of vm.runtime.targets) {
      for (const soundId of Object.keys(target.sprite.soundBank.soundPlayers)) {
        const soundPlayer = target.sprite.soundBank.soundPlayers[soundId];
        if (soundPlayer.outputNode) {
          soundPlayer.outputNode.stop(audioContext.currentTime);
          soundPlayer._createSource();
          soundPlayer.outputNode.start(
            audioContext.currentTime,
            audioContext.currentTime - soundPlayer.startingUntil + vm.runtime.currentStepTime / 1000
          );
          soundPlayer.startingUntil -= vm.runtime.currentStepTime / 1000;
        }
      }
    }
    // Move all threads forward one frame in time. For blocks like `wait () seconds`
    for (const thread of vm.runtime.threads) {
      if (pausedThreadState.has(thread)) {
        pausedThreadState.get(thread).time += vm.runtime.currentStepTime;
      }
    }

    // Try to run edge activated hats
    pauseNewThreads = true;

    const hats = vm.runtime._hats;
    for (const hatType in hats) {
      if (!Object.prototype.hasOwnProperty.call(hats, hatType)) continue;
      const hat = hats[hatType];
      if (hat.edgeActivated) {
        vm.runtime.startHats(hatType);
      }
    }

    pauseNewThreads = false;
  }

  eventTarget.dispatchEvent(new CustomEvent("step"));
};

export const setup = (addon) => {
  if (vm) {
    return;
  }

  vm = addon.tab.traps.vm;

  const originalStepThreads = vm.runtime.sequencer.stepThreads;
  vm.runtime.sequencer.stepThreads = function () {
    if (isPaused()) {
      for (const thread of this.runtime.threads) {
        ensurePausedThreadIsStillPaused(thread);
      }
    }
    return originalStepThreads.call(this);
  };

  // Unpause when green flag
  const originalGreenFlag = vm.runtime.greenFlag;
  vm.runtime.greenFlag = function () {
    setPaused(false);
    return originalGreenFlag.call(this);
  };

  // Disable edge-activated hats and hats like "when key pressed" while paused.
  const originalStartHats = vm.runtime.startHats;
  vm.runtime.startHats = function (...args) {
    const hat = args[0];
    // These hats can be manually started by the user when paused or while single stepping.
    const isUserInitiated = hat === "event_whenbroadcastreceived" || hat === "control_start_as_clone";
    if (pauseNewThreads) {
      if (!isUserInitiated && !this.getIsEdgeActivatedHat(hat)) {
        return [];
      }
      const newThreads = originalStartHats.apply(this, args);
      for (const thread of newThreads) {
        pauseThread(thread);
      }
      return newThreads;
    } else if (paused && !isUserInitiated) {
      return [];
    }
    return originalStartHats.apply(this, args);
  };

  // Paused threads should not be counted as running when updating GUI state.
  const originalGetMonitorThreadCount = vm.runtime._getMonitorThreadCount;
  vm.runtime._getMonitorThreadCount = function (threads) {
    let count = originalGetMonitorThreadCount.call(this, threads);
    if (paused) {
      for (const thread of threads) {
        if (pausedThreadState.has(thread)) {
          count++;
        }
      }
    }
    return count;
  };
};
// ===== 调试器本地化运行时（编辑器切语言即时热同步）=====
// api.js 的 msg() 只按页面启动时的语言求值，编辑器内切换语言后 addon 已渲染
// 文本不会自动刷新；此处为 debugger 提供独立的运行时翻译源（en / zh-cn /
// zh-tw 三份语言包），把"当前语言"当作运行时状态：每次求值都从编辑器 redux
// 实时读取，不再缓存启动时的值。
// 触发重绘的信号（互为备份，避免单一机制在宿主环境失效）：
//   1) window.ReduxStore 的原生 redux subscribe —— 最可靠，绕开事件派发机制；
//   2) addon.tab.redux 的 statechanged 事件 —— addon 官方事件通道；
//   3) <html lang> 属性变化 —— 独立于 redux 的补充信号；
//   4) 500ms 低频轮询 —— 前面的信号都未生效时的最终保险（开销仅一次字符串比较）。
// 诊断：window.__debuggerL10n.stats() 可读取各信号触发次数与当前语言，
// 用于证明"监听到底有没有被触发"。
const l10nSources = {
  en: enMessages,
  "zh-cn": zhCNMessages,
  "zh-tw": zhTWMessages,
};
const l10nFallback = enMessages;
const l10nRefreshCallbacks = new Set();
let l10nLanguage = "en";
// 安装时记录的 addon 引用：translateKey 依赖它实时读取 redux locale。
let l10nAddon = null;
// 切换语言时编辑器会 dispatch 的 action（scratch-gui locales reducer）。
const SELECT_LOCALE_ACTION = "scratch-gui/locales/SELECT_LOCALE";

// 语言持久化键：scratch-gui 的 selectLocale 会同步写入 localStorage（tw:language），
// 页面加载时 detectLocale 也优先读它——是"重新打开也读取当前语言"的最终依据，
// 同时作为 redux 通道不可用时的备用读取通道。
const L10N_STORAGE_KEY = "tw:language";

const l10nStats = {
  statechangedEvents: 0, // statechanged 回调被触发次数
  selectLocaleEvents: 0, // 其中命中语言切换 action 的次数
  storeSubscribes: 0, // window.ReduxStore 原生订阅回调触发次数
  domLangChanges: 0, // <html lang> 变化次数
  pollTicks: 0, // 轮询检查次数
  applies: 0, // 语言真正变化并执行重绘的次数
  refreshErrors: 0, // 刷新回调执行失败的次数（元素引用失效等）
  lastActionType: null, // 最近一次 statechanged 的 action.type
  lastLocale: null, // 最近一次读到的编辑器 locale
  localeSource: null, // 上次 locale 的读取通道：redux / localStorage / html-lang
  lastChangeSource: null, // 最近一次语言变化由哪个通道发现
  logCount: 0, // 事件日志条数
  storeStateMismatch: false, // window.ReduxStore 与 addon.redux.state 是否指向不同状态
  localeMismatch: false, // redux 与 localStorage 是否给出过不同 locale
  lastMismatchPair: null, // 最近一次不一致的组合，用于避免重复刷日志
};

// 启动基线语言：首次解析到的语言。用于在多通道冲突时判断"哪一侧代表了用户的新选择"。
let l10nInitialLocale = null;

// 事件环形日志：即使控制台输出被过滤或页面已复现问题，也能用
// window.__debuggerL10n.log() 取回完整时间线（含各信号触发与重绘结果）。
const l10nEventLog = [];
const L10N_LOG_LIMIT = 100;
const logL10n = (tag, payload) => {
  const entry = Object.assign(
    {tag, time: new Date().toISOString(), language: l10nLanguage},
    payload
  );
  l10nEventLog.push(entry);
  if (l10nEventLog.length > L10N_LOG_LIMIT) {
    l10nEventLog.shift();
  }
  l10nStats.logCount++;
  return entry;
};

export const getDebuggerLanguage = () => l10nLanguage;

// 语言回退链：与 addons-l10n 一致 —— 繁体缺键回退简体（zh-cn），再回退英文。
// （zh-tw.json 是增量语言包，仅含少量覆盖键，直接查表会拿到 undefined。）
const getFallbackChain = (language) => {
  if (language === "zh-tw") return ["zh-tw", "zh-cn", "en"];
  return [language, "en"];
};

// 把编辑器 locale 规整为受支持语言。兼容 "zh-cn-xxx" / "zh" 这类变体；
// 其余语言沿用 addons-l10n 缺省回退英文。
const normalizeLocale = (locale) => {
  if (!locale) return "en";
  const lower = String(locale).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(l10nSources, lower)) {
    return lower;
  }
  const base = lower.split("-")[0];
  if (base === "zh") {
    return lower.includes("tw") || lower.includes("hk") ? "zh-tw" : "zh-cn";
  }
  return "en";
};

const refreshAllTexts = () => {
  for (const callback of Array.from(l10nRefreshCallbacks)) {
    try {
      callback();
    } catch (e) {
      // 单个刷新器失败不阻断其余文案更新；同时记入事件日志——"某个回调抛错
      // 导致其后文案不再刷新"是这类热同步问题最常见的隐性原因。
      l10nStats.refreshErrors++;
      console.warn("debugger l10n refresh failed", e);
      logL10n("refresh-failed", {message: (e && e.message) || String(e)});
    }
  }
};

// 应用指定 locale：仅当语言真正变化时重绘全部已注册文案，返回是否发生变化。
// 幂等，可安全重复调用（轮询 / 事件重复上报都不会造成多余重绘）。
export const applyLanguage = (locale) => {
  const language = normalizeLocale(locale);
  if (language === l10nLanguage) {
    return false;
  }
  l10nLanguage = language;
  l10nStats.applies++;
  logL10n("language-changed", {to: language, via: l10nStats.localeSource || null});
  refreshAllTexts();
  return true;
};

// 读取编辑器 redux 状态。优先级：window.ReduxStore（app-state-hoc 暴露的真实
// store 实例，getState() 每次都是最新值）> addon.tab.redux.state（addon 包装，
// 在部分宿主构建里可能是初始化时的状态快照，切语言后仍返回旧值——这正是
// "切语言后调试器文案不跟随、重开仍不跟随"最可疑的成因，故降为备用通道）。
const readAppState = () => {
  let fromAddon = null;
  const redux = l10nAddon && l10nAddon.tab && l10nAddon.tab.redux;
  if (redux) {
    try {
      fromAddon = redux.state || null;
    } catch (e) {
      fromAddon = null;
    }
  }
  let fromStore = null;
  if (typeof window !== "undefined" && window.ReduxStore) {
    try {
      fromStore = window.ReduxStore.getState() || null;
    } catch (e) {
      fromStore = null;
    }
  }
  if (fromStore) {
    if (fromAddon && fromAddon !== fromStore) {
      // 两条通道指向不同状态对象：说明 addon 包装给出的是陈旧快照，记录以便诊断
      l10nStats.storeStateMismatch = true;
    }
    return fromStore;
  }
  return fromAddon;
};

// 实时读取编辑器 redux 中的 locale（每次调用都取最新值，不做启动期缓存）。
// 兼容 locales 挂在 state 顶层或 scratchGui 下的两种结构；editor 页面为
// state.locales.locale（见 lib/app-state-hoc.jsx：locales: localesReducer）。
const readReduxLocale = () => {
  const state = readAppState();
  if (!state) return null;
  const locales = state.locales || (state.scratchGui && state.scratchGui.locales);
  return (locales && locales.locale) || null;
};

// 备用通道一：localStorage 的 tw:language（scratch-gui 的 selectLocale 会写入）。
// 编辑器语言选择器、SE 设置窗口、菜单栏语言菜单三条切换路径都走 selectLocale，
// 因此这里与 redux 同步更新；redux 通道读不到时（state 未就绪/结构异常）用它兜底。
const readStoredLocale = () => {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(L10N_STORAGE_KEY) || null;
  } catch (e) {
    return null;
  }
};

// 备用通道二：<html lang>（containers/language-selector.jsx 与 addons 设置页
// 都会在语言变化时同步该属性）。作为最后兜底，仅在其余通道都拿不到值时使用。
const readHtmlLang = () => {
  if (typeof document === "undefined" || !document.documentElement) return null;
  const lang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  return lang || null;
};

// 解析当前语言。三条通道：redux（window.ReduxStore 实时态）→ localStorage
// （tw:language，selectLocale 同步写入）→ <html lang>。并记录取值通道供诊断。
//
// 冲突裁决：若 redux 与 localStorage 给出不同语言，以"偏离启动基线"的一方为准
// —— 用户显式切换语言必然改变其中至少一条通道，而陈旧快照只会保持基线值。
const resolveLocale = () => {
  const reduxLocale = readReduxLocale();
  const storedLocale = readStoredLocale();

  // 首次解析：直接采用持久化值——页面初始渲染语言由 detectLocale 读 tw:language
  // 决定，而 addon 注入可能早于 redux 首帧，此时的 redux 值还是默认 en，不可信。
  if (!l10nInitialLocale) {
    const initial = storedLocale || reduxLocale || readHtmlLang();
    if (initial) {
      l10nInitialLocale = initial;
      return {
        locale: initial,
        source: storedLocale ? "localStorage" : (reduxLocale ? "redux" : "html-lang"),
      };
    }
    return {locale: null, source: "none"};
  }

  if (storedLocale && reduxLocale && storedLocale !== reduxLocale) {
    const storedIsNew = storedLocale !== l10nInitialLocale;
    const reduxIsNew = reduxLocale !== l10nInitialLocale;
    l10nStats.localeMismatch = true;
    const pair = reduxLocale + "|" + storedLocale;
    if (l10nStats.lastMismatchPair !== pair) {
      // 只在组合变化时留一条日志，避免轮询刷屏
      l10nStats.lastMismatchPair = pair;
      logL10n("locale-mismatch", {
        reduxLocale,
        storedLocale,
        baseline: l10nInitialLocale,
        chosen: storedIsNew && !reduxIsNew ? "localStorage" : "redux",
      });
    }
    if (storedIsNew && !reduxIsNew) return {locale: storedLocale, source: "localStorage"};
    if (reduxIsNew && !storedIsNew) return {locale: reduxLocale, source: "redux"};
    // 两侧都偏离基线（又互不相同）：以持久化记录为准
    return {locale: storedLocale, source: "localStorage"};
  }

  if (reduxLocale) return {locale: reduxLocale, source: "redux"};
  if (storedLocale) return {locale: storedLocale, source: "localStorage"};
  const htmlLang = readHtmlLang();
  if (htmlLang) return {locale: htmlLang, source: "html-lang"};
  return {locale: null, source: "none"};
};

// 原生 redux 订阅：直接订阅 app-state-hoc 创建并暴露到 window 的 store
// （window.ReduxStore，见 lib/app-state-hoc.jsx）。这条链路完全绕开 addon 的
// statechanged 事件派发，只要 store 存在，任何 dispatch（含语言切换）都会回调，
// 是热同步最可靠的信号；store 尚未创建时由轮询稍后重试。
let l10nSubscribedStore = null;
const trySubscribeStore = () => {
  if (typeof window === "undefined" || !window.ReduxStore) {
    return false;
  }
  if (l10nSubscribedStore === window.ReduxStore) {
    return true;
  }
  try {
    window.ReduxStore.subscribe(() => {
      l10nStats.storeSubscribes++;
      ensureLanguageUpToDate();
    });
    l10nSubscribedStore = window.ReduxStore;
    logL10n("store-subscribed", {hasReduxStore: true});
    return true;
  } catch (e) {
    return false;
  }
};

// 惰性同步：任何一次翻译求值前，先按最新 locale 对齐语言（redux → localStorage
// → <html lang> 三级通道）。这让"重新打开调试器窗口"这类复用旧 DOM 的场景也能
// 读到时下语言。
const ensureLanguageUpToDate = () => {
  const {locale, source} = resolveLocale();
  l10nStats.localeSource = source;
  if (!locale) return false;
  l10nStats.lastLocale = locale;
  const changed = applyLanguage(locale);
  if (changed) {
    l10nStats.lastChangeSource = source;
  }
  return changed;
};

// 与 api.js msg() 键语义一致：完整键含 addon 前缀，如 "debugger/window-title"。
// 仅支持简单 {placeholder} 插值（debugger 语言包无 ICU 复数/选择语法）。
export const translateKey = (key, vars) => {
  // 关键：求值前先对齐最新语言，避免固化在启动时的语言上。
  ensureLanguageUpToDate();
  let text;
  for (const language of getFallbackChain(l10nLanguage)) {
    const source = l10nSources[language] || l10nFallback;
    if (typeof source[key] === "string") {
      text = source[key];
      break;
    }
  }
  if (typeof text !== "string") {
    return key;
  }
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
};

export const registerLanguageRefresh = (callback) => {
  l10nRefreshCallbacks.add(callback);
  return callback;
};

export const unregisterLanguageRefresh = (callback) => {
  l10nRefreshCallbacks.delete(callback);
};

// 强制重绘一次全部已注册文案（幂等；供 UI 初始化完成 / 窗口重新显示时对齐全量文案）。
export const refreshLanguageTexts = () => {
  ensureLanguageUpToDate();
  refreshAllTexts();
};

// 诊断快照：一次性给出"当前语言 + 三条通道的读数 + 已注册刷新器数量 + 信号计数"。
// 用于证明监听是否被触发、文案是否按新语言重算：
//   - 控制台看 [debugger-l10n] 前缀的日志；
//   - 或执行 window.__debuggerL10n.log() 取结构化事件时间线，window.__debuggerL10n.stats() 取计数。
export const reportL10nState = (tag) => {
  const {locale, source} = resolveLocale();
  const snapshot = {
    tag: tag || "probe",
    current: l10nLanguage,
    resolvedLocale: locale,
    localeSource: source,
    reduxLocale: readReduxLocale(),
    storedLocale: readStoredLocale(),
    htmlLang: readHtmlLang(),
    refreshCallbacks: l10nRefreshCallbacks.size,
    storeSubscribed: Boolean(l10nSubscribedStore),
    stats: Object.assign({}, l10nStats),
  };
  logL10n("state", snapshot);
  return snapshot;
};

// 读取编辑器当前 locale 并立即应用（不依赖 redux 事件，供初始化收口时对齐）。
export const syncLanguageFromRedux = (addon) => {
  if (addon) {
    l10nAddon = addon;
  }
  return ensureLanguageUpToDate();
};

// 挂接语言同步信号（幂等，重复调用只安装一次）：
//   1) window.ReduxStore 的原生 redux subscribe（最可靠，绕开事件派发机制）；
//   2) addon.tab.redux 的 statechanged（addon 官方事件通道）；
//   3) <html lang> 的 MutationObserver（独立于 redux 的补充信号）；
//   4) 500ms 轮询兜底（前三者都未生效时的最终保险）。
// 四者都只做"读到最新 locale 后按需重绘"，可并存且不会重复重绘。
let l10nSyncInstalled = false;
// redux statechanged 事件处理器（独立成函数，便于 redux 通道晚就绪时重试挂载）。
const handleReduxStatechanged = (event) => {
  l10nStats.statechangedEvents++;
  // 事件能被派发说明 store 已就绪，顺手补上原生订阅（幂等）
  trySubscribeStore();
  const action = event && event.detail && event.detail.action;
  const type = (action && action.type) || null;
  l10nStats.lastActionType = type;
  if (type === SELECT_LOCALE_ACTION) {
    l10nStats.selectLocaleEvents++;
  }
  const changed = ensureLanguageUpToDate();
  if (type === SELECT_LOCALE_ACTION) {
    logL10n("select-locale", {
      reduxLocale: l10nStats.lastLocale,
      changed,
    });
  }
};

// 挂载 statechanged 监听。redux 通道不存在时不抛错（返回 false 由轮询重试），
// 避免因单条信号不可用而中断后续信号与初始化收口——此前的实现用 addon.tab.redux
// 做整体守卫，一旦该通道缺失/结构异常，整个语言同步链路都会被跳过。
let l10nStatechangedAttached = false;
const attachReduxStatechanged = () => {
  if (l10nStatechangedAttached) return true;
  const redux = (l10nAddon && l10nAddon.tab && l10nAddon.tab.redux) || null;
  if (!redux || typeof redux.addEventListener !== "function") return false;
  redux.addEventListener("statechanged", handleReduxStatechanged);
  l10nStatechangedAttached = true;
  logL10n("statechanged-attached", {});
  return true;
};

export const installLanguageSync = (addon) => {
  l10nAddon = addon;
  if (!l10nSyncInstalled) {
    l10nSyncInstalled = true;

    // 信号 1：原生 redux 订阅（store 尚未创建时由轮询稍后重试）
    trySubscribeStore();

    // 信号 2：redux statechanged（通道未就绪时不抛错，轮询会重试挂载）
    if (!attachReduxStatechanged()) {
      logL10n("statechanged-pending", {});
    }

    // 信号 3：<html lang> 变化（独立于 redux 事件的补充信号）
    if (typeof MutationObserver !== "undefined" && document.documentElement) {
      const langObserver = new MutationObserver(() => {
        l10nStats.domLangChanges++;
        const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(l10nSources, htmlLang)) {
          l10nStats.lastLocale = htmlLang;
          applyLanguage(htmlLang);
        } else {
          ensureLanguageUpToDate();
        }
        logL10n("html-lang-changed", {htmlLang});
      });
      langObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    }

    // 信号 4：轮询兜底（前面信号都未生效时的最终保险；同时重试
    // window.ReduxStore 的原生订阅——store 可能晚于 addon 初始化才创建）。
    // 自适应降频：信号 1/2 尚未全部挂载时保持 500ms 快速重试；两者齐备后转 5s
    // 低频保险档（开销仍只是一次字符串比较），避免常驻 2Hz 空转。
    if (typeof setInterval === "function" && typeof setTimeout === "function") {
      const pollOnce = () => {
        l10nStats.pollTicks++;
        trySubscribeStore();
        attachReduxStatechanged();
        const changed = ensureLanguageUpToDate();
        if (changed) {
          // 兜底通道确实救场时留下证据（正常情况不会触发）
          logL10n("poll-applied", {
            locale: l10nStats.lastLocale,
            source: l10nStats.localeSource,
          });
        }
        const allAttached = l10nSubscribedStore && l10nStatechangedAttached;
        setTimeout(pollOnce, allAttached ? 5000 : 500);
      };
      setTimeout(pollOnce, 500);
    }
  }

  // 初始化收口：立刻对齐一次当前语言，并留一条诊断快照（含三条通道的读数）。
  ensureLanguageUpToDate();
  reportL10nState("installed");

  // 诊断入口：控制台执行 window.__debuggerL10n.stats() 查看各信号计数
  if (typeof window !== "undefined") {
    window.__debuggerL10n = {
      getLanguage: () => l10nLanguage,
      getLocaleFromRedux: () => readReduxLocale(),
      getStoredLocale: () => readStoredLocale(),
      getHtmlLang: () => readHtmlLang(),
      refresh: () => refreshLanguageTexts(),
      // stats()：各信号触发计数；probe()：打印一次完整快照；log()：事件时间线。
      stats: () =>
        Object.assign({}, l10nStats, {
          current: l10nLanguage,
          installed: l10nSyncInstalled,
          storeSubscribed: Boolean(l10nSubscribedStore),
          refreshCallbacks: l10nRefreshCallbacks.size,
        }),
      probe: () => reportL10nState("probe"),
      log: () => l10nEventLog.slice(),
    };
  }

  return l10nLanguage;
};
