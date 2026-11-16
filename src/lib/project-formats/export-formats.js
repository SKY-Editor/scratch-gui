/**
 * 项目导出格式写回层：把 scratch-vm 产出的标准 sb3 容器转写成
 * .star（StartEditor / Bilup）或 .rj（RemixWarp）容器。
 * ---------------------------------------------------------------------------
 * 读取侧（adapter-star / adapter-rj）是「把第三方容器还原成 sb3 语义」，
 * 本文件是它的逆运算。为保证「导出的文件自己也能读回来」，
 * 写回规则严格对齐读取侧的解析约定：
 *
 *   .star：star.json（magic + shards + keys 短键映射）
 *          project.base.json（sb3 骨架，targets 内不含 blocks）
 *          blocks/t{目标}/c{分片}.json（短键 + 省略默认值）
 *          素材平铺在 zip 根目录
 *
 *   .rj  ：manifest.json（magic + formatVersion + monitors + project 元信息）
 *          targets/{i}.json（{index, target}，权威源）
 *          blocks/{i}.json（{index, blocks}，标准 sb3 长键）
 *          tables/*.json（冗余索引，读取侧不依赖但同类编辑器会读）
 *          assets/*（素材在 assets/ 子目录）
 * ---------------------------------------------------------------------------
 */
import JSZip from '@turbowarp/jszip';
import {FORMAT, RJ_MAGIC} from './detect';

// 与读取侧 STAR_MAGIC_PREFIX（'STAR-'）兼容的完整标识。
const STAR_MAGIC = 'STAR-1.0.5-SEA';

/**
 * 标准键 -> 短键。与 adapter-star 的 DEFAULT_KEY_MAP 互为逆映射，
 * 材料化写进 star.json.keys，读取方（含我们自己的读取侧）运行时读取，不硬编码。
 */
const STAR_KEY_MAP = {
    opcode: '$o',
    inputs: '$i',
    fields: '$f',
    next: '$n',
    parent: '$p',
    topLevel: '$t',
    shadow: '$s',
    x: '$x',
    y: '$y',
    mutation: '$m',
    comment: '$c'
};

// 分片里需要省掉的默认值：读取侧会按同一套规则补回。
const STAR_EMPTY_OBJECT_KEYS = ['inputs', 'fields'];
const STAR_NULL_KEYS = ['parent', 'next'];
const STAR_FALSE_KEYS = ['shadow', 'topLevel'];

/**
 * 取 zip 内路径的文件名部分。
 * @param {string} path zip 内路径
 * @returns {string} 文件名
 */
const baseName = path => {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? path : path.substring(slash + 1);
};

/**
 * 把 Blob 转成可交给 JSZip 的输入。
 * @param {Blob} blob sb3 内容
 * @returns {Promise<ArrayBuffer|Blob>} JSZip 可接受的输入
 */
const toZipInput = blob => (
    typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : Promise.resolve(blob)
);

/**
 * 读入 sb3 容器。
 * @param {Blob} blob sb3 内容
 * @returns {Promise<JSZip>} 已加载的 zip
 */
const loadSb3Archive = blob => toZipInput(blob).then(input => JSZip.loadAsync(input));

/**
 * 把 sb3 容器根目录下的素材全部读进内存（key 为 zip 内原路径）。
 * @param {JSZip} zip 已加载的 zip
 * @returns {Promise<Map<string, Uint8Array>>} 路径 -> 字节
 */
const collectRawAssets = zip => {
    const paths = [];
    zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        if (relativePath === 'project.json') return;
        paths.push(relativePath);
    });

    return Promise.all(paths.map(path => zip.file(path).async('uint8array')))
        .then(buffers => {
            const assets = new Map();
            paths.forEach((path, index) => {
                assets.set(path, buffers[index]);
            });
            return assets;
        });
};

/**
 * 单个积木压缩成 .star 短键形态，并省掉默认值。
 * @param {object} block 标准 sb3 积木
 * @param {object} keyMap 标准键 -> 短键
 * @returns {object} 短键积木
 */
const compressBlock = (block, keyMap) => {
    if (!block || typeof block !== 'object') return block;

    const packed = {};
    Object.keys(block).forEach(standardKey => {
        const value = block[standardKey];

        if (STAR_NULL_KEYS.indexOf(standardKey) !== -1 && value === null) return;
        if (STAR_FALSE_KEYS.indexOf(standardKey) !== -1 && value === false) return;
        if (STAR_EMPTY_OBJECT_KEYS.indexOf(standardKey) !== -1 &&
            value && typeof value === 'object' && Object.keys(value).length === 0) return;
        // 非顶层块不该带坐标，读取侧同样会删掉。
        if ((standardKey === 'x' || standardKey === 'y') && !block.topLevel) return;

        packed[keyMap[standardKey] || standardKey] = value;
    });

    return packed;
};

/**
 * 深拷贝并交给 JSON 往返一次，避免写回时污染 vm 内的项目对象。
 * @param {object} value 任意可序列化值
 * @returns {object} 副本
 */
const cloneJson = value => JSON.parse(JSON.stringify(value || {}));

/**
 * 组装 .star 容器。
 * @param {object} project 标准 sb3 项目对象
 * @param {Map<string, Uint8Array>} assets 素材
 * @returns {Promise<Blob>} 容器内容
 */
const toStarArchive = (project, assets) => {
    const zip = new JSZip();
    const clone = cloneJson(project);
    const targets = Array.isArray(clone.targets) ? clone.targets : [];
    const shards = [];

    clone.targets = targets.map((target, index) => {
        const skeleton = Object.assign({}, target);
        const blocks = skeleton.blocks && typeof skeleton.blocks === 'object' ? skeleton.blocks : {};
        delete skeleton.blocks;

        const packed = {};
        Object.keys(blocks).forEach(blockId => {
            packed[blockId] = compressBlock(blocks[blockId], STAR_KEY_MAP);
        });

        const shardPath = `blocks/t${index}/c0.json`;
        zip.file(shardPath, JSON.stringify({blocks: packed}));
        shards.push({
            name: shardPath,
            t: index,
            count: Object.keys(packed).length
        });

        return skeleton;
    });

    zip.file('project.base.json', JSON.stringify(clone));
    zip.file('star.json', JSON.stringify({
        magic: STAR_MAGIC,
        version: '1.0.5',
        generator: 'SKY Editor',
        shards: shards,
        keys: STAR_KEY_MAP
    }));

    // .star 的素材平铺在根目录，文件名即 md5ext。
    assets.forEach((bytes, path) => {
        zip.file(baseName(path), bytes);
    });

    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/octet-stream',
        compression: 'DEFLATE',
        compressionOptions: {level: 6}
    });
};

/**
 * 组装 .rj 容器。
 * @param {object} project 标准 sb3 项目对象
 * @param {Map<string, Uint8Array>} assets 素材
 * @param {string} [title] 项目标题
 * @returns {Promise<Blob>} 容器内容
 */
const toRjArchive = (project, assets, title) => {
    const zip = new JSZip();
    const clone = cloneJson(project);
    const targets = Array.isArray(clone.targets) ? clone.targets : [];
    const tables = {
        targets: [],
        costumes: [],
        sounds: [],
        variables: [],
        monitors: []
    };

    let blockCount = 0;

    targets.forEach((target, index) => {
        const entity = Object.assign({}, target);
        const blocks = entity.blocks && typeof entity.blocks === 'object' ? entity.blocks : {};
        delete entity.blocks;

        zip.file(`targets/${index}.json`, JSON.stringify({index: index, target: entity}));
        zip.file(`blocks/${index}.json`, JSON.stringify({index: index, blocks: blocks}));

        const localBlockCount = Object.keys(blocks).length;
        blockCount += localBlockCount;

        tables.targets.push({
            index: index,
            name: target.name,
            isStage: Boolean(target.isStage),
            blockCount: localBlockCount
        });
        (target.costumes || []).forEach(costume => {
            tables.costumes.push({
                target: index,
                name: costume.name,
                assetId: costume.assetId,
                md5ext: costume.md5ext,
                dataFormat: costume.dataFormat
            });
        });
        (target.sounds || []).forEach(sound => {
            tables.sounds.push({
                target: index,
                name: sound.name,
                assetId: sound.assetId,
                md5ext: sound.md5ext,
                dataFormat: sound.dataFormat
            });
        });
        const variables = target.variables || {};
        Object.keys(variables).forEach(variableId => {
            const entry = variables[variableId] || [];
            tables.variables.push({
                target: index,
                id: variableId,
                name: entry[0],
                value: entry[1]
            });
        });
    });

    tables.monitors = Array.isArray(clone.monitors) ? clone.monitors.slice() : [];

    zip.file('manifest.json', JSON.stringify({
        magic: RJ_MAGIC,
        formatVersion: 1,
        app: 'TurboWarp',
        title: typeof title === 'string' ? title : '',
        targetCount: targets.length,
        blockCount: blockCount,
        monitors: tables.monitors,
        project: {
            meta: clone.meta || {},
            extensions: Array.isArray(clone.extensions) ? clone.extensions : []
        },
        tables: {
            targets: 'tables/targets.json',
            costumes: 'tables/costumes.json',
            sounds: 'tables/sounds.json',
            variables: 'tables/variables.json',
            monitors: 'tables/monitors.json'
        }
    }));

    Object.keys(tables).forEach(name => {
        zip.file(`tables/${name}.json`, JSON.stringify(tables[name]));
    });

    // .rj 的素材放在 assets/ 子目录。
    assets.forEach((bytes, path) => {
        zip.file(`assets/${baseName(path)}`, bytes);
    });

    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/octet-stream',
        compression: 'DEFLATE',
        compressionOptions: {level: 6}
    });
};

/**
 * 把标准 sb3 容器转写成指定格式。
 * @param {Blob} sb3Blob scratch-vm 产出的标准 sb3 内容
 * @param {string} format FORMAT 中的取值（sb3 / star / rj）
 * @param {object} [options] 选项
 * @param {string} [options.title] 项目标题（.rj 会写进清单）
 * @returns {Promise<Blob>} 目标格式内容；format 为 sb3 时原样返回
 */
const exportProjectArchive = (sb3Blob, format, options) => {
    if (!format || format === FORMAT.SB3) return Promise.resolve(sb3Blob);
    if (format !== FORMAT.STAR && format !== FORMAT.RJ) {
        return Promise.reject(new Error(`Unsupported export format: ${format}`));
    }

    return loadSb3Archive(sb3Blob).then(zip => {
        const projectFile = zip.file('project.json');
        if (!projectFile) {
            return Promise.reject(new Error('project.json is missing in the sb3 archive.'));
        }

        return Promise.all([
            projectFile.async('string'),
            collectRawAssets(zip)
        ]).then(([text, assets]) => {
            const project = JSON.parse(text);
            if (format === FORMAT.STAR) return toStarArchive(project, assets);
            return toRjArchive(project, assets, options && options.title);
        });
    });
};

export {
    STAR_MAGIC,
    STAR_KEY_MAP,
    compressBlock,
    exportProjectArchive,
    toRjArchive,
    toStarArchive
};
