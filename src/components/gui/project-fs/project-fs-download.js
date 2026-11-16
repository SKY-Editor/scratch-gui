// SKYEditor：项目资源虚拟文件系统（测试版）—— 下载能力
// 职责：把树节点 payload 描述的资源，按「原始字节」保存为本地文件。
// 说明：
//   1) 造型/声音 —— 直接取运行时资源库中的 asset 二进制原样写出，
//      扩展名取资源真实 dataFormat（已在数据层拼进 fileName），不做任何转码。
//   2) 项目 .js —— 写出 vm.toJSON() 的工程 JSON 文本（结构完整、不含资源二进制）。
//   3) 角色 .sprite3 —— 用项目已有的 @turbowarp/jszip 打包：zip 内放
//      「角色名.json（sb3 规范的角色序列化结果）」+ 该角色全部造型/声音资源
//      （文件名沿用 md5ext），与 Scratch 官方 sprite3 结构一致，可直接导入。
//      若自行打包异常，回退到 scratch-vm 的 exportSprite（其内部同样使用
//      @turbowarp/jszip，与背包导出走同一条序列化路径）。
import JSZip from '@turbowarp/jszip';

import {getAssetById} from './project-fs-assets.js';

// 资源下载 MIME：仅影响浏览器保存时的行为，扩展名始终以 fileName 为准
const MIME_BY_EXT = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    webm: 'audio/webm',
    js: 'text/plain;charset=utf-8',
    json: 'application/json;charset=utf-8'
};

const SPRITE3_MIME = 'application/x.scratch.sprite3';
// 释放临时 URL 前的等待时间，避免下载尚未开始就被回收
const REVOKE_DELAY = 4000;

const getExt = fileName => {
    const match = /\.([^.]+)$/.exec(fileName || '');
    return match ? match[1].toLowerCase() : '';
};

const getMimeType = fileName => MIME_BY_EXT[getExt(fileName)] || 'application/octet-stream';

// 触发浏览器保存：a[download] + 临时 objectURL
const saveBlob = (blob, fileName) => {
    if (typeof document === 'undefined' || !blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY);
};

// 取运行时资源二进制（asset.data 为 Uint8Array 或 ArrayBuffer，可直接交给 Blob）
const getAssetData = (runtime, assetId) => {
    const asset = getAssetById(runtime, assetId);
    return asset && asset.data ? asset.data : null;
};

// 造型/声音：原始资源文件下载
const downloadAsset = (vm, payload) => {
    const runtime = vm && vm.runtime;
    const data = getAssetData(runtime, payload.assetId);
    if (!data) return false;
    saveBlob(new Blob([data], {type: getMimeType(payload.fileName)}), payload.fileName);
    return true;
};

// 项目 .js：工程 JSON 文本下载
const downloadProjectJson = (vm, payload) => {
    if (!vm || typeof vm.toJSON !== 'function') return false;
    const projectJson = vm.toJSON();
    if (typeof projectJson !== 'string') return false;
    saveBlob(
        new Blob([projectJson], {type: getMimeType(payload.fileName)}),
        payload.fileName
    );
    return true;
};

// 收集角色自有资源的二进制（文件名沿用 md5ext，与 sb3 内部引用一致）
const collectSpriteAssets = (runtime, sprite) => {
    const resources = [].concat(sprite.costumes || [], sprite.sounds || []);
    return resources.reduce((files, resource) => {
        const dataFormat = (resource.dataFormat || '').toLowerCase();
        const assetId = resource.assetId || null;
        const md5ext = resource.md5ext || (assetId ? `${assetId}.${dataFormat}` : null);
        const data = assetId ? getAssetData(runtime, assetId) : null;
        if (!md5ext || !data) return files;
        return files.concat([{name: md5ext, data}]);
    }, []);
};

// 从工程序列化结果中取出「与 target 对应的角色 json」
// 说明：sb3 的角色对象按 runtime 中原始 target 顺序排列，故先用索引定位，
//       再用名称做一次校验，避免角色重名时取错。
const resolveSerializedSprite = (vm, target) => {
    const runtime = vm.runtime;
    const orderedTargets = (runtime.targets || [])
        .filter(item => item && !item.isStage && item.isOriginal !== false);
    const index = orderedTargets.findIndex(item => item.id === target.id);
    if (index === -1) return null;
    if (typeof vm.toJSON !== 'function') return null;

    const project = JSON.parse(vm.toJSON());
    const serializedSprites = (project.targets || []).filter(item => !item.isStage);
    const candidate = serializedSprites[index];
    const targetName = (target.getName && target.getName()) || (target.sprite && target.sprite.name);
    if (candidate && candidate.name === targetName) return candidate;
    return serializedSprites.find(item => item.name === targetName) || null;
};

// 角色 .sprite3：@turbowarp/jszip 打包（角色 json + 全部资源）
const buildSprite3Bytes = (vm, targetId) => {
    const runtime = vm && vm.runtime;
    const target = runtime && typeof runtime.getTargetById === 'function' ?
        runtime.getTargetById(targetId) :
        null;
    if (!target || !target.sprite) return Promise.reject(new Error('角色资源不存在'));

    const sprite = target.sprite;
    const serialized = resolveSerializedSprite(vm, target);
    if (!serialized) return Promise.reject(new Error('角色序列化结果不可用'));

    const zip = new JSZip();
    const spriteName = serialized.name || sprite.name || 'sprite';
    zip.file(`${spriteName}.json`, JSON.stringify(serialized));
    collectSpriteAssets(runtime, sprite).forEach(file => {
        zip.file(file.name, file.data);
    });

    return zip.generateAsync({
        type: 'uint8array',
        mimeType: SPRITE3_MIME,
        compression: 'DEFLATE',
        compressionOptions: {level: 6}
    });
};

// 兜底：scratch-vm 自带导出（内部同样使用 @turbowarp/jszip）
const buildSprite3BytesViaVm = (vm, targetId) => {
    if (!vm || typeof vm.exportSprite !== 'function') {
        return Promise.reject(new Error('导出能力不可用'));
    }
    return Promise.resolve(vm.exportSprite(targetId, 'uint8array'));
};

// 角色 .sprite3：打包后按 zip 保存
const downloadSprite3 = (vm, payload) => {
    const ensureBytes = bytes => {
        if (!bytes) throw new Error('打包结果为空');
        saveBlob(new Blob([bytes], {type: SPRITE3_MIME}), payload.fileName);
        return true;
    };
    return buildSprite3Bytes(vm, payload.targetId)
        .catch(() => buildSprite3BytesViaVm(vm, payload.targetId))
        .then(ensureBytes)
        .catch(() => false);
};

/**
 * 按节点下载（唯一入口）
 * @param {object} vm - scratch-vm 实例
 * @param {object} node - 树节点（需含 payload）
 * @returns {Promise<boolean>} 是否成功触发下载
 */
const downloadNode = (vm, node) => {
    const payload = node && node.payload;
    if (!payload) return Promise.resolve(false);
    if (payload.type === 'asset') return Promise.resolve(downloadAsset(vm, payload));
    if (payload.type === 'project') return Promise.resolve(downloadProjectJson(vm, payload));
    if (payload.type === 'sprite3') return downloadSprite3(vm, payload);
    return Promise.resolve(false);
};

export {
    downloadNode,
    downloadAsset,
    downloadProjectJson,
    downloadSprite3
};
