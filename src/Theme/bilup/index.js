/*
 * bilup 主题差异包 — 统一入口
 * ---------------------------------------------------------------------------
 * 来源：Bilup（https://github.com/Bilup/scratch-gui，GPL-3.0，
 *       仅作功能参考自行实现，非逐字复制）。
 *
 * 本目录（src/Theme/bilup/）为 bilup 主题相对 TurboWarp 基线的差异包：
 * 与上游一致的基础文件一律不复制（直接引用原路径），仅保留差异实现。
 * 由 menu-bar.jsx 一行挂载 BilupMenuBar；仅 uiTheme === 'bilup' 时渲染，
 * 非 bilup 主题零影响、零回归；BilupBlocks 三类新积木（素材/字符串/Addons）
 * 因不改 scratch-blocks 内核，仅在「扩展」入口以说明形式保留（见文档注释）。
 * ---------------------------------------------------------------------------
 */

export {default as BilupMenuBar} from './components/bilup-menu-bar.jsx';
export {default as BilupWindow} from './components/bilup-window.jsx';
export {default} from './components/bilup-menu-bar.jsx';
