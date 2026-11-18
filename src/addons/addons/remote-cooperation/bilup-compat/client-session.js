/**
 * client-session.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import {ASSET, ASSET_BLOCK_TIMEOUT_MS, CTRL, DIAL_TIMEOUT_MS, Emitter, entityKeysForOp, GAP_REQUEST_DELAY_MS, GAP_RESYNC_DELAY_MS, generateClientPeerId, KIND, makeCtrl, makePropose, MAX_BUFFERED_OPS, PENDING_OP_TIMEOUT_MS, PENDING_PRUNE_INTERVAL_MS, PRESENCE, PROTOCOL_VERSION, SNAPSHOT} from './core.js';
import {CompatTransport} from './transport.js';
import Peer from 'peerjs';


// ---------------------------------------------------------------------------
// Client 会话（对齐 Bilup client-session.js：严格 seq 串行 + 间隙恢复 +
// 资产阻塞 + 快照 onboarding + 断线重连）
// ---------------------------------------------------------------------------
class BilupClientSession extends Emitter {
    /**
     * @param {object} options
     * @param {CompatTransport} options.transport
     * @param {object} options.engine SKY op-engine 实例（applyRemoteOp / reset / injectAssetData）
     * @param {string} options.roomId
     * @param {string} options.username
     * @param {Function} options.hasAsset (md5ext) => boolean
     * @param {Function} options.getAsset (md5ext) => bytes|null
     * @param {Function} options.storeAsset async (md5ext, Uint8Array) => void
     * @param {Function} options.applyProjectData async (projectJson) => void（loadProject）
     * @param {Function} options.remapTargetIds (targetIds) => void
     * @param {Function} options.loadExtensions (extensions) => Promise
     */
    constructor({ transport, engine, roomId, username, hasAsset, getAsset, storeAsset, applyProjectData, remapTargetIds, loadExtensions }) {
        super();
        this.transport = transport;
        this.engine = engine;
        this.roomId = roomId;
        this.username = username;
        this.hasAsset = hasAsset;
        this.getAsset = getAsset;
        this.storeAsset = storeAsset;
        this.applyProjectData = applyProjectData;
        this.remapTargetIds = remapTargetIds || null;
        this.loadExtensions = loadExtensions || null;

        this.lastAppliedSeq = null;
        this.users = new Map();
        this.pendingOps = [];
        this.isApproved = false;
        this._denied = false;
        this._stop = false;
        this._onboarding = false;
        this._opBuffer = new Map();
        this._clientOpCounter = 0;
        this._gapRequestTimer = null;
        this._gapResyncTimer = null;
        this._pruneTimer = null;
        this._assetBlockTimer = null;
        this._blockedOp = null;
        this._settleTimer = null;
        this._resyncAttempts = 0;

        this._onMessage = this._onMessage.bind(this);
        this._onPeerDisconnected = this._onPeerDisconnected.bind(this);
        this._onReconnectTick = this._onReconnectTick.bind(this);
    }

    get id() {
        return this.transport.id;
    }

    getUsers() {
        return Array.from(this.users.values());
    }

    async connect() {
        await this.transport.join(this.roomId);
        this.transport.on('message', this._onMessage);
        this.transport.on('peer-disconnected', this._onPeerDisconnected);
        this.transport.on('reconnect-tick', this._onReconnectTick);
        this._pruneTimer = setInterval(() => this._prunePendingOps(), PENDING_PRUNE_INTERVAL_MS);
        this._sendHello();
        return this.id;
    }

    destroy() {
        this._stop = true;
        this.transport.abortReconnect();
        this.transport.off('message', this._onMessage);
        this.transport.off('peer-disconnected', this._onPeerDisconnected);
        this.transport.off('reconnect-tick', this._onReconnectTick);
        this._clearGapTimers();
        if (this._pruneTimer) {
            clearInterval(this._pruneTimer);
            this._pruneTimer = null;
        }
        this._clearAssetBlockTimer();
        if (this._settleTimer) {
            clearTimeout(this._settleTimer);
            this._settleTimer = null;
        }
        this.pendingOps = [];
        this._blockedOp = null;
        this._opBuffer.clear();
        this.removeAllListeners();
    }

    /**
     * 提交本地已应用的编辑：记录 pending op（等待 host echo），发 PROPOSE。
     */
    submitLocal(type, payload) {
        this._clientOpCounter++;
        const clientOpId = this._clientOpCounter;
        this.pendingOps.push({
            clientOpId,
            type,
            payload,
            keys: entityKeysForOp(type, payload),
            submittedAt: Date.now(),
        });
        this.transport.sendToHost(makePropose(type, payload, clientOpId));
        return clientOpId;
    }

    submitLocalPresence(envelope) {
        this.transport.sendToHost(envelope);
    }

    /**
     * 快照应用成功后设置基准 seq，排空缓冲 op。
     */
    setBaseSeq(atSeq) {
        this.pendingOps = [];
        this._onboarding = false;
        this.lastAppliedSeq = atSeq;
        this._drainBuffer();
        this._armSettleCheck();
    }

    resumeApply() {
        if (!this._blockedOp) return;
        const envelope = this._blockedOp;
        this._blockedOp = null;
        this._clearAssetBlockTimer();
        this._applyOp(envelope);
        this._drainBuffer();
    }

    /**
     * 全量重入房：清空本地排序状态，重新请求快照。
     */
    beginResync() {
        this.lastAppliedSeq = null;
        this.pendingOps = [];
        this._blockedOp = null;
        this._clearAssetBlockTimer();
        this._opBuffer.clear();
        this._clearGapTimers();
        this._onboarding = false;
        if (this._settleTimer) {
            clearTimeout(this._settleTimer);
            this._settleTimer = null;
        }
        try {
            if (this.engine && typeof this.engine.reset === 'function') this.engine.reset();
        } catch (e) { /* ignore */ }
    }

    _sendHello() {
        const payload = {
            protocolVersion: PROTOCOL_VERSION,
            username: this.username,
            roomId: this.roomId,
        };
        if (this.lastAppliedSeq !== null) payload.lastAppliedSeq = this.lastAppliedSeq;
        this.transport.sendToHost(makeCtrl(CTRL.HELLO, payload));
        this.emit('awaiting-approval');
    }

    _onMessage(peerId, envelope) {
        switch (envelope.kind) {
        case KIND.OP:
            this._onOp(envelope);
            break;
        case KIND.REJECT:
            this._onReject(envelope);
            break;
        case KIND.CTRL:
            this._onCtrl(envelope);
            break;
        case KIND.SNAPSHOT:
            if (envelope.type === SNAPSHOT.BEGIN) this._onboarding = true;
            this.emit('snapshot-message', envelope);
            break;
        case KIND.ASSET:
            this.emit('asset-message', envelope);
            break;
        case KIND.PRESENCE:
            this.emit('presence', envelope.payload && envelope.payload.userId, envelope);
            break;
        default:
            break;
        }
    }

    _onOp(envelope) {
        if (this.lastAppliedSeq === null || this._blockedOp) {
            this._bufferOp(envelope);
            return;
        }
        if (envelope.seq <= this.lastAppliedSeq) return;
        if (envelope.seq === this.lastAppliedSeq + 1) {
            this._applyOp(envelope);
            this._drainBuffer();
            return;
        }
        this._bufferOp(envelope);
        this._scheduleGapRecovery();
    }

    _bufferOp(envelope) {
        if (this._opBuffer.size >= MAX_BUFFERED_OPS) {
            this._opBuffer.clear();
            this.emit('resync-needed', 'op buffer overflow');
            return;
        }
        this._opBuffer.set(envelope.seq, envelope);
    }

    _drainBuffer() {
        while (!this._blockedOp && this._opBuffer.has(this.lastAppliedSeq + 1)) {
            const next = this._opBuffer.get(this.lastAppliedSeq + 1);
            this._opBuffer.delete(next.seq);
            this._applyOp(next);
        }
        if (this._blockedOp && !this._assetBlockTimer) this._armAssetBlockTimer();
        this._opBuffer.forEach((op, seq) => {
            if (seq <= this.lastAppliedSeq) this._opBuffer.delete(seq);
        });
        if (this._opBuffer.size === 0) {
            this._clearGapTimers();
        } else {
            this._scheduleGapRecovery();
        }
    }

    _armAssetBlockTimer() {
        if (this._assetBlockTimer) clearTimeout(this._assetBlockTimer);
        this._assetBlockTimer = setTimeout(() => {
            this._assetBlockTimer = null;
            if (!this._blockedOp) return;
            this.emit('resync-needed', 'assets for the next op never arrived from the host');
        }, ASSET_BLOCK_TIMEOUT_MS);
    }

    _clearAssetBlockTimer() {
        if (this._assetBlockTimer) {
            clearTimeout(this._assetBlockTimer);
            this._assetBlockTimer = null;
        }
    }

    _applyOp(envelope) {
        // 自己的 echo：本地已应用，确认跳过
        if (envelope.clientId === this.id) {
            const index = this.pendingOps.findIndex((p) => p.clientOpId === envelope.clientOpId);
            if (index !== -1) {
                this.lastAppliedSeq = envelope.seq;
                this.pendingOps.splice(index, 1);
                return;
            }
        }
        // 资产阻塞：op 引用缺失资产时阻塞队列，等资产通道送达
        if (Array.isArray(envelope.payload && envelope.payload.assetRefs)) {
            const missing = envelope.payload.assetRefs.filter((md5ext) => !this.hasAsset(md5ext));
            if (missing.length > 0) {
                this._blockedOp = envelope;
                this._armAssetBlockTimer();
                this.emit('assets-needed', missing);
                return;
            }
        }
        this.lastAppliedSeq = envelope.seq;
        const meta = { from: envelope.clientId };
        try {
            if (this.engine && typeof this.engine.applyRemoteOp === 'function') {
                this.engine.applyRemoteOp(envelope.type, envelope.payload, meta);
            }
        } catch (error) {
            this.emit('resync-needed', `failed to apply op ${envelope.seq}: ${error.message}`);
            return;
        }
        this.emit('op-applied', envelope);
        // 冲突重放：远端 op 覆盖了本地 pending op 的效果时，重新断言本地 op
        const keys = entityKeysForOp(envelope.type, envelope.payload);
        if (keys.length === 0) return;
        this.pendingOps.forEach((pending) => {
            if (!pending.keys.some((key) => keys.indexOf(key) !== -1)) return;
            try {
                if (this.engine && typeof this.engine.applyRemoteOp === 'function') {
                    this.engine.applyRemoteOp(pending.type, pending.payload, { from: this.id });
                }
            } catch (e) { /* 重放失败不阻塞：host 会同样拒绝或忽略 */ }
        });
    }

    _onReject(envelope) {
        const { clientOpId, reason } = envelope.payload || {};
        const index = this.pendingOps.findIndex((p) => p.clientOpId === clientOpId);
        if (index !== -1) this.pendingOps.splice(index, 1);
        this.emit('op-rejected', { clientOpId, reason });
    }

    _onCtrl(envelope) {
        const payload = envelope.payload || {};
        switch (envelope.type) {
        case CTRL.JOIN_APPROVED:
            this.isApproved = true;
            this.emit('join-approved', { hostUsername: payload.hostUsername });
            break;
        case CTRL.JOIN_DENIED:
            this._denied = true;
            this.transport.abortReconnect();
            this.emit('join-denied', payload.reason || 'Join request was denied');
            break;
        case CTRL.USERS_LIST:
            this.users.clear();
            (payload.users || []).forEach((user) => this.users.set(user.id, user));
            this.emit('users-updated', { users: this.getUsers() });
            break;
        case CTRL.USER_JOINED:
            if (payload.user) {
                this.users.set(payload.user.id, payload.user);
                this.emit('users-updated', { users: this.getUsers() });
            }
            break;
        case CTRL.USER_LEFT:
            if (payload.id === this.transport.hostPeerId) {
                this.emit('host-left');
                break;
            }
            if (this.users.delete(payload.id)) {
                this.emit('users-updated', { users: this.getUsers() });
            }
            break;
        case CTRL.KICK:
            this.transport.abortReconnect();
            this.emit('kicked', payload.reason || 'You were removed from the room');
            break;
        case CTRL.RESYNC_REQUIRED:
            this.emit('resync-needed', 'host op log no longer covers our position');
            break;
        case CTRL.SESSION_READY:
            this.emit('session-ready');
            break;
        default:
            break;
        }
    }

    _scheduleGapRecovery() {
        if (this._gapRequestTimer || this._gapResyncTimer) return;
        this._gapRequestTimer = setTimeout(() => {
            this._gapRequestTimer = null;
            if (this._opBuffer.size === 0 || this.lastAppliedSeq === null) return;
            this.transport.sendToHost(makeCtrl(CTRL.OPS_REQUEST, {
                fromSeq: this.lastAppliedSeq + 1,
            }));
            this._gapResyncTimer = setTimeout(() => {
                this._gapResyncTimer = null;
                if (this._opBuffer.size > 0) {
                    this.emit('resync-needed', 'gap replay did not arrive');
                }
            }, GAP_RESYNC_DELAY_MS);
        }, GAP_REQUEST_DELAY_MS);
    }

    _clearGapTimers() {
        if (this._gapRequestTimer) {
            clearTimeout(this._gapRequestTimer);
            this._gapRequestTimer = null;
        }
        if (this._gapResyncTimer) {
            clearTimeout(this._gapResyncTimer);
            this._gapResyncTimer = null;
        }
    }

    _prunePendingOps() {
        const now = Date.now();
        const before = this.pendingOps.length;
        this.pendingOps = this.pendingOps.filter((p) => now - p.submittedAt < PENDING_OP_TIMEOUT_MS);
        if (this.pendingOps.length < before) {
            this.emit('resync-needed', 'local ops were never acknowledged by the host');
        }
    }

    _onPeerDisconnected(peerId) {
        if (peerId !== this.transport.hostPeerId) return;
        if (this._denied || this._stop) return;
        this.isApproved = false;
        this.emit('host-connection-lost');
        this.transport.scheduleReconnect();
    }

    _onReconnectTick() {
        if (this._denied || this._stop) return;
        this.emit('reconnecting', { attempt: this.transport._reconnectAttempts });
        this._redial();
    }

    async _redial() {
        try {
            const roomId = this.roomId;
            const id = generateClientPeerId(roomId);
            const peer = new Peer(id, this.transport.peerConfig);
            await new Promise((resolve, reject) => {
                const onOpen = () => { cleanup(); resolve(); };
                const onError = (err) => { cleanup(); reject(new Error(err && err.message || 'peer error')); };
                const cleanup = () => {
                    peer.off('open', onOpen);
                    peer.off('error', onError);
                };
                peer.on('open', onOpen);
                peer.on('error', onError);
            });
            const conn = peer.connect(this.transport.hostPeerId, { reliable: true });
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { cleanup(); reject(new Error('redial timeout')); }, DIAL_TIMEOUT_MS);
                const onOpen = () => { cleanup(); resolve(); };
                const onError = (err) => { cleanup(); reject(new Error(err && err.message || 'dial error')); };
                const cleanup = () => {
                    clearTimeout(timer);
                    conn.off('open', onOpen);
                    conn.off('error', onError);
                };
                conn.on('open', onOpen);
                conn.on('error', onError);
            });
            // 替换 transport 内部 peer/连接
            this.transport.markReconnected(peer);
            const oldConns = Array.from(this.transport.conns.keys());
            oldConns.forEach((p) => this.transport.closeConnection(p));
            this.transport._registerConnection(conn, false);
            this._sendHello();
            this.emit('reconnected');
            this._armSettleCheck();
        } catch (e) {
            if (this._denied || this._stop) return;
            if (this.transport.scheduleReconnect()) {
                this.emit('reconnecting', { attempt: this.transport._reconnectAttempts });
            } else {
                this.emit('connection-failed', { error: e && e.message || String(e) });
            }
        }
    }

    _armSettleCheck() {
        if (this._settleTimer) clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(() => {
            this._settleTimer = null;
            if (this._onboarding) return;
            if (this.pendingOps.length > 0) {
                this.emit('resync-needed', 'local ops were never confirmed after reconnect');
            }
        }, 3000);
    }
}

export {BilupClientSession};
