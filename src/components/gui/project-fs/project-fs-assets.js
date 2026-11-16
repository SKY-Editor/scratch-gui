// SKYEditor：项目资源虚拟文件系统（测试版）—— 资源缩略图解析与缓存
// 职责：把造型资源转换为可直接交给 <img> 的 dataURI，并按 assetId 缓存。
// 说明：造型编码（encodeDataURI）对大体积 SVG 有明显开销，而文件树在
//       PROJECT_CHANGED / targetsUpdate / 标题变化时都会重建，若每次重建都重新编码
//       会造成明显卡顿。assetId 是资源内容的 MD5，天然适合作为缓存键。

const IMAGE_DATA_FORMATS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

// assetId -> dataURI
const thumbnailCache = new Map();

const normalizeDataFormat = dataFormat => (
    dataFormat ?
        String(dataFormat)
            .toLowerCase()
            .replace(/^\./, '') :
        ''
);

// 是否为可直接作为缩略图渲染的图片类数据格式
const isImageDataFormat = dataFormat => (
    IMAGE_DATA_FORMATS.indexOf(normalizeDataFormat(dataFormat)) !== -1
);

// 从运行时资源库按 assetId 取回 asset（costume.asset 在部分场景会被置空）
const getAssetById = (runtime, assetId) => {
    if (!assetId || !runtime || !runtime.storage) return null;
    if (typeof runtime.storage.get !== 'function') return null;
    return runtime.storage.get(assetId) || null;
};

/**
 * 取造型缩略图（dataURI），带 assetId 缓存
 * @param {object} runtime - vm.runtime
 * @param {object} costume - 造型对象（含 assetId / asset / dataFormat）
 * @returns {string|null} dataURI，非图片资源或不可用时返回 null
 */
const getCostumeThumbnail = (runtime, costume) => {
    if (!costume) return null;
    if (!isImageDataFormat(costume.dataFormat)) return null;

    const asset = costume.asset || getAssetById(runtime, costume.assetId);
    const assetId = (asset && asset.assetId) || costume.assetId;
    if (!assetId) return null;

    if (thumbnailCache.has(assetId)) return thumbnailCache.get(assetId);

    let dataUri = null;
    try {
        if (asset && typeof asset.encodeDataURI === 'function') {
            dataUri = asset.encodeDataURI() || null;
        }
    } catch (e) {
        dataUri = null;
    }

    // 只缓存成功结果：资源尚未就绪时允许下次重建重试
    if (dataUri) thumbnailCache.set(assetId, dataUri);
    return dataUri;
};

/**
 * 取角色「当前正在使用」的造型缩略图（角色 .sprite3 节点图标）
 * 说明：scratch-vm 切换造型时只改写 target.currentCostume 并重绘，不会派发
 *       PROJECT_CHANGED / targetsUpdate，因此视图侧需自行感知该索引变化。
 *       注意：currentCostume 挂在 RenderedTarget 上（不在 target.sprite 上），
 *       此函数同时兼容两种挂载位置，并对索引越界 / 非法值回退首个造型。
 * @param {object} runtime - vm.runtime
 * @param {object} target - 角色 target（也接受 target.sprite）
 * @returns {string|null} dataURI
 */
const getActiveCostumeThumbnail = (runtime, target) => {
    if (!target) return null;
    const sprite = target.sprite || target;
    const costumes = Array.isArray(sprite.costumes) ? sprite.costumes : [];
    if (costumes.length === 0) return null;

    const isValidIndex = index => (
        Number.isInteger(index) && index >= 0 && index < costumes.length
    );
    // 优先 target.currentCostume，其次 sprite.currentCostume
    const activeIndex = [target.currentCostume, sprite.currentCostume].find(isValidIndex);
    const activeCostume = isValidIndex(activeIndex) ? costumes[activeIndex] : costumes[0];
    return getCostumeThumbnail(runtime, activeCostume);
};

/**
 * 取资源真实字节数（造型 / 声音共用）
 * 说明：大小必须来自资源本身的二进制数据（asset.data 为 Uint8Array 或 ArrayBuffer，
 *       两者都有 byteLength），不能按文件名或 dataFormat 估算。
 *       资源尚未载入时返回 null，由调用方决定回退展示。
 * @param {object} runtime - vm.runtime
 * @param {object} resource - 造型或声音对象（含 asset / assetId）
 * @returns {number|null} 字节数
 */
const getAssetByteSize = (runtime, resource) => {
    if (!resource) return null;
    const asset = resource.asset || getAssetById(runtime, resource.assetId);
    const data = asset && asset.data;
    if (!data || typeof data.byteLength !== 'number') return null;
    return data.byteLength;
};

// 取资源的 assetId（asset 对象上的 assetId 更权威，回退资源自身字段）
const getResourceAssetId = (runtime, resource) => {
    if (!resource) return null;
    const asset = resource.asset || getAssetById(runtime, resource.assetId);
    return (asset && asset.assetId) || resource.assetId || null;
};

// 清空缓存（项目整体切换时可按需调用）
const clearThumbnailCache = () => {
    thumbnailCache.clear();
};

export {
    getCostumeThumbnail,
    getActiveCostumeThumbnail,
    getAssetByteSize,
    getResourceAssetId,
    getAssetById,
    isImageDataFormat,
    clearThumbnailCache
};
