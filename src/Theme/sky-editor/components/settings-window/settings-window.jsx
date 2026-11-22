import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';

import locales from '@turbowarp/scratch-l10n';

import ThemedWindow from '../../../../components/tw-themed-window/themed-window.jsx';
import {SettingsModalBody} from '../../../../components/tw-settings-modal/settings-modal.jsx';
import {defaultStageSize} from '../../../../reducers/custom-stage-size';

import {SkyScrollContainer} from '../../../../components/sky-scrollbar/sky-scrollbar.jsx';
import themePaletteIcon from '../../../../components/menu-bar/tw-theme-palette.svg';
import threeIcon from '../../../../components/menu-bar/tw-blocks-three.svg';
import desktopIcon from '../../../../components/menu-bar/tw-desktop-icon.svg';
import settingsIcon from '../../../../components/menu-bar/icon--settings.svg';
import languageIcon from '../../../../components/language-selector/language-icon.svg';
import advancedIcon from '../../../../components/menu-bar/tw-advanced.svg';
import keyboardIcon from '../../../../components/menu-bar/tw-keyboard.svg';
import layoutIcon from '../../../../components/menu-bar/tw-layout.svg';
import wallpaperIcon from '../../../../components/menu-bar/tw-wallpaper.svg';
import fontIcon from '../../../../components/menu-bar/tw-font.svg';
import loadingIcon from '../../../../components/menu-bar/tw-loading.svg';

import {
    GUI_DARK,
    GUI_LIGHT,
    BLOCKS_CUSTOM,
    BLOCKS_DARK,
    BLOCKS_HIGH_CONTRAST,
    BLOCKS_THREE,
    Theme
} from '../../../../lib/themes/index.js';
import {selectLocale} from '../../../../reducers/locales.js';
import {setTheme} from '../../../../reducers/theme.js';
import {setUiTheme} from '../../../../Theme/public/ui-theme-reducer.js';
import {setMenuBarPosition} from '../../../../reducers/menu-bar-position.js';
import {setTabLayout} from '../../../../reducers/tab-layout.js';
import {setContextMenuStyle} from '../../../../reducers/context-menu-style.js';
import {setAudioEditorStyle} from '../../../../reducers/audio-editor-style.js';
import {persistTheme} from '../../../../lib/themes/themePersistance.js';
import {applyUiThemeChrome} from '../../../../Theme/public/ui-theme-registry.js';
import {persistMenuBarPosition} from '../../../../lib/sky-settings-store.js';
import {persistTabLayout} from '../../../../lib/sky-settings-store.js';
import {persistContextMenuStyle, applyContextMenuStyle} from '../../../../lib/sky-settings-store.js';
import {persistAudioEditorStyle} from '../../../../lib/sky-settings-store.js';
import {setCloudHost, setCloudHostName} from '../../../../reducers/tw';
import styles from '../../../../components/menu-bar/settings-menu.css';
// 编辑器菜单栏主题色：与「主题色窗口标签栏」是两条互相独立的设置

// SKYEditor 账号模块（创客次元账号登录 + 云变量接入），与 scratch-gui 平级目录
import {
    apiClient,
    sessionManager,
    bindSessionApi,
    solvePow,
} from '../../../../../../skyeditor-account/src/index.js';


import {PlaceholderTab} from './placeholder-tab.jsx';
import {LanguageTab} from './language-tab.jsx';
import {LayoutTab} from './layout-tab.jsx';
import {CloudServerTab} from './cloud-server-tab.jsx';
import {AccountTab} from './account-tab.jsx';
import {ThemeTab} from './theme-tab.jsx';
import {MergedThemeTab} from './merged-theme-tab.jsx';
import {AdvancedFeaturesTab} from './advanced-features-tab.jsx';
import {messages} from './settings-messages';

const SETTINGS_CATEGORIES = [
    {
        id: 'general',
        message: messages.generalCategory,
        icon: settingsIcon,
        items: [
            {id: 'advanced', message: messages.advancedTab, icon: advancedIcon},
            {id: 'language', message: messages.languageTab, icon: languageIcon},
            {id: 'keyboard', message: messages.keyboardTab, icon: keyboardIcon}
        ]
    },
    {
        id: 'appearance',
        message: messages.appearanceCategory,
        icon: threeIcon,
        items: [
            {id: 'theme', message: messages.themeTab, icon: themePaletteIcon},
            {id: 'layout', message: messages.layoutTab, icon: layoutIcon},
            {id: 'wallpaper', message: messages.wallpaperTab, icon: wallpaperIcon},
            {id: 'font', message: messages.fontTab, icon: fontIcon},
            {id: 'loading', message: messages.loadingTab, icon: loadingIcon},
            {id: 'sky-appearance', message: messages.skyAppearanceTab, icon: settingsIcon}
        ]
    },
    {
        id: 'tools',
        message: messages.toolsCategory,
        icon: advancedIcon,
        items: [
            {id: 'advanced-features', message: messages.advancedFeaturesTab, icon: advancedIcon}
        ]
    },
    {
        id: 'experimental',
        message: messages.experimentalCategory,
        icon: desktopIcon,
        items: [
            {id: 'cloud-server', message: messages.cloudServerTab, icon: desktopIcon}
        ]
    }
];

const normalizeTab = tab => {
    if (tab === 'advanced' || tab === 'account' || tab === 'cloud-server' || tab === 'advanced-features') return tab;
    return 'language';
};

class SettingsWindow extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleFramerateChange',
            'handleCustomizeFramerate',
            'handleHighQualityPenChange',
            'handleInterpolationChange',
            'handleInfiniteClonesChange',
            'handleRemoveFencingChange',
            'handleRemoveLimitsChange',
            'handleWarpTimerChange',
            'handleStageWidthChange',
            'handleStageHeightChange',
            'handleDisableCompilerChange',
            'handleStoreProjectOptions',
            'handleSelectTab',
            'handleToggleCategory'
        ]);
        this.state = {
            activeTab: normalizeTab(props.defaultTab),
            collapsedCategories: {}
        };
    }
    componentDidMount () {
        // 应用级登录态恢复：绑定 API 客户端并校验/恢复本地保存的登录态
        bindSessionApi(apiClient);
        if (sessionManager.isLoggedIn()) {
            sessionManager.refresh().catch(() => {});
        } else {
            sessionManager.restore().catch(() => {});
        }
    }
    componentDidUpdate (prevProps) {
        const nextTab = normalizeTab(this.props.defaultTab);
        const prevTab = normalizeTab(prevProps.defaultTab);
        if (this.props.defaultTab && nextTab !== prevTab) {
            this.setState({activeTab: nextTab});
        }
    }
    handleFramerateChange (e) {
        this.props.vm.setFramerate(e.target.checked ? 60 : 30);
    }
    async handleCustomizeFramerate () {
        // prompt() returns Promise in desktop app
        // eslint-disable-next-line no-alert
        const newFramerate = await prompt(this.props.intl.formatMessage(messages.newFramerate), this.props.framerate);
        const parsed = parseFloat(newFramerate);
        if (isFinite(parsed)) {
            this.props.vm.setFramerate(parsed);
        }
    }
    handleHighQualityPenChange (e) {
        this.props.vm.renderer.setUseHighQualityRender(e.target.checked);
    }
    handleInterpolationChange (e) {
        this.props.vm.setInterpolation(e.target.checked);
    }
    handleInfiniteClonesChange (e) {
        this.props.vm.setRuntimeOptions({
            maxClones: e.target.checked ? Infinity : 300
        });
    }
    handleRemoveFencingChange (e) {
        this.props.vm.setRuntimeOptions({
            fencing: !e.target.checked
        });
    }
    handleRemoveLimitsChange (e) {
        this.props.vm.setRuntimeOptions({
            miscLimits: !e.target.checked
        });
    }
    handleWarpTimerChange (e) {
        this.props.vm.setCompilerOptions({
            warpTimer: e.target.checked
        });
    }
    handleDisableCompilerChange (e) {
        this.props.vm.setCompilerOptions({
            enabled: !e.target.checked
        });
    }
    handleStageWidthChange (value) {
        this.props.vm.setStageSize(value, this.props.customStageSize.height);
    }
    handleStageHeightChange (value) {
        this.props.vm.setStageSize(this.props.customStageSize.width, value);
    }
    handleStoreProjectOptions () {
        this.props.vm.storeProjectOptions();
    }
    handleSelectTab (tab) {
        this.setState({activeTab: tab});
    }
    handleToggleCategory (categoryId) {
        this.setState(prevState => ({
            collapsedCategories: {
                ...prevState.collapsedCategories,
                [categoryId]: !prevState.collapsedCategories[categoryId]
            }
        }));
    }
    render () {
        const {
            canChangeLanguage,
            canChangeTheme,
            currentLocale,
            menuBarPosition,
            tabLayout,
            contextMenuStyle,
            audioEditorStyle,
            onClickDesktopSettings,
            onChangeLanguage,
            onChangeMenuBarPosition,
            onChangeTabLayout,
            onChangeContextMenuStyle,
            onChangeAudioEditorStyle,
            onChangeTheme,
            onChangeUiTheme,
            onOpenCustomSettings,
            onSetCloudHost,
            onSetCloudHostName,
            onClose,
            cloudHost,
            cloudHostName,
            theme,
            uiTheme,
            isEmbedded,
            framerate,
            highQualityPen,
            interpolation,
            infiniteClones,
            removeFencing,
            removeLimits,
            warpTimer,
            customStageSize,
            disableCompiler
        } = this.props;

        const {activeTab} = this.state;

        const advancedProps = {
            isEmbedded,
            framerate,
            onFramerateChange: this.handleFramerateChange,
            onCustomizeFramerate: this.handleCustomizeFramerate,
            interpolation,
            onInterpolationChange: this.handleInterpolationChange,
            highQualityPen,
            onHighQualityPenChange: this.handleHighQualityPenChange,
            warpTimer,
            onWarpTimerChange: this.handleWarpTimerChange,
            infiniteClones,
            onInfiniteClonesChange: this.handleInfiniteClonesChange,
            removeFencing,
            onRemoveFencingChange: this.handleRemoveFencingChange,
            removeLimits,
            onRemoveLimitsChange: this.handleRemoveLimitsChange,
            stageWidth: customStageSize.width,
            stageHeight: customStageSize.height,
            customStageSizeEnabled:
                customStageSize.width !== defaultStageSize.width ||
                customStageSize.height !== defaultStageSize.height,
            onStageWidthChange: this.handleStageWidthChange,
            onStageHeightChange: this.handleStageHeightChange,
            disableCompiler,
            onDisableCompilerChange: this.handleDisableCompilerChange,
            onStoreProjectOptions: this.handleStoreProjectOptions
        };

        const title = this.props.intl.formatMessage(messages.settingsTitle);

        return (
            <ThemedWindow
                id="settingsWindow"
                title={title}
                onClose={onClose}
                icon={settingsIcon}
                width={960}
                height={576}
                flushBody
            >
                <div
                    className={classNames(styles.windowShell, {
                        [styles.windowShellLight]: theme.gui === GUI_LIGHT
                    })}
                >
                    <SkyScrollContainer
                        className={classNames(styles.windowSidebar, {
                            [styles.windowSidebarLight]: theme.gui === GUI_LIGHT
                        })}
                        contentGap={14}
                        insetY={8}
                        light={theme.gui === GUI_LIGHT}
                        wrapClassName={styles.windowSidebarWrap}
                    >
                            {/* 独立「账号」设置项：不属于任何分类，置于 General 分类上方 */}
                            <button
                                className={classNames(styles.windowTab, {
                                    [styles.windowTabActive]: activeTab === 'account'
                                })}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={this.handleSelectTab.bind(this, 'account')}
                            >
                                <img
                                    className={styles.windowTabIcon}
                                    src={settingsIcon}
                                    draggable={false}
                                    width={16}
                                    height={16}
                                    alt=""
                                />
                                <FormattedMessage {...messages.accountTab} />
                            </button>
                            {SETTINGS_CATEGORIES.map(category => (
                                <React.Fragment key={category.id}>
                                    <button
                                        className={classNames(styles.windowCategory, {
                                            [styles.windowCategoryExpanded]: !this.state.collapsedCategories[category.id]
                                        })}
                                        onClick={this.handleToggleCategory.bind(this, category.id)}
                                    >
                                        <span className={styles.windowCategoryCaret}>
                                            {'▼'}
                                        </span>
                                        <span className={styles.windowCategoryLabel}>
                                            <FormattedMessage {...category.message} />
                                        </span>
                                    </button>
                                    <div
                                        className={classNames(styles.windowCategoryItems, {
                                            [styles.windowCategoryItemsExpanded]: !this.state.collapsedCategories[category.id]
                                        })}
                                    >
                                        <div className={styles.windowCategoryItemsInner}>
                                    {category.items.map(item => (
                                        <button
                                            key={item.id}
                                            className={classNames(styles.windowTab, {
                                                [styles.windowTabActive]: activeTab === item.id
                                            })}
                                            onClick={this.handleSelectTab.bind(this, item.id)}
                                        >
                                            <img
                                                className={styles.windowTabIcon}
                                                src={item.icon}
                                                draggable={false}
                                                width={16}
                                                height={16}
                                                alt=""
                                            />
                                            <FormattedMessage {...item.message} />
                                        </button>
                                    ))}
                                        </div>
                                    </div>
                                </React.Fragment>
                            ))}
                    </SkyScrollContainer>
                    <div className={styles.windowContent}>
                        {activeTab === 'account' && (
                            <AccountTab intl={this.props.intl} />
                        )}
                        {activeTab === 'language' && (
                            <LanguageTab
                                canChangeLanguage={canChangeLanguage}
                                currentLocale={currentLocale}
                                onChangeLanguage={onChangeLanguage}
                                onClickDesktopSettings={onClickDesktopSettings}
                            />
                        )}
                        {activeTab === 'sky-appearance' && (
                            <PlaceholderTab
                                title={messages.skyAppearanceTab}
                                description={messages.skyAppearancePlaceholder}
                                icon={settingsIcon}
                            />
                        )}
                        {activeTab === 'layout' && (
                            <LayoutTab
                                menuBarPosition={menuBarPosition}
                                onChangeMenuBarPosition={onChangeMenuBarPosition}
                                tabLayout={tabLayout}
                                onChangeTabLayout={onChangeTabLayout}
                                contextMenuStyle={contextMenuStyle}
                                onChangeContextMenuStyle={onChangeContextMenuStyle}
                            />
                        )}
                        {activeTab === 'wallpaper' && (
                            <PlaceholderTab
                                title={messages.wallpaperTab}
                                description={messages.wallpaperPlaceholder}
                                icon={wallpaperIcon}
                            />
                        )}
                        {activeTab === 'font' && (
                            <PlaceholderTab
                                title={messages.fontTab}
                                description={messages.fontPlaceholder}
                                icon={fontIcon}
                            />
                        )}
                        {activeTab === 'loading' && (
                            <PlaceholderTab
                                title={messages.loadingTab}
                                description={messages.loadingPlaceholder}
                                icon={loadingIcon}
                            />
                        )}
                        {activeTab === 'theme' && (
                            <MergedThemeTab
                                canChangeTheme={canChangeTheme}
                                onChangeTheme={onChangeTheme}
                                onChangeUiTheme={onChangeUiTheme}
                                onOpenCustomSettings={onOpenCustomSettings}
                                theme={theme}
                                uiTheme={uiTheme}
                            />
                        )}
                        {activeTab === 'advanced' && (
                            <SettingsModalBody {...advancedProps} />
                        )}
                        {activeTab === 'cloud-server' && (
                            <CloudServerTab
                                cloudHost={cloudHost}
                                cloudHostName={cloudHostName}
                                onSetCloudHost={onSetCloudHost}
                                onSetCloudHostName={onSetCloudHostName}
                            />
                        )}
                        {activeTab === 'advanced-features' && (
                            <AdvancedFeaturesTab
                                audioEditorStyle={audioEditorStyle}
                                onChangeAudioEditorStyle={onChangeAudioEditorStyle}
                            />
                        )}
                        {activeTab === 'keyboard' && (
                            <PlaceholderTab
                                title={messages.keyboardTab}
                                description={messages.keyboardPlaceholder}
                                icon={keyboardIcon}
                            />
                        )}
                    </div>
                </div>
            </ThemedWindow>
        );
    }
}

SettingsWindow.propTypes = {
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    currentLocale: PropTypes.string,
    defaultTab: PropTypes.oneOf(['settings', 'advanced', 'account', 'cloud-server', 'advanced-features']),
    menuBarPosition: PropTypes.string,
    tabLayout: PropTypes.string,
    contextMenuStyle: PropTypes.string,
    audioEditorStyle: PropTypes.string,
    onClickDesktopSettings: PropTypes.func,
    onChangeLanguage: PropTypes.func,
    onChangeMenuBarPosition: PropTypes.func,
    onChangeTabLayout: PropTypes.func,
    onChangeContextMenuStyle: PropTypes.func,
    onChangeAudioEditorStyle: PropTypes.func,
    onChangeTheme: PropTypes.func,
    onChangeUiTheme: PropTypes.func,
    onOpenCustomSettings: PropTypes.func,
    onSetCloudHost: PropTypes.func,
    onSetCloudHostName: PropTypes.func,
    onClose: PropTypes.func,
    theme: PropTypes.instanceOf(Theme),
    uiTheme: PropTypes.string,
    intl: intlShape,
    vm: PropTypes.shape({
        renderer: PropTypes.shape({
            setUseHighQualityRender: PropTypes.func
        }),
        setFramerate: PropTypes.func,
        setCompilerOptions: PropTypes.func,
        setInterpolation: PropTypes.func,
        setRuntimeOptions: PropTypes.func,
        setStageSize: PropTypes.func,
        storeProjectOptions: PropTypes.func
    }),
    isEmbedded: PropTypes.bool,
    cloudHost: PropTypes.string,
    cloudHostName: PropTypes.string,
    framerate: PropTypes.number,
    highQualityPen: PropTypes.bool,
    interpolation: PropTypes.bool,
    infiniteClones: PropTypes.bool,
    removeFencing: PropTypes.bool,
    removeLimits: PropTypes.bool,
    warpTimer: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    disableCompiler: PropTypes.bool
};

const mapStateToProps = state => ({
    currentLocale: state.locales.locale,
    theme: state.scratchGui.theme.theme,
    uiTheme: state.scratchGui.uiTheme,
    menuBarPosition: state.scratchGui.menuBarPosition,
    tabLayout: state.scratchGui.tabLayout,
    contextMenuStyle: state.scratchGui.contextMenuStyle,
    audioEditorStyle: state.scratchGui.audioEditorStyle,
    vm: state.scratchGui.vm,
    isEmbedded: state.scratchGui.mode.isEmbedded,
    cloudHost: state.scratchGui.tw.cloudHost,
    cloudHostName: state.scratchGui.tw.cloudHostName,
    framerate: state.scratchGui.tw.framerate,
    highQualityPen: state.scratchGui.tw.highQualityPen,
    interpolation: state.scratchGui.tw.interpolation,
    infiniteClones: state.scratchGui.tw.runtimeOptions.maxClones === Infinity,
    removeFencing: !state.scratchGui.tw.runtimeOptions.fencing,
    removeLimits: !state.scratchGui.tw.runtimeOptions.miscLimits,
    warpTimer: state.scratchGui.tw.compilerOptions.warpTimer,
    customStageSize: state.scratchGui.customStageSize,
    disableCompiler: !state.scratchGui.tw.compilerOptions.enabled
});

const mapDispatchToProps = dispatch => ({
    onChangeLanguage: locale => {
        dispatch(selectLocale(locale));
    },
    onChangeTheme: theme => {
        dispatch(setTheme(theme));
        persistTheme(theme);
    },
    onChangeUiTheme: themeId => {
        dispatch(setUiTheme(themeId));
        applyUiThemeChrome(themeId);
    },
    onChangeMenuBarPosition: position => {
        dispatch(setMenuBarPosition(position));
        persistMenuBarPosition(position);
    },
    onChangeTabLayout: layout => {
        dispatch(setTabLayout(layout));
        persistTabLayout(layout);
    },
    onChangeContextMenuStyle: style => {
        dispatch(setContextMenuStyle(style));
        persistContextMenuStyle(style);
        applyContextMenuStyle(style);
    },
    onChangeAudioEditorStyle: style => {
        dispatch(setAudioEditorStyle(style));
        persistAudioEditorStyle(style);
    },
    onSetCloudHost: cloudHost => {
        dispatch(setCloudHost(cloudHost));
        localStorage.setItem('sky:cloudHost', cloudHost);
    },
    onSetCloudHostName: name => {
        dispatch(setCloudHostName(name));
        localStorage.setItem('sky:cloudHostName', name);
    }
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(SettingsWindow));
