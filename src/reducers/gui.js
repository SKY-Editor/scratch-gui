import {applyMiddleware, compose, combineReducers} from 'redux';
import alertsReducer, {alertsInitialState} from './alerts';
import assetDragReducer, {assetDragInitialState} from './asset-drag';
import cardsReducer, {cardsInitialState} from './cards';
import colorPickerReducer, {colorPickerInitialState} from './color-picker';
import connectionModalReducer, {connectionModalInitialState} from './connection-modal';
import customProceduresReducer, {customProceduresInitialState} from './custom-procedures';
import blockDragReducer, {blockDragInitialState} from './block-drag';
import editorTabReducer, {editorTabInitialState} from './editor-tab';
import hoveredTargetReducer, {hoveredTargetInitialState} from './hovered-target';
import menuReducer, {menuInitialState} from './menus';
import micIndicatorReducer, {micIndicatorInitialState} from './mic-indicator';
import modalReducer, {modalsInitialState} from './modals';
import modeReducer, {modeInitialState} from './mode';
import monitorReducer, {monitorsInitialState} from './monitors';
import monitorLayoutReducer, {monitorLayoutInitialState} from './monitor-layout';
import projectChangedReducer, {projectChangedInitialState} from './project-changed';
import projectStateReducer, {projectStateInitialState} from './project-state';
import projectTitleReducer, {projectTitleInitialState} from './project-title';
import fontsLoadedReducer, {fontsLoadedInitialState} from './fonts-loaded';
import restoreDeletionReducer, {restoreDeletionInitialState} from './restore-deletion';
import stageSizeReducer, {stageSizeInitialState} from './stage-size';
import targetReducer, {targetsInitialState} from './targets';
import themeReducer, {themeInitialState} from './theme';
import uiThemeReducer, {uiThemeInitialState} from '../Theme/public/ui-theme-reducer.js';
import menuBarPositionReducer, {menuBarPositionInitialState} from './menu-bar-position';
import tabLayoutReducer, {tabLayoutInitialState} from './tab-layout';
import contextMenuStyleReducer, {contextMenuStyleInitialState} from './context-menu-style';
import audioEditorStyleReducer, {audioEditorStyleInitialState} from './audio-editor-style';
import musicPlayerReducer, {musicPlayerInitialState} from './music-player';
import timeoutReducer, {timeoutInitialState} from './timeout';
import timeTravelReducer, {timeTravelInitialState} from './time-travel';
import toolboxReducer, {toolboxInitialState} from './toolbox';
import twReducer, {twInitialState} from './tw';
import customStageSizeReducer, {customStageSizeInitialState} from './custom-stage-size';
import vmReducer, {vmInitialState} from './vm';
import vmStatusReducer, {vmStatusInitialState} from './vm-status';
import bilupReducer from '../Theme/bilup/bilup-reducer.js';
import workspaceMetricsReducer, {workspaceMetricsInitialState} from './workspace-metrics';
// --- bilup-ui 官方布局专属 slices（bilup 主题切换后由官方组件读取；非 bilup 主题零影响）---
import collaborationReducer, {collaborationInitialState} from '../bilup-ui/reducers/collaboration.js';
import mwProjectThemeReducer, {mwProjectThemeInitialState} from '../bilup-ui/reducers/mw-project-theme.js';
import roturReducer, {roturInitialState} from '../bilup-ui/reducers/rotur.js';
import shortcutsReducer, {shortcutsInitialState} from '../bilup-ui/reducers/shortcuts.js';
import toastReducer, {toastInitialState} from '../bilup-ui/reducers/toast.js';
import bilupThemeReducer, {themeInitialState as bilupThemeInitialState} from '../bilup-ui/reducers/theme.js';
import throttle from 'redux-throttle';

import decks from '../lib/libraries/decks/index.jsx';

const guiMiddleware = compose(applyMiddleware(throttle(300, {leading: true, trailing: true})));

const guiInitialState = {
    alerts: alertsInitialState,
    assetDrag: assetDragInitialState,
    blockDrag: blockDragInitialState,
    cards: cardsInitialState,
    colorPicker: colorPickerInitialState,
    connectionModal: connectionModalInitialState,
    customStageSize: customStageSizeInitialState,
    customProcedures: customProceduresInitialState,
    editorTab: editorTabInitialState,
    mode: modeInitialState,
    hoveredTarget: hoveredTargetInitialState,
    stageSize: stageSizeInitialState,
    menus: menuInitialState,
    micIndicator: micIndicatorInitialState,
    modals: modalsInitialState,
    monitors: monitorsInitialState,
    monitorLayout: monitorLayoutInitialState,
    projectChanged: projectChangedInitialState,
    projectState: projectStateInitialState,
    projectTitle: projectTitleInitialState,
    fontsLoaded: fontsLoadedInitialState,
    restoreDeletion: restoreDeletionInitialState,
    targets: targetsInitialState,
    theme: themeInitialState,
    uiTheme: uiThemeInitialState,
    menuBarPosition: menuBarPositionInitialState,
    tabLayout: tabLayoutInitialState,
    contextMenuStyle: contextMenuStyleInitialState,
    audioEditorStyle: audioEditorStyleInitialState,
    musicPlayer: musicPlayerInitialState,
    timeout: timeoutInitialState,
    timeTravel: timeTravelInitialState,
    toolbox: toolboxInitialState,
    tw: twInitialState,
    vm: vmInitialState,
    vmStatus: vmStatusInitialState,
    workspaceMetrics: workspaceMetricsInitialState,
    collaboration: collaborationInitialState,
    mwProjectTheme: mwProjectThemeInitialState,
    rotur: roturInitialState,
    shortcuts: shortcutsInitialState,
    toast: toastInitialState,
    bilupTheme: bilupThemeInitialState
};

const initPlayer = function (currentState) {
    return Object.assign(
        {},
        currentState,
        {mode: {
            isEmbedded: false,
            isFullScreen: currentState.mode.isFullScreen,
            isPlayerOnly: true,
            // When initializing in player mode, make sure to reset
            // hasEverEnteredEditorMode
            hasEverEnteredEditor: false
        }}
    );
};
const initFullScreen = function (currentState) {
    return Object.assign(
        {},
        currentState,
        {mode: {
            isEmbedded: false,
            isFullScreen: true,
            isPlayerOnly: currentState.mode.isPlayerOnly,
            hasEverEnteredEditor: currentState.mode.hasEverEnteredEditor
        }}
    );
};

const initEmbedded = function (currentState) {
    return Object.assign(
        {},
        currentState,
        {mode: {
            isEmbedded: true,
            // tw: embed does not need isFullScreen anymore
            isFullScreen: false,
            isPlayerOnly: true,
            hasEverEnteredEditor: false
        }}
    );
};

const initTutorialCard = function (currentState, deckId) {
    return Object.assign(
        {},
        currentState,
        {
            cards: {
                visible: true,
                content: decks,
                activeDeckId: deckId,
                expanded: true,
                step: 0,
                x: 0,
                y: 0,
                dragging: false
            }
        }
    );
};

const initTelemetryModal = function (currentState) {
    return Object.assign(
        {},
        currentState,
        {
            modals: {
                telemetryModal: true // this key must match `MODAL_TELEMETRY` in modals.js
            }
        }
    );
};

const guiReducer = combineReducers({
    alerts: alertsReducer,
    assetDrag: assetDragReducer,
    blockDrag: blockDragReducer,
    cards: cardsReducer,
    colorPicker: colorPickerReducer,
    connectionModal: connectionModalReducer,
    customStageSize: customStageSizeReducer,
    customProcedures: customProceduresReducer,
    editorTab: editorTabReducer,
    mode: modeReducer,
    hoveredTarget: hoveredTargetReducer,
    stageSize: stageSizeReducer,
    menus: menuReducer,
    micIndicator: micIndicatorReducer,
    modals: modalReducer,
    monitors: monitorReducer,
    monitorLayout: monitorLayoutReducer,
    projectChanged: projectChangedReducer,
    projectState: projectStateReducer,
    projectTitle: projectTitleReducer,
    fontsLoaded: fontsLoadedReducer,
    restoreDeletion: restoreDeletionReducer,
    targets: targetReducer,
    theme: themeReducer,
    uiTheme: uiThemeReducer,
    menuBarPosition: menuBarPositionReducer,
    tabLayout: tabLayoutReducer,
    contextMenuStyle: contextMenuStyleReducer,
    audioEditorStyle: audioEditorStyleReducer,
    musicPlayer: musicPlayerReducer,
    timeout: timeoutReducer,
    timeTravel: timeTravelReducer,
    toolbox: toolboxReducer,
    tw: twReducer,
    vm: vmReducer,
    vmStatus: vmStatusReducer,
    bilup: bilupReducer,
    workspaceMetrics: workspaceMetricsReducer,
    collaboration: collaborationReducer,
    mwProjectTheme: mwProjectThemeReducer,
    rotur: roturReducer,
    shortcuts: shortcutsReducer,
    toast: toastReducer,
    bilupTheme: bilupThemeReducer
});

export {
    guiReducer as default,
    guiInitialState,
    guiMiddleware,
    initEmbedded,
    initFullScreen,
    initPlayer,
    initTelemetryModal,
    initTutorialCard
};
