/**
 * vm-methods.js —— 自 op-engine.js 拆出（2026-11-18 刀8）。
 */
import {imageDataToDataUrl, OP, sanitizeCostume, sanitizeSound, serializeAudioBuffer, serializeSprite} from './core.js';
import {serializeEvent, reconstructEvent, shouldSyncEvent} from '../block-serialization.js';


// ---------------------------------------------------------------------------
// wrapVmMethods —— 捕获层：包装 VM 编辑入口，本地编辑产出 op
// ---------------------------------------------------------------------------
const COSTUME_SELECT_DEBOUNCE_MS = 200;

const wrapVmMethods = ({ vm, patcher, isSuppressed, onLocalOp, onProjectLoaded }) => {
  const runtime = vm.runtime;
  const editingTargetId = () => (vm.editingTarget ? vm.editingTarget.id : null);

  const captureNewTarget = () => {
    const target = vm.editingTarget;
    if (!target || !target.sprite || target.isStage) return;
    const { spriteJson, assetRefs } = serializeSprite(vm, target.id);
    onLocalOp(OP.SPRITE_ADD, { targetId: target.id, spriteJson, assetRefs });
  };

  patcher.patch(vm, 'addSprite', (original) => (...args) => {
    const result = original(...args);
    if (!isSuppressed() && result && result.then) {
      result.then(() => captureNewTarget());
    }
    return result;
  });

  patcher.patch(vm, 'duplicateSprite', (original) => (...args) => {
    const result = original(...args);
    if (!isSuppressed() && result && result.then) {
      result.then(() => captureNewTarget());
    }
    return result;
  });

  patcher.patch(vm, 'deleteSprite', (original) => (targetId) => {
    const existed = Boolean(runtime.getTargetById(targetId));
    const result = original(targetId);
    if (!isSuppressed() && existed) {
      onLocalOp(OP.SPRITE_DELETE, { targetId });
    }
    return result;
  });

  patcher.patch(vm, 'renameSprite', (original) => (targetId, newName) => {
    const result = original(targetId, newName);
    if (!isSuppressed()) {
      const target = runtime.getTargetById(targetId);
      onLocalOp(OP.SPRITE_RENAME, { targetId, name: target ? target.getName() : newName });
    }
    return result;
  });

  patcher.patch(vm, 'reorderTarget', (original) => (targetIndex, newIndex) => {
    const result = original(targetIndex, newIndex);
    if (!isSuppressed() && result) {
      const target = runtime.targets[newIndex];
      if (target) {
        onLocalOp(OP.SPRITE_REORDER, { targetId: target.id, newIndex });
      }
    }
    return result;
  });

  const captureCostumeAdd = (result, optTargetId) => {
    if (isSuppressed() || !result || !result.then) return;
    result.then(() => {
      const targetId = optTargetId || editingTargetId();
      const target = targetId ? runtime.getTargetById(targetId) : null;
      if (!target) return;
      const costumes = target.getCostumes();
      const costume = costumes[target.currentCostume] || costumes[costumes.length - 1];
      if (!costume || !costume.md5) return;
      onLocalOp(OP.COSTUME_ADD, {
        targetId,
        costume: sanitizeCostume(costume),
        assetRefs: [costume.md5],
      });
    });
  };

  patcher.patch(vm, 'addCostume', (original) => (md5ext, costumeObject, optTargetId, optVersion) => {
    const result = original(md5ext, costumeObject, optTargetId, optVersion);
    captureCostumeAdd(result, optTargetId);
    return result;
  });

  if (typeof vm.addCostumeFromLibrary === 'function') {
    patcher.patch(vm, 'addCostumeFromLibrary', (original) => (md5ext, costumeObject) => {
      const result = original(md5ext, costumeObject);
      captureCostumeAdd(result, null);
      return result;
    });
  }

  patcher.patch(vm, 'deleteCostume', (original) => (index) => {
    const targetId = editingTargetId();
    const result = original(index);
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.COSTUME_DELETE, { targetId, index });
    }
    return result;
  });

  patcher.patch(vm, 'renameCostume', (original) => (index, newName) => {
    const result = original(index, newName);
    const targetId = editingTargetId();
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.COSTUME_RENAME, { targetId, index, name: newName });
    }
    return result;
  });

  patcher.patch(vm, 'reorderCostume', (original) => (targetId, costumeIndex, newIndex) => {
    const result = original(targetId, costumeIndex, newIndex);
    if (!isSuppressed() && result) {
      onLocalOp(OP.COSTUME_REORDER, { targetId, oldIndex: costumeIndex, newIndex });
    }
    return result;
  });

  patcher.patch(vm, 'duplicateCostume', (original) => (index) => {
    const targetId = editingTargetId();
    const result = original(index);
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.COSTUME_DUPLICATE, { targetId, index });
    }
    return result;
  });

  patcher.patch(vm, 'addSound', (original) => (soundObject, optTargetId) => {
    const result = original(soundObject, optTargetId);
    if (!isSuppressed() && result && result.then) {
      result.then(() => {
        const targetId = optTargetId || editingTargetId();
        const target = targetId ? runtime.getTargetById(targetId) : null;
        if (!target) return;
        const sounds = target.getSounds();
        const sound = sounds[sounds.length - 1];
        if (!sound || !sound.md5) return;
        onLocalOp(OP.SOUND_ADD, {
          targetId,
          sound: sanitizeSound(sound),
          assetRefs: [sound.md5],
        });
      });
    }
    return result;
  });

  patcher.patch(vm, 'deleteSound', (original) => (index) => {
    const targetId = editingTargetId();
    const result = original(index);
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.SOUND_DELETE, { targetId, index });
    }
    return result;
  });

  patcher.patch(vm, 'renameSound', (original) => (index, newName) => {
    const result = original(index, newName);
    const targetId = editingTargetId();
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.SOUND_RENAME, { targetId, index, name: newName });
    }
    return result;
  });

  patcher.patch(vm, 'reorderSound', (original) => (targetId, soundIndex, newIndex) => {
    const result = original(targetId, soundIndex, newIndex);
    if (!isSuppressed() && result) {
      onLocalOp(OP.SOUND_REORDER, { targetId, oldIndex: soundIndex, newIndex });
    }
    return result;
  });

  patcher.patch(vm, 'duplicateSound', (original) => (index) => {
    const targetId = editingTargetId();
    const result = original(index);
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.SOUND_DUPLICATE, { targetId, index });
    }
    return result;
  });

  patcher.patch(vm, 'updateSvg', (original) => (costumeIndex, svg, rotationCenterX, rotationCenterY) => {
    const result = original(costumeIndex, svg, rotationCenterX, rotationCenterY);
    const targetId = editingTargetId();
    if (!isSuppressed() && targetId) {
      onLocalOp(OP.COSTUME_UPDATE, {
        targetId,
        index: costumeIndex,
        isVector: true,
        svg,
        rotationCenterX,
        rotationCenterY,
      });
    }
    return result;
  });

  patcher.patch(vm, 'updateBitmap', (original) =>
    (costumeIndex, bitmap, rotationCenterX, rotationCenterY, bitmapResolution) => {
      const result = original(costumeIndex, bitmap, rotationCenterX, rotationCenterY, bitmapResolution);
      const targetId = editingTargetId();
      if (!isSuppressed() && targetId) {
        try {
          onLocalOp(OP.COSTUME_UPDATE, {
            targetId,
            index: costumeIndex,
            isVector: false,
            bitmapData: imageDataToDataUrl(bitmap),
            rotationCenterX,
            rotationCenterY,
            bitmapResolution: bitmapResolution || 2,
          });
        } catch (e) { /* 画布转换失败则跳过本次更新 */ }
      }
      return result;
    });

  if (typeof vm.updateSoundBuffer === 'function') {
    patcher.patch(vm, 'updateSoundBuffer', (original) => (soundIndex, newBuffer, soundEncoding) => {
      const result = original(soundIndex, newBuffer, soundEncoding);
      const targetId = editingTargetId();
      if (!isSuppressed() && targetId && newBuffer) {
        try {
          onLocalOp(OP.SOUND_UPDATE, {
            targetId,
            index: soundIndex,
            audioData: serializeAudioBuffer(newBuffer),
          });
        } catch (e) { /* 序列化失败则跳过 */ }
      }
      return result;
    });
  }

  patcher.patch(vm, 'shareBlocksToTarget', (original) => (blocks, targetId, optFromTargetId) => {
    const result = original(blocks, targetId, optFromTargetId);
    if (!isSuppressed()) {
      onLocalOp(OP.BLOCKS_SHARE, { targetId, blocks });
    }
    return result;
  });

  if (vm.extensionManager) {
    patcher.patch(vm.extensionManager, 'loadExtensionURL', (original) => (extensionURL, ...rest) => {
      const result = original(extensionURL, ...rest);
      if (!isSuppressed()) {
        onLocalOp(OP.EXTENSION_LOAD, { extensionId: String(extensionURL) });
      }
      return result;
    });
    if (typeof vm.extensionManager.removeExtension === 'function') {
      patcher.patch(vm.extensionManager, 'removeExtension', (original) => (extensionId, ...rest) => {
        const result = original(extensionId, ...rest);
        if (!isSuppressed()) {
          onLocalOp(OP.EXTENSION_REMOVE, { extensionId: String(extensionId) });
        }
        return result;
      });
    }
    if (typeof vm.extensionManager.reorderExtension === 'function') {
      patcher.patch(vm.extensionManager, 'reorderExtension', (original) => (index, newIndex) => {
        const keys = Array.from(vm.extensionManager._loadedExtensions.keys());
        const extensionId = keys[index];
        const result = original(index, newIndex);
        if (!isSuppressed() && extensionId) {
          onLocalOp(OP.EXTENSION_REORDER, { extensionId, newIndex });
        }
        return result;
      });
    }
  }

  // 造型选择无专用 VM 入口：在 targetsUpdate 上 diff editingTarget.currentCostume（防抖）。
  // loadProject patch 会在整项目加载前清空此表，避免快照/本地加载后误发 COSTUME_SELECT。
  let lastCostumeByTarget = new Map();
  let costumeSelectTimer = null;

  if (typeof vm.loadProject === 'function') {
    patcher.patch(vm, 'loadProject', (original) => function loadProject(input, ...rest) {
      lastCostumeByTarget.clear();
      const suppressAtCall = isSuppressed();
      const result = original.call(vm, input, ...rest);
      if (result && result.then && !suppressAtCall && onProjectLoaded) {
        result.then(() => onProjectLoaded()).catch(() => { /* 加载失败保留旧文档 */ });
      }
      return result;
    });
  }

  const onTargetsUpdate = () => {
    const target = vm.editingTarget;
    if (!target) return;
    const previous = lastCostumeByTarget.get(target.id);
    const current = target.currentCostume;
    if (previous === current) return;
    lastCostumeByTarget.set(target.id, current);
    // 抑制期（远端应用 / 快照应用）同样推进基线：远端写入会触发 targetsUpdate，
    // 若不更新基线，抑制结束后本端首次真实编辑会把旧值与新值误判为变化而重放 echo op。
    if (isSuppressed()) return;
    if (typeof previous === 'undefined') return; // 首次观察不产生 op
    if (costumeSelectTimer) clearTimeout(costumeSelectTimer);
    costumeSelectTimer = setTimeout(() => {
      costumeSelectTimer = null;
      if (isSuppressed() || !vm.editingTarget) return;
      onLocalOp(OP.COSTUME_SELECT, {
        targetId: vm.editingTarget.id,
        index: vm.editingTarget.currentCostume,
      });
    }, COSTUME_SELECT_DEBOUNCE_MS);
  };
  vm.on('targetsUpdate', onTargetsUpdate);

  // 角色属性编辑（舞台拖拽/信息面板/音量/透明度）走 TARGET_UPDATE，按 target 合并节流
  const pendingTargetUpdates = new Map();
  const TARGET_UPDATE_THROTTLE_MS = 100;
  const pushTargetUpdate = (targetId, props) => {
    if (!targetId || !props || Object.keys(props).length === 0) return;
    const pending = pendingTargetUpdates.get(targetId);
    if (pending) {
      Object.assign(pending.props, props);
      return;
    }
    pendingTargetUpdates.set(targetId, {
      props,
      timer: setTimeout(() => {
        const entry = pendingTargetUpdates.get(targetId);
        pendingTargetUpdates.delete(targetId);
        if (entry && !isSuppressed()) {
          onLocalOp(OP.TARGET_UPDATE, { targetId, props: entry.props });
        }
      }, TARGET_UPDATE_THROTTLE_MS),
    });
  };
  const onSpriteInfoChanged = (target, changedProps) => {
    if (isSuppressed()) return;
    if (!target || !changedProps) return;
    const props = {};
    ['x', 'y', 'direction', 'size', 'visible', 'rotationStyle', 'volume', 'videoTransparency'].forEach((key) => {
      if (typeof changedProps[key] !== 'undefined') props[key] = changedProps[key];
    });
    pushTargetUpdate(target.id, props);
  };
  runtime.on('SPRITE_INFO_CHANGED', onSpriteInfoChanged);

  // targetsUpdate 兜底：音量/视频透明度等不走 SPRITE_INFO_CHANGED 的入口，
  // 在 targetsUpdate 里对比变化并并入同一节流通道（首次观察只记基线不产生 op）。
  const lastTargetExtra = new Map();

  // 音量/视频透明度变化对比（targetsUpdate 携带，SPRITE_INFO_CHANGED 可能不带）
  const onTargetsUpdateExtra = () => {
    const target = vm.editingTarget;
    if (!target) return;
    const last = lastTargetExtra.get(target.id);
    const vol = typeof target.volume === 'number' ? target.volume : null;
    const vTrans = typeof target.videoTransparency === 'number' ? target.videoTransparency : null;
    // 抑制期同样推进基线，避免远端写入导致的音量/透明度差异在抑制结束后被误判为本地编辑
    if (isSuppressed()) {
      lastTargetExtra.set(target.id, { vol, vTrans });
      return;
    }
    if (last) {
      const props = {};
      if (vol !== null && last.vol !== vol) props.volume = vol;
      if (vTrans !== null && last.vTrans !== vTrans) props.videoTransparency = vTrans;
      pushTargetUpdate(target.id, props);
    }
    lastTargetExtra.set(target.id, { vol, vTrans });
  };
  vm.on('targetsUpdate', onTargetsUpdateExtra);

  // 广播消息列表（runtime.messages）增删改同步
  patcher.patch(vm, 'addBroadcastMsg', (original) => (msg, shouldUpdateProject) => {
    const existed = runtime.messages.indexOf(msg) !== -1;
    const result = original(msg, shouldUpdateProject);
    if (!isSuppressed() && !existed && runtime.messages.indexOf(msg) !== -1) {
      onLocalOp(OP.MESSAGE_ADD, { name: msg });
    }
    return result;
  });

  patcher.patch(vm, 'renameBroadcastMsg', (original) => (oldMsg, newMsg) => {
    const result = original(oldMsg, newMsg);
    if (!isSuppressed() && oldMsg !== newMsg && runtime.messages.indexOf(newMsg) !== -1) {
      onLocalOp(OP.MESSAGE_RENAME, { from: oldMsg, to: newMsg });
    }
    return result;
  });

  patcher.patch(vm, 'deleteBroadcastMsg', (original) => (msg) => {
    const existed = runtime.messages.indexOf(msg) !== -1;
    const result = original(msg);
    if (!isSuppressed() && existed && runtime.messages.indexOf(msg) === -1) {
      onLocalOp(OP.MESSAGE_DELETE, { name: msg });
    }
    return result;
  });

  return () => {
    vm.removeListener('targetsUpdate', onTargetsUpdate);
    vm.removeListener('targetsUpdate', onTargetsUpdateExtra);
    runtime.removeListener('SPRITE_INFO_CHANGED', onSpriteInfoChanged);
    if (costumeSelectTimer) clearTimeout(costumeSelectTimer);
    pendingTargetUpdates.forEach((entry) => clearTimeout(entry.timer));
    pendingTargetUpdates.clear();
    lastTargetExtra.clear();
    lastCostumeByTarget = null;
  };
};

// 监视器唯一键：捕获端（setupMonitorCapture）与应用端（VMApplier）共用同一算法，
// 保证远端 op 的 key 能精确匹配本端快照基线。
const monitorKeyOf = (m) => {
  if (!m) return '';
  return `${m.id || ''}|${m.spriteName || ''}|${m.opcode || ''}|${m.params ? (m.params.VARIABLE || m.params.LIST || '') : ''}`;
};

// 结构化 JSON 深拷贝（监视器 op 载荷跨端传输用；失败时原样返回）
const cloneJson = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return obj;
  }
};

// ---------------------------------------------------------------------------
// setupMonitorCapture —— 监视器（变量监视器 / 列表监视器）增删改捕获
// ---------------------------------------------------------------------------
// 监视器属于 runtime 级状态（_monitorState），不挂在某个 target 的 blocks 上，
// 与块事件链路相互独立，单独 patch runtime.requestAddMonitor / requestUpdateMonitor /
// requestRemoveMonitor / requestHideMonitor 四个入口捕获为 op。
// 抑制期（远端应用 / 快照应用）只推进基线不产生 op，防止回声互推。
const setupMonitorCapture = ({ vm, isSuppressed, onLocalOp }) => {
  const runtime = vm && vm.runtime;
  if (!runtime) return () => {};
  const monitorOps = { add: null, update: null, remove: null, hide: null };
  const lastByKey = new Map(); // monitorKey -> last monitor json（用于变化对比与基线推进）
  const monitorKey = monitorKeyOf;

  const pushMonitorOp = (type, payload) => {
    if (type === OP.MONITOR_UPDATE) {
      // 变化对比：与上一次已广播的 monitor json 做浅比较，无实质变化不广播
      const key = payload.key;
      const last = lastByKey.get(key);
      if (last && shallowEqualMonitor(last, payload.monitor)) return;
    }
    lastByKey.set(payload.key, payload.monitor);
    if (isSuppressed()) return; // 抑制期只推进基线，不产生 op
    onLocalOp(type, payload);
  };

  const shallowEqualMonitor = (a, b) => {
    if (!a || !b) return false;
    for (const k of ['value', 'visible', 'mode', 'x', 'y', 'width', 'height', 'sliderMin', 'sliderMax', 'isDiscrete', 'params']) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
    }
    return true;
  };

  // runtime.requestAddMonitor(monitorData) —— 新建监视器
  monitorOps.add = (original) => function requestAddMonitor(monitorData) {
    const result = original.apply(runtime, arguments);
    try {
      if (monitorData && monitorData.id) {
        pushMonitorOp(OP.MONITOR_ADD, {
          key: monitorKey(monitorData),
          monitor: JSON.parse(JSON.stringify(monitorData)),
        });
      }
    } catch (e) { /* 捕获失败不阻塞 VM 调用 */ }
    return result;
  };

  // runtime.requestUpdateMonitor(id, data) —— 值 / 模式 / 滑块 / 位置等更新
  monitorOps.update = (original) => function requestUpdateMonitor(id, data) {
    const result = original.apply(runtime, arguments);
    try {
      // 注意：runtime.getMonitorState() 无参返回整个 MonitorState（非按 id 取单个），
      // 必须再 .get(id) 才能拿到 MonitorRecord；直接传 id 会拿到整个 state（恒真值）导致载荷错乱。
      const st = (runtime.getMonitorState && runtime.getMonitorState()) || null;
      const monitor = st ? st.get(id) : null;
      if (monitor) {
        pushMonitorOp(OP.MONITOR_UPDATE, {
          key: monitorKey(monitor),
          monitor: JSON.parse(JSON.stringify(monitor)),
        });
      }
    } catch (e) { /* ignore */ }
    return result;
  };

  // runtime.requestRemoveMonitor(id) —— 删除监视器
  monitorOps.remove = (original) => function requestRemoveMonitor(id) {
    const result = original.apply(runtime, arguments);
    try {
      const key = `id:${id}`;
      lastByKey.delete(key);
      if (!isSuppressed()) onLocalOp(OP.MONITOR_DELETE, { id });
    } catch (e) { /* ignore */ }
    return result;
  };

  // runtime.requestHideMonitor(id) —— 显示/隐藏监视器（mode 切换底层也会触发，作为冗余兜底）
  monitorOps.hide = (original) => function requestHideMonitor(id) {
    const result = original.apply(runtime, arguments);
    try {
      const st = (runtime.getMonitorState && runtime.getMonitorState()) || null;
      const monitor = st ? st.get(id) : null;
      if (monitor) {
        pushMonitorOp(OP.MONITOR_UPDATE, {
          key: monitorKey(monitor),
          monitor: JSON.parse(JSON.stringify(monitor)),
        });
      }
    } catch (e) { /* ignore */ }
    return result;
  };

  const cleanups = [
    ['requestAddMonitor', monitorOps.add],
    ['requestUpdateMonitor', monitorOps.update],
    ['requestRemoveMonitor', monitorOps.remove],
    ['requestHideMonitor', monitorOps.hide],
  ].map(([name, fn]) => {
    if (typeof runtime[name] !== 'function') return () => {};
    const original = runtime[name];
    runtime[name] = fn(original);
    return () => { runtime[name] = original; };
  });

  return () => {
    cleanups.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    lastByKey.clear();
  };
};

// ---------------------------------------------------------------------------
// setupBlockCapture —— Blockly 工作区事件捕获（拖拽/拼接/改字段/注释/变量）
// ---------------------------------------------------------------------------
const setupBlockCapture = ({ getWorkspace, getVm, isSuppressed, onLocalOp }) => {
  const workspace = getWorkspace ? getWorkspace() : null;
  if (!workspace || typeof workspace.addChangeListener !== 'function') return () => {};

  // change 类事件（打字/数值/下拉/折叠）按 块+字段 维度合并，只广播最新值；
  // 结构性事件（create/delete/move/var/comment）保持即时，不延迟应用顺序。
  const CHANGE_COALESCE_MS = 120;
  const pendingChanges = new Map();
  const changeKey = (event) => `${event.blockId}|${event.element}|${event.name}`;

  const sendPayload = (vm, event) => {
    let payload;
    try {
      payload = serializeEvent(vm, event);
    } catch (e) {
      return;
    }
    if (!payload) return;
    onLocalOp(OP.BLOCK_EVENT, payload);
  };

  const onChange = (event) => {
    if (isSuppressed()) return;
    if (!shouldSyncEvent(event)) return;
    const vm = getVm ? getVm() : null;
    if (!vm) return;

    if (event.type === 'change') {
      const key = changeKey(event);
      const existing = pendingChanges.get(key);
      if (existing) {
        try {
          existing.payload = serializeEvent(vm, event);
        } catch (e) { /* 保留旧 payload */ }
        return;
      }
      let payload;
      try {
        payload = serializeEvent(vm, event);
      } catch (e) {
        return;
      }
      const entry = {
        payload,
        timer: setTimeout(() => {
          pendingChanges.delete(key);
          if (!isSuppressed() && entry.payload) onLocalOp(OP.BLOCK_EVENT, entry.payload);
        }, CHANGE_COALESCE_MS),
      };
      pendingChanges.set(key, entry);
      return;
    }

    sendPayload(vm, event);
  };

  workspace.addChangeListener(onChange);
  return () => {
    try {
      workspace.removeChangeListener(onChange);
    } catch (e) { /* ignore */ }
    for (const entry of pendingChanges.values()) clearTimeout(entry.timer);
    pendingChanges.clear();
  };
};

export {cloneJson, COSTUME_SELECT_DEBOUNCE_MS, monitorKeyOf, setupBlockCapture, setupMonitorCapture, wrapVmMethods};
