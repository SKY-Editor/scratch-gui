/**
 * core.js —— 自 op-engine.js 拆出（2026-11-18 刀8）。
 */

// ---------------------------------------------------------------------------
// OP 枚举（移植 Bilup protocol，操作级业务类型）
// ---------------------------------------------------------------------------
const OP = {
  BLOCK_EVENT: 'block-event',
  BLOCKS_SHARE: 'blocks-share',
  TARGET_UPDATE: 'target-update',
  SPRITE_ADD: 'sprite-add',
  SPRITE_DELETE: 'sprite-delete',
  SPRITE_RENAME: 'sprite-rename',
  SPRITE_REORDER: 'sprite-reorder',
  COSTUME_ADD: 'costume-add',
  COSTUME_DELETE: 'costume-delete',
  COSTUME_RENAME: 'costume-rename',
  COSTUME_SELECT: 'costume-select',
  COSTUME_REORDER: 'costume-reorder',
  COSTUME_DUPLICATE: 'costume-duplicate',
  COSTUME_UPDATE: 'costume-update',
  SOUND_ADD: 'sound-add',
  SOUND_DELETE: 'sound-delete',
  SOUND_RENAME: 'sound-rename',
  SOUND_REORDER: 'sound-reorder',
  SOUND_DUPLICATE: 'sound-duplicate',
  SOUND_UPDATE: 'sound-update',
  EXTENSION_LOAD: 'extension-load',
  EXTENSION_REMOVE: 'extension-remove',
  EXTENSION_REORDER: 'extension-reorder',
  MESSAGE_ADD: 'message-add',
  MESSAGE_RENAME: 'message-rename',
  MESSAGE_DELETE: 'message-delete',
  MONITOR_ADD: 'monitor-add',
  MONITOR_UPDATE: 'monitor-update',
  MONITOR_DELETE: 'monitor-delete',
};

// ---------------------------------------------------------------------------
// VmPatcher —— VM 实例方法包装登记与还原
// ---------------------------------------------------------------------------
class VmPatcher {
  constructor() {
    this._patches = [];
  }

  /**
   * 包装 obj[methodName]，wrapperFactory 接收绑定好 this 的 original。
   * @param {object} obj 目标对象（vm 或 extensionManager 等）
   * @param {string} methodName 方法名
   * @param {Function} wrapperFactory (original) => wrapper
   */
  patch(obj, methodName, wrapperFactory) {
    if (!obj || typeof obj[methodName] !== 'function') return;
    const original = obj[methodName].bind(obj);
    obj[methodName] = wrapperFactory(original);
    this._patches.push({ obj, methodName, original });
  }

  restoreAll() {
    for (const p of this._patches) {
      try {
        p.obj[p.methodName] = p.original;
      } catch (e) { /* 忽略还原失败 */ }
    }
    this._patches.length = 0;
  }
}

// ---------------------------------------------------------------------------
// OpApplier 基类 —— 提供远端应用抑制深度计数
// ---------------------------------------------------------------------------
class OpApplier {
  constructor() {
    this._remoteApplyDepth = 0;
  }

  isRemoteApplying() {
    return this._remoteApplyDepth > 0;
  }
}

// ---------------------------------------------------------------------------
// createStorageAsset —— 从 storage 同步取资产（asset-data 已注入后命中）
// ---------------------------------------------------------------------------
const createStorageAsset = (vm, assetId, dataFormat) => {
  const storage = vm && vm.runtime ? vm.runtime.storage : null;
  if (!storage || !assetId) return null;
  const id = String(assetId).split('.')[0];
  const fmt = String(dataFormat || '').toLowerCase();
  let typeName = null;
  if (fmt === 'svg') typeName = 'ImageVector';
  else if (['wav', 'mp3', 'ogg'].indexOf(fmt) >= 0) typeName = 'Sound';
  else if (['png', 'jpg', 'jpeg', 'bmp', 'gif'].indexOf(fmt) >= 0) typeName = 'ImageBitmap';
  if (typeName) {
    try {
      const asset = storage.get(typeName, id, fmt);
      if (asset && asset.data && asset.data.length > 0) return asset;
    } catch (e) { /* 尝试下一路径 */ }
  }
  // 兜底：与快照链路一致的单参数 get(assetId)
  try {
    const asset = storage.get(id);
    if (asset && asset.data && asset.data.length > 0) return asset;
  } catch (e) { /* ignore */ }
  return null;
};

// ---------------------------------------------------------------------------
// 序列化辅助（移植 Bilup vm-capture）
// ---------------------------------------------------------------------------
const sanitizeCostume = (costume) => ({
  name: costume.name,
  md5: costume.md5,
  dataFormat: costume.dataFormat,
  rotationCenterX: costume.rotationCenterX,
  rotationCenterY: costume.rotationCenterY,
  bitmapResolution: costume.bitmapResolution,
  assetId: costume.assetId,
});

const sanitizeSound = (sound) => ({
  name: sound.name,
  md5: sound.md5,
  dataFormat: sound.dataFormat,
  assetId: sound.assetId,
  rate: sound.rate,
  sampleCount: sound.sampleCount,
});

/**
 * 把单个 sprite 序列化为 sb3 角色 JSON（走 vm.toJSON，保证符合 VM schema），
 * 并列出其引用资产（md5ext），资产字节走按需拉取通道。
 */
const serializeSprite = (vm, targetId) => {
  const spriteJson = JSON.parse(vm.toJSON(targetId));
  const assetRefs = []
    .concat(spriteJson.costumes || [], spriteJson.sounds || [])
    .map((item) => item.md5ext)
    .filter(Boolean);
  return { spriteJson, assetRefs };
};

const imageDataToDataUrl = (imageData) => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas.toDataURL();
};

const serializeAudioBuffer = (buffer) => {
  const channels = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(Array.from(buffer.getChannelData(i)));
  }
  return {
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    channels,
  };
};

export {createStorageAsset, imageDataToDataUrl, OP, OpApplier, sanitizeCostume, sanitizeSound, serializeAudioBuffer, serializeSprite, VmPatcher};
