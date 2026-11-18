/**
 * host-session.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import {ASSET, CTRL, Emitter, KIND, makeCtrl, makeOp, makeReject, OP_LOG_SIZE, PRESENCE, PROTOCOL_VERSION, SNAPSHOT} from './core.js';
import {CompatTransport} from './transport.js';
import Peer from 'peerjs';


// ---------------------------------------------------------------------------
// Host 会话（对齐 Bilup host-session.js：定序广播 + 用户管理 + op 日志 + 快照下发）
// ---------------------------------------------------------------------------
class BilupHostSession extends Emitter {
    /**
     * @param {object} options
     * @param {CompatTransport} options.transport
     * @param {object} options.engine SKY op-engine（applyRemoteOp 用于应用远端 op）
     * @param {string} options.roomId
     * @param {string} options.username
     * @param {Function} options.getProjectData async () => ArrayBuffer（快照序列化）
     * @param {Function} options.getTargetIds () => [{id,name,isStage}]|null
     * @param {Function} options.getExtensions () => [{id,url?}]|null
     * @param {Function} options.applyPushedProject async (ArrayBuffer) => void（client push 项目）
     */
    constructor({ transport, engine, roomId, username, getProjectData, getTargetIds, getExtensions, applyPushedProject }) {
        super();
        this.transport = transport;
        this.engine = engine;
        this.roomId = roomId;
        this.username = username;
        this.getProjectData = getProjectData;
        this.getTargetIds = getTargetIds || null;
        this.getExtensions = getExtensions || null;
        this.applyPushedProject = applyPushedProject || null;

        this.seq = 0;
        this.opLog = [];
        this.users = new Map();
        this.pendingJoinRequests = new Map();
        this.pendingSyncs = new Set();
        this._clientOpCounter = 0;
        this._bannedPeers = new Map();
        this._started = false;
        // 串行应用队列：远端 PROPOSE 按到达顺序应用再定序广播
        this._applyChain = Promise.resolve();

        this._onMessage = this._onMessage.bind(this);
        this._onPeerDisconnected = this._onPeerDisconnected.bind(this);
    }

    get id() {
        return this.transport.id;
    }

    getUsers() {
        return Array.from(this.users.values());
    }

    async start() {
        const id = await this.transport.host(this.roomId);
        this._started = true;
        this.transport.on('message', this._onMessage);
        this.transport.on('peer-disconnected', this._onPeerDisconnected);
        const hostUser = { id, username: this.username, isHost: true };
        this.users.set(id, hostUser);
        this.emit('user-joined', hostUser);
        return id;
    }

    destroy() {
        if (this._started) {
            try {
                this.transport.broadcast(makeCtrl(CTRL.USER_LEFT, { id: this.id }));
            } catch (e) { /* ignore */ }
        }
        this._started = false;
        this.transport.off('message', this._onMessage);
        this.transport.off('peer-disconnected', this._onPeerDisconnected);
        this.users.clear();
        this.pendingJoinRequests.clear();
        this.pendingSyncs.clear();
        this._bannedPeers.clear();
        this.opLog = [];
        this.removeAllListeners();
    }

    isClientApproved(peerId) {
        return this.users.has(peerId) && peerId !== this.id;
    }

    /**
     * Host 本地 op：已本地应用，直接定序广播（自身即资产源，无需先推字节）。
     */
    submitLocal(type, payload) {
        this._clientOpCounter++;
        const op = makeOp(type, payload, {
            seq: ++this.seq,
            clientId: this.id,
            clientOpId: this._clientOpCounter,
        });
        this._appendToLog(op);
        this.transport.broadcast(op);
        return op;
    }

    submitLocalPresence(envelope) {
        if (envelope && envelope.payload) envelope.payload.userId = this.id;
        this.transport.broadcast(envelope);
    }

    markClientSynced(peerId) {
        if (!this.pendingSyncs.has(peerId)) return;
        this.pendingSyncs.delete(peerId);
        if (this.pendingSyncs.size === 0) {
            this.transport.broadcast(makeCtrl(CTRL.SESSION_READY, {}));
            this.emit('session-ready');
        }
    }

    opsSince(fromSeq) {
        if (fromSeq > this.seq) return [];
        const oldest = this.opLog.length > 0 ? this.opLog[0].seq : this.seq + 1;
        if (fromSeq < oldest) return null;
        return this.opLog.filter((op) => op.seq >= fromSeq);
    }

    _appendToLog(op) {
        this.opLog.push(op);
        if (this.opLog.length > OP_LOG_SIZE) this.opLog.shift();
    }

    _onMessage(peerId, envelope) {
        switch (envelope.kind) {
        case KIND.CTRL:
            this._onCtrl(peerId, envelope);
            break;
        case KIND.PROPOSE:
            this._onPropose(peerId, envelope);
            break;
        case KIND.PRESENCE:
            this._onPresence(peerId, envelope);
            break;
        case KIND.SNAPSHOT:
            if (!this.isClientApproved(peerId)) return;
            if (envelope.type === SNAPSHOT.COMPLETE) this.markClientSynced(peerId);
            this.emit('snapshot-message', peerId, envelope);
            break;
        case KIND.ASSET:
            if (!this.isClientApproved(peerId)) return;
            this.emit('asset-message', peerId, envelope);
            break;
        default:
            break;
        }
    }

    _onCtrl(peerId, envelope) {
        const payload = envelope.payload || {};
        switch (envelope.type) {
        case CTRL.HELLO:
            this._onHello(peerId, payload);
            break;
        case CTRL.JOIN_CANCELLED:
            this.pendingJoinRequests.delete(peerId);
            this.transport.closeConnection(peerId);
            break;
        case CTRL.USERNAME_CHANGE:
            if (!this.isClientApproved(peerId)) return;
            const user = this.users.get(peerId);
            if (user) user.username = payload.username;
            this._broadcastUsersList();
            break;
        case CTRL.OPS_REQUEST:
            if (!this.isClientApproved(peerId)) return;
            const ops = this.opsSince(payload.fromSeq);
            if (ops === null) {
                this.transport.send(peerId, makeCtrl(CTRL.RESYNC_REQUIRED, {}));
            } else {
                ops.forEach((op) => this.transport.send(peerId, op));
            }
            break;
        default:
            break;
        }
    }

    _onHello(peerId, payload) {
        if (payload.protocolVersion !== PROTOCOL_VERSION) {
            this.transport.send(peerId, makeCtrl(CTRL.JOIN_DENIED, {
                reason: 'This room is running a different version of the app. Make sure everyone is on the latest version.',
            }));
            this.transport.closeConnection(peerId);
            return;
        }
        if (this._isBanned(peerId)) {
            this.transport.send(peerId, makeCtrl(CTRL.JOIN_DENIED, { reason: 'You were removed from the room' }));
            this.transport.closeConnection(peerId);
            return;
        }
        if (this.users.has(peerId)) {
            this._admitClient(peerId, payload.username, payload.lastAppliedSeq);
            return;
        }
        // SKY host 固定 public：公共房间直接放行（私密审批未实现）
        this._admitClient(peerId, payload.username, payload.lastAppliedSeq);
    }

    _admitClient(peerId, username, lastAppliedSeq) {
        const user = { id: peerId, username: username || '匿名', isHost: false };
        this.users.set(peerId, user);
        this.transport.send(peerId, makeCtrl(CTRL.JOIN_APPROVED, { hostUsername: this.username }));
        this.transport.send(peerId, makeCtrl(CTRL.USERS_LIST, { users: this.getUsers() }));
        this.transport.broadcast(makeCtrl(CTRL.USER_JOINED, { user }), peerId);
        this.emit('user-joined', user);
        this.pendingSyncs.add(peerId);
        if (typeof lastAppliedSeq === 'number') {
            const ops = this.opsSince(lastAppliedSeq + 1);
            if (ops !== null) {
                ops.forEach((op) => this.transport.send(peerId, op));
                this.markClientSynced(peerId);
                this.emit('snapshot-skipped', { peerId });
                return;
            }
        }
        this.emit('snapshot-needed', { peerId });
    }

    _onPropose(peerId, envelope) {
        if (!this.isClientApproved(peerId)) return;
        // 串行应用队列：保证 host 端文档按到达顺序应用，再分配 seq 广播
        this._applyChain = this._applyChain.then(async () => {
            try {
                if (this.engine && typeof this.engine.applyRemoteOp === 'function') {
                    await this.engine.applyRemoteOp(envelope.type, envelope.payload, { from: peerId });
                }
            } catch (error) {
                this.transport.send(peerId, makeReject(
                    envelope.clientOpId,
                    error && error.message ? error.message.slice(0, 200) : 'rejected'
                ));
                return;
            }
            const op = makeOp(envelope.type, envelope.payload, {
                seq: ++this.seq,
                clientId: peerId,
                clientOpId: envelope.clientOpId,
            });
            this._appendToLog(op);
            this.transport.broadcast(op, peerId);
            this.emit('op-applied', op);
        }).catch((e) => {
            // 队列异常不应终止后续处理
            this.transport.send(peerId, makeReject(envelope.clientOpId, 'apply queue error'));
        });
    }

    _onPresence(peerId, envelope) {
        if (!this.isClientApproved(peerId)) return;
        if (envelope && envelope.payload) envelope.payload.userId = peerId;
        this.transport.broadcast(envelope, peerId);
        this.emit('presence', peerId, envelope);
    }

    _isBanned(peerId) {
        const expiry = this._bannedPeers.get(peerId);
        if (expiry === undefined) return false;
        if (expiry < Date.now()) {
            this._bannedPeers.delete(peerId);
            return false;
        }
        return true;
    }

    _onPeerDisconnected(peerId) {
        const request = this.pendingJoinRequests.get(peerId);
        if (request) {
            this.pendingJoinRequests.delete(peerId);
            return;
        }
        this._removeClient(peerId);
    }

    _removeClient(peerId) {
        const user = this.users.get(peerId);
        if (!user) return;
        this.users.delete(peerId);
        this.markClientSynced(peerId);
        this.transport.broadcast(makeCtrl(CTRL.USER_LEFT, { id: peerId }));
        this.emit('user-left', user);
    }
}

export {BilupHostSession};
