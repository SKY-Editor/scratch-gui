/**
 * index.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import {ASSET, bufferToText, dataFormatForExt, makePresence, md5extToAssetId, PRESENCE, SNAPSHOT, textToBuffer, toArrayBuffer} from './core.js';
import {CompatTransport} from './transport.js';
import {CompatAssetChannel} from './asset-channel.js';
import {BilupClientSession} from './client-session.js';
import {BilupHostSession} from './host-session.js';
import {CompatClientSnapshotService, CompatHostSnapshotService} from './snapshot.js';
import Peer from 'peerjs';


// ---------------------------------------------------------------------------
// createBilupCompat —— 组装模块（UI 面板 + 模式切换 + op-engine 桥接）
// ---------------------------------------------------------------------------
/**
 * @param {object} options
 * @param {VirtualMachine} options.vm
 * @param {Function} options.getVm () => vm（惰性取最新 vm）
 * @param {object} options.engine SKY op-engine 实例
 * @param {Function} options.el (tag, className, text) => HTMLElement（复用 userscript 的 el）
 * @param {HTMLElement} options.mountEl 挂载容器
 * @param {Function} options.log 日志
 * @param {Function} options.onStateChange (mode) => void 模式切换回调（'none' | 'bilup-client' | 'bilup-host'）
 * @param {Function} options.deactivateSchemeA () => void 切换前停掉方案A连接（保留 opEngine）
 */
export default function createBilupCompat({
    vm,
    getVm,
    engine,
    getEngine,
    el,
    mountEl,
    log,
    onStateChange,
    deactivateSchemeA,
}) {
    const logger = log || ((...args) => console.warn('[bilup-compat]', ...args));
    // op-engine 惰性获取：userscript 在 getEngine 回调中先 ensureOpEngine 再返回，
    // 保证 Bilup 会话启动时引擎已创建（复用捕获/应用能力），同时支持直接传 engine。
    const resolveEngine = () => (typeof getEngine === 'function' ? getEngine() : engine);
    let mode = 'none'; // 'none' | 'client' | 'host'
    let transport = null;
    let assetChannel = null;
    let clientSession = null;
    let hostSession = null;
    let clientSnapshots = null;
    let hostSnapshots = null;
    let members = [];
    let hostUsername = '';
    let presenceTimer = null;
    let destroyed = false;

    // -----------------------------------------------------------------------
    // VM/资产访问辅助
    // -----------------------------------------------------------------------
    const storageOf = () => {
        const v = getVm();
        return v && v.runtime ? v.runtime.storage : null;
    };

    const getAsset = (md5ext) => {
        const assetId = md5extToAssetId(md5ext);
        const storage = storageOf();
        try {
            const cached = storage && storage.get(assetId);
            if (cached && cached.data && cached.data.length > 0) return cached.data;
        } catch (e) { /* ignore */ }
        // 二级查找：扫描当前 targets 的 costumes/sounds asset 对象
        try {
            const v = getVm();
            const runtime = v && v.runtime;
            const targets = (runtime && runtime.targets) || [];
            for (const target of targets) {
                const items = [];
                try {
                    if (typeof target.getCostumes === 'function') items.push(...target.getCostumes());
                    if (typeof target.getSounds === 'function') items.push(...target.getSounds());
                } catch (e) { /* ignore */ }
                for (const item of items) {
                    if (item && item.asset && item.assetId === assetId && item.asset.data && item.asset.data.length > 0) {
                        return item.asset.data;
                    }
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    };

    const hasAsset = (md5ext) => getAsset(md5ext) !== null;

    const storeAsset = async (md5ext, bytes) => {
        const storage = storageOf();
        if (!storage) return;
        const assetId = md5extToAssetId(md5ext);
        const dot = String(md5ext).lastIndexOf('.');
        const dataFormat = dot >= 0 ? dataFormatForExt(String(md5ext).slice(dot + 1)) : 'image/png';
        let assetType = null;
        try {
            const AT = storage.AssetType;
            if (dataFormat === 'image/svg+xml') assetType = AT.ImageVector;
            else if (dataFormat.indexOf('image/') === 0) assetType = AT.ImageBitmap;
            else assetType = AT.Sound;
        } catch (e) {
            assetType = null;
        }
        if (assetType) {
            storage.store(assetType, assetId, dataFormat, bytes);
        }
    };

    const collectCostumeSoundRefs = (projectData) => {
        const refs = new Set();
        const targets = (projectData && projectData.targets) || [];
        for (const target of targets) {
            for (const listKey of ['costumes', 'sounds']) {
                const list = target[listKey] || [];
                for (const item of list) {
                    if (item && item.md5ext) refs.add(item.md5ext);
                }
            }
        }
        return Array.from(refs);
    };

    const applyProjectData = async (buffer) => {
        const v = getVm();
        if (!v || typeof v.loadProject !== 'function') {
            throw new Error('vm.loadProject 不可用');
        }
        // 先清 op 引擎排队（快照为权威全量）
        try {
            const activeEngine = resolveEngine();
            if (activeEngine && typeof activeEngine.reset === 'function') activeEngine.reset();
        } catch (e) { /* ignore */ }
        let projectJson;
        try {
            projectJson = JSON.parse(bufferToText(buffer));
        } catch (e) {
            // 二进制 sb3 不适用本兼容层文本快照路径：尝试原始字节
            projectJson = null;
        }
        if (!projectJson || typeof projectJson !== 'object') {
            throw new Error('快照不是有效 JSON（SKY 快照采用 JSON 序列化）');
        }
        // 资产预取：快照引用但本地缺失的资产，向 host 请求字节后再 loadProject
        const missingRefs = collectCostumeSoundRefs(projectJson).filter((ref) => !hasAsset(ref));
        if (missingRefs.length > 0 && clientSession && assetChannel) {
            await new Promise((resolve) => {
                const waitFor = new Set(missingRefs);
                const onReceived = (md5ext) => {
                    waitFor.delete(md5ext);
                    if (waitFor.size === 0) {
                        assetChannel.off('asset-received', onReceived);
                        assetChannel.off('asset-unavailable', onUnavailable);
                        clearTimeout(timer);
                        resolve();
                    }
                };
                const onUnavailable = ({ md5exts }) => {
                    if (Array.isArray(md5exts)) md5exts.forEach((m) => waitFor.delete(m));
                    if (waitFor.size === 0) {
                        assetChannel.off('asset-received', onReceived);
                        assetChannel.off('asset-unavailable', onUnavailable);
                        clearTimeout(timer);
                        resolve();
                    }
                };
                const timer = setTimeout(() => {
                    assetChannel.off('asset-received', onReceived);
                    assetChannel.off('asset-unavailable', onUnavailable);
                    resolve();
                }, 30000);
                assetChannel.on('asset-received', onReceived);
                assetChannel.on('asset-unavailable', onUnavailable);
                assetChannel.requestFromHost(missingRefs);
            });
        }
        await v.loadProject(projectJson);
    };

    const getProjectData = async () => {
        const v = getVm();
        // 优先 sb3 字节序列化；失败回退 JSON 文本
        try {
            if (v && typeof v.saveProjectSb3 === 'function') {
                const sb3 = await v.saveProjectSb3();
                if (sb3 && (sb3.byteLength || sb3.length)) return toArrayBuffer(sb3);
            }
        } catch (e) { /* fallthrough */ }
        try {
            const json = v && typeof v.toJSON === 'function' ? v.toJSON() : null;
            if (json) return textToBuffer(typeof json === 'string' ? json : JSON.stringify(json));
        } catch (e) { /* ignore */ }
        throw new Error('项目序列化失败');
    };

    const getTargetIds = () => {
        try {
            const v = getVm();
            const targets = (v && v.runtime && v.runtime.targets) || [];
            return targets.map((t) => ({
                id: t.id,
                name: typeof t.getName === 'function' ? t.getName() : (t.name || ''),
                isStage: !!t.isStage,
            }));
        } catch (e) {
            return null;
        }
    };

    const getExtensions = () => {
        try {
            const v = getVm();
            const extIds = v && v.runtime && v.runtime.extensionManager
                ? Array.from(v.runtime.extensionManager.extensions.keys())
                : [];
            return extIds.map((id) => ({ id }));
        } catch (e) {
            return null;
        }
    };

    const remapTargetIds = (targetIds) => {
        // sb3 loadProject 会重新生成 target id；按名称匹配尽量对齐 host 的 id。
        // id 对齐失败时 op 的 name 回退仍可用（op-engine 多处按名称查找）。
        try {
            const v = getVm();
            const runtime = v && v.runtime;
            const targets = (runtime && runtime.targets) || [];
            for (const info of targetIds || []) {
                const t = targets.find((x) => (typeof x.getName === 'function' ? x.getName() : x.name) === info.name);
                if (t && !info.isStage !== !t.isStage) continue;
                if (t) t.id = info.id;
            }
        } catch (e) { /* ignore */ }
    };

    const loadExtensions = async (extensions) => {
        // SKY 侧扩展一般已内置；扩展 id 对齐留给 op 层按名回退。无需强制加载。
        return Promise.resolve();
    };

    const getSnapshotAtSeq = () => (hostSession ? hostSession.seq : 0);

    // -----------------------------------------------------------------------
    // UI 面板
    // -----------------------------------------------------------------------
    const card = el('div', 'rc-card rc-card-bilup');
    const title = el('div', 'rc-card-title', 'Bilup 兼容模式');
    const desc = el('div', 'rc-card-desc',
        '通过 PeerJS 加入 Bilup 房间协作（与真实 Bilup 客户端互通）。' +
        '与上方 ws://localhost:8090 信令模式互斥。');
    const roomRow = el('div', 'rc-row');
    const roomLabel = el('label', 'rc-label', '房间号');
    const roomInput = el('input', 'rc-input rc-input-bilup-room');
    roomInput.type = 'text';
    roomInput.placeholder = '如 ABC123（Bilup 房间号）';
    roomRow.append(roomLabel, roomInput);
    const peerRow = el('div', 'rc-row');
    const peerLabel = el('label', 'rc-label', 'PeerServer');
    const peerInput = el('input', 'rc-input rc-input-bilup-peer');
    peerInput.type = 'text';
    peerInput.value = 'collab_warp.mistium.com:443';
    peerInput.placeholder = 'host:port，默认 collab_warp.mistium.com:443';
    peerRow.append(peerLabel, peerInput);
    const btnRow = el('div', 'rc-row');
    const createBilupBtn = el('button', 'rc-btn rc-btn-primary', '创建 Bilup 房间');
    const joinBilupBtn = el('button', 'rc-btn rc-btn-secondary', '加入 Bilup 房间');
    const leaveBilupBtn = el('button', 'rc-btn rc-btn-danger rc-btn-leave', '离开 Bilup');
    leaveBilupBtn.disabled = true;
    btnRow.append(createBilupBtn, joinBilupBtn, leaveBilupBtn);
    const bilupStatus = el('div', 'rc-sync-detail', 'Bilup 未连接');
    const bilupMembers = el('div', 'rc-members');
    card.append(title, desc, roomRow, peerRow, btnRow, bilupStatus, bilupMembers);
    mountEl.appendChild(card);

    const renderStatus = (text) => {
        bilupStatus.textContent = text;
    };
    const renderMembers = () => {
        bilupMembers.innerHTML = '';
        if (members.length === 0) {
            bilupMembers.appendChild(el('div', 'rc-members-empty', '房间内暂无其他成员'));
            return;
        }
        for (const m of members) {
            const row = el('div', 'rc-member');
            const avatar = el('span', 'rc-avatar', (m.username || m.id || '?').slice(0, 1).toUpperCase());
            const name = el('span', 'rc-member-name', m.username || m.id);
            const tag = m.isHost ? el('span', 'rc-tag', 'Host') : null;
            row.append(avatar, name);
            if (tag) row.appendChild(tag);
            bilupMembers.appendChild(row);
        }
    };
    const setBusyButtons = (busy) => {
        createBilupBtn.disabled = busy;
        joinBilupBtn.disabled = busy;
    };

    const parsePeerConfig = () => {
        const raw = peerInput.value.trim() || 'collab_warp.mistium.com:443';
        const match = raw.match(/^(https?:\/\/)?([^:/]+)(?::(\d+))?$/);
        if (!match) {
            renderStatus('PeerServer 地址格式错误（host:port）');
            return null;
        }
        const host = match[2];
        const port = match[3] ? parseInt(match[3], 10) : 443;
        const secure = port === 443;
        return {
            host,
            port,
            secure,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                ],
            },
        };
    };

    // -----------------------------------------------------------------------
    // 会话组装
    // -----------------------------------------------------------------------
    const teardown = () => {
        if (presenceTimer) {
            clearInterval(presenceTimer);
            presenceTimer = null;
        }
        if (clientSnapshots) {
            try { clientSnapshots.destroy(); } catch (e) { /* ignore */ }
            clientSnapshots = null;
        }
        if (hostSnapshots) {
            try { hostSnapshots.destroy(); } catch (e) { /* ignore */ }
            hostSnapshots = null;
        }
        if (assetChannel) {
            try { assetChannel.destroy(); } catch (e) { /* ignore */ }
            assetChannel = null;
        }
        if (clientSession) {
            try { clientSession.destroy(); } catch (e) { /* ignore */ }
            clientSession = null;
        }
        if (hostSession) {
            try { hostSession.destroy(); } catch (e) { /* ignore */ }
            hostSession = null;
        }
        if (transport) {
            try { transport.destroy(); } catch (e) { /* ignore */ }
            transport = null;
        }
        mode = 'none';
        members = [];
        renderMembers();
        setBusyButtons(false);
        leaveBilupBtn.disabled = true;
        if (onStateChange) onStateChange('none');
    };

    const startPresence = () => {
        if (presenceTimer) clearInterval(presenceTimer);
        presenceTimer = setInterval(() => {
            if (mode === 'none') return;
            try {
                const v = getVm();
                const t = v && v.editingTarget;
                const envelope = makePresence(PRESENCE.EDITING_TARGET, {
                    targetId: t ? t.id : null,
                    targetName: t ? (typeof t.getName === 'function' ? t.getName() : t.name) : null,
                    at: Date.now(),
                });
                if (mode === 'client' && clientSession) clientSession.submitLocalPresence(envelope);
                else if (mode === 'host' && hostSession) hostSession.submitLocalPresence(envelope);
            } catch (e) { /* ignore */ }
        }, 2000);
    };

    const startClient = async () => {
        if (destroyed) return;
        const roomId = roomInput.value.trim();
        if (!roomId) {
            renderStatus('请输入 Bilup 房间号');
            return;
        }
        if (deactivateSchemeA) {
            try { deactivateSchemeA(); } catch (e) { /* ignore */ }
        }
        teardown();
        const peerConfig = parsePeerConfig();
        if (!peerConfig) return;
        const username = (document.querySelector('.rc-input-name') && document.querySelector('.rc-input-name').value.trim())
            || 'SKY用户';
        setBusyButtons(true);
        renderStatus(`正在加入 Bilup 房间 ${roomId}…`);
        try {
            transport = new CompatTransport({ peerConfig, log: logger });
            clientSession = new BilupClientSession({
                transport,
                engine: resolveEngine(),
                roomId,
                username,
                hasAsset,
                getAsset,
                storeAsset,
                applyProjectData,
                remapTargetIds,
                loadExtensions,
            });
            assetChannel = new CompatAssetChannel({ isHost: false, transport, getAsset, storeAsset });
            clientSnapshots = new CompatClientSnapshotService({
                session: clientSession,
                transport,
                applyProjectData: async (buffer) => {
                    const v = getVm();
                    if (v) {
                        try { v.stopAll(); } catch (e) { /* ignore */ }
                    }
                    await applyProjectData(buffer);
                },
                remapTargetIds,
                loadExtensions,
            });
            clientSession.on('awaiting-approval', () => renderStatus('已拨号 Host，等待批准…'));
            clientSession.on('join-approved', ({ hostUsername: hu }) => {
                hostUsername = hu || '';
                mode = 'client';
                renderStatus(`已加入房间 ${roomId}（Host: ${hostUsername}），等待快照…`);
                leaveBilupBtn.disabled = false;
                setBusyButtons(false);
                if (onStateChange) onStateChange('bilup-client');
                startPresence();
            });
            clientSession.on('join-denied', (reason) => {
                renderStatus(`加入被拒绝：${reason}`);
                setBusyButtons(false);
                teardown();
            });
            clientSession.on('kicked', (reason) => {
                renderStatus(`已被移出房间：${reason}`);
                setBusyButtons(false);
                teardown();
            });
            clientSession.on('host-left', () => {
                renderStatus('Host 已离开，连接结束');
                setBusyButtons(false);
                teardown();
            });
            clientSession.on('users-updated', ({ users }) => {
                members = users.slice();
                renderMembers();
            });
            clientSession.on('session-ready', () => renderStatus(`已与房间同步（${members.length + 1} 人）`));
            clientSession.on('op-applied', () => { /* op 流正常 */ });
            clientSession.on('op-rejected', ({ reason }) => logger('op rejected:', reason));
            clientSession.on('resync-needed', (reason) => {
                renderStatus(`需要重新同步（${reason}），正在重拉快照…`);
                if (clientSnapshots) clientSnapshots.requestResync();
            });
            clientSession.on('connection-failed', ({ error }) => {
                renderStatus(`连接失败：${error}`);
                setBusyButtons(false);
                teardown();
            });
            clientSession.on('reconnecting', ({ attempt }) => renderStatus(`连接断开，重连中（${attempt}）…`));
            clientSession.on('reconnected', () => renderStatus('已重连，正在重新入房…'));
            clientSession.on('assets-needed', (missing) => {
                if (assetChannel) assetChannel.requestFromHost(missing);
            });
            // 资产到位后唤醒阻塞的 op 队列
            if (assetChannel) {
                assetChannel.on('asset-received', () => {
                    if (clientSession) clientSession.resumeApply();
                });
                assetChannel.on('asset-unavailable', ({ md5exts }) => {
                    if (Array.isArray(md5exts)) {
                        renderStatus(`Host 缺少资产（${md5exts.length} 项），将重拉快照…`);
                    }
                    if (clientSession) clientSession.resumeApply();
                });
            }
            clientSnapshots.on('download-start', ({ totalBytes }) => {
                renderStatus(`正在接收项目快照（${(totalBytes / 1024).toFixed(0)} KB）…`);
            });
            clientSnapshots.on('download-progress', ({ loaded, total }) => {
                const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
                renderStatus(`接收快照 ${pct}%`);
            });
            clientSnapshots.on('download-complete', () => renderStatus('快照已接收，正在应用…'));
            clientSnapshots.on('download-error', ({ error }) => {
                renderStatus(`快照失败：${error && error.message || error}`);
            });
            await clientSession.connect();
            renderStatus('已拨号 Host，等待批准…');
        } catch (e) {
            renderStatus(`连接失败：${e && e.message || e}`);
            setBusyButtons(false);
            teardown();
        }
    };

    const startHost = async () => {
        if (destroyed) return;
        const roomId = roomInput.value.trim();
        if (!roomId) {
            renderStatus('请输入 Bilup 房间号');
            return;
        }
        if (deactivateSchemeA) {
            try { deactivateSchemeA(); } catch (e) { /* ignore */ }
        }
        teardown();
        const peerConfig = parsePeerConfig();
        if (!peerConfig) return;
        const username = (document.querySelector('.rc-input-name') && document.querySelector('.rc-input-name').value.trim())
            || 'SKY Host';
        setBusyButtons(true);
        renderStatus(`正在创建 Bilup 房间 ${roomId}…`);
        try {
            transport = new CompatTransport({ peerConfig, log: logger });
            hostSession = new BilupHostSession({
                transport,
                engine: resolveEngine(),
                roomId,
                username,
                getProjectData,
                getTargetIds,
                getExtensions,
                applyPushedProject: async (buffer) => {
                    const v = getVm();
                    if (!v) return;
                    try {
                        const activeEngine = resolveEngine();
                        if (activeEngine && typeof activeEngine.reset === 'function') activeEngine.reset();
                        const json = JSON.parse(bufferToText(buffer));
                        await v.loadProject(json);
                    } catch (e) {
                        logger('应用 client push 项目失败', e);
                    }
                },
            });
            assetChannel = new CompatAssetChannel({ isHost: true, transport, getAsset, storeAsset });
            hostSnapshots = new CompatHostSnapshotService({
                session: hostSession,
                transport,
                getProjectData,
                getTargetIds,
                getExtensions,
            });
            hostSession.on('user-joined', () => {
                members = hostSession.getUsers().slice();
                renderMembers();
            });
            hostSession.on('user-left', () => {
                members = hostSession.getUsers().slice();
                renderMembers();
            });
            hostSession.on('session-ready', () => renderStatus(`房间已就绪（${members.length} 人）`));
            hostSession.on('op-applied', () => { /* op 流正常 */ });
            hostSession.on('snapshot-needed', ({ peerId }) => {
                renderStatus(`新成员加入，正在下发快照…`);
                if (hostSnapshots) hostSnapshots.startTransfer(peerId);
            });
            hostSession.on('snapshot-skipped', () => renderStatus('新成员已从 op 日志追平，跳过快照'));
            hostSnapshots.on('upload-complete', ({ peerId }) => {
                hostSession.markClientSynced(peerId);
                renderStatus(`快照下发完成（${hostSession.getUsers().length} 人）`);
            });
            hostSnapshots.on('upload-error', ({ peerId, error }) => logger('快照下发失败', error));
            hostSnapshots.on('project-pushed', ({ buffer }) => {
                logger('收到 client push 项目，已 adopt');
                renderStatus('已采用成员推送的项目');
                // 全量替换后重新快照所有 client
                if (hostSession && hostSnapshots) {
                    hostSession.getUsers()
                        .filter((u) => u.id !== hostSession.id)
                        .forEach((u) => hostSnapshots.startTransfer(u.id));
                }
            });
            assetChannel.on('asset-unavailable', ({ peerId, md5ext }) => {
                logger('host 无此资产:', peerId, md5ext);
            });
            await hostSession.start();
            mode = 'host';
            members = hostSession.getUsers().slice();
            renderMembers();
            renderStatus(`已创建房间 ${roomId}，等待成员加入…`);
            leaveBilupBtn.disabled = false;
            setBusyButtons(false);
            if (onStateChange) onStateChange('bilup-host');
            startPresence();
        } catch (e) {
            renderStatus(`创建失败：${e && e.message || e}`);
            setBusyButtons(false);
            teardown();
        }
    };

    const leave = () => {
        renderStatus('已离开 Bilup 房间');
        teardown();
    };

    // -----------------------------------------------------------------------
    // op-engine 桥接（由 userscript.js 在 bilupActive 时转交）
    // -----------------------------------------------------------------------
    const handleLocalOp = (type, payload) => {
        if (mode === 'none') return;
        if (mode === 'client' && clientSession) {
            // 资产先行因果序：带 assetRefs 的 op 先推字节给 host，再发 propose
            const refs = (payload && Array.isArray(payload.assetRefs)) ? payload.assetRefs : [];
            const pushable = refs.filter((ref) => getAsset(ref));
            if (pushable.length > 0 && assetChannel) {
                assetChannel.sendAssets('host', pushable).then(() => {
                    if (mode === 'client' && clientSession) clientSession.submitLocal(type, payload);
                }).catch(() => {
                    if (mode === 'client' && clientSession) clientSession.submitLocal(type, payload);
                });
            } else {
                clientSession.submitLocal(type, payload);
            }
            return;
        }
        if (mode === 'host' && hostSession) {
            hostSession.submitLocal(type, payload);
        }
    };

    const handleLocalAssetRequest = (assetIds, toClientId) => {
        // op-engine 接收侧发现缺资产时回调；本层应已在应用前 prefetch，通常不会触发。
        // 触发时把 md5 转 md5ext 请求交给 asset 通道处理（md5 无法还原 ext，跳过即可，
        // 由快照 resync 兜底）。asset 通道已绑定 REQUEST/BEGIN/CHUNK 处理。
        void assetIds;
        void toClientId;
    };

    createBilupBtn.addEventListener('click', () => startHost());
    joinBilupBtn.addEventListener('click', () => startClient());
    leaveBilupBtn.addEventListener('click', () => leave());

    return {
        isActive: () => mode !== 'none',
        getMode: () => mode,
        handleLocalOp,
        handleLocalAssetRequest,
        leave,
        destroy: teardown,
    };
}
