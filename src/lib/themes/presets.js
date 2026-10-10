// Editor UI theme presets. UI themes are an independent style layer,
// orthogonal to accent / gui / blocks.
//
// 兼容壳：真正的唯一真源是 ui-theme-registry.js。
// 新增主题请改注册表（ui-theme-registry.js），不要改本文件。
// 本文件仅保留 THEME_PRESETS 导出，供选择菜单渲染循环继续使用。
import {getUiThemePresets} from '../../Theme/public/ui-theme-registry.js';

const THEME_PRESETS = getUiThemePresets();

export {
    THEME_PRESETS
};
