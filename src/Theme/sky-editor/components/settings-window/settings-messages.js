/**
 * 设置窗口全部文案（defineMessages 数据）+ 选项组 + blockIcons 图标映射。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；纯数据模块，不依赖任何组件。
 * 注：blockIcons（积木配色图标映射）因仅被 MergedThemeTab 消费、且与 blockOptions
 * 同批定义，随选项组一并迁入此处，避免在主文件与页面之间产生往返引用。
 */
import React from 'react';
import {defineMessages} from 'react-intl';
import {BLOCKS_CUSTOM, BLOCKS_DARK, BLOCKS_HIGH_CONTRAST, BLOCKS_THREE, Theme} from '../../../../lib/themes/index.js';
import threeIcon from '../../../../components/menu-bar/tw-blocks-three.svg';
import highContrastIcon from '../../../../components/menu-bar/tw-blocks-high-contrast.svg';
import darkIcon from '../../../../components/menu-bar/tw-blocks-dark.svg';
import customIcon from '../../../../components/menu-bar/tw-blocks-custom.svg';

const messages = defineMessages({
    newFramerate: {
        defaultMessage: 'New framerate:',
        description: 'Prompt shown to choose a new framerate',
        id: 'tw.menuBar.newFramerate'
    },
    settingsTitle: {
        defaultMessage: 'Settings',
        description: 'Title of the combined settings window',
        id: 'gui.menuBar.settings'
    },
    languageTab: {
        defaultMessage: 'Language',
        description: 'Tab label for language settings in the combined settings window',
        id: 'tw.settingsWindow.languageTab'
    },
    themeTab: {
        defaultMessage: 'Theme',
        description: 'Tab label for theme settings in the combined settings window',
        id: 'tw.settingsWindow.themeTab'
    },
    blocksTab: {
        defaultMessage: 'Block Colors',
        description: 'Tab label for block color settings in the combined settings window',
        id: 'tw.settingsWindow.blocksTab'
    },
    accentTab: {
        defaultMessage: 'Accent',
        description: 'Tab label for accent settings in the combined settings window',
        id: 'tw.settingsWindow.accentTab'
    },
    skyAppearanceTab: {
        defaultMessage: 'SKYEditor 外观',
        description: 'Tab label for SKYEditor appearance settings in the combined settings window',
        id: 'tw.settingsWindow.skyAppearanceTab'
    },
    layoutTab: {
        defaultMessage: '布局',
        description: 'Tab label for layout settings in the combined settings window',
        id: 'tw.settingsWindow.layoutTab'
    },
    wallpaperTab: {
        defaultMessage: '壁纸',
        description: 'Tab label for wallpaper settings in the combined settings window',
        id: 'tw.settingsWindow.wallpaperTab'
    },
    fontTab: {
        defaultMessage: '字体',
        description: 'Tab label for font settings in the combined settings window',
        id: 'tw.settingsWindow.fontTab'
    },
    loadingTab: {
        defaultMessage: '加载动画',
        description: 'Tab label for loading animation settings in the combined settings window',
        id: 'tw.settingsWindow.loadingTab'
    },
    wallpaperPlaceholder: {
        defaultMessage: '壁纸设置功能开发中，敬请期待',
        description: 'Placeholder text shown in the wallpaper settings tab',
        id: 'tw.settingsWindow.wallpaperPlaceholder'
    },
    fontPlaceholder: {
        defaultMessage: '字体设置功能开发中，敬请期待',
        description: 'Placeholder text shown in the font settings tab',
        id: 'tw.settingsWindow.fontPlaceholder'
    },
    loadingPlaceholder: {
        defaultMessage: '加载动画设置功能开发中，敬请期待',
        description: 'Placeholder text shown in the loading animation settings tab',
        id: 'tw.settingsWindow.loadingPlaceholder'
    },
    skyAppearancePlaceholder: {
        defaultMessage: 'SKYEditor 外观设置功能开发中，敬请期待',
        description: 'Placeholder text shown in the SKYEditor appearance settings tab',
        id: 'tw.settingsWindow.skyAppearancePlaceholder'
    },
    menuBarPositionLabel: {
        defaultMessage: '菜单栏位置',
        description: 'Label for the menu bar position setting in the combined settings window',
        id: 'tw.settingsWindow.menuBarPosition'
    },
    tabLayoutLabel: {
        defaultMessage: '标签栏布局',
        description: 'Label for the tab layout setting in the combined settings window',
        id: 'tw.settingsWindow.tabLayout'
    },
    windowButtonStyleLabel: {
        defaultMessage: '窗口按钮样式',
        description: 'Label for the window button style setting in the combined settings window',
        id: 'tw.settingsWindow.windowButtonStyle'
    },
    contextMenuStyleLabel: {
        defaultMessage: '右键菜单样式',
        description: 'Label for the context menu style setting in the combined settings window',
        id: 'tw.settingsWindow.contextMenuStyle'
    },
    windowTabBarThemeLabel: {
        defaultMessage: '主题色窗口标签栏',
        description: 'Label for the setting that toggles the theme colored window tab bar',
        id: 'tw.settingsWindow.windowTabBarTheme'
    },
    menuBarThemeLabel: {
        defaultMessage: '编辑器菜单栏使用主题色',
        description: 'Label for the setting that toggles the theme colored editor menu bar',
        id: 'tw.settingsWindow.menuBarTheme'
    },
    advancedTab: {
        defaultMessage: 'General',
        description: 'Tab label for general settings in the combined settings window',
        id: 'tw.settingsWindow.advancedTab'
    },
    keyboardTab: {
        defaultMessage: '按键设置',
        description: 'Tab label for keyboard settings in the combined settings window',
        id: 'tw.settingsWindow.keyboardTab'
    },
    keyboardPlaceholder: {
        defaultMessage: '按键设置功能开发中，敬请期待',
        description: 'Placeholder text shown in the keyboard settings tab',
        id: 'tw.settingsWindow.keyboardPlaceholder'
    },
    generalCategory: {
        defaultMessage: 'General',
        description: 'Category name for the general settings group in the combined settings window',
        id: 'tw.settingsWindow.generalCategory'
    },
    appearanceCategory: {
        defaultMessage: 'Appearance',
        description: 'Category name for the appearance settings group in the combined settings window',
        id: 'tw.settingsWindow.appearanceCategory'
    },
    toolsCategory: {
        defaultMessage: 'Tools',
        description: 'Category name for the tools settings group in the combined settings window',
        id: 'tw.settingsWindow.toolsCategory'
    },
    experimentalCategory: {
        defaultMessage: 'Experimental Features',
        description: 'Category name for the experimental settings group in the combined settings window',
        id: 'tw.settingsWindow.experimentalCategory'
    },
    cloudServerTab: {
        defaultMessage: '云变量服务器',
        description: 'Tab label for cloud variable server settings in the combined settings window',
        id: 'tw.settingsWindow.cloudServerTab'
    },
    cloudServerDescription: {
        defaultMessage: '选择云变量连接的目标服务器。内置服务器无需额外配置；选择自定义时需要填写服务器地址与显示名称。',
        description: 'Description text shown in the cloud variable server settings tab',
        id: 'tw.settingsWindow.cloudServerDescription'
    },
    cloudServerTypeLabel: {
        defaultMessage: '服务器',
        description: 'Label for the cloud variable server type dropdown in the combined settings window',
        id: 'tw.settingsWindow.cloudServerType'
    },
    cloudServerScratch: {
        defaultMessage: 'Scratch 服务器',
        description: 'Option for the official TurboWarp cloud variable server',
        id: 'tw.settingsWindow.cloudServerScratch'
    },
    cloudServerMaker: {
        defaultMessage: '创客次元服务器',
        description: 'Option for the CTspace maker cloud variable server',
        id: 'tw.settingsWindow.cloudServerMaker'
    },
    cloudServerCustom: {
        defaultMessage: '自定义',
        description: 'Option for a custom cloud variable server',
        id: 'tw.settingsWindow.cloudServerCustom'
    },
    cloudServerAddressLabel: {
        defaultMessage: '云变量服务器地址',
        description: 'Label for the custom cloud variable server address input',
        id: 'tw.settingsWindow.cloudServerAddress'
    },
    cloudServerNameLabel: {
        defaultMessage: '服务器显示名称',
        description: 'Label for the custom cloud variable server display name input',
        id: 'tw.settingsWindow.cloudServerName'
    },
    accountTab: {
        defaultMessage: '账号',
        description: 'Tab label for account settings in the combined settings window',
        id: 'tw.settingsWindow.accountTab'
    },
    accountLoginTitle: {
        defaultMessage: '登录SKYEditor',
        description: 'Big title shown on the account tab when not logged in',
        id: 'tw.settingsWindow.accountLoginTitle'
    },
    accountLoginEntry: {
        defaultMessage: '登录',
        description: 'Entry button inside the rounded login box when not logged in',
        id: 'tw.settingsWindow.accountLoginEntry'
    },
    accountLoginIntro: {
        defaultMessage: '登录后可同步账号信息，并使用创客次元云变量等服务',
        description: 'Hint text under the title of the account tab',
        id: 'tw.settingsWindow.accountLoginIntro'
    },
    accountLoginWithSkyStudio: {
        defaultMessage: '使用 SKY Studio 扫码登录',
        description: 'Login method button for SKY Studio QR code login',
        id: 'tw.settingsWindow.accountLoginWithSkyStudio'
    },
    accountLoginWithCtspace: {
        defaultMessage: '使用创客次元账号登录',
        description: 'Login method button for creator-forum (CTspace) account login',
        id: 'tw.settingsWindow.accountLoginWithCtspace'
    },
    accountNotImplemented: {
        defaultMessage: 'SKY Studio 扫码登录尚未完成，敬请期待',
        description: 'Placeholder shown when clicking the not-yet-implemented login method',
        id: 'tw.settingsWindow.accountNotImplemented'
    },
    accountBack: {
        defaultMessage: '返回',
        description: 'Back button to return to login method selection',
        id: 'tw.settingsWindow.accountBack'
    },
    accountRegisterEntry: {
        defaultMessage: '还没有账号？注册一个',
        description: 'Entry link to switch to the registration form',
        id: 'tw.settingsWindow.accountRegisterEntry'
    },
    accountRegisterTitle: {
        defaultMessage: '注册SKYEditor',
        description: 'Title of the registration form',
        id: 'tw.settingsWindow.accountRegisterTitle'
    },
    accountRegisterIntro: {
        defaultMessage: '注册创客次元账号后，即可使用云变量与云项目服务',
        description: 'Hint text under the registration form title',
        id: 'tw.settingsWindow.accountRegisterIntro'
    },
    accountEmail: {
        defaultMessage: '邮箱',
        description: 'Label for email input on the registration form',
        id: 'tw.settingsWindow.accountEmail'
    },
    accountConfirmPassword: {
        defaultMessage: '确认密码',
        description: 'Label for confirm-password input on the registration form',
        id: 'tw.settingsWindow.accountConfirmPassword'
    },
    accountRegister: {
        defaultMessage: '注册',
        description: 'Submit button of the registration form',
        id: 'tw.settingsWindow.accountRegister'
    },
    accountRegistering: {
        defaultMessage: '注册中…',
        description: 'Text of the registration submit button while a request is in flight',
        id: 'tw.settingsWindow.accountRegistering'
    },
    accountGoLogin: {
        defaultMessage: '已有账号？去登录',
        description: 'Entry link to switch back to the login form',
        id: 'tw.settingsWindow.accountGoLogin'
    },
    accountPasswordMismatch: {
        defaultMessage: '两次输入的密码不一致',
        description: 'Validation error when the two passwords do not match',
        id: 'tw.settingsWindow.accountPasswordMismatch'
    },
    accountEmailInvalid: {
        defaultMessage: '请输入有效的邮箱地址',
        description: 'Validation error when the email format is invalid',
        id: 'tw.settingsWindow.accountEmailInvalid'
    },
    accountRegisterSuccess: {
        defaultMessage: '注册成功，已自动登录',
        description: 'Toast shown after a successful registration',
        id: 'tw.settingsWindow.accountRegisterSuccess'
    },
    accountUsername: {
        defaultMessage: '用户名',
        description: 'Label for username input on the creator-forum login form',
        id: 'tw.settingsWindow.accountUsername'
    },
    accountPassword: {
        defaultMessage: '密码',
        description: 'Label for password input on the creator-forum login form',
        id: 'tw.settingsWindow.accountPassword'
    },
    accountCaptcha: {
        defaultMessage: '图形验证码',
        description: 'Label for captcha answer input on the creator-forum login form',
        id: 'tw.settingsWindow.accountCaptcha'
    },
    accountCaptchaRefresh: {
        defaultMessage: '看不清？点击图片刷新',
        description: 'Hint under the captcha image to refresh it',
        id: 'tw.settingsWindow.accountCaptchaRefresh'
    },
    accountLogin: {
        defaultMessage: '登录',
        description: 'Submit button of the creator-forum login form',
        id: 'tw.settingsWindow.accountLogin'
    },
    accountLoggingIn: {
        defaultMessage: '登录中…',
        description: 'Text of the login submit button while a request is in flight',
        id: 'tw.settingsWindow.accountLoggingIn'
    },
    accountLoggingInWait: {
        defaultMessage: '正在获取验证码并计算口令，请稍候…',
        description: 'Hint shown while captcha and proof-of-work are being prepared',
        id: 'tw.settingsWindow.accountLoggingInWait'
    },
    accountPowSolving: {
        defaultMessage: '正在计算登录凭证…',
        description: 'Hint shown while proof-of-work is solved in the background (captcha already visible)',
        id: 'tw.settingsWindow.accountPowSolving'
    },
    accountBioFallback: {
        defaultMessage: '这个人很神秘，还没有填写个人简介',
        description: 'Fallback bio text when the user has no bio/signature',
        id: 'tw.settingsWindow.accountBioFallback'
    },
    accountLogout: {
        defaultMessage: '退出登录',
        description: 'Button to log out of the current account',
        id: 'tw.settingsWindow.accountLogout'
    },
    accountLoginFail: {
        defaultMessage: '登录失败：{error}',
        description: 'Error message when the creator-forum login request fails',
        id: 'tw.settingsWindow.accountLoginFail'
    },
    accountFetchProfileFail: {
        defaultMessage: '登录成功，但获取用户资料失败：{error}',
        description: 'Warning when login succeeded but fetching the profile failed',
        id: 'tw.settingsWindow.accountFetchProfileFail'
    },
    accountCaptchaFail: {
        defaultMessage: '验证码获取失败，请点击重试',
        description: 'Error hint when the captcha could not be loaded',
        id: 'tw.settingsWindow.accountCaptchaFail'
    },
    accountCloudBridgeTip: {
        defaultMessage: '登录成功后，创客次元云变量服务器与云项目接口将自动携带登录令牌。',
        description: 'Tip explaining that the cloud bridge is ready after login',
        id: 'tw.settingsWindow.accountCloudBridgeTip'
    },
    cloudServerTest: {
        defaultMessage: '测试连通性',
        description: 'Button that tests connectivity to the selected cloud variable server',
        id: 'tw.settingsWindow.cloudServerTest'
    },
    cloudServerTesting: {
        defaultMessage: '测试中…',
        description: 'Button text while a cloud variable server connectivity test is in flight',
        id: 'tw.settingsWindow.cloudServerTesting'
    },
    cloudServerTestHint: {
        defaultMessage: '测试会尝试连接所选服务器并立即断开，仅验证网络可达性。',
        description: 'Hint under the cloud variable server connectivity test button',
        id: 'tw.settingsWindow.cloudServerTestHint'
    },
    cloudServerTestOk: {
        defaultMessage: '连接成功，服务器可达。',
        description: 'Result text when the cloud variable server connectivity test succeeds',
        id: 'tw.settingsWindow.cloudServerTestOk'
    },
    cloudServerTestFail: {
        defaultMessage: '连接失败，请检查服务器地址、网络或防火墙设置。',
        description: 'Result text when the cloud variable server connectivity test fails',
        id: 'tw.settingsWindow.cloudServerTestFail'
    },
    cloudServerTestEmpty: {
        defaultMessage: '请先填写云变量服务器地址。',
        description: 'Result text when trying to test connectivity without a custom server address',
        id: 'tw.settingsWindow.cloudServerTestEmpty'
    },
    advancedFeaturesTab: {
        defaultMessage: '高级功能',
        description: 'Tab label for the advanced features page in the tools category',
        id: 'tw.settingsWindow.advancedFeaturesTab'
    },
    audioEditorStyleLabel: {
        defaultMessage: '音频编辑器样式',
        description: 'Label for the audio editor style setting',
        id: 'tw.settingsWindow.audioEditorStyleLabel'
    },
    audioEditorStyleScratch: {
        defaultMessage: 'Scratch 原版',
        description: 'Option to use the original Scratch audio editor style',
        id: 'tw.settingsWindow.audioEditorStyleScratch'
    },
    audioEditorStyleAdvanced: {
        defaultMessage: '高级版本',
        description: 'Option to use the advanced audio editor style',
        id: 'tw.settingsWindow.audioEditorStyleAdvanced'
    }
});

const blockOptions = defineMessages({
    three: {
        defaultMessage: 'Original',
        description: 'Name of normal Scratch block colors.',
        id: 'tw.blockColors.three'
    },
    'high-contrast': {
        defaultMessage: 'High Contrast',
        description: 'Name of the high contrast block colors.',
        id: 'tw.blockColors.highContrast'
    },
    dark: {
        defaultMessage: 'Dark (Beta)',
        description: 'Name of the dark block colors',
        id: 'tw.blockColors.dark'
    },
    custom: {
        defaultMessage: 'Customize in Addon Settings',
        description: 'Link in block color list to open addon settings for more customization',
        id: 'tw.blockColors.custom'
    }
});

const blockIcons = {
    [BLOCKS_THREE]: threeIcon,
    [BLOCKS_HIGH_CONTRAST]: highContrastIcon,
    [BLOCKS_DARK]: darkIcon,
    [BLOCKS_CUSTOM]: customIcon
};

const menuBarPositionOptions = defineMessages({
    left: {
        defaultMessage: '靠左',
        description: 'Option to align the menu bar to the left',
        id: 'tw.settingsWindow.menuBarPositionLeft'
    },
    center: {
        defaultMessage: '居中',
        description: 'Option to center the menu bar',
        id: 'tw.settingsWindow.menuBarPositionCenter'
    }
});

const windowButtonStyleOptions = defineMessages({
    windows: {
        defaultMessage: 'Windows',
        description: 'Option label for Windows style window buttons',
        id: 'tw.settingsWindow.windowButtonStyleWindows'
    },
    mac: {
        defaultMessage: 'Mac',
        description: 'Option label for macOS style window buttons',
        id: 'tw.settingsWindow.windowButtonStyleMac'
    }
});

const tabLayoutOptions = defineMessages({
    vertical: {
        defaultMessage: '竖向',
        description: 'Option to display the editor tabs vertically',
        id: 'tw.settingsWindow.tabLayoutVertical'
    },
    horizontal: {
        defaultMessage: '横向',
        description: 'Option to display the editor tabs horizontally',
        id: 'tw.settingsWindow.tabLayoutHorizontal'
    }
});

const contextMenuStyleOptions = defineMessages({
    tw: {
        defaultMessage: '经典样式',
        description: 'Option to use the original classic context menu style',
        id: 'tw.settingsWindow.contextMenuStyleTw'
    },
    se: {
        defaultMessage: 'SKYEditor样式',
        description: 'Option to use the SKYEditor context menu style',
        id: 'tw.settingsWindow.contextMenuStyleSe'
    }
});

const audioEditorStyleOptions = defineMessages({
    scratch: {
        defaultMessage: 'Scratch 原版',
        description: 'Option to use the original Scratch audio editor style',
        id: 'tw.settingsWindow.audioEditorStyleScratch'
    },
    advanced: {
        defaultMessage: '高级版本',
        description: 'Option to use the advanced audio editor style',
        id: 'tw.settingsWindow.audioEditorStyleAdvanced'
    }
});

const menuBarThemeOptions = defineMessages({
    themed: {
        defaultMessage: '启用',
        description: 'Option to show the editor menu bar in the theme color',
        id: 'tw.settingsWindow.menuBarThemeThemed'
    },
    plain: {
        defaultMessage: '关闭',
        description: 'Option to show the editor menu bar in the plain UI background color',
        id: 'tw.settingsWindow.menuBarThemePlain'
    }
});

const windowTabBarThemeOptions = defineMessages({
    themed: {
        defaultMessage: '启用',
        description: 'Option to show the window tab bar in the theme color',
        id: 'tw.settingsWindow.windowTabBarThemeThemed'
    },
    white: {
        defaultMessage: '关闭',
        description: 'Option to show the window tab bar in plain white',
        id: 'tw.settingsWindow.windowTabBarThemeWhite'
    }
});

export {messages, blockOptions, blockIcons, menuBarPositionOptions, windowButtonStyleOptions, tabLayoutOptions, contextMenuStyleOptions, audioEditorStyleOptions, menuBarThemeOptions, windowTabBarThemeOptions};
