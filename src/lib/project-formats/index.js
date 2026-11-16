import JSZip from '@turbowarp/jszip';
import log from '../log';
import {deserializeRj} from './adapter-rj';
import {deserializeStar} from './adapter-star';
import {packProjectZip} from './asset-source';
import {FORMAT, detectFormat, readZipJson} from './detect';
import {normalizeProject} from './normalize-project';

/**
 * 第三方项目格式读取层（只做读取，导出继续走标准 sb3）。
 *
 * 流水线：
 *   1. 只读容器中央目录，按清单文件名 + magic 判定格式（不解压内容）；
 *   2. 交给对应 adapter 还原出标准 sb3 语义的项目对象与素材索引；
 *   3. 把还原结果合成一个标准 sb3 容器（project.json + 素材平铺根目录）；
 *   4. 仍然调用 vm.loadProject 载入合成后的容器。
 *
 * 为什么第 4 步不直接调 vm.deserializeProject：
 * GUI 侧有大量逻辑挂在 vm.loadProject 上（协作同步会 patch 这个方法、
 * 存档点、失败提示、项目标题等），绕过它会静默丢功能。合成容器全程在内存里完成，
 * 素材用 STORE 方式打包不做二次压缩，代价远小于丢失这些链路。
 */

const ADAPTERS = {
    [FORMAT.STAR]: {
        manifest: 'star.json',
        deserialize: deserializeStar
    },
    [FORMAT.RJ]: {
        manifest: 'manifest.json',
        deserialize: deserializeRj
    }
};

/**
 * @param {*} input 任意输入
 * @returns {boolean} 是否为二进制容器
 */
const isBinaryInput = input => Boolean(input) && (
    input instanceof ArrayBuffer || ArrayBuffer.isView(input)
);

/**
 * @param {ArrayBuffer|ArrayBufferView} input 二进制输入
 * @returns {Uint8Array|null} 字节视图
 */
const toBytes = input => {
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return null;
};

/**
 * 把第三方容器还原并重新打包成标准 sb3 容器。
 * @param {JSZip} zip 已加载的容器
 * @param {string} format detectFormat 的结果
 * @returns {Promise<Uint8Array>} 标准 sb3 容器字节
 */
const adaptToSb3 = (zip, format) => {
    const adapter = ADAPTERS[format];
    if (!adapter) return Promise.reject(new Error(`No adapter for format: ${format}`));

    return readZipJson(zip, adapter.manifest).then(manifest =>
        adapter.deserialize(zip, manifest).then(adapted => {
            normalizeProject(adapted.project);
            return packProjectZip(adapted.project, adapted.assets).then(packed => {
                if (packed.missing.length) {
                    // 素材缺失不应阻断加载：scratch-vm 会把对应造型/声音标记为空，
                    // 项目其余部分照常可用。
                    log.warn('[project-formats] 素材缺失', {
                        format: format,
                        count: packed.missing.length,
                        sample: packed.missing.slice(0, 10)
                    });
                }
                return packed.bytes;
            });
        })
    );
};

/**
 * 统一的项目加载入口：标准格式与第三方格式都从这里进。
 * @param {VirtualMachine} vm scratch-vm 实例
 * @param {ArrayBuffer|ArrayBufferView|object|string} input 项目数据
 * @param {object} [options] 选项
 * @param {string} [options.filename] 文件名，用于日志
 * @param {object} [options.vmOptions] 透传给 vm.loadProject 的选项
 * @returns {Promise} 加载完成
 */
const loadAnyProject = (vm, input, options) => {
    if (!vm || typeof vm.loadProject !== 'function') {
        return Promise.reject(new Error('loadAnyProject requires a scratch-vm instance.'));
    }
    const opts = options || {};

    // 已解析好的项目对象 / JSON 字符串：原生路径本来就支持，不必过适配层。
    if (!isBinaryInput(input)) return vm.loadProject(input, opts.vmOptions);

    const bytes = toBytes(input);
    if (!bytes || !bytes.length) return vm.loadProject(input, opts.vmOptions);

    return JSZip.loadAsync(bytes)
        .then(
            zip => detectFormat(zip).then(format => ({zip: zip, format: format})),
            // 不是 zip 容器（例如 sb1）：交还原生链路去识别并给出标准错误。
            () => null
        )
        .then(result => {
            if (!result || !ADAPTERS[result.format]) {
                // 标准 sb3 或无法识别的容器：完整交还原生链路，
                // 保持 scratch-parser 校验与所有既有钩子不变。
                return vm.loadProject(bytes, opts.vmOptions);
            }
            log.info('[project-formats] 识别到第三方格式，走适配层', {
                format: result.format,
                filename: opts.filename || ''
            });
            return adaptToSb3(result.zip, result.format)
                .then(rebuilt => vm.loadProject(rebuilt, opts.vmOptions));
        });
};

export {
    FORMAT,
    adaptToSb3,
    detectFormat,
    isBinaryInput,
    loadAnyProject,
    toBytes
};
