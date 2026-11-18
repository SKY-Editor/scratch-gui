/**
 * op-engine.js —— 操作级同步引擎（Bilup 思路移植，适配方案A Yjs 信令）
 *
 * 与快照同步（userscript.js 的 maybePushProjectSnapshot / applyRemoteSnapshot）
 * 并行工作，职责分工：
 *   - 快照链路：整体项目交换（loadProject 级），新成员加入 / 内容兜底；
 *   - 操作级链路（本文件）：细粒度编辑实时同步，避免整包快照的 MB 级体积
 *     与 400ms+150ms 节流延迟，让拖拽积木、打字、切造型等操作接近实时。
 *
 * 捕获层：patch VM 的 sprite/costume/sound/extension 入口 + Blockly 事件监听，
 *   本地编辑 -> OP.* op -> sendOp 回调（userscript 用 sendRelay(KIND_OP) 广播）；
 * 应用层：远端 op -> applyRemoteOp -> 串行 Promise 链按序应用到 VM + Blockly；
 *   应用期间 _remoteApplyDepth > 0，捕获层 isSuppressed() 返回 true，不产生 echo。
 * asset：op 只携带引用清单（assetRefs），本地缺失时经 sendAssetRequest 定向
 *   拉取；asset-data 注入 storage 后由 injectAssetData 唤醒排队 op 继续应用。
 *
 * 铁律：不碰 scratch-vm 内核。所有 VM 实例方法包装经 VmPatcher 登记，
 * destroy() 时逐一还原。快照 loadProject 同样走被 patch 的入口，但因
 * 快照应用期 applyingRemote=true（外部 isSuppressed 合成），不会触发捕获。
 */

// 2026-11-18 刀8 拆分：实现已拆入 ./op-engine/ 目录（core OP枚举/VmPatcher/OpApplier/序列化工具 ·
// vm-methods 本地捕获与 VM 方法包装 · vm-applier 远端应用器 · index createOpEngine 工厂）；
// 本文件保留为稳定入口，userscript 的 './op-engine.js' 导入无需改动（含 OP 枚举再导出）。
export {default, OP} from './op-engine/index.js';
