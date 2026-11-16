// SKYEditor：项目资源虚拟文件系统（测试版）—— 数据映射层
// 职责：把当前 VM 中真实的 target / 造型 / 声音资源，映射为文件树节点。
// 说明：本模块不写死任何资源名，全部从 vm.runtime.targets 实时读取，
//       以保证树内容与项目内实际资源一致。
//       图片类节点与角色节点会附带 thumbnail（dataURI），供视图层渲染缩略图；
//       缩略图按 assetId 缓存，重建树时不会重复编码。

// 节点附加字段说明：
//   size    —— 真实数据字节数，来自资源二进制或工程 JSON 文本，未知为 null
//   payload —— 该节点可下载内容的描述（type 决定下载方式），不可下载为 null
import {
    getActiveCostumeThumbnail,
    getAssetByteSize,
    getCostumeThumbnail,
    getResourceAssetId
} from './project-fs-assets.js';

const UNTITLED = '未命名项目';

// 项目名清洗：去掉 .sb3 后缀，空值回退
const normalizeProjectName = projectTitle => {
    const raw = (projectTitle || '').trim();
    if (!raw) return UNTITLED;
    return raw.replace(/\.sb3$/i, '');
};

// 资源文件名 = 资源名 + 真实数据格式（若资源名已含同名后缀则不重复拼接）
const buildFileName = (resourceName, dataFormat) => {
    const name = (resourceName || '').trim() || '未命名';
    const ext = (dataFormat || '').toLowerCase();
    if (!ext) return name;
    const lower = name.toLowerCase();
    if (lower.endsWith(`.${ext}`)) return name;
    return `${name}.${ext}`;
};

// 目录大小 = 其下所有资源的真实字节数合计（未载入的资源按 0 计入，
// 保证已可用部分的大小仍然可见，且数字始终为确定值、不会闪烁变化）
const sumChildSize = children => children.reduce((total, child) => (
    total + (typeof child.size === 'number' ? child.size : 0)
), 0);

const makeFolder = (path, name, children, options) => {
    const opts = options || {};
    return {
        id: path,
        name,
        kind: 'folder',
        thumbnail: opts.thumbnail || null,
        children,
        size: sumChildSize(children),
        payload: opts.payload || null
    };
};

const makeFile = (path, name, ext, options) => {
    const opts = options || {};
    return {
        id: path,
        name,
        kind: 'file',
        ext: (ext || '').toLowerCase(),
        thumbnail: opts.thumbnail || null,
        children: null,
        size: typeof opts.size === 'number' ? opts.size : null,
        payload: opts.payload || null
    };
};

// 资源文件节点的下载描述：assetId 用于运行时取回原始二进制，
// fileName 已是「资源名 + 真实 dataFormat」，下载时原样使用
const buildAssetPayload = (runtime, resource, fileName) => {
    const assetId = getResourceAssetId(runtime, resource);
    if (!assetId) return null;
    return {type: 'asset', assetId, fileName};
};

// 造型列表 → 文件节点（背景 / 造型共用）：图片类带缩略图，音频类不带
const buildCostumeFiles = (costumes, basePath, runtime) => (costumes || []).map((costume, index) => {
    const fileName = buildFileName(costume.name, costume.dataFormat);
    return makeFile(`${basePath}/${index}`, fileName, costume.dataFormat, {
        thumbnail: getCostumeThumbnail(runtime, costume),
        size: getAssetByteSize(runtime, costume),
        payload: buildAssetPayload(runtime, costume, fileName)
    });
});

// 声音列表 → 文件节点
const buildSoundFiles = (sounds, basePath, runtime) => (sounds || []).map((sound, index) => {
    const fileName = buildFileName(sound.name, sound.dataFormat);
    return makeFile(`${basePath}/${index}`, fileName, sound.dataFormat, {
        size: getAssetByteSize(runtime, sound),
        payload: buildAssetPayload(runtime, sound, fileName)
    });
});

// 工程 JSON 文本的真实字节数：项目 .js 节点的大小即序列化后的工程 JSON 大小
// （仅结构，不含资源二进制；资源二进制大小由造型/声音节点各自承担）
const measureProjectJson = vm => {
    try {
        if (!vm || typeof vm.toJSON !== 'function') return null;
        const projectJson = vm.toJSON();
        if (typeof projectJson !== 'string') return null;
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(projectJson).length;
        }
        return projectJson.length;
    } catch (e) {
        return null;
    }
};

/**
 * 构建项目资源文件树
 * 结构（与需求图一致）：
 *   项目名/
 *     项目名.js
 *     舞台/
 *       背景/*.svg
 *       声音/*.wav
 *     角色名.sprite3/
 *       造型/*.svg
 *       声音/*.wav
 * @param {object} vm - scratch-vm 实例
 * @param {string} projectTitle - redux 中的项目标题
 * @returns {object|null} 根节点（vm 不可用时返回 null）
 */
const buildProjectFileTree = (vm, projectTitle) => {
    if (!vm || !vm.runtime) return null;
    const runtime = vm.runtime;
    const targets = Array.isArray(runtime.targets) ? runtime.targets : [];
    const stage = targets.find(target => target && target.isStage) || null;
    const sprites = targets.filter(target => target && !target.isStage && target.isOriginal);

    const projectName = normalizeProjectName(projectTitle);
    const rootId = '/';

    // 工程 JSON 只测量一次，供项目 .js 节点使用
    const projectJsonSize = measureProjectJson(vm);
    const projectFileName = `${projectName}.js`;

    const children = [
        makeFile(`${rootId}${projectFileName}`, projectFileName, 'js', {
            size: projectJsonSize,
            payload: {type: 'project', fileName: projectFileName}
        })
    ];

    // 舞台节点：始终存在（编辑器中舞台恒存在），资源为空时给出空目录提示
    if (stage) {
        const stageSprite = stage.sprite || {};
        children.push(makeFolder(`${rootId}舞台`, '舞台', [
            makeFolder(`${rootId}舞台/背景`, '背景',
                buildCostumeFiles(stageSprite.costumes, `${rootId}舞台/背景`, runtime)),
            makeFolder(`${rootId}舞台/声音`, '声音',
                buildSoundFiles(stageSprite.sounds, `${rootId}舞台/声音`, runtime))
        ]));
    }

    // 角色节点：按角色区顺序（runtime.targets 中非舞台项的顺序）展开
    // 角色节点作为“文件（.sprite3）”展示，图标取其“当前正在使用的造型”缩略图；
    // 该节点的大小为其下造型/声音资源合计，右键可直接打包下载 .sprite3
    sprites.forEach((target, spriteIndex) => {
        const sprite = target.sprite || {};
        const spriteName = (target.getName && target.getName()) || sprite.name || `角色${spriteIndex + 1}`;
        const spritePath = `${rootId}${spriteIndex}`;
        const spriteFileName = `${spriteName}.sprite3`;
        children.push(makeFolder(spritePath, spriteFileName, [
            makeFolder(`${spritePath}/造型`, '造型',
                buildCostumeFiles(sprite.costumes, `${spritePath}/造型`, runtime)),
            makeFolder(`${spritePath}/声音`, '声音',
                buildSoundFiles(sprite.sounds, `${spritePath}/声音`, runtime))
        ], {
            thumbnail: getActiveCostumeThumbnail(runtime, target),
            payload: {
                type: 'sprite3',
                targetId: target.id,
                fileName: spriteFileName
            }
        }));
    });

    return makeFolder(rootId, projectName, children);
};

export {
    buildProjectFileTree,
    normalizeProjectName
};
