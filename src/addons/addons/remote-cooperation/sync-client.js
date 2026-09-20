/**
 * sync-client.js —— 协作客户端 SDK（浏览器版，供 remote-cooperation addon 使用）
 *
 * 语义与 backend-prototype/src/client.js 保持一致（方案A 同步语义的浏览器移植）：
 *   - 一个客户端 = 一个 WebSocket 连接 + 一份本地 Yjs 共享文档
 *   - 连接信令服务并加入房间（携带本地初始状态）
 *   - 监听本地文档变化，把 Yjs 增量广播给房间内其他成员
 *   - 接收远端成员 / 数据，应用 CRDT 增量，最终多端收敛一致
 *
 * 与 backend 版的差异（仅传输层适配，业务语义不变）：
 *   - 使用浏览器原生 WebSocket（不再依赖 Node 的 ws 包）
 *   - base64 编解码改用浏览器 btoa/atob（protocol.js 内实现）
 *   - 增加 'sync-activity' 事件：收到远端数据时向 UI 提供最近同步活动信息
 *
 * 事件（onEvent 回调）：
 *   welcome        加入成功，携带 { roomId, members[], opSeq }
 *   member-joined  新成员加入，携带 member { clientId, displayName }
 *   member-left    成员离开，携带 { clientId }
 *   data           收到远端 CRDT 数据，携带 { from, kind: 'init-state' | 'update' }
 *   op             收到远端业务 op（操作级同步），携带 { from, type, payload, seq }
 *   op-catchup     收到服务端 op 补偿历史（操作级同步），携带 { from, ops[] }
 *   sync-activity  同步活动（收到远端数据并应用后），携带 { from, kind, at, snapshot }
 *   disconnected   连接断开，携带 { clientId }
 */

import * as Y from 'yjs';
import * as protocol from './protocol.js';

const WS_OPEN = 1;

class SkySyncClient {
  /**
   * @param {object} opts
   * @param {string} opts.url 信令服务地址，如 ws://localhost:8090
   * @param {string} opts.roomId 房间号
   * @param {string} opts.clientId 本端唯一标识
   * @param {string} [opts.displayName] 展示名
   * @param {(event:string, data:any)=>void} [opts.onEvent] 事件回调
   */
  constructor(opts) {
    this.url = opts.url;
    this.roomId = opts.roomId;
    this.clientId = opts.clientId;
    this.displayName = opts.displayName || `匿名-${opts.clientId.slice(0, 4)}`;
    this.onEvent = opts.onEvent || (() => {});

    this.doc = new Y.Doc(); // 本地共享文档
    this.roomMembers = []; // 当前房间成员列表
    this.ws = null;
    this._closed = false;
    this._onWelcomeOnce = null;
  }

  /**
   * 建立连接并加入房间。返回 Promise，join 被服务端确认（welcome）后 resolve。
   * 连接失败 / 超时 reject。
   */
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        reject(new Error(`无法连接到 ${this.url}：${e.message}`));
        return;
      }
      this.ws = ws;

      const timer = setTimeout(() => {
        reject(new Error(`${this.clientId} 连接信令服务超时`));
        try {
          ws.close();
        } catch (e) { /* ignore */ }
      }, 8000);

      ws.onopen = () => {
        // 1) 订阅本地文档变化：任何改动（含自己写入、远端应用）都会触发
        //    增量生成并广播给房间其他成员（Yjs update 事件自带自上次以来的增量）。
        this.doc.on('update', (update) => {
          if (this._closed || this.ws.readyState !== WS_OPEN) return;
          const frame = protocol.encode(
            protocol.buildRelay(this.roomId, this.clientId, null, protocol.KIND_UPDATE, {
              update: protocol.toBase64(update),
            })
          );
          this.ws.send(frame);
        });

        // 2) 发送 join（携带本地初始状态，让房间其他成员能学到本端已有内容）
        const fullState = Y.encodeStateAsUpdate(this.doc);
        const state = fullState.length > 0 ? protocol.toBase64(fullState) : null;
        this.ws.send(
          protocol.encode(protocol.buildJoin(this.roomId, this.clientId, this.displayName, state))
        );
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        const msg = protocol.decode(ev.data);
        if (msg) this._handleMessage(msg);
      };

      ws.onclose = () => {
        this._closed = true;
        this.onEvent('disconnected', { clientId: this.clientId });
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(new Error(`信令服务连接错误：${this.url}`));
      };

      // welcome 到达后视为加入成功
      this._onWelcomeOnce = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case protocol.MSG_WELCOME: {
        this.roomMembers = msg.members || [];
        this.onEvent('welcome', {
          roomId: msg.roomId,
          members: this.roomMembers,
          opSeq: typeof msg.opSeq === 'number' ? msg.opSeq : 0,
        });
        if (this._onWelcomeOnce) {
          this._onWelcomeOnce();
          this._onWelcomeOnce = null;
        }
        break;
      }

      case protocol.MSG_MEMBER_JOINED: {
        const member = msg.member || {};
        if (!this.roomMembers.some((m) => m.clientId === member.clientId)) {
          this.roomMembers.push(member);
        }
        this.onEvent('member-joined', member);

        // 学习新成员携带的初始状态
        if (msg.state) {
          Y.applyUpdate(this.doc, protocol.fromBase64(msg.state));
        }
        // 把自己的完整状态定向发给新成员，保证新成员能拿到房间现状
        const fullState = Y.encodeStateAsUpdate(this.doc);
        if (fullState.length > 0) {
          const frame = protocol.encode(
            protocol.buildRelay(
              this.roomId,
              this.clientId,
              member.clientId,
              protocol.KIND_INIT_STATE,
              { state: protocol.toBase64(fullState) }
            )
          );
          if (this.ws.readyState === WS_OPEN) this.ws.send(frame);
        }
        break;
      }

      case protocol.MSG_MEMBER_LEFT: {
        this.roomMembers = this.roomMembers.filter((m) => m.clientId !== msg.clientId);
        this.onEvent('member-left', { clientId: msg.clientId });
        break;
      }

      case protocol.MSG_SYNC: {
        const kind = msg.kind;
        const payload = msg.payload || {};
        // asset 按需拉取：请求/回传属于业务透传消息，不经 Yjs 文档，
        // 原样抛给上层 UI 处理（请求方在 userscript 内按缺失清单拉取）。
        if (kind === protocol.KIND_ASSET_REQUEST) {
          this.onEvent('asset-request', { from: msg.from, assetIds: payload.assetIds || [] });
          break;
        }
        if (kind === protocol.KIND_ASSET_DATA) {
          this.onEvent('asset-data', { from: msg.from, assets: payload.assets || [] });
          break;
        }
        // 操作级同步：业务 op 不经 Yjs 文档，原样抛给上层 UI（op-engine）
        // 串行应用到本地 VM（payload 由 op-engine 的 makeOp 构造并校验）。
        if (kind === protocol.KIND_OP) {
          // op 载荷解包 + seq/opSeq 透传：seq 为服务端注入的中心序号（定序去重基准），
          // opSeq 为旧协议客户端本地序号（仅诊断兼容）；均缺失时为 null。
          this.onEvent('op', {
            from: msg.from,
            type: payload.type,
            payload: payload.payload,
            seq: (typeof payload.seq === 'number' ? payload.seq : null),
            opSeq: (typeof payload.opSeq === 'number' ? payload.opSeq : null),
          });
          break;
        }
        // 操作级同步补偿：服务端按 since 定向回传的 op 历史（断线重连/入房后补齐差值）
        if (kind === protocol.KIND_OP_CATCHUP) {
          this.onEvent('op-catchup', {
            from: msg.from,
            ops: Array.isArray(payload.ops) ? payload.ops : [],
          });
          break;
        }
        // 在线成员状态：低频率业务消息，不经 Yjs 文档，原样抛给上层 UI。
        if (kind === protocol.KIND_PRESENCE) {
          this.onEvent('presence', { from: msg.from, ...payload });
          break;
        }
        let snapshot = null;
        if (kind === protocol.KIND_INIT_STATE && payload.state) {
          Y.applyUpdate(this.doc, protocol.fromBase64(payload.state));
          snapshot = this.getSnapshot();
          this.onEvent('data', { from: msg.from, kind: 'init-state' });
          this.onEvent('sync-activity', { from: msg.from, kind: 'init-state', at: Date.now(), snapshot });
        } else if (kind === protocol.KIND_UPDATE && payload.update) {
          Y.applyUpdate(this.doc, protocol.fromBase64(payload.update));
          snapshot = this.getSnapshot();
          this.onEvent('data', { from: msg.from, kind: 'update' });
          this.onEvent('sync-activity', { from: msg.from, kind: 'update', at: Date.now(), snapshot });
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * 向共享文档根 map 写入一个 key（模拟协作者的一次编辑 / 项目快照）。
   * @param {string} key
   * @param {any} value
   */
  setKey(key, value) {
    this.doc.getMap('root').set(key, value);
  }

  /**
   * 读取共享文档根 map 的 key。
   */
  getKey(key) {
    return this.doc.getMap('root').get(key);
  }

  /**
   * 返回当前共享文档根 map 的完整快照（普通对象）。
   */
  getSnapshot() {
    return this.doc.getMap('root').toJSON();
  }

  /**
   * 当前房间成员列表（只读拷贝）。
   */
  getMembers() {
    return this.roomMembers.slice();
  }

  /**
   * 发送自定义业务消息（绕过 Yjs 增量，用于 asset 按需拉取等定向通信）。
   * @param {string} kind 业务子类型（如 protocol.KIND_ASSET_REQUEST）
   * @param {*} payload 业务数据
   * @param {string|null} to 目标 clientId；null 表示广播给房间其他成员
   * @returns {boolean} 是否成功发出
   */
  sendRelay(kind, payload, to = null) {
    if (this._closed || !this.ws || this.ws.readyState !== WS_OPEN) return false;
    const frame = protocol.encode(
      protocol.buildRelay(this.roomId, this.clientId, to || null, kind, payload)
    );
    this.ws.send(frame);
    return true;
  }

  /**
   * 主动离开房间并断开连接。
   */
  leave() {
    this._closed = true;
    try {
      if (this.ws && this.ws.readyState === WS_OPEN) {
        this.ws.send(
          protocol.encode(protocol.buildLeave(this.roomId, this.clientId))
        );
      }
    } catch (e) { /* ignore */ }
    try {
      if (this.ws) this.ws.close();
    } catch (e) { /* ignore */ }
  }
}

export { SkySyncClient };
