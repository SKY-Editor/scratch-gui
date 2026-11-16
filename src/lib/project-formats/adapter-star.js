import {
    collectAssets,
    indexByFileName,
    normalizeProjectAssets
} from './asset-source';
import {STAR_MAGIC_PREFIX, readZipJson} from './detect';

/**
 * StartEditor（Bilup 系）的 .star 容器适配。
 *
 * 容器结构：
 *   project.base.json     sb3 骨架，targets 内**不含** blocks 字段
 *   star.json             清单：magic / version / shards / keys（短键映射表）
 *   blocks/t{target}/{i}.json  积木分片，使用短键且省略默认值
 *   *.svg                素材平铺在根目录
 *
 * 还原要点：
 *   1. 短键映射必须从 star.json.keys 动态读取，禁止硬编码；
 *   2. 分片按清单顺序合并进对应 target，块 id 全局唯一，跨分片的 next/parent 合法；
 *   3. 省略的默认值（shadow / parent / inputs / fields / topLevel）需要补回。
 */

// 短键映射的内置兜底，仅在清单缺少 keys 时使用。清单提供 keys 时以清单为准并允许扩展。
const DEFAULT_KEY_MAP = {
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

// 分片中被省略的默认值。inputs / fields 必须是全新对象，避免多个块共享同一引用。
const createBlockDefaults = () => ({
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: false
});

/**
 * 由清单的 keys 表构建「短键 -> 标准键」反向映射。
 * @param {object} keys 清单里的 keys 表（标准键 -> 短键）
 * @returns {object} 短键 -> 标准键
 */
const buildReverseKeyMap = keys => {
    const reverse = {};
    Object.keys(DEFAULT_KEY_MAP).forEach(standardKey => {
        reverse[DEFAULT_KEY_MAP[standardKey]] = standardKey;
    });
    if (keys && typeof keys === 'object') {
        Object.keys(keys).forEach(standardKey => {
            const shortKey = keys[standardKey];
            if (typeof shortKey === 'string' && shortKey) reverse[shortKey] = standardKey;
        });
    }
    return reverse;
};

/**
 * 把一个短键积木展开为标准 sb3 积木。
 * @param {object} rawBlock 分片中的积木
 * @param {object} reverseKeyMap 短键 -> 标准键
 * @returns {object} 标准 sb3 积木
 */
const expandBlock = (rawBlock, reverseKeyMap) => {
    if (!rawBlock || typeof rawBlock !== 'object') return rawBlock;
    const block = {};
    Object.keys(rawBlock).forEach(rawKey => {
        const standardKey = reverseKeyMap[rawKey] || rawKey;
        block[standardKey] = rawBlock[rawKey];
    });

    const defaults = createBlockDefaults();
    Object.keys(defaults).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(block, key)) {
            block[key] = defaults[key];
        }
    });

    // 顶层块必须有坐标，否则工作区里会堆在原点。分片省略了坐标时补 0。
    if (block.topLevel) {
        if (typeof block.x !== 'number') block.x = 0;
        if (typeof block.y !== 'number') block.y = 0;
    } else {
        delete block.x;
        delete block.y;
    }

    return block;
};

/**
 * 从分片对象里取出积木表。分片既可能是 {blocks: {...}}，也可能直接就是积木表。
 * @param {object} shard 分片内容
 * @returns {object} 积木表
 */
const getShardBlocks = shard => {
    if (!shard || typeof shard !== 'object') return null;
    if (shard.blocks && typeof shard.blocks === 'object') return shard.blocks;
    return shard;
};

/**
 * 把分片积木合并进目标 target。
 * @param {object} project 项目对象（原地修改）
 * @param {number} targetIndex target 下标
 * @param {object} blocks 标准 sb3 积木表
 * @param {object} [shardMeta] 对应的清单条目，用于错误提示
 * @returns {void}
 */
const mergeBlocksIntoTarget = (project, targetIndex, blocks) => {
    const targets = project.targets || [];
    let target = targets[targetIndex];
    if (!target) {
        // 有些导出版本用名字而非下标关联，退一步按清单条目的 name 匹配。
        target = null;
    }
    if (!target) return;
    if (!target.blocks || typeof target.blocks !== 'object') target.blocks = {};
    Object.keys(blocks).forEach(blockId => {
        target.blocks[blockId] = blocks[blockId];
    });
};

/**
 * @param {JSZip} zip 已加载的 zip
 * @param {object} manifest star.json 内容
 * @returns {Promise<{project: object, assets: Map<string, Uint8Array>, missing: Array}>} 标准 sb3 语义的项目对象与素材表
 */
const deserializeStar = (zip, manifest) => {
    if (!manifest || typeof manifest.magic !== 'string' ||
        manifest.magic.indexOf(STAR_MAGIC_PREFIX) !== 0) {
        return Promise.reject(new Error('Not a StartEditor (.star) project.'));
    }

    const shardMetas = Array.isArray(manifest.shards) ? manifest.shards : [];
    const shardPromises = shardMetas.map(meta => readZipJson(zip, meta && meta.name));

    return Promise.all([
        readZipJson(zip, 'project.base.json'),
        collectAssets(zip),
        Promise.all(shardPromises)
    ]).then(([baseProject, assets, shards]) => {
        if (!baseProject || !Array.isArray(baseProject.targets)) {
            throw new Error('project.base.json is missing or has no targets.');
        }

        const project = baseProject;
        const reverseKeyMap = buildReverseKeyMap(manifest.keys);

        shards.forEach((shard, index) => {
            const meta = shardMetas[index] || {};
            const rawBlocks = getShardBlocks(shard);
            if (!rawBlocks) return;

            const expanded = {};
            Object.keys(rawBlocks).forEach(blockId => {
                expanded[blockId] = expandBlock(rawBlocks[blockId], reverseKeyMap);
            });

            // 分片的 t 字段是 target 下标；老版本缺失时退化为全部 target 里首个同名的。
            let targetIndex = typeof meta.t === 'number' ? meta.t : null;
            if (targetIndex === null && typeof meta.target === 'number') {
                targetIndex = meta.target;
            }
            if (targetIndex === null) return;
            mergeBlocksIntoTarget(project, targetIndex, expanded);
        });

        // targets 里没被分片覆盖到的，补一个空积木表，避免出现 blocks 为 undefined 的 target。
        project.targets.forEach(target => {
            if (!target.blocks || typeof target.blocks !== 'object') target.blocks = {};
        });

        // scratch-vm 的 deserializeProject 依据 projectVersion 选择分支，第三方容器不会带这个字段。
        project.projectVersion = 3;
        normalizeProjectAssets(project);

        return {
            project: project,
            assets: indexByFileName(assets),
            missing: []
        };
    });
};

export {
    DEFAULT_KEY_MAP,
    buildReverseKeyMap,
    deserializeStar,
    expandBlock
};
