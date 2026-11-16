import JSZip from '@turbowarp/jszip';

/**
 * 素材扩展名白名单。scratch-vm 的 serialization/sb3 只会认这些 dataFormat，
 * 与之保持一致可避免把清单、索引等 json 误当素材。
 */
const ASSET_EXTENSION_PATTERN = /\.(svg|png|jpg|jpeg|gif|bmp|mp3|wav|ogg)$/i;

/**
 * @param {string} path zip 内路径
 * @returns {boolean} 该条目是否可能是素材
 */
const isAssetPath = path => {
    if (!path || path.endsWith('/')) return false;
    return ASSET_EXTENSION_PATTERN.test(path);
};

/**
 * 去掉素材名末尾的扩展名。
 * StartEditor 的 assetId 会带着扩展名（形如 "ce8d...[md5].svg"），而
 * scratch-vm 期望 assetId 是不含扩展名的裸 md5，扩展名只出现在 md5ext 里。
 * 若不剥离，deserializeCostume 会拼出 "xxx.svg.svg" 从而找不到文件。
 * @param {string} value 原始值
 * @returns {string} 裸 md5
 */
const stripExtension = value => {
    if (typeof value === 'undefined' || value === null) return '';
    return String(value).replace(ASSET_EXTENSION_PATTERN, '');
};

/**
 * 取路径中的文件名部分。
 * @param {string} path zip 内路径
 * @returns {string} 文件名
 */
const getFileName = path => {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? path : path.substring(slash + 1);
};

/**
 * 把一个 zip 内的素材读进内存。
 * @param {JSZip} zip 已加载的 zip
 * @param {object} [options] 选项
 * @param {string} [options.prefix] 只收集该目录前缀下的素材（如 rj 的 "assets/"）
 * @returns {Promise<Map<string, Uint8Array>>} zip 内路径 -> 素材字节
 */
const collectAssets = (zip, options) => {
    const prefix = (options && options.prefix) || null;
    const paths = [];
    zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        if (prefix && relativePath.indexOf(prefix) !== 0) return;
        if (!isAssetPath(relativePath)) return;
        paths.push(relativePath);
    });

    return Promise.all(paths.map(path => zip.file(path).async('uint8array')))
        .then(blobs => {
            const assets = new Map();
            paths.forEach((path, index) => assets.set(path, blobs[index]));
            return assets;
        });
};

/**
 * 以「小写文件名（含扩展名）」为键重建素材索引。
 * 这样无论素材平铺在根目录（.star）还是放在 assets/ 子目录（.rj），
 * 都能按 md5ext 命中同一份字节。
 * @param {Map<string, Uint8Array>} assets collectAssets 的产物
 * @returns {Map<string, Uint8Array>} 文件名 -> 素材字节
 */
const indexByFileName = assets => {
    const index = new Map();
    if (!assets) return index;
    assets.forEach((bytes, path) => {
        const fileName = getFileName(path).toLowerCase();
        if (!index.has(fileName)) index.set(fileName, bytes);
    });
    return index;
};

/**
 * 规范化造型描述符，使其符合 scratch-vm 对 sb3 造型的预期。
 * @param {object} costume 造型描述符（原地修改）
 * @returns {object} 同一个造型描述符
 */
const normalizeCostume = costume => {
    if (!costume || typeof costume !== 'object') return costume;
    const assetId = stripExtension(costume.assetId || costume.md5ext || costume.md5);
    if (!assetId) return costume;
    const dataFormat = String(costume.dataFormat || '').toLowerCase();
    costume.assetId = assetId;
    if (dataFormat) {
        costume.dataFormat = dataFormat;
        costume.md5ext = `${assetId}.${dataFormat}`;
        // deserializeCostume 用 `${assetId}.${dataFormat}` 定位 zip 条目，
        // md5 同步一份便于其它读取方复用同一素材。
        costume.md5 = costume.md5ext;
    }
    return costume;
};

/**
 * 规范化声音描述符。
 * @param {object} sound 声音描述符（原地修改）
 * @returns {object} 同一个声音描述符
 */
const normalizeSound = sound => {
    if (!sound || typeof sound !== 'object') return sound;
    const assetId = stripExtension(sound.assetId || sound.md5ext || sound.md5);
    if (!assetId) return sound;
    const dataFormat = String(sound.dataFormat || '').toLowerCase();
    sound.assetId = assetId;
    if (dataFormat) {
        sound.dataFormat = dataFormat;
        sound.md5ext = `${assetId}.${dataFormat}`;
        // scratch-vm 的 deserializeSound 直接用 sound.md5 作为 zip 内文件名，
        // 所以这里必须带上扩展名。
        sound.md5 = sound.md5ext;
    }
    return sound;
};

/**
 * 规范化单个 target 的造型与声音。
 * @param {object} target target 描述符（原地修改）
 * @returns {object} 同一个 target
 */
const normalizeTargetAssets = target => {
    if (!target || typeof target !== 'object') return target;
    if (Array.isArray(target.costumes)) target.costumes.forEach(normalizeCostume);
    if (Array.isArray(target.sounds)) target.sounds.forEach(normalizeSound);
    return target;
};

/**
 * 规范化整个项目的素材描述符。
 * @param {object} project 项目对象（原地修改）
 * @returns {object} 同一个项目对象
 */
const normalizeProjectAssets = project => {
    if (project && Array.isArray(project.targets)) {
        project.targets.forEach(normalizeTargetAssets);
    }
    return project;
};

/**
 * 按 md5ext 在素材索引里取字节。
 * @param {Map<string, Uint8Array>} assetsByFileName indexByFileName 的产物
 * @param {string} name md5ext
 * @returns {Uint8Array|null} 素材字节
 */
const resolveAssetBytes = (assetsByFileName, name) => {
    if (!assetsByFileName || !name) return null;
    const fileName = getFileName(String(name)).toLowerCase();
    return assetsByFileName.get(fileName) || null;
};

/**
 * 把项目引用到的素材平铺到一个新的 zip 根目录，文件名即 md5ext。
 * 这样 scratch-vm 的 deserializeCostume / deserializeSound 可以直接命中，
 * 无需改动 storage，也无需搬动原 zip 内的文件。
 * @param {object} project 已规范化的项目对象
 * @param {Map<string, Uint8Array>} assetsByFileName indexByFileName 的产物
 * @returns {{zip: JSZip, missing: Array}} 合成好的 zip 与缺失素材清单
 */
const buildAssetZip = (project, assetsByFileName) => {
    const zip = new JSZip();
    const missing = [];
    const targets = (project && project.targets) || [];

    targets.forEach(target => {
        const descriptors = [];
        if (Array.isArray(target.costumes)) descriptors.push(...target.costumes);
        if (Array.isArray(target.sounds)) descriptors.push(...target.sounds);

        descriptors.forEach(descriptor => {
            const name = descriptor.md5ext || descriptor.md5;
            if (!name) return;
            const fileName = getFileName(String(name));
            if (zip.file(fileName)) return;
            const bytes = resolveAssetBytes(assetsByFileName, fileName);
            if (bytes) {
                zip.file(fileName, bytes);
            } else {
                missing.push({
                    target: target.name,
                    asset: descriptor.name,
                    fileName: fileName
                });
            }
        });
    });

    return {zip: zip, missing: missing};
};

/**
 * 把结构化项目对象 + 素材合成一个标准 sb3 容器。
 * project.json 放在根目录，素材按 md5ext 平铺在根目录。
 * @param {object} project 已规范化的项目对象
 * @param {Map<string, Uint8Array>} assetsByFileName indexByFileName 的产物
 * @returns {Promise<{bytes: Uint8Array, missing: Array}>} 容器字节与缺失素材清单
 */
const packProjectZip = (project, assetsByFileName) => {
    const {zip, missing} = buildAssetZip(project, assetsByFileName);
    zip.file('project.json', JSON.stringify(project));
    return zip.generateAsync({
        type: 'uint8array',
        // 这个容器只是内存中转，紧接着就会被 scratch-vm 解包成 Blob。
        // 用 level 1 的快速 deflate：SVG/JSON 类内容压缩收益很高（体积可降 2~3 倍），
        // PNG/MP3 这类已压缩格式因为 level 低，额外开销也很小。
        compression: 'DEFLATE',
        compressionOptions: {level: 1}
    }).then(bytes => ({bytes: bytes, missing: missing}));
};

export {
    buildAssetZip,
    collectAssets,
    indexByFileName,
    isAssetPath,
    normalizeCostume,
    normalizeProjectAssets,
    normalizeSound,
    normalizeTargetAssets,
    packProjectZip,
    resolveAssetBytes,
    stripExtension
};
