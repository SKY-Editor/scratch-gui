/**
 * SKYEditor 新增功能的双主题呈现登记表（唯一登记处）
 * ---------------------------------------------------------------------------
 * 规则：任何「SKYEditor 新增、TurboWarp 官方没有 / 形态不同」的功能，都必须在本文件
 * 登记一次它在两个主题下的呈现形态；组件内只允许通过 useFeatureSurface(id) 取形态，
 * 禁止在业务代码里写 uiTheme === 'sky-editor' 的分支来判断长相。
 *
 * 登记字段：
 *   kind      功能类型：'window'（独立窗口）| 'dialog'（简短交互）| 'panel'（内联面板）
 *   sky/tw    两个主题各自覆盖的语义：shell / chrome / tabsAxis / tone
 *             未写的键自动继承 theme-adapter 的 DEFAULT_SURFACE（= TurboWarp 官方形态）
 *
 * 对照口径（SKY 专属形态 → 官方对应形态）：
 *   Win11 独立窗口        → 官方深灰标题栏弹窗（tw-modal）
 *   竖向标签栏 / 左侧分类  → 官方顶部横向标签条
 *   SKY 设置窗口          → 官方设置弹窗（弹窗外壳 + 横标签）
 *   SKY 圆角浮层 / 提示    → 官方 popover
 * ---------------------------------------------------------------------------
 */
import {registerFeatureSurface} from './theme-adapter.js';

/** 设置（SKY: Win11 窗口 + 左竖栏分类 → TW: 弹窗 + 顶部横排标签） */
registerFeatureSurface('settings', {
    kind: 'window',
    sky: {shell: 'win11', tabsAxis: 'vertical'},
    tw: {shell: 'tw-modal', tabsAxis: 'horizontal'}
});

/** 音乐播放器（SKY: Win11 窗口，标签竖排 → TW: 弹窗，标签横排） */
registerFeatureSurface('music-player', {
    kind: 'window',
    sky: {shell: 'win11', tabsAxis: 'vertical'},
    tw: {shell: 'tw-modal', tabsAxis: 'horizontal'}
});

/** 编辑器主标签栏（SKY: 可切竖向侧栏 → TW: 固定顶部横向） */
registerFeatureSurface('stage-tabs', {
    kind: 'panel',
    sky: {tabsAxis: 'vertical'},
    tw: {tabsAxis: 'horizontal'}
});

/** 作品导出窗口 */
registerFeatureSurface('export-window', {
    kind: 'window',
    sky: {shell: 'win11'},
    tw: {shell: 'tw-modal'}
});

/** 扩展（Addons）窗口 */
registerFeatureSurface('addons-window', {
    kind: 'window',
    sky: {shell: 'win11'},
    tw: {shell: 'tw-modal'}
});

/** 还原点窗口 */
registerFeatureSurface('restore-point', {
    kind: 'window',
    sky: {shell: 'win11'},
    tw: {shell: 'tw-modal'}
});

/** 用户名 / 登录信息窗口 */
registerFeatureSurface('username-window', {
    kind: 'window',
    sky: {shell: 'win11'},
    tw: {shell: 'tw-modal'}
});

/** 自定义积木（工作区浮窗） */
registerFeatureSurface('custom-procedures', {
    kind: 'window',
    sky: {shell: 'win11'},
    tw: {shell: 'tw-modal'}
});

/** 输入框 prompt（SKY: Win11 圆角输入窗 → TW: 官方 prompt 弹窗） */
registerFeatureSurface('prompt', {
    kind: 'dialog',
    sky: {shell: 'win11', chrome: 'win11'},
    tw: {shell: 'tw-modal', chrome: 'classic'}
});

/** 确认框（含音乐播放器的确认框） */
registerFeatureSurface('confirm-dialog', {
    kind: 'dialog',
    sky: {shell: 'win11', chrome: 'win11'},
    tw: {shell: 'tw-modal', chrome: 'classic'}
});

/** 新建歌单等轻量输入弹窗 */
registerFeatureSurface('music-dialog', {
    kind: 'dialog',
    sky: {shell: 'win11', chrome: 'win11'},
    tw: {shell: 'tw-modal', chrome: 'classic'}
});

/** 音乐播放器歌词全屏页（SKY: 独立层 → TW: 弹窗内容层） */
registerFeatureSurface('music-lyrics-page', {
    kind: 'panel',
    sky: {tabsAxis: 'vertical'},
    tw: {tabsAxis: 'horizontal'}
});

/** 网易云抽屉 / 管理面板等侧滑面板（SKY: 侧边抽屉 → TW: 弹窗内的横排分区） */
registerFeatureSurface('music-side-panel', {
    kind: 'panel',
    sky: {tabsAxis: 'vertical'},
    tw: {tabsAxis: 'horizontal'}
});

/** 右键菜单（SKY: 圆角独立项皮肤 → TW: 官方菜单皮肤） */
registerFeatureSurface('context-menu', {
    kind: 'panel',
    sky: {tone: 'sky'},
    tw: {tone: 'classic'}
});

export const FEATURE_IDS = {
    SETTINGS: 'settings',
    MUSIC_PLAYER: 'music-player',
    STAGE_TABS: 'stage-tabs',
    EXPORT_WINDOW: 'export-window',
    ADDONS_WINDOW: 'addons-window',
    RESTORE_POINT: 'restore-point',
    USERNAME_WINDOW: 'username-window',
    CUSTOM_PROCEDURES: 'custom-procedures',
    PROMPT: 'prompt',
    CONFIRM_DIALOG: 'confirm-dialog',
    MUSIC_DIALOG: 'music-dialog',
    MUSIC_LYRICS_PAGE: 'music-lyrics-page',
    MUSIC_SIDE_PANEL: 'music-side-panel',
    CONTEXT_MENU: 'context-menu'
};

export default FEATURE_IDS;
