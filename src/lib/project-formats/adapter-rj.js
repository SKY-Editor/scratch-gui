import {
    collectAssets,
    indexByFileName,
    normalizeProjectAssets
} from './asset-source';
import {RJ_MAGIC, readZipJson} from './detect';

/**
 * RemixWarp 的 .rj 容器适配。
 *
 * 容器结构：
 *   manifest.json        清单：magic / formatVersion / project.extensions / monitors / 文件索引
 *   targets/{i}.json     单个 target，真正的 target 对象在 .target 字段内
 *   blocks/{i}.json      单个 target 的积木，标准 sb3 长键格式，积木表在 .blocks 字段内
 *   blocks/prebuilt/{i}.json  预编译积木，**非** sb3 格式，加载时必须跳过
 *   tables/*.json        冗余索引（targets/costumes/sounds/variables/monitors 各一份）
 *   assets/*.svg|png…    素材，位于 assets/ 子目录
 *
 * 还原要点：
 *   1. 以 targets/{i}.json 为权威源，tables/*.json 只是索引，不参与还原；
 *   2. blocks/prebuilt/ 使用命名对象式 inputs（{name, block, shadow}）、坐标为字符串，
 *      与 sb3 数组式格式不兼容，必须整目录跳过；
 *   3. 素材在 assets/ 子目录，靠 asset-source 按文件名重建索引来命中，不搬动文件。
 */

const TARGET_PATH_PATTERN = /^targets\/([^/]+)\.json$/;
const BLOCKS_PATH_PATTERN = /^blocks\/([^/]+)\.json$/;

/**
 * 从 zip 路径表里挑出匹配的条目。
 * @param {JSZip} zip 已加载的 zip
 * @param {RegExp} pattern 路径匹配
 * @returns {Array<{key: string, path: string}>} key 为文件名主干（通常是序号）
 */
const listEntries = (zip, pattern) => {
    const entries = [];
    zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        const matched = relativePath.match(pattern);
        if (!matched) return;
        entries.push({key: matched[1], path: relativePath});
    });
    return entries;
};

/**
 * 按序号的数值大小排序，保证 target 顺序与导出时一致。
 * @param {Array<{key: string}>} entries 条目列表
 * @returns {Array<{key: string}>} 排序后的列表
 */
const sortByIndex = entries => entries.sort((a, b) => {
    const indexA = parseInt(a.key, 10);
    const indexB = parseInt(b.key, 10);
    if (isNaN(indexA) || isNaN(indexB)) return a.key < b.key ? -1 : 1;
    return indexA - indexB;
});

/**
 * 去掉积木对象上不属于 sb3 规范的字段。
 * rj 的部分导出会在积木上附带内部 id，保留会干扰 scratch-vm 的解析。
 * @param {object} blocks 积木表
 * @returns {object} 同一个积木表
 */
const sanitizeBlocks = blocks => {
    if (!blocks || typeof blocks !== 'object') return blocks;
    Object.keys(blocks).forEach(blockId => {
        const block = blocks[blockId];
        if (block && typeof block === 'object') delete block.id;
    });
    return blocks;
};

/**
 * 把 manifest 里 project 段的信息合并到还原出的项目对象上。
 * @param {object} project 项目对象（原地修改）
 * @param {object} manifest 清单
 * @returns {object} 同一个项目对象
 */
const applyManifestMeta = (project, manifest) => {
    const stage = manifest.project && typeof manifest.project === 'object' ? manifest.project : {};

    if (Array.isArray(stage.extensions)) {
        project.extensions = stage.extensions.slice();
    }
    if (!Array.isArray(project.extensions)) project.extensions = [];

    if (stage.meta && typeof stage.meta === 'object') {
        project.meta = Object.assign({}, stage.meta);
    }
    if (!project.meta || typeof project.meta !== 'object') project.meta = {};
    if (!project.meta.semver) project.meta.semver = '3.0.0';
    if (!project.meta.vm) project.meta.vm = '0.2.0';

    // 监视器以清单为准；tables/monitors.json 只是同一份数据的索引。
    if (Array.isArray(manifest.monitors)) {
        project.monitors = manifest.monitors;
    } else if (!Array.isArray(project.monitors)) {
        project.monitors = [];
    }

    if (typeof manifest.title === 'string' && manifest.title && typeof project.meta.name === 'undefined') {
        project.meta.name = manifest.title;
    }

    return project;
};

/**
 * @param {JSZip} zip 已加载的 zip
 * @param {object} manifest manifest.json 内容
 * @returns {Promise<{project: object, assets: Map<string, Uint8Array>}>} 标准 sb3 语义的项目对象与素材表
 */
const deserializeRj = (zip, manifest) => {
    if (!manifest || manifest.magic !== RJ_MAGIC) {
        return Promise.reject(new Error('Not a RemixWarp (.rj) project.'));
    }

    // 明确的版本门禁：不认识的 formatVersion 宁可拒绝，也不做猜测性解析。
    if (typeof manifest.formatVersion !== 'undefined' &&
        manifest.formatVersion !== null &&
        manifest.formatVersion !== 1) {
        return Promise.reject(new Error(
            `Unsupported .rj formatVersion: ${manifest.formatVersion}`
        ));
    }

    const targetEntries = sortByIndex(listEntries(zip, TARGET_PATH_PATTERN));
    // blocks/prebuilt/ 不匹配 BLOCKS_PATH_PATTERN（多一级目录），因此天然被跳过。
    const blockEntries = listEntries(zip, BLOCKS_PATH_PATTERN);

    return Promise.all([
        Promise.all(targetEntries.map(entry => readZipJson(zip, entry.path))),
        Promise.all(blockEntries.map(entry => readZipJson(zip, entry.path))),
        collectAssets(zip, {prefix: 'assets/'})
    ]).then(([targetPayloads, blockPayloads, assets]) => {
        if (!targetPayloads.length) {
            throw new Error('No targets/{i}.json found in .rj container.');
        }

        const targets = targetPayloads.map(payload => {
            if (!payload || typeof payload !== 'object') return null;
            // 真正的 target 对象在 .target 字段里；直接就是 target 时原样使用。
            return payload.target && typeof payload.target === 'object' ? payload.target : payload;
        }).filter(Boolean);

        const blocksByIndex = new Map();
        blockEntries.forEach((entry, position) => {
            const payload = blockPayloads[position];
            if (!payload || typeof payload !== 'object') return;
            const key = typeof payload.index === 'undefined' ? entry.key : String(payload.index);
            const blocks = payload.blocks && typeof payload.blocks === 'object' ?
                payload.blocks : payload;
            blocksByIndex.set(key, sanitizeBlocks(blocks));
        });

        const project = {
            targets: targets,
            extensions: [],
            monitors: []
        };

        // target 自己的 index 用来关联同名序号的积木文件。
        targetPayloads.forEach((payload, position) => {
            const target = targets[position];
            if (!target) return;
            const rawIndex = payload && typeof payload.index !== 'undefined' ? String(payload.index) : null;
            const key = rawIndex === null ? String(position) : rawIndex;
            const blocks = blocksByIndex.get(key);
            target.blocks = blocks || {};
            if (!blocks && blocksByIndex.size === 1) {
                // 只有一个积木文件但序号对不上时，退化为按顺序认领。
                target.blocks = blocksByIndex.values().next().value || {};
            }
        });

        applyManifestMeta(project, manifest);

        project.projectVersion = 3;
        normalizeProjectAssets(project);

        return {
            project: project,
            assets: indexByFileName(assets)
        };
    });
};

export {deserializeRj, sortByIndex};
