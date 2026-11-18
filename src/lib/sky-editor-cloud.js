/**
 * window.__SKYEDITOR_CLOUD__ 云接入桥的唯一定义点（SKY Editor）。
 *
 * 对象形状（token / user / cloudServer / apiClient / cloudProjectApi）只在本文件声明，
 * 登录态变化的三处入口统一调用本模块，避免多处各写一份对象字面量导致形状漂移：
 * - playground 启动恢复登录态（src/playground/render-gui.jsx）
 * - 设置窗口登录/注册成功（settings-window.jsx finalizeLogin）
 * - 设置窗口登出清理（settings-window.jsx handleLogoutClick）
 * 窗口全局保留给云变量接入等外部消费（对外合同不变）。
 */
import {
    apiClient,
    CTSPACE_CLOUD_SERVER,
    CloudProjectApi
} from '../../../skyeditor-account/src/index.js';

/**
 * 挂载（或覆盖）云接入桥。
 * @param {string} token 登录令牌（由 sessionManager 持久化）
 * @param {object|null} user 用户资料；空值统一落为 null（与原两处实现语义一致）
 */
export function setSkyEditorCloud(token, user) {
    window.__SKYEDITOR_CLOUD__ = {
        token,
        user: user || null,
        cloudServer: CTSPACE_CLOUD_SERVER,
        apiClient,
        cloudProjectApi: new CloudProjectApi(apiClient)
    };
}

/** 登出时移除云接入桥（幂等，不存在时无操作）。 */
export function clearSkyEditorCloud() {
    if (window.__SKYEDITOR_CLOUD__) {
        delete window.__SKYEDITOR_CLOUD__;
    }
}
