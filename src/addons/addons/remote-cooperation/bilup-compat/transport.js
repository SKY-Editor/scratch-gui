/**
 * transport.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import {CTRL, DEAD_PEER_MS, DEFAULT_PEER_CONFIG, DIAL_TIMEOUT_MS, Emitter, generateClientPeerId, generateHostPeerId, HEARTBEAT_MS, KIND, makeCtrl, MAX_RECONNECT_ATTEMPTS, validateEnvelope} from './core.js';
import Peer from 'peerjs';


// ---------------------------------------------------------------------------
// Transport —— PeerJS 封装（对齐 Bilup transport.js 语义的精简实现）
// ---------------------------------------------------------------------------
class CompatTransport extends Emitter {
    /**
     * @param {object} options
     * @param {object} options.peerConfig PeerJS 配置（host/port/secure/config）
     * @param {Function} [options.log] 日志
     */
    constructor({ peerConfig, log }) {
        super();
        this.peerConfig = peerConfig || DEFAULT_PEER_CONFIG;
        this.log = log || ((...args) => console.warn('[bilup-compat]', ...args));
        this.peer = null;
        this.id = null;
        this.conns = new Map(); // peerId -> DataConnection
        this.hostPeerId = null;
        this._isHost = false;
        this._stop = false;
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._heartbeatTimer = null;
        this._lastSeen = new Map(); // peerId -> timestamp（收到任何消息都刷新）
        this._peerOpenPromise = null;
        this._dialTimer = null;
    }

    _onData(peerId, data) {
        this._lastSeen.set(peerId, Date.now());
        let envelope = data;
        if (typeof data === 'string') {
            try {
                envelope = JSON.parse(data);
            } catch (e) {
                return;
            }
        }
        if (!validateEnvelope(envelope)) return;
        // 心跳透传处理
        if (envelope.kind === KIND.CTRL) {
            if (envelope.type === CTRL.PING) {
                this.send(peerId, makeCtrl(CTRL.PONG, {}));
                return;
            }
            if (envelope.type === CTRL.PONG) return;
        }
        this.emit('message', peerId, envelope);
    }

    _registerConnection(conn, isIncoming) {
        const peerId = conn.peer;
        if (this.conns.has(peerId)) {
            try { conn.close(); } catch (e) { /* ignore */ }
            return;
        }
        this.conns.set(peerId, conn);
        this._lastSeen.set(peerId, Date.now());

        conn.on('data', (data) => this._onData(peerId, data));
        conn.on('close', () => {
            if (this.conns.get(peerId) === conn) this.conns.delete(peerId);
            this._lastSeen.delete(peerId);
            this.emit('peer-disconnected', peerId);
        });
        conn.on('error', (err) => {
            this.log('connection error', peerId, err && err.message);
        });
        // 连接建立后立即开始心跳
        this._ensureHeartbeat();
    }

    _ensureHeartbeat() {
        if (this._heartbeatTimer) return;
        this._heartbeatTimer = setInterval(() => {
            const now = Date.now();
            for (const [peerId, conn] of this.conns) {
                try {
                    if (conn.open) conn.send(makeCtrl(CTRL.PING, {}));
                } catch (e) { /* ignore */ }
            }
            // 死 peer 判定：30s 无任何消息
            for (const [peerId, lastSeen] of this._lastSeen) {
                if (now - lastSeen > DEAD_PEER_MS) {
                    const conn = this.conns.get(peerId);
                    if (conn) {
                        try { conn.close(); } catch (e) { /* ignore */ }
                        this.conns.delete(peerId);
                        this._lastSeen.delete(peerId);
                        this.emit('peer-disconnected', peerId);
                    }
                }
            }
        }, HEARTBEAT_MS);
    }

    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    /**
     * Host 模式：注册固定 peer id，开始接受 client 拨号。
     * @returns {Promise<string>} 本端 peer id
     */
    async host(roomId) {
        this._isHost = true;
        const id = generateHostPeerId(roomId);
        this.id = id;
        this.peer = new Peer(id, this.peerConfig);
        this._peerOpenPromise = new Promise((resolve, reject) => {
            const onOpen = () => { cleanup(); resolve(id); };
            const onError = (err) => { cleanup(); reject(new Error(err && err.message || 'peer error')); };
            const cleanup = () => {
                this.peer.off('open', onOpen);
                this.peer.off('error', onError);
            };
            this.peer.on('open', onOpen);
            this.peer.on('error', onError);
        });
        this.peer.on('connection', (conn) => this._registerConnection(conn, true));
        this.peer.on('disconnected', () => {
            // PeerJS 断线后尝试重连 broker
            try { this.peer.reconnect(); } catch (e) { /* ignore */ }
        });
        await this._peerOpenPromise;
        return id;
    }

    /**
     * Client 模式：注册随机 peer id，拨号 host。
     * @returns {Promise<string>} 本端 peer id
     */
    async join(roomId) {
        this._isHost = false;
        const id = generateClientPeerId(roomId);
        this.id = id;
        this.hostPeerId = generateHostPeerId(roomId);
        this.peer = new Peer(id, this.peerConfig);
        await new Promise((resolve, reject) => {
            const onOpen = () => { cleanup(); resolve(); };
            const onError = (err) => { cleanup(); reject(new Error(err && err.message || 'peer error')); };
            const cleanup = () => {
                this.peer.off('open', onOpen);
                this.peer.off('error', onError);
            };
            this.peer.on('open', onOpen);
            this.peer.on('error', onError);
        });

        const conn = this.peer.connect(this.hostPeerId, { reliable: true });
        await new Promise((resolve, reject) => {
            this._dialTimer = setTimeout(() => {
                cleanup();
                reject(new Error('拨号 Host 超时（PeerServer 不可达或房间不存在）'));
            }, DIAL_TIMEOUT_MS);
            const onOpen = () => { cleanup(); resolve(); };
            const onError = (err) => { cleanup(); reject(new Error(err && err.message || 'dial error')); };
            const cleanup = () => {
                clearTimeout(this._dialTimer);
                this._dialTimer = null;
                conn.off('open', onOpen);
                conn.off('error', onError);
            };
            conn.on('open', onOpen);
            conn.on('error', onError);
        });
        this._registerConnection(conn, false);
        return id;
    }

    send(peerId, envelope) {
        const conn = this.conns.get(peerId);
        if (!conn || !conn.open) return false;
        try {
            conn.send(envelope);
            return true;
        } catch (e) {
            this.log('send failed', peerId, e && e.message);
            return false;
        }
    }

    sendToHost(envelope) {
        if (!this.hostPeerId) return false;
        return this.send(this.hostPeerId, envelope);
    }

    broadcast(envelope, exceptPeerId) {
        for (const peerId of this.conns.keys()) {
            if (peerId === exceptPeerId) continue;
            this.send(peerId, envelope);
        }
    }

    bufferedAmount(peerId) {
        const conn = this.conns.get(peerId);
        if (!conn || !conn.dataChannel) return 0;
        try {
            return conn.dataChannel.bufferedAmount || 0;
        } catch (e) {
            return 0;
        }
    }

    closeConnection(peerId) {
        const conn = this.conns.get(peerId);
        if (conn) {
            try { conn.close(); } catch (e) { /* ignore */ }
            this.conns.delete(peerId);
            this._lastSeen.delete(peerId);
        }
    }

    /**
     * 调度重连（client 指数退避 1s -> 16s，最多 10 次）。返回 true 表示已调度。
     */
    scheduleReconnect() {
        if (this._stop) return false;
        if (this._reconnectTimer) return true;
        this._reconnectAttempts++;
        if (this._reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            this.emit('fatal', { error: new Error('重连失败次数过多') });
            return false;
        }
        const delayMs = Math.min(16000, 1000 * Math.pow(2, this._reconnectAttempts - 1));
        this.emit('reconnecting', { attempt: this._reconnectAttempts, delayMs });
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.emit('reconnect-tick');
        }, delayMs);
        return true;
    }

    /**
     * 主动停止重连（被拒绝/被踢/主动离开时调用）。
     */
    abortReconnect() {
        this._stop = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    /**
     * 重连回调成功后由会话调用：记录新 peer 实例。
     */
    markReconnected(peer) {
        this.peer = peer;
        this._reconnectAttempts = 0;
        this.emit('reconnected');
    }

    destroy() {
        this._stop = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._dialTimer) {
            clearTimeout(this._dialTimer);
            this._dialTimer = null;
        }
        this._stopHeartbeat();
        for (const conn of this.conns.values()) {
            try { conn.close(); } catch (e) { /* ignore */ }
        }
        this.conns.clear();
        this._lastSeen.clear();
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) { /* ignore */ }
            this.peer = null;
        }
    }
}

export {CompatTransport};
