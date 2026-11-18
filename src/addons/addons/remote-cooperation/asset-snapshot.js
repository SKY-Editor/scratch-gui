/**
 * 资产快照工具簇 —— 2026-11-18 刀8 自 userscript.js 拆出。
 * ---------------------------------------------------------------------------
 * 本簇只依赖入参（vmInstance / projectJson / ids）与全局 console/btoa，
 * 无闭包引用，故可整体迁出；userscript 的调用点经 import 使用，
 * 函数签名与行为完全不变。
 */
  // -------------------------------------------------------------------------
  // 文本格式（SVG）直接以字符串传输；其余（PNG/WAV/MP3/JPG/GIF 等）转 base64。
  const ASSET_TEXT_FORMATS = ['svg'];

  // Uint8Array/Buffer -> base64（浏览器 btoa，分块避免调用栈溢出）
  const bytesToBase64 = (() => {
    const CHUNK = 0x8000;
    return (bytes) => {
      let binary = '';
      const len = bytes.length;
      for (let i = 0; i < len; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary);
    };
  })();

  /**
   * 遍历项目当前引用的全部 asset（costume/sound，去重），把每一项交给回调。
   * 数据源：vm.runtime.targets 上真实加载的 costume/sound 对象（含 asset.data）；
   * 若对象未持有 asset 则回退查 storage 内置缓存（storage.get）。
   * 回调签名：cb(assetId, srcAsset, data, dataFormat)
   *   - srcAsset：storage 或 target 上持数据的 asset 对象（可能为 null）
   *   - data：Uint8Array 原始数据（可能为 null）
   *   - dataFormat：小写格式串（如 'svg' / 'png' / 'wav'）
   */
  const forEachProjectAsset = (vmInstance, cb) => {
    const storage = vmInstance && vmInstance.runtime ? vmInstance.runtime.storage : null;
    const seen = new Set();
    const visit = (assetId, asset, dataFormat) => {
      if (!assetId || seen.has(assetId)) return;
      seen.add(assetId);
      // 数据完整性：优先取 storage 缓存中的完整数据（storage.get 命中说明已完整加载/注入），
      // 仅当 storage 无数据时才回退 target 上的 asset.data（可能为库占位/未完成拉取）。
      let srcAsset = null;
      let data = null;
      if (storage) {
        const cached = storage.get(assetId);
        if (cached && cached.data && cached.data.length > 0) {
          srcAsset = cached;
          data = cached.data;
        }
      }
      if (!data && asset && asset.data && asset.data.length > 0) {
        srcAsset = asset;
        data = asset.data;
      }
      cb(assetId, srcAsset, data, String(dataFormat || '').toLowerCase());
    };
    const targets = vmInstance && vmInstance.runtime ? (vmInstance.runtime.targets || []) : [];
    targets.forEach((target) => {
      const costumes = typeof target.getCostumes === 'function' ? target.getCostumes() : (target.costumes || []);
      (costumes || []).forEach((costume) => {
        visit(costume.assetId, costume.asset || (storage && storage.get(costume.assetId)), costume.dataFormat);
      });
      // 注意：scratch-vm 的 Target 实例没有 sounds 属性（运行时非数组），
      // 正确 API 是 getSounds()，与上方造型的 getCostumes() 写法对齐；
      // 否则声音 asset 永远收集不进快照，接收端因声音缺失导致整个角色安装失败。
      const sounds = (typeof target.getSounds === 'function' ? target.getSounds() : (target.sprite && target.sprite.sounds)) || [];
      sounds.forEach((sound) => {
        visit(sound.assetId, sound.asset || (storage && storage.get(sound.assetId)), sound.dataFormat);
      });
    });
  };

  /**
   * 收集项目 asset 引用清单（assetId + dataFormat），供快照携带。
   * 只列本地持完整数据的 asset；体积从 MB 级降到 KB 级，
   * 接收端本地缺失时再按需拉取（见 asset-request / asset-data）。
   */
  const collectAssetManifest = (vmInstance) => {
    const manifest = [];
    forEachProjectAsset(vmInstance, (assetId, srcAsset, data, dataFormat) => {
      if (srcAsset && data && data.length > 0) {
        manifest.push({ assetId, dataFormat });
      }
    });
    return manifest;
  };

  /**
   * 收集项目 asset 的二进制数据（编码为 text/base64），供按需拉取响应。
   * @param {*} vmInstance
   * @param {Set<string>|null} ids 仅收集指定 assetId；null 表示全部
   * @returns {[{assetId, dataFormat, encoding: 'text'|'base64', data, incomplete}]}
   */
  const collectProjectAssets = (vmInstance, ids) => {
    const assets = [];
    // 保守最小长度（字节）：二进制格式低于此值视为可疑（如库声音仅 wav 头占位）。
    // 携带 incomplete 标记由接收端跳过注入，避免用残废数据污染本地缓存。
    const BIN_MIN_SIZE = { wav: 64, mp3: 64, png: 100, jpg: 100, jpeg: 100, gif: 100, bmp: 100 };
    forEachProjectAsset(vmInstance, (assetId, srcAsset, data, dataFormat) => {
      if (ids && !ids.has(assetId)) return;
      if (!data) {
        console.warn('[remote-coop] asset 数据缺失（storage 与 target 均无完整数据）', assetId, dataFormat);
        return;
      }
      try {
        let incomplete = false;
        if (ASSET_TEXT_FORMATS.indexOf(dataFormat) < 0) {
          const min = BIN_MIN_SIZE[dataFormat] || 64;
          if (data.length < min) incomplete = true;
        }
        if (ASSET_TEXT_FORMATS.indexOf(dataFormat) >= 0) {
          assets.push({ assetId, dataFormat, encoding: 'text', data: srcAsset.decodeText(), incomplete: false });
        } else {
          assets.push({ assetId, dataFormat, encoding: 'base64', data: bytesToBase64(data), incomplete });
        }
      } catch (e) {
        console.warn('[remote-coop] asset 编码失败，跳过', assetId, e);
      }
    });
    return assets;
  };

  /**
   * 应用快照前，把快照携带的 asset 写入本地 storage 内置缓存。
   * storage.cache 实际走 builtinHelper._store：对已存在且 immutable 的 id
   * 直接返回不覆盖（幂等），不会破坏本地已有同名 asset。
   */
  const injectSnapshotAssets = (projectJson, vmInstance) => {
    const list = (projectJson && projectJson.assets) || [];
    if (!list.length) return;
    const storage = vmInstance && vmInstance.runtime ? vmInstance.runtime.storage : null;
    if (!storage) return;
    list.forEach((item) => {
      try {
        // 按需拉取模式：快照 assets 是引用清单（仅 assetId + dataFormat，无 encoding/data），
        // 二进制数据由 asset-data 定向回传后再注入；此处跳过清单项，避免 atob(undefined) 抛错。
        if (!('encoding' in item) && !('data' in item)) {
          return;
        }
        // 推送端已标记数据不完整（如库声音仅 wav 头占位、拉取未完成），
        // 跳过注入，避免用残废数据污染本地 storage 缓存导致 loadProject 失败。
        if (item.incomplete) {
          console.warn('[remote-coop] asset 数据不完整（incomplete 标记），跳过注入', item.assetId, item.dataFormat);
          return;
        }
        let bytes;
        if (item.encoding === 'text') {
          bytes = new TextEncoder().encode(String(item.data));
        } else {
          bytes = Uint8Array.from(atob(String(item.data)), (c) => c.charCodeAt(0));
        }
        const dataFormat = String(item.dataFormat || '').toLowerCase();
        let assetType = null;
        if (dataFormat === 'svg') assetType = storage.AssetType.ImageVector;
        else if (['png', 'bmp', 'jpeg', 'jpg', 'gif'].indexOf(dataFormat) >= 0) assetType = storage.AssetType.ImageBitmap;
        else if (['wav', 'mp3'].indexOf(dataFormat) >= 0) assetType = storage.AssetType.Sound;
        if (!assetType) {
          console.warn('[remote-coop] 未知 asset 格式，跳过', item.assetId, dataFormat);
          return;
        }
        storage.cache(assetType, dataFormat, bytes, item.assetId);
      } catch (e) {
        console.warn('[remote-coop] asset 注入失败', item.assetId, e);
      }
    });
  };

export {ASSET_TEXT_FORMATS, bytesToBase64, forEachProjectAsset, collectAssetManifest, collectProjectAssets, injectSnapshotAssets};
