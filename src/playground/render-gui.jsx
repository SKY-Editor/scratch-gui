import React from 'react';
import GUI from '../containers/gui.jsx';
import {setSkyEditorCloud} from '../lib/sky-editor-cloud.js';
import {
    apiClient,
    sessionManager,
    bindSessionApi,
    setApiBaseUrl
} from '../../../skyeditor-account/src/index.js';

// 浏览器端统一走「同源代理」访问创客次元 API：URL 形如 /api/<path>，
// 由 webpack devServer.proxy（生产为等价反向代理）转发到
// https://forum.ctspace.xyz/api（见 webpack.config.js 的 '/api' proxy），
// 从而规避 forum.ctspace.xyz 对非白名单本地源的 CORS 拦截。
setApiBaseUrl('/api');

const searchParams = new URLSearchParams(location.search);
// 优先 URL 参数（embed 场景），其次取用户上次在设置窗口中选择并持久化的服务器，最后使用官方默认地址
const storedCloudHost = localStorage.getItem('sky:cloudHost');
const cloudHost = searchParams.get('cloud_host') || storedCloudHost || 'wss://clouddata.turbowarp.org';

/**
 * 编辑器启动时立即恢复登录态（不再等用户打开设置窗口）。
 * 恢复成功后把令牌/用户/云服务器/云项目 REST 桥挂到 window.__SKYEDITOR_CLOUD__，
 * 供云变量接入与后续功能复用；随后用最新资料校验刷新一次。
 */
(function initSkyEditorAccount() {
    bindSessionApi(apiClient);
    if (sessionManager.isLoggedIn()) {
        sessionManager.refresh().catch(() => {});
        return;
    }
    sessionManager.restore().then(snapshot => {
        if (snapshot && snapshot.token) {
            setSkyEditorCloud(snapshot.token, snapshot.user);
        }
    }).catch(() => {});
})();

const RenderGUI = props => (
    <GUI
        cloudHost={cloudHost}
        canUseCloud
        hasCloudPermission
        canSave={false}
        basePath={process.env.ROOT}
        canEditTitle
        enableCommunity
        {...props}
    />
);

export default RenderGUI;
