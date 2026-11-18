/**
 * bilup-compat.js —— SKY Editor remote-cooperation addon 的 Bilup 兼容层
 *
 * 职责：让 SKY Editor 可以作为 Bilup 客户端（client）加入 Bilup 协作房间，
 * 与真实 Bilup 客户端共同协作；同时支持 SKY 作为房间 Host（host 定序 +
 * 快照分块下发 + 资产服务），让 Bilup 客户端加入 SKY 主持的房间。
 *
 * 设计原则：
 *  - 完全复用 op-engine.js 的捕获与应用能力（本地编辑捕获 -> sendOp 回调；
 *    远端 op -> applyRemoteOp 串行应用）。本文件只做协议桥接，不触碰
 *    scratch-vm 内核，不改动 sync-client.js / protocol.js / server.js。
 *  - 协议常量/信封/握手/定序/快照分块/资产通道与 Bilup
 *    (scratch-gui/src/lib/collaboration/) 对齐，host peer id 前缀固定为
 *    'Bilup'（与 Bilup 品牌前缀一致，才能互拨互认）。
 *  - 与现有方案A（ws://localhost:8090 信令）互斥：同一时刻只有一种连接模式。
 *    userscript.js 通过 bilupActive 标志把 op-engine 的 sendOp /
 *    sendAssetRequest 路由到本模块。
 *
 * 互通边界（消息类型）：
 *  - 已实现：OP / PROPOSE / REJECT / CTRL(HELLO, JOIN_APPROVED, JOIN_DENIED,
 *    USERS_LIST, USER_JOINED, USER_LEFT, USERNAME_CHANGE, JOIN_CANCELLED,
 *    OPS_REQUEST, RESYNC_REQUIRED, SESSION_READY, KICK, PING, PONG) /
 *    SNAPSHOT(BEGIN, CHUNK, ACK, REQUEST, COMPLETE, PUSH, PUSH_COMPLETE) /
 *    ASSET(REQUEST, BEGIN, CHUNK, UNAVAILABLE) / PRESENCE(EDITING_TARGET)
 *  - 未实现：房间隐私审批（PRIVACY_CHANGED / pendingJoinRequests 审批 UI，
 *    本层创建的房间固定 public，公共房间直接放行；私密房间由真 Bilup Host
 *    审批后照常加入）；HOST_LOADING_*（仅 UI 提示用途）。
 */

// 2026-11-18 刀8 拆分：实现已按类拆入 ./bilup-compat/ 目录（core 协议常量/Emitter/工具 ·
// transport 传输层 · asset-channel 资产通道 · client-session/host-session 会话 ·
// snapshot 主备快照服务 · index createBilupCompat 工厂）；本文件保留为稳定入口，
// userscript 的 './bilup-compat.js' 导入无需改动。
export {default} from './bilup-compat/index.js';
