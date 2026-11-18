/**
 * index.js —— 自 op-engine.js 拆出（2026-11-18 刀8）。
 */
import {OP, VmPatcher} from './core.js';
import {setupBlockCapture, setupMonitorCapture, wrapVmMethods} from './vm-methods.js';
import {VMApplier} from './vm-applier.js';


// ---------------------------------------------------------------------------
// createOpEngine —— 组装并返回引擎实例
// ---------------------------------------------------------------------------
/**
 * @param {object} options
 * @param {VirtualMachine} options.vm scratch-vm 实例
 * @param {Function} options.getWorkspace () => Blockly workspace | null
 * @param {Function} options.isSuppressed () => boolean 外部抑制（快照应用期）
 * @param {Function} options.sendOp (type, payload) => void 本地 op 广播回调
 * @param {Function} options.sendAssetRequest (assetIds, toClientId) => void
 * @param {Function} [options.log] 日志函数（默认 console.warn 前缀）
 */
const createOpEngine = (options) => {
  const {
    vm,
    getWorkspace,
    isSuppressed: externalSuppressed,
    sendOp,
    sendAssetRequest,
    log,
  } = options;
  const logger = log || ((...args) => console.warn('[op-engine]', ...args));

  const patcher = new VmPatcher();
  const applier = new VMApplier({
    vm,
    getWorkspace,
    requestAssets: null, // 下方组装后回填
  });
  let cleanupCapture = null;
  let cleanupBlock = null;
  let cleanupMonitor = null;

  // ---- op 资产按需拉取（独立于快照 assetWait，各自等待 asset-data 注入） ----
  const pendingAssetRequests = []; // { missing: Set<assetId>, resolve, timer }
  const finalizePendingAssetRequest = (entry) => {
    const idx = pendingAssetRequests.indexOf(entry);
    if (idx !== -1) pendingAssetRequests.splice(idx, 1);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve();
  };
  const requestAssets = (refs, fromClientId) => new Promise((resolve) => {
    const storage = vm && vm.runtime ? vm.runtime.storage : null;
    const missing = [];
    (refs || []).forEach((ref) => {
      if (!ref) return;
      const assetId = String(ref).split('.')[0];
      let hit = false;
      try {
        const cached = storage && storage.get(assetId);
        hit = !!(cached && cached.data && cached.data.length > 0);
      } catch (e) { /* ignore */ }
      if (!hit) missing.push(assetId);
    });
    if (missing.length === 0) {
      resolve();
      return;
    }
    const entry = {
      missing: new Set(missing),
      resolve,
      timer: setTimeout(() => finalizePendingAssetRequest(entry), 5000),
    };
    pendingAssetRequests.push(entry);
    if (sendAssetRequest) sendAssetRequest(missing, fromClientId);
  });
  applier.requestAssets = requestAssets;

  const combinedIsSuppressed = () =>
    (typeof externalSuppressed === 'function' && externalSuppressed()) ||
    applier.isRemoteApplying();

  const onLocalOp = (type, payload) => {
    if (sendOp) sendOp(type, payload);
  };

  const engine = {
    _started: false,

    start() {
      if (engine._started) return;
      engine._started = true;
      try {
        cleanupCapture = wrapVmMethods({
          vm,
          patcher,
          isSuppressed: combinedIsSuppressed,
          onLocalOp,
          onProjectLoaded: null,
        });
      } catch (e) {
        logger('捕获层启动失败', e);
      }
      cleanupBlock = setupBlockCapture({
        getWorkspace,
        getVm: () => vm,
        isSuppressed: combinedIsSuppressed,
        onLocalOp,
      });
      cleanupMonitor = setupMonitorCapture({
        vm,
        isSuppressed: combinedIsSuppressed,
        onLocalOp,
      });
      logger('操作级同步引擎已启动');
    },

    isRemoteApplying() {
      return applier.isRemoteApplying();
    },

    /**
     * 应用远端 op。返回 Promise，串行队列按到达顺序落地。
     * @param {string} type op 类型
     * @param {object} payload op 载荷
     * @param {object} [meta] { from }
     */
    applyRemoteOp(type, payload, meta) {
      return applier.apply(type, payload, meta);
    },

    /**
     * 收到 asset-data 后调用：注入完成的数据会唤醒等待中的 op。
     * @param {Array} assets [{ assetId, ... }]
     */
    injectAssetData(assets) {
      const list = Array.isArray(assets) ? assets : [];
      for (const item of list) {
        if (!item || !item.assetId) continue;
        for (const entry of pendingAssetRequests) entry.missing.delete(item.assetId);
      }
      for (const entry of pendingAssetRequests.slice()) {
        if (entry.missing.size === 0) finalizePendingAssetRequest(entry);
      }
    },

    /**
     * 快照 loadProject 完成后回填本端监视器基线（Map<monitorKey, monitor json>），
     * 供远端 MONITOR_UPDATE op 按 key 对齐字段，避免跨端 id 不一致时更新错位。
     * @param {Map|null} baseline
     */
    setMonitorBaseline(baseline) {
      applier.syncMonitorBaseline = baseline || null;
    },

    /**
     * 收到全量快照并 loadProject 前调用：丢弃排队中的旧 op 与等待中的资产请求，
     * 避免旧增量在整体替换后错乱。
     */
    reset() {
      applier.reset();
      for (const entry of pendingAssetRequests.slice()) finalizePendingAssetRequest(entry);
      pendingAssetRequests.length = 0;
    },

    destroy() {
      engine._started = false;
      if (cleanupCapture) {
        try {
          cleanupCapture();
        } catch (e) { /* ignore */ }
        cleanupCapture = null;
      }
      if (cleanupBlock) {
        try {
          cleanupBlock();
        } catch (e) { /* ignore */ }
        cleanupBlock = null;
      }
      if (cleanupMonitor) {
        try {
          cleanupMonitor();
        } catch (e) { /* ignore */ }
        cleanupMonitor = null;
      }
      patcher.restoreAll();
      applier.destroy();
      for (const entry of pendingAssetRequests.slice()) finalizePendingAssetRequest(entry);
      pendingAssetRequests.length = 0;
    },
  };

  return engine;
};

export default createOpEngine;
export { OP };
