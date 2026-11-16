/**
 * 把还原出的项目对象补齐到 scratch-parser 的 sb3 schema 要求。
 *
 * scratch-parser 的校验比 scratch-vm 的运行时宽松得多，但仍有硬性要求：
 *   sb3_schema:      required = [meta, targets]，meta.semver 必须匹配 3.x.y
 *   sb3_definitions:
 *     stage  required = [name, isStage]，name 必须为 "Stage"，isStage 必须为 true
 *     sprite required = [name, isStage]，isStage 必须为 false
 *     target required = [variables, costumes, sounds, blocks]
 *
 * 第三方容器的骨架常常省略这些字段，若不补齐，合成出的标准 sb3 会被
 * scratch-parser 直接判为 "Invalid project data"，用户只会看到一个笼统的失败提示。
 */

const STAGE_NAME = 'Stage';

/**
 * 判断 target 是否为舞台。
 * @param {object} target target 对象
 * @returns {boolean} 是否舞台
 */
const isStageTarget = target => Boolean(target) && (
    target.isStage === true || target.name === STAGE_NAME
);

/**
 * 补一个字段，仅在缺失时写入。
 * @param {object} target target 对象（原地修改）
 * @param {string} key 字段名
 * @param {*} value 默认值
 * @returns {void}
 */
const fillDefault = (target, key, value) => {
    if (typeof target[key] === 'undefined' || target[key] === null) target[key] = value;
};

/**
 * 补齐单个 target。
 * @param {object} target target 对象（原地修改）
 * @param {number} index 在 targets 数组中的下标
 * @returns {object} 同一个 target
 */
const normalizeTarget = (target, index) => {
    if (!target || typeof target !== 'object') return target;
    const isStage = isStageTarget(target);

    if (isStage) {
        target.name = STAGE_NAME;
        target.isStage = true;
    } else {
        target.isStage = false;
        if (typeof target.name !== 'string' || !target.name) target.name = `Sprite${index}`;
    }

    // target 维度必需字段
    fillDefault(target, 'variables', {});
    fillDefault(target, 'lists', {});
    fillDefault(target, 'broadcasts', {});
    fillDefault(target, 'blocks', {});
    fillDefault(target, 'comments', {});
    fillDefault(target, 'costumes', []);
    fillDefault(target, 'sounds', []);
    fillDefault(target, 'currentCostume', 0);
    fillDefault(target, 'volume', 100);

    if (typeof target.layerOrder !== 'number') {
        // 舞台固定在最底层，角色按数组顺序递增。
        target.layerOrder = isStage ? 0 : index;
    }

    if (isStage) {
        fillDefault(target, 'tempo', 60);
        fillDefault(target, 'videoTransparency', 50);
        fillDefault(target, 'videoState', 'on');
        fillDefault(target, 'textToSpeechLanguage', null);
    } else {
        fillDefault(target, 'visible', true);
        fillDefault(target, 'x', 0);
        fillDefault(target, 'y', 0);
        fillDefault(target, 'size', 100);
        fillDefault(target, 'direction', 90);
        fillDefault(target, 'draggable', false);
        fillDefault(target, 'rotationStyle', 'all around');
    }

    return target;
};

/**
 * 补齐整个项目。
 * @param {object} project 项目对象（原地修改）
 * @returns {object} 同一个项目对象
 */
const normalizeProject = project => {
    if (!project || typeof project !== 'object') return project;

    if (!Array.isArray(project.targets)) project.targets = [];
    project.targets.forEach(normalizeTarget);

    if (!Array.isArray(project.extensions)) project.extensions = [];
    if (!Array.isArray(project.monitors)) project.monitors = [];

    if (!project.meta || typeof project.meta !== 'object') project.meta = {};
    // semver 必须形如 3.x.y，vm 必须形如 x.y.z，否则 schema 校验不通过。
    if (typeof project.meta.semver !== 'string' ||
        !/^3\.[0-9]+\.[0-9]+$/.test(project.meta.semver)) {
        project.meta.semver = '3.0.0';
    }
    if (typeof project.meta.vm !== 'string' ||
        !/^[0-9]+\.[0-9]+\.[0-9]+/.test(project.meta.vm)) {
        project.meta.vm = '0.2.0';
    }
    if (typeof project.meta.agent !== 'undefined' && typeof project.meta.agent !== 'string') {
        delete project.meta.agent;
    }

    // 舞台必须存在且排在首位，scratch-vm 依赖 targets[0] 是舞台。
    const stageIndex = project.targets.findIndex(isStageTarget);
    if (stageIndex > 0) {
        const [stage] = project.targets.splice(stageIndex, 1);
        project.targets.unshift(stage);
    }

    project.projectVersion = 3;

    return project;
};

export {
    isStageTarget,
    normalizeProject,
    normalizeTarget
};
