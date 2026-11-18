/**
 * snapshot.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import {arrayBufferToBase64, CHUNK_SIZE, Emitter, makeSnapshot, MAX_RESYNC_ATTEMPTS, RECEIVE_TIMEOUT_MS, SEND_WINDOW, SNAPSHOT, toArrayBuffer} from './core.js';
import {CompatTransport} from './transport.js';
import {BilupClientSession} from './client-session.js';
import {BilupHostSession} from './host-session.js';


// ---------------------------------------------------------------------------
// 快照服务（对齐 Bilup snapshot.js：Host 分块下发 + ACK 滑窗；Client 重组应用）
// ---------------------------------------------------------------------------
class CompatHostSnapshotService extends Emitter {
    /**
     * @param {object} options
     * @param {BilupHostSession} options.session
     * @param {CompatTransport} options.transport
     * @param {Function} options.getProjectData async () => ArrayBuffer
     * @param {Function} options.getTargetIds () => [{id,name,isStage}]|null
     * @param {Function} options.getExtensions () => [{id,url?}]|null
     */
    constructor({ session, transport, getProjectData, getTargetIds, getExtensions }) {
        super();
        this.session = session;
        this.transport = transport;
        this.getProjectData = getProjectData;
        this.getTargetIds = getTargetIds || null;
        this.getExtensions = getExtensions || null;
        this._transfers = new Map();
        this._pushes = new Map();
        this._transferCounter = 0;

        this._onSnapshotNeeded = ({ peerId }) => this.startTransfer(peerId);
        this._onSnapshotMessage = (peerId, envelope) => {
            if (envelope.type === SNAPSHOT.ACK) {
                this._onAck(peerId, envelope.payload);
            } else if (envelope.type === SNAPSHOT.REQUEST) {
                this.startTransfer(peerId);
            } else if (envelope.type === SNAPSHOT.PUSH) {
                this._onPushBegin(peerId, envelope.payload);
            } else if (envelope.type === SNAPSHOT.CHUNK) {
                this._onPushChunk(peerId, envelope.payload);
            } else if (envelope.type === SNAPSHOT.PUSH_COMPLETE) {
                this._onPushComplete(peerId, envelope.payload);
            }
        };
        this._onUserLeft = (user) => {
            this._transfers.delete(user.id);
            this._pushes.delete(user.id);
        };
        session.on('snapshot-needed', this._onSnapshotNeeded);
        session.on('snapshot-message', this._onSnapshotMessage);
        session.on('user-left', this._onUserLeft);
    }

    destroy() {
        this.session.off('snapshot-needed', this._onSnapshotNeeded);
        this.session.off('snapshot-message', this._onSnapshotMessage);
        this.session.off('user-left', this._onUserLeft);
        this._transfers.clear();
        this._pushes.clear();
        this.removeAllListeners();
    }

    async startTransfer(peerId) {
        this._transferCounter++;
        const transferId = `snapshot-${this._transferCounter}`;
        this._transfers.set(peerId, { transferId, starting: true });
        this.emit('upload-start', { peerId });
        let buffer;
        let atSeq;
        let targetIds;
        let extensions;
        try {
            // atSeq 在序列化前捕获：序列化期间的 op 不在快照内，client 只补 atSeq 之后
            atSeq = this.session.seq;
            buffer = toArrayBuffer(await this.getProjectData());
            targetIds = this.getTargetIds ? this.getTargetIds() : null;
            extensions = this.getExtensions ? this.getExtensions() : null;
        } catch (error) {
            this._transfers.delete(peerId);
            this.emit('upload-error', { peerId, error });
            return;
        }
        const current = this._transfers.get(peerId);
        if (!current || current.transferId !== transferId) return;
        const chunkCount = Math.max(1, Math.ceil(buffer.byteLength / CHUNK_SIZE));
        const transfer = { transferId, buffer, chunkCount, nextIndex: 0, ackedCount: 0 };
        this._transfers.set(peerId, transfer);
        const beginPayload = { transferId, totalBytes: buffer.byteLength, chunkCount, atSeq };
        if (targetIds) beginPayload.targetIds = targetIds;
        if (extensions) beginPayload.extensions = extensions;
        this.transport.send(peerId, makeSnapshot(SNAPSHOT.BEGIN, beginPayload));
        for (let i = 0; i < SEND_WINDOW; i++) this._sendNextChunk(peerId, transfer);
    }

    _sendNextChunk(peerId, transfer) {
        if (transfer.nextIndex >= transfer.chunkCount) return;
        const index = transfer.nextIndex++;
        const start = index * CHUNK_SIZE;
        const raw = transfer.buffer.slice(start, Math.min(start + CHUNK_SIZE, transfer.buffer.byteLength));
        this.transport.send(peerId, makeSnapshot(SNAPSHOT.CHUNK, {
            transferId: transfer.transferId,
            index,
            data: arrayBufferToBase64(raw),
        }));
    }

    _onAck(peerId, { transferId }) {
        const transfer = this._transfers.get(peerId);
        if (!transfer || transfer.transferId !== transferId || transfer.starting) return;
        transfer.ackedCount++;
        this.emit('upload-progress', {
            peerId,
            sent: Math.min(transfer.ackedCount * CHUNK_SIZE, transfer.buffer.byteLength),
            total: transfer.buffer.byteLength,
        });
        if (transfer.ackedCount >= transfer.chunkCount) {
            this._transfers.delete(peerId);
            this.emit('upload-complete', { peerId });
            return;
        }
        this._sendNextChunk(peerId, transfer);
    }

    _onPushBegin(peerId, { transferId, totalBytes, chunkCount }) {
        this._pushes.set(peerId, {
            transferId,
            totalBytes,
            chunkCount,
            chunks: new Array(chunkCount),
            receivedCount: 0,
            receivedBytes: 0,
        });
    }

    _onPushChunk(peerId, { transferId, index, data }) {
        const push = this._pushes.get(peerId);
        if (!push || push.transferId !== transferId) return;
        if (index >= push.chunkCount || push.chunks[index]) return;
        push.chunks[index] = toArrayBuffer(data);
        push.receivedCount++;
        push.receivedBytes += push.chunks[index].byteLength;
    }

    _onPushComplete(peerId, { transferId }) {
        const push = this._pushes.get(peerId);
        if (!push || push.transferId !== transferId) return;
        this._pushes.delete(peerId);
        if (push.receivedCount !== push.chunkCount || push.receivedBytes !== push.totalBytes) return;
        const combined = new Uint8Array(push.receivedBytes);
        let offset = 0;
        push.chunks.forEach((chunk) => {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        });
        this.emit('project-pushed', { peerId, buffer: combined.buffer });
    }
}

class CompatClientSnapshotService extends Emitter {
    /**
     * @param {object} options
     * @param {BilupClientSession} options.session
     * @param {CompatTransport} options.transport
     * @param {Function} options.applyProjectData async (ArrayBuffer) => void
     * @param {Function} options.remapTargetIds (targetIds) => void
     * @param {Function} options.loadExtensions (extensions) => Promise
     */
    constructor({ session, transport, applyProjectData, remapTargetIds, loadExtensions }) {
        super();
        this.session = session;
        this.transport = transport;
        this.applyProjectData = applyProjectData;
        this.remapTargetIds = remapTargetIds || null;
        this.loadExtensions = loadExtensions || null;
        this._incoming = null;
        this._timeout = null;
        this._resyncAttempts = 0;

        this._onSnapshotMessage = (envelope) => {
            if (envelope.type === SNAPSHOT.BEGIN) this._onBegin(envelope.payload);
            else if (envelope.type === SNAPSHOT.CHUNK) this._onChunk(envelope.payload);
        };
        this._onResyncNeeded = () => this.requestResync();
        session.on('snapshot-message', this._onSnapshotMessage);
        session.on('resync-needed', this._onResyncNeeded);
    }

    destroy() {
        this.session.off('snapshot-message', this._onSnapshotMessage);
        this.session.off('resync-needed', this._onResyncNeeded);
        this._clearTimeout();
        this._incoming = null;
        this.removeAllListeners();
    }

    requestResync() {
        this._resyncAttempts++;
        if (this._resyncAttempts > MAX_RESYNC_ATTEMPTS) {
            this._resyncAttempts = 0;
            this.emit('download-error', { error: new Error('Failed to synchronize with the host after multiple attempts') });
            return;
        }
        this.session.beginResync();
        this.transport.sendToHost(makeSnapshot(SNAPSHOT.REQUEST, {}));
    }

    /**
     * 把本地项目 push 给 host（全量替换，host adopt 后重快照）。
     * @param {ArrayBuffer} buffer
     */
    pushProject(buffer) {
        if (!buffer || buffer.byteLength === 0) return;
        const transferId = `push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const chunkCount = Math.max(1, Math.ceil(buffer.byteLength / CHUNK_SIZE));
        this.transport.sendToHost(makeSnapshot(SNAPSHOT.PUSH, {
            transferId,
            totalBytes: buffer.byteLength,
            chunkCount,
        }));
        for (let index = 0; index < chunkCount; index++) {
            const start = index * CHUNK_SIZE;
            const raw = buffer.slice(start, Math.min(start + CHUNK_SIZE, buffer.byteLength));
            this.transport.sendToHost(makeSnapshot(SNAPSHOT.CHUNK, {
                transferId,
                index,
                data: arrayBufferToBase64(raw),
            }));
        }
        this.transport.sendToHost(makeSnapshot(SNAPSHOT.PUSH_COMPLETE, { transferId }));
    }

    _onBegin({ transferId, totalBytes, chunkCount, atSeq, targetIds, extensions }) {
        this._incoming = {
            transferId,
            totalBytes,
            chunkCount,
            atSeq,
            targetIds: targetIds || null,
            extensions: extensions || null,
            chunks: new Array(chunkCount),
            receivedCount: 0,
            receivedBytes: 0,
        };
        this._armTimeout();
        this.emit('download-start', { totalBytes });
    }

    _onChunk({ transferId, index, data }) {
        const incoming = this._incoming;
        if (!incoming || incoming.transferId !== transferId) return;
        if (index >= incoming.chunkCount || incoming.chunks[index]) return;
        incoming.chunks[index] = toArrayBuffer(data);
        incoming.receivedCount++;
        incoming.receivedBytes += incoming.chunks[index].byteLength;
        this._armTimeout();
        this.transport.sendToHost(makeSnapshot(SNAPSHOT.ACK, { transferId, index }));
        this.emit('download-progress', { loaded: incoming.receivedBytes, total: incoming.totalBytes });
        if (incoming.receivedCount === incoming.chunkCount) this._finish(incoming);
    }

    async _finish(incoming) {
        this._incoming = null;
        this._clearTimeout();
        const combined = new Uint8Array(incoming.receivedBytes);
        let offset = 0;
        incoming.chunks.forEach((chunk) => {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        });
        if (combined.byteLength !== incoming.totalBytes) {
            this.emit('download-error', { error: new Error('snapshot size mismatch') });
            this.requestResync();
            return;
        }
        this.emit('download-complete');
        try {
            await this.applyProjectData(combined.buffer);
        } catch (error) {
            this.emit('download-error', { error });
            this.requestResync();
            return;
        }
        this._resyncAttempts = 0;
        if (incoming.targetIds && this.remapTargetIds) {
            try { this.remapTargetIds(incoming.targetIds); } catch (e) { /* ignore */ }
        }
        if (incoming.extensions && this.loadExtensions) {
            try { await this.loadExtensions(incoming.extensions); } catch (e) { /* ignore */ }
        }
        this.session.setBaseSeq(incoming.atSeq);
        this.transport.sendToHost(makeSnapshot(SNAPSHOT.COMPLETE, { transferId: incoming.transferId }));
    }

    _armTimeout() {
        this._clearTimeout();
        this._timeout = setTimeout(() => {
            const error = new Error('snapshot transfer stalled');
            this._incoming = null;
            this.emit('download-error', { error });
        }, RECEIVE_TIMEOUT_MS);
    }

    _clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
        }
    }
}

export {CompatClientSnapshotService, CompatHostSnapshotService};
