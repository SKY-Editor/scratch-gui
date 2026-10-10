/**
 * editor-framework-core 统一出口
 * ---------------------------------------------------------------------------
 * 新框架架构核心目录。业务代码只允许通过本 index 或对应子模块的公开接口
 * 访问框架能力，禁止直接读取主题目录内部文件（隔离铁律）。
 * ---------------------------------------------------------------------------
 */
export * from './theme-registry';
export * from './shell-registry';
export * from './part-registry';
export {assembleTheme, mountShell} from './assembler';
export {setSharedData, getSharedData, removeSharedData, shared} from './shared-data';
