import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React, {useEffect, useState} from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
// bilup 主题专属：官方 Bilup 完整布局（镜像自克隆源 E:\秦始皇计划\第三方编辑器临时存放文件\Bilup\scratch-gui）
import BilupGUI from '../../bilup-ui/components/gui/gui.jsx';
import MusicPlayerWindow from '../music-player/music-player-window.jsx';
import SkySpotlightSearch from './sky-spotlight-search.jsx';
import SkyAiWindow from './sky-ai-window.jsx';
import SkyAddonWindowHost from './sky-addon-window-host.jsx';
// SKYEditor：项目资源虚拟文件系统（测试版）—— 中央悬浮按钮 + 文件树窗口
import ProjectFsTestButton from './project-fs/project-fs-test-button.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import BrowserModal from '../browser-modal/browser-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';
import TWUsernameModal from '../../containers/tw-username-modal.jsx';
import TWSettingsModal from '../../containers/tw-settings-modal.jsx';
import TWSecurityManager from '../../containers/tw-security-manager.jsx';
import TWCustomExtensionModal from '../../containers/tw-custom-extension-modal.jsx';
import TWRestorePointManager from '../../containers/tw-restore-point-manager.jsx';
import TWFontsModal from '../../containers/tw-fonts-modal.jsx';
import TWUnknownPlatformModal from '../../containers/tw-unknown-platform-modal.jsx';
import TWInvalidProjectModal from '../../containers/tw-invalid-project-modal.jsx';

import {STAGE_SIZE_MODES, FIXED_WIDTH, UNCONSTRAINED_NON_STAGE_WIDTH} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';
import {Theme} from '../../lib/themes';

import {isRendererSupported, isBrowserSupported} from '../../lib/tw-environment-support-prober';

import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from '!../../lib/tw-recolor/build!./icon--code.svg';
import costumesIcon from '!../../lib/tw-recolor/build!./icon--costumes.svg';
import soundsIcon from '!../../lib/tw-recolor/build!./icon--sounds.svg';
import variablesIcon from '!../../lib/tw-recolor/build!./icon--variables.svg';
import remoteCoopIcon from '!../../lib/tw-recolor/build!./icon--remote-coop.svg';
import searchIcon from '../action-menu/icon--search.svg';
import skyAiIcon from './icon--sky-ai.svg';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

const getFullscreenBackgroundColor = () => {
    const params = new URLSearchParams(location.search);
    if (params.has('fullscreen-background')) {
        return params.get('fullscreen-background');
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return '#111';
    }
    return 'white';
};

const fullscreenBackgroundColor = getFullscreenBackgroundColor();

const GUIComponent = props => {
    const [skySearchOpen, setSkySearchOpen] = useState(false);
    // SKYEditor：SKY Agent 窗口开关（点击侧边栏「AI」标签打开，再次点击或点关闭按钮关闭）
    const [aiWindowOpen, setAiWindowOpen] = useState(false);

    // SKYEditor：顶部下滑式积木搜索面板的打开入口。
    // 1) find-bar 插件拦截到 Ctrl+F 后派发 sky-open-search-window 事件；
    // 2) 插件被禁用时由下面的 keydown 兜底监听到 Ctrl+F；
    // 3) 竖向侧边栏搜索标签同样走 setSkySearchOpen。
    useEffect(() => {
        const handleSkyOpenSearch = () => {
            setSkySearchOpen(true);
        };
        const handleSkySearchShortcut = e => {
            // find-bar 已经处理过（preventDefault）就不再重复打开
            if (e.defaultPrevented) return;
            if (e.shiftKey || e.altKey) return;
            if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setSkySearchOpen(true);
            }
        };
        document.addEventListener('sky-open-search-window', handleSkyOpenSearch);
        window.addEventListener('keydown', handleSkySearchShortcut, true);
        return () => {
            document.removeEventListener('sky-open-search-window', handleSkyOpenSearch);
            window.removeEventListener('keydown', handleSkySearchShortcut, true);
        };
    }, []);

    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        customStageSize,
        enableCommunity,
        intl,
        isCreating,
        isEmbedded,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isWindowFullScreen,
        isTelemetryEnabled,
        isTotallyNormal,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onClickAddonSettings,
        onClickDesktopSettings,
        onClickNewWindow,
        onClickPackager,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickLogo,
        onExtensionButtonClick,
        onOpenCustomExtensionModal,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        securityManager,
        showComingSoon,
        showOpenFilePicker,
        showSaveFilePicker,
        soundsTabVisible,
        stageSizeMode,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        usernameModalVisible,
        settingsModalVisible,
        customExtensionModalVisible,
        fontsModalVisible,
        unknownPlatformModalVisible,
        invalidProjectModalVisible,
        uiTheme,
        tabLayout,
        vm,
        ...componentProps
    } = omit(props, 'dispatch');
    if (uiTheme === 'bilup') {
        // 官方 Bilup 完整布局：菜单栏/舞台区/角色面板/状态栏/水印全部照抄克隆源
        // 必须透传 vm，否则 bilup-ui 的 Stage 等容器读 this.props.vm.renderer 时
        // vm 为 undefined，直接抛 "Cannot read properties of undefined (reading 'renderer')"
        return <BilupGUI vm={vm} />;
    }
    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    const isSkyVertical = uiTheme === 'sky-editor' && tabLayout === 'vertical';

    // SKYEditor 竖向标签栏：图标使用 mask 渲染，颜色跟随主题明暗（--text-primary），
    // 深色主题=白色图标，浅色主题=深色图标。
    const renderSkyTabIcon = iconSrc => (
        isSkyVertical ? (
            <span
                className={styles.skyTabIcon}
                style={{
                    WebkitMaskImage: `url("${iconSrc}")`,
                    maskImage: `url("${iconSrc}")`
                }}
            />
        ) : (
            <img
                draggable={false}
                src={iconSrc}
            />
        )
    );

    // SKYEditor：竖向/横向标签栏通用的「附加动作标签」（如搜索按钮）。
    // 这类标签没有自己的面板，点击后执行任意动作（打开独立窗口/执行命令）。
    // 只需要在这里写好这一个渲染模板，横向与竖向两种标签栏就会自动适配：
    // —— 布局（横排/竖排、尺寸、圆角、图标形式）全部由 CSS 类决定，组件层
    //    不再关心 tabLayout；
    // —— 新增一个这样的按钮，只需照抄一行 renderSkyActionTab({...})，无需
    //    再写任何布局分支。统一标记（.sky-tab）与调用方式见文档
    //    《SKYEditor-标签栏统一调用指南》（E:\秦始皇计划\SKY Editor\文档\）。
    const renderSkyActionTab = ({key, icon, title, label, onClick, className}) => (
        <button
            key={key}
            type="button"
            className={classNames(tabClassNames.tab, className)}
            title={title}
            onClick={onClick}
        >
            {renderSkyTabIcon(icon)}
            {label}
        </button>
    );

    // SKYEditor：竖向/横向标签栏通用的「内容型标签」快捷入口。
    // 内容型标签 = 原生 <Tab>，自带对应的标签面板（TabPanel），在两类布局下
    // 都能正常切换面板，无需额外适配；示例见《SKYEditor-标签栏统一调用指南》
    // 文档中的"变量标签"。
    const renderSkyContentTab = ({key, icon, label, className}) => (
        <Tab
            key={key}
            className={classNames(tabClassNames.tab, className)}
        >
            {renderSkyTabIcon(icon)}
            {label}
        </Tab>
    );

    const tabClassNames = {
        tabs: classNames(
            styles.tabs,
            isSkyVertical ? styles.tabsSkySidebar : null
        ),
        tab: classNames(tabStyles.reactTabsTab, styles.tab, 'sky-tab'),
        tabList: classNames(
            tabStyles.reactTabsTabList,
            styles.tabList,
            uiTheme === 'sky-editor' && tabLayout === 'vertical' ? styles.tabListSkySidebar : null
        ),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    const unconstrainedWidth = (
        UNCONSTRAINED_NON_STAGE_WIDTH +
        FIXED_WIDTH +
        Math.max(0, customStageSize.width - FIXED_WIDTH)
    );

    // SKYEditor 竖向侧边栏：搜索标签。点击打开顶部下滑式积木搜索面板。
    const handleSkySidebarSearch = () => {
        setSkySearchOpen(true);
    };

    // SKYEditor 竖向侧边栏：SKY Agent 标签。点击打开 SKY Agent 窗口（再次点击标签则关闭）。
    const handleSkySidebarAi = () => {
        setAiWindowOpen(open => !open);
    };

    return (<MediaQuery minWidth={unconstrainedWidth}>{isUnconstrained => {
        const stageSize = resolveStageSize(stageSizeMode, isUnconstrained);

        const alwaysEnabledModals = (
            <React.Fragment>
                <TWSecurityManager securityManager={securityManager} />
                <TWRestorePointManager />
                {usernameModalVisible && <TWUsernameModal />}
                {settingsModalVisible && <TWSettingsModal />}
                {customExtensionModalVisible && <TWCustomExtensionModal />}
                {fontsModalVisible && <TWFontsModal />}
                {unknownPlatformModalVisible && <TWUnknownPlatformModal />}
                {invalidProjectModalVisible && <TWInvalidProjectModal />}
            </React.Fragment>
        );

        return isPlayerOnly ? (
            <React.Fragment>
                {/* TW: When the window is fullscreen, use an element to display the background color */}
                {/* The default color for transparency is inconsistent between browsers and there isn't an existing */}
                {/* element for us to style that fills the entire screen. */}
                {isWindowFullScreen ? (
                    <div
                        className={styles.fullscreenBackground}
                        style={{
                            backgroundColor: fullscreenBackgroundColor
                        }}
                    />
                ) : null}
                <StageWrapper
                    isFullScreen={isFullScreen}
                    isEmbedded={isEmbedded}
                    isRendererSupported={isRendererSupported()}
                    isRtl={isRtl}
                    loading={loading}
                    stageSize={STAGE_SIZE_MODES.full}
                    vm={vm}
                >
                    {alertsVisible ? (
                        <Alerts className={styles.alertsContainer} />
                    ) : null}
                </StageWrapper>
                {alwaysEnabledModals}
            </React.Fragment>
        ) : (
            <Box
                className={styles.pageWrapper}
                dir={isRtl ? 'rtl' : 'ltr'}
                style={{
                    minWidth: 1024 + Math.max(0, customStageSize.width - 480),
                    minHeight: 640 + Math.max(0, customStageSize.height - 360)
                }}
                {...componentProps}
            >
                {alwaysEnabledModals}
                {telemetryModalVisible ? (
                    <TelemetryModal
                        isRtl={isRtl}
                        isTelemetryEnabled={isTelemetryEnabled}
                        onCancel={onTelemetryModalCancel}
                        onOptIn={onTelemetryModalOptIn}
                        onOptOut={onTelemetryModalOptOut}
                        onRequestClose={onRequestCloseTelemetryModal}
                        onShowPrivacyPolicy={onShowPrivacyPolicy}
                    />
                ) : null}
                {loading ? (
                    <Loader isFullScreen />
                ) : null}
                {isCreating ? (
                    <Loader
                        isFullScreen
                        messageId="gui.loader.creating"
                    />
                ) : null}
                {isBrowserSupported() ? null : (
                    <BrowserModal
                        isRtl={isRtl}
                        onClickDesktopSettings={onClickDesktopSettings}
                    />
                )}
                {tipsLibraryVisible ? (
                    <TipsLibrary />
                ) : null}
                {cardsVisible ? (
                    <Cards />
                ) : null}
                {alertsVisible ? (
                    <Alerts className={styles.alertsContainer} />
                ) : null}
                {connectionModalVisible ? (
                    <ConnectionModal
                        vm={vm}
                    />
                ) : null}
                {costumeLibraryVisible ? (
                    <CostumeLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseCostumeLibrary}
                    />
                ) : null}
                {backdropLibraryVisible ? (
                    <BackdropLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseBackdropLibrary}
                    />
                ) : null}
                <MenuBar
                    accountNavOpen={accountNavOpen}
                    authorId={authorId}
                    authorThumbnailUrl={authorThumbnailUrl}
                    authorUsername={authorUsername}
                    canChangeLanguage={canChangeLanguage}
                    canChangeTheme={canChangeTheme}
                    canCreateCopy={canCreateCopy}
                    canCreateNew={canCreateNew}
                    canEditTitle={canEditTitle}
                    canManageFiles={canManageFiles}
                    canRemix={canRemix}
                    canSave={canSave}
                    canShare={canShare}
                    className={styles.menuBarPosition}
                    enableCommunity={enableCommunity}
                    isShared={isShared}
                    isTotallyNormal={isTotallyNormal}
                    logo={logo}
                    renderLogin={renderLogin}
                    showComingSoon={showComingSoon}
                    showOpenFilePicker={showOpenFilePicker}
                    showSaveFilePicker={showSaveFilePicker}
                    onClickAbout={onClickAbout}
                    onClickAccountNav={onClickAccountNav}
                    onClickAddonSettings={onClickAddonSettings}
                    onClickDesktopSettings={onClickDesktopSettings}
                    onClickNewWindow={onClickNewWindow}
                    onClickPackager={onClickPackager}
                    onClickLogo={onClickLogo}
                    onCloseAccountNav={onCloseAccountNav}
                    onLogOut={onLogOut}
                    onOpenRegistration={onOpenRegistration}
                    onProjectTelemetryEvent={onProjectTelemetryEvent}
                    onSeeCommunity={onSeeCommunity}
                    onShare={onShare}
                    onStartSelectingFileUpload={onStartSelectingFileUpload}
                    onToggleLoginOpen={onToggleLoginOpen}
                />
                <Box className={styles.bodyWrapper}>
                    <Box className={styles.flexWrapper}>
                        <Box className={styles.editorWrapper}>
                            <Tabs
                                forceRenderTabPanel
                                className={tabClassNames.tabs}
                                selectedIndex={activeTabIndex}
                                selectedTabClassName={tabClassNames.tabSelected}
                                selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                                onSelect={onActivateTab}
                            >
                                <TabList className={tabClassNames.tabList}>
                                    <Tab className={tabClassNames.tab}>
                                        {renderSkyTabIcon(codeIcon())}
                                        <FormattedMessage
                                            defaultMessage="Code"
                                            description="Button to get to the code panel"
                                            id="gui.gui.codeTab"
                                        />
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        onClick={onActivateCostumesTab}
                                    >
                                        {renderSkyTabIcon(costumesIcon())}
                                        {targetIsStage ? (
                                            <FormattedMessage
                                                defaultMessage="Backdrops"
                                                description="Button to get to the backdrops panel"
                                                id="gui.gui.backdropsTab"
                                            />
                                        ) : (
                                            <FormattedMessage
                                                defaultMessage="Costumes"
                                                description="Button to get to the costumes panel"
                                                id="gui.gui.costumesTab"
                                            />
                                        )}
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        onClick={onActivateSoundsTab}
                                    >
                                        {renderSkyTabIcon(soundsIcon())}
                                        <FormattedMessage
                                            defaultMessage="Sounds"
                                            description="Button to get to the sounds panel"
                                            id="gui.gui.soundsTab"
                                        />
                                    </Tab>
                                    {(uiTheme === 'sky-editor') && renderSkyContentTab({
                                        key: 'sky-remote-coop-tab',
                                        icon: remoteCoopIcon(),
                                        label: (
                                            <FormattedMessage
                                                defaultMessage="Remote Coop"
                                                description="Button to get to the remote cooperation panel"
                                                id="gui.gui.remoteCoopTab"
                                            />
                                        )
                                    })}
                                    {(uiTheme === 'sky-editor') && renderSkyContentTab({
                                        key: 'sky-variables-tab',
                                        icon: variablesIcon(),
                                        label: (
                                            <FormattedMessage
                                                defaultMessage="Variables"
                                                description="Button to get to the variables manager panel"
                                                id="gui.gui.variablesTab"
                                            />
                                        )
                                    })}
                                    {(uiTheme === 'sky-editor' && tabLayout === 'vertical') && renderSkyActionTab({
                                        key: 'sky-search-tab',
                                        icon: searchIcon,
                                        title: intl.formatMessage({id: 'gui.gui.searchTab', defaultMessage: '搜索'}),
                                        label: (
                                            <FormattedMessage
                                                defaultMessage="搜索"
                                                description="Button to open the search window"
                                                id="gui.gui.searchTab"
                                            />
                                        ),
                                        onClick: handleSkySidebarSearch
                                    })}
                                    {(uiTheme === 'sky-editor' && tabLayout === 'vertical') && renderSkyActionTab({
                                        key: 'sky-ai-tab',
                                        icon: skyAiIcon,
                                        title: intl.formatMessage({id: 'gui.gui.aiTab', defaultMessage: 'SKY Agent'}),
                                        label: (
                                            <FormattedMessage
                                                defaultMessage="SKY Agent"
                                                description="Button to open the AI assistant window"
                                                id="gui.gui.aiTab"
                                            />
                                        ),
                                        onClick: handleSkySidebarAi
                                    })}
                                </TabList>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    <Box className={styles.blocksWrapper}>
                                        <Blocks
                                            key={`${blocksId}/${theme.id}`}
                                            canUseCloud={canUseCloud}
                                            grow={1}
                                            isVisible={blocksTabVisible}
                                            options={{
                                                media: `${basePath}static/${theme.getBlocksMediaFolder()}/`
                                            }}
                                            stageSize={stageSize}
                                            onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                                            theme={theme}
                                            vm={vm}
                                        />
                                    </Box>
                                    <Box className={styles.extensionButtonContainer}>
                                        <button
                                            className={styles.extensionButton}
                                            title={intl.formatMessage(messages.addExtension)}
                                            onClick={onExtensionButtonClick}
                                        >
                                            <img
                                                className={styles.extensionButtonIcon}
                                                draggable={false}
                                                src={addExtensionIcon}
                                            />
                                        </button>
                                    </Box>
                                    <Box className={styles.watermark}>
                                        <Watermark />
                                    </Box>
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {costumesTabVisible ? <CostumeTab
                                        vm={vm}
                                    /> : null}
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                                </TabPanel>
                                {(uiTheme === 'sky-editor') && (
                                    <TabPanel className={classNames(tabClassNames.tabPanel, styles.skyRemoteCoopPanel)}>
                                        {/* 远程协作面板：内容由 remote-cooperation addon 注入到该容器 */}
                                    </TabPanel>
                                )}
                                {(uiTheme === 'sky-editor') && (
                                    <TabPanel className={classNames(tabClassNames.tabPanel, styles.skyVariablePanel)}>
                                        {/* 变量管理面板：内容由 variable-manager 插件注入到该容器 */}
                                    </TabPanel>
                                )}
                            </Tabs>
                            {backpackVisible ? (
                                <Backpack host={backpackHost} />
                            ) : null}
                        </Box>

                        <Box className={classNames(styles.stageAndTargetWrapper, styles[stageSize])}>
                            <StageWrapper
                                isFullScreen={isFullScreen}
                                isRendererSupported={isRendererSupported()}
                                isRtl={isRtl}
                                stageSize={stageSize}
                                vm={vm}
                            />
                            {/* SKYEditor：项目资源虚拟文件系统测试入口（仅新增浮层，不改动角色区） */}
                            <ProjectFsTestButton vm={vm} />
                            <Box className={styles.targetWrapper}>
                                <TargetPane
                                    stageSize={stageSize}
                                    vm={vm}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Box>
                <DragLayer />
                <MusicPlayerWindow />
                {skySearchOpen && (
                    <SkySpotlightSearch onClose={() => setSkySearchOpen(false)} />
                )}
                {aiWindowOpen && (
                    <SkyAiWindow vm={vm} onClose={() => setAiWindowOpen(false)} />
                )}
                {/* SKYEditor：addon 窗口（调试器等）交给 React 主体系 Win11Window 渲染 */}
                <SkyAddonWindowHost />
            </Box>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isWindowFullScreen: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickPackager: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    securityManager: PropTypes.shape({}),
    showComingSoon: PropTypes.bool,
    showOpenFilePicker: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.instanceOf(Theme),
    uiTheme: PropTypes.string,
    tabLayout: PropTypes.string,
    tipsLibraryVisible: PropTypes.bool,
    usernameModalVisible: PropTypes.bool,
    settingsModalVisible: PropTypes.bool,
    customExtensionModalVisible: PropTypes.bool,
    fontsModalVisible: PropTypes.bool,
    unknownPlatformModalVisible: PropTypes.bool,
    invalidProjectModalVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    customStageSize: state.scratchGui.customStageSize,
    isWindowFullScreen: state.scratchGui.tw.isWindowFullScreen,
    // This is the button's mode, as opposed to the actual current state
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme,
    uiTheme: state.scratchGui.uiTheme,
    tabLayout: state.scratchGui.tabLayout
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));
