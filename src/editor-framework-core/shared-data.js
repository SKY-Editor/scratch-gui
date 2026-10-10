/**
 * editor-framework-core / shared-data
 * 共享数据层（主题间数据互通）
 * ---------------------------------------------------------------------------
 * 「外壳+插槽」架构要求：主题目录（GUI+VM 文件）物理隔离，但数据必须互通。
 * 本模块是跨主题共享数据的唯一通道：
 *   - 主题 A 写入的项目级数据，主题 B 切换后仍可读取；
 *   - 不持久化到 localStorage 的数据默认仅存在于当前会话；
 *   - 避免主题直接互相 import 内部文件造成耦合。
 * ---------------------------------------------------------------------------
 */
const SHARED_DATA = {};

/**
 * 写共享数据
 * @param {string} key 键（建议带主题前缀，如 'bilup:windowState'）
 * @param {*} value 任意值
 * @returns {void}
 */
const setSharedData = (key, value) => {
    SHARED_DATA[key] = value;
};

/**
 * 读共享数据
 * @param {string} key 键
 * @param {*} [fallback] 缺省值
 * @returns {*} 数据值或缺省值
 */
const getSharedData = (key, fallback) =>
    Object.prototype.hasOwnProperty.call(SHARED_DATA, key) ? SHARED_DATA[key] : fallback;

/**
 * 删除共享数据
 * @param {string} key 键
 * @returns {void}
 */
const removeSharedData = key => {
    delete SHARED_DATA[key];
};

/**
 * 会话级全局状态读写（简写，供跨主题共享「当前值」类数据）
 */
const shared = {
    get: getSharedData,
    set: setSharedData,
    remove: removeSharedData
};

export {SHARED_DATA, setSharedData, getSharedData, removeSharedData, shared};
