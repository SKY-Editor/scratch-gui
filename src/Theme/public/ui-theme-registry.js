/**
 * Theme/public / ui-theme-registry（兼容 re-export 层）
 * ---------------------------------------------------------------------------
 * 新框架下「主题清单」的唯一真源已迁移到 src/editor-framework-core/theme-registry.js。
 * 本文件仅为兼容层：旧代码 import 路径 '../../Theme/common/ui-theme-registry' 只需
 * 将 common 改为 public，其余逻辑零改动（全部接口原样 re-export）。
 *
 * Theme/public 目录定位：仅做「读取当前主题 + 切换」的纯工具，从 core 读清单，
 * 不维护任何注册表副本。
 * ---------------------------------------------------------------------------
 */
export * from '../../editor-framework-core/theme-registry';
