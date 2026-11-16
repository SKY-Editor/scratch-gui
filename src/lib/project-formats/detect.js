/**
 * 第三方项目格式标识。
 * @enum {string}
 */
const FORMAT = {
    SB3: 'sb3',
    STAR: 'star',
    RJ: 'rj',
    UNKNOWN: 'unknown'
};

// StartEditor (.star) 的清单 magic 形如 "STAR-1.0.5-SEA"，版本号在中间，
// 因此只比对前缀；具体版本交由 adapter 内部识别，不认识的版本明确拒绝。
const STAR_MAGIC_PREFIX = 'STAR-';

// RemixWarp (.rj) 的清单 magic 为固定串。
const RJ_MAGIC = 'RemixWarp-RJ-Project';

/**
 * 读取 zip 内某个 JSON 条目。
 * @param {JSZip} zip 已加载的 zip
 * @param {string} path zip 内路径
 * @returns {Promise<object|null>} 解析结果，条目不存在或解析失败时为 null
 */
const readZipJson = (zip, path) => {
    if (!path) return Promise.resolve(null);
    const file = zip.file(path);
    if (!file) return Promise.resolve(null);
    return file.async('string').then(text => {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    });
};

/**
 * 依据清单文件名 + magic 判定容器属于哪种编辑器格式。
 * 只读取极小的清单文件，不触碰 targets / blocks / 素材。
 * @param {JSZip} zip 已加载的 zip
 * @returns {Promise<string>} FORMAT 中的取值
 */
const detectFormat = zip => {
    if (zip.file('project.json')) return Promise.resolve(FORMAT.SB3);

    if (zip.file('star.json')) {
        return readZipJson(zip, 'star.json').then(manifest => {
            if (manifest && typeof manifest.magic === 'string' &&
                manifest.magic.indexOf(STAR_MAGIC_PREFIX) === 0) {
                return FORMAT.STAR;
            }
            return FORMAT.UNKNOWN;
        });
    }

    if (zip.file('manifest.json')) {
        return readZipJson(zip, 'manifest.json').then(manifest => {
            if (manifest && manifest.magic === RJ_MAGIC) return FORMAT.RJ;
            return FORMAT.UNKNOWN;
        });
    }

    return Promise.resolve(FORMAT.UNKNOWN);
};

export {
    FORMAT,
    RJ_MAGIC,
    STAR_MAGIC_PREFIX,
    detectFormat,
    readZipJson
};
