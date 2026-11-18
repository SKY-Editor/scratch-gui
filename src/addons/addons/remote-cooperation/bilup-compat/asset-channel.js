/**
 * asset-channel.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import {arrayBufferToBase64, ASSET, CHUNK_SIZE, DRAIN_POLL_MS, Emitter, KIND, makeAsset, MAX_BUFFERED_BYTES, toArrayBuffer} from './core.js';
import {CompatTransport} from './transport.js';


// ---------------------------------------------------------------------------
// 资产通道（对齐 Bilup assets.js：发起端先推字节再发 op；接收端按需向 Host 拉取）
// ---------------------------------------------------------------------------
class CompatAssetChannel extends Emitter {
    /**
     * @param {object} options
     * @param {boolean} options.isHost
     * @param {CompatTransport} options.transport
     * @param {Function} options.getAsset (md5ext) => ArrayBuffer|Uint8Array|null
     * @param {Function} options.storeAsset async (md5ext, Uint8Array) => void
     */
    constructor({ isHost, transport, getAsset, storeAsset }) {
        super();
        this.isHost = isHost;
        this.transport = transport;
        this.getAsset = getAsset;
        this.storeAsset = storeAsset;
        this._incoming = new Map();
        this._requestedFromHost = new Set();
        this._pendingServes = new Map();
        this._destroyed = false;

        if (isHost) {
            this._onAssetMessage = (peerId, envelope) => this._onMessage(peerId, envelope);
        } else {
            this._onAssetMessage = (envelope) => this._onMessage('host', envelope);
        }
        this.transport.on('message', this._onAssetMessage);
    }

    destroy() {
        this._destroyed = true;
        this.transport.off('message', this._onAssetMessage);
        this._incoming.clear();
        this._requestedFromHost.clear();
        this._pendingServes.clear();
    }

    async _waitForDrain(peerId) {
        if (this.transport.bufferedAmount(peerId) < MAX_BUFFERED_BYTES) return;
        await new Promise((resolve) => {
            const check = () => {
                if (this._destroyed || this.transport.bufferedAmount(peerId) < MAX_BUFFERED_BYTES) {
                    resolve();
                    return;
                }
                setTimeout(check, DRAIN_POLL_MS);
            };
            setTimeout(check, DRAIN_POLL_MS);
        });
    }

    /**
     * 把单个资产字节推给对端（client -> host 在 propose 前；host -> client 服务请求）。
     * @returns {Promise<boolean>} 是否找到并发出
     */
    async sendAsset(peerId, md5ext) {
        const raw = this.getAsset(md5ext);
        if (!raw) return false;
        const buffer = toArrayBuffer(raw);
        const chunkCount = Math.max(1, Math.ceil(buffer.byteLength / CHUNK_SIZE));
        const send = (envelope) => (
            peerId === 'host' ? this.transport.sendToHost(envelope) : this.transport.send(peerId, envelope)
        );
        send(makeAsset(ASSET.BEGIN, { md5ext, totalBytes: buffer.byteLength, chunkCount }));
        for (let index = 0; index < chunkCount; index++) {
            await this._waitForDrain(peerId);
            if (this._destroyed) return false;
            const start = index * CHUNK_SIZE;
            const chunk = buffer.slice(start, Math.min(start + CHUNK_SIZE, buffer.byteLength));
            send(makeAsset(ASSET.CHUNK, { md5ext, index, data: arrayBufferToBase64(chunk) }));
        }
        return true;
    }

    /**
     * 逐资产推送（保持背压节奏）。
     * @param {string} peerId
     * @param {Array.<string>} md5exts
     */
    async sendAssets(peerId, md5exts) {
        for (const md5ext of md5exts) {
            if (this._destroyed) return;
            await this.sendAsset(peerId, md5ext);
        }
    }

    /**
     * Client 向 Host 请求缺失资产（去重）。
     * @param {Array.<string>} md5exts
     */
    requestFromHost(md5exts) {
        const wanted = md5exts.filter((md5ext) => !this._requestedFromHost.has(md5ext));
        if (wanted.length === 0) return;
        wanted.forEach((md5ext) => this._requestedFromHost.add(md5ext));
        this.transport.sendToHost(makeAsset(ASSET.REQUEST, { md5exts: wanted }));
    }

    _onMessage(peerId, envelope) {
        if (envelope.kind !== KIND.ASSET) return;
        switch (envelope.type) {
        case ASSET.REQUEST: {
            if (!this.isHost) return;
            const md5exts = (envelope.payload && envelope.payload.md5exts) || [];
            const unavailable = md5exts.filter((md5ext) => !this.getAsset(md5ext));
            unavailable.forEach((md5ext) => {
                if (!this._pendingServes.has(md5ext)) this._pendingServes.set(md5ext, new Set());
                this._pendingServes.get(md5ext).add(peerId);
                this.emit('asset-unavailable', { peerId, md5ext });
            });
            if (unavailable.length > 0) {
                this.transport.send(peerId, makeAsset(ASSET.UNAVAILABLE, { md5exts: unavailable }));
            }
            this.sendAssets(peerId, md5exts.filter((md5ext) => this.getAsset(md5ext)));
            break;
        }
        case ASSET.UNAVAILABLE: {
            if (this.isHost) return;
            const md5exts = (envelope.payload && envelope.payload.md5exts) || [];
            md5exts.forEach((md5ext) => this._requestedFromHost.delete(md5ext));
            this.emit('asset-unavailable', { md5exts });
            break;
        }
        case ASSET.BEGIN: {
            const { md5ext, totalBytes, chunkCount } = envelope.payload;
            this._incoming.set(`${peerId}:${md5ext}`, {
                md5ext,
                totalBytes,
                chunkCount,
                chunks: new Array(chunkCount),
                receivedCount: 0,
                receivedBytes: 0,
            });
            break;
        }
        case ASSET.CHUNK: {
            const { md5ext, index, data } = envelope.payload;
            const key = `${peerId}:${md5ext}`;
            const incoming = this._incoming.get(key);
            if (!incoming || index >= incoming.chunkCount || incoming.chunks[index]) return;
            incoming.chunks[index] = toArrayBuffer(data);
            incoming.receivedCount++;
            incoming.receivedBytes += incoming.chunks[index].byteLength;
            if (incoming.receivedCount === incoming.chunkCount) {
                this._incoming.delete(key);
                this._finish(incoming);
            }
            break;
        }
        default:
            break;
        }
    }

    async _finish(incoming) {
        if (incoming.receivedBytes !== incoming.totalBytes) return;
        const combined = new Uint8Array(incoming.receivedBytes);
        let offset = 0;
        incoming.chunks.forEach((chunk) => {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        });
        try {
            await this.storeAsset(incoming.md5ext, combined);
        } catch (error) {
            this._requestedFromHost.delete(incoming.md5ext);
            return;
        }
        this._requestedFromHost.delete(incoming.md5ext);
        this.emit('asset-received', incoming.md5ext);
        const waiting = this._pendingServes.get(incoming.md5ext);
        if (waiting) {
            this._pendingServes.delete(incoming.md5ext);
            waiting.forEach((peerId) => this.sendAsset(peerId, incoming.md5ext));
        }
    }
}

export {CompatAssetChannel};
