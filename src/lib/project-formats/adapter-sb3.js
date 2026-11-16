/**
 * 标准 .sb3 无需任何转换。
 *
 * 结构：project.json + 素材平铺在容器根目录，scratch-vm 的
 * serialization/sb3 可以直接读取，且 scratch-parser 的校验、协作 patch、
 * 存档点快照等既有钩子都挂在 vm.loadProject 上，绕过它们反而会丢功能。
 *
 * 因此本文件只提供识别能力，实际加载仍交还原生链路。
 */

/**
 * @param {JSZip} zip 已加载的 zip
 * @returns {boolean} 是否为标准 sb3 容器
 */
const isStandardSb3 = zip => Boolean(zip && zip.file('project.json'));

export {isStandardSb3};
