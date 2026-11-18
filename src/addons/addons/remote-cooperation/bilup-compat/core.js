/**
 * core.js —— 自 bilup-compat.js 拆出（2026-11-18 刀8）。
 */
import Peer from 'peerjs';


// ---------------------------------------------------------------------------
// 协议常量（与 Bilup protocol.js 对齐的自包含副本）
// ---------------------------------------------------------------------------
const PROTOCOL_VERSION = 1;
const KIND = {
    OP: 'op',
    PROPOSE: 'propose',
    REJECT: 'reject',
    CTRL: 'ctrl',
    SNAPSHOT: 'snapshot',
    ASSET: 'asset',
    PRESENCE: 'presence',
};
const CTRL = {
    PING: 'ping',
    PONG: 'pong',
    HELLO: 'hello',
    JOIN_APPROVED: 'join-approved',
    JOIN_DENIED: 'join-denied',
    USERS_LIST: 'users-list',
    USER_JOINED: 'user-joined',
    USER_LEFT: 'user-left',
    USERNAME_CHANGE: 'username-change',
    JOIN_CANCELLED: 'join-cancelled',
    OPS_REQUEST: 'ops-request',
    RESYNC_REQUIRED: 'resync-required',
    SESSION_READY: 'session-ready',
    KICK: 'kick',
    PRIVACY_CHANGED: 'privacy-changed',
    HOST_LOADING_START: 'host-loading-start',
    HOST_LOADING_PROGRESS: 'host-loading-progress',
    HOST_LOADING_COMPLETE: 'host-loading-complete',
};
const SNAPSHOT = {
    BEGIN: 'begin',
    CHUNK: 'chunk',
    ACK: 'ack',
    REQUEST: 'request',
    PUSH: 'push',
    PUSH_COMPLETE: 'push-complete',
    COMPLETE: 'complete',
};
const ASSET = {
    REQUEST: 'request',
    BEGIN: 'begin',
    CHUNK: 'chunk',
    UNAVAILABLE: 'unavailable',
};
const PRESENCE = {
    EDITING_TARGET: 'editing-target',
};

// 与 Bilup brand.js 的 APP_NAME 保持一致：host peer id = <APP>-collab-<room>-host
const APP_NAME = 'Bilup';
const CHUNK_SIZE = 64 * 1024;
const SEND_WINDOW = 4;
const HEARTBEAT_MS = 10000;
const DEAD_PEER_MS = 30000;
const DIAL_TIMEOUT_MS = 15000;
const MAX_RECONNECT_ATTEMPTS = 10;
const OP_LOG_SIZE = 512;
const GAP_REQUEST_DELAY_MS = 3000;
const GAP_RESYNC_DELAY_MS = 10000;
const ASSET_BLOCK_TIMEOUT_MS = 30000;
const MAX_BUFFERED_OPS = 5000;
const RECEIVE_TIMEOUT_MS = 60000;
const MAX_RESYNC_ATTEMPTS = 5;
const PENDING_OP_TIMEOUT_MS = 30000;
const PENDING_PRUNE_INTERVAL_MS = 10000;
const MAX_BUFFERED_BYTES = 128 * 1024;
const DRAIN_POLL_MS = 50;

const DEFAULT_PEER_CONFIG = {
    host: 'collab_warp.mistium.com',
    port: 443,
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
        ],
    },
};

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------
class Emitter {
    constructor() {
        this._listeners = new Map();
    }
    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return this;
    }
    off(event, fn) {
        const set = this._listeners.get(event);
        if (set) set.delete(fn);
        return this;
    }
    emit(event, ...args) {
        const set = this._listeners.get(event);
        if (set) for (const fn of Array.from(set)) fn(...args);
        return this;
    }
    removeAllListeners() {
        this._listeners.clear();
    }
}

const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};
const base64ToArrayBuffer = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
};
const toArrayBuffer = (data) => {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (typeof data === 'string') return base64ToArrayBuffer(data);
    throw new Error('data must be binary');
};
const textToBuffer = (text) => new TextEncoder().encode(text).buffer;
const bufferToText = (buffer) => new TextDecoder('utf-8').decode(buffer);

const generateHostPeerId = (roomId) => `${APP_NAME}-collab-${roomId}-host`;
const generateClientPeerId = (roomId) =>
    `${APP_NAME}-collab-${roomId}-user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// 信封构造（与 Bilup protocol.js 字段一致）
const makeEnvelope = (kind, type, payload) => ({ v: PROTOCOL_VERSION, kind, type, payload });
const makeOp = (type, payload, { seq, clientId, clientOpId }) =>
    ({ v: PROTOCOL_VERSION, kind: KIND.OP, type, payload, seq, clientId, clientOpId });
const makePropose = (type, payload, clientOpId) =>
    ({ v: PROTOCOL_VERSION, kind: KIND.PROPOSE, type, payload, clientOpId });
const makeReject = (clientOpId, reason) =>
    ({ v: PROTOCOL_VERSION, kind: KIND.REJECT, type: 'op-reject', payload: { clientOpId, reason } });
const makeCtrl = (type, payload) => ({ v: PROTOCOL_VERSION, kind: KIND.CTRL, type, payload });
const makeSnapshot = (type, payload) => ({ v: PROTOCOL_VERSION, kind: KIND.SNAPSHOT, type, payload });
const makeAsset = (type, payload) => ({ v: PROTOCOL_VERSION, kind: KIND.ASSET, type, payload });
const makePresence = (type, payload) => ({ v: PROTOCOL_VERSION, kind: KIND.PRESENCE, type, payload });

const validateEnvelope = (envelope) => {
    if (!envelope || typeof envelope !== 'object') return false;
    if (envelope.v !== PROTOCOL_VERSION) return false;
    if (typeof envelope.kind !== 'string' || typeof envelope.type !== 'string') return false;
    if (envelope.payload === undefined || envelope.payload === null) return false;
    return true;
};

// 资产引用：md5ext -> assetId（md5）
const md5extToAssetId = (md5ext) => String(md5ext).split('.')[0];
// 根据文件扩展名推断 dataFormat
const dataFormatForExt = (ext) => {
    switch (String(ext || '').toLowerCase()) {
        case 'svg': return 'image/svg+xml';
        case 'png': return 'image/png';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'bmp': return 'image/bmp';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'wav': return 'audio/x-wav';
        case 'mp3': return 'audio/mpeg';
        default: return 'image/png';
    }
};

// 简化实体 key 提取（用于冲突重放）：大多数 op 以 targetId 寻址。
const entityKeysForOp = (type, payload) => {
    const p = payload || {};
    const keys = [];
    if (p.targetId) keys.push(`target:${p.targetId}`);
    if (p.name && (type === 'costume-add' || type === 'sound-add' || type === 'costume-rename' || type === 'sound-rename')) {
        keys.push(`name:${p.name}`);
    }
    if (p.varId) keys.push(`var:${p.varId}`);
    if (p.broadcastId || p.name && type === 'message-add') keys.push(`msg:${p.broadcastId || p.name}`);
    return keys;
};

export {APP_NAME, arrayBufferToBase64, ASSET, ASSET_BLOCK_TIMEOUT_MS, base64ToArrayBuffer, bufferToText, CHUNK_SIZE, CTRL, dataFormatForExt, DEAD_PEER_MS, DEFAULT_PEER_CONFIG, DIAL_TIMEOUT_MS, DRAIN_POLL_MS, Emitter, entityKeysForOp, GAP_REQUEST_DELAY_MS, GAP_RESYNC_DELAY_MS, generateClientPeerId, generateHostPeerId, HEARTBEAT_MS, KIND, makeAsset, makeCtrl, makeEnvelope, makeOp, makePresence, makePropose, makeReject, makeSnapshot, MAX_BUFFERED_BYTES, MAX_BUFFERED_OPS, MAX_RECONNECT_ATTEMPTS, MAX_RESYNC_ATTEMPTS, md5extToAssetId, OP_LOG_SIZE, PENDING_OP_TIMEOUT_MS, PENDING_PRUNE_INTERVAL_MS, PRESENCE, PROTOCOL_VERSION, RECEIVE_TIMEOUT_MS, SEND_WINDOW, SNAPSHOT, textToBuffer, toArrayBuffer, validateEnvelope};
