import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import LanguageMenu from './language-menu.jsx';
import MenuBarMenu from './menu-bar-menu.jsx';
import {MenuSection, MenuItem} from '../menu/menu.jsx';
import MenuLabel from './tw-menu-label.jsx';
import TWAccentThemeMenu from './tw-theme-accent.jsx';
import TWUiThemeMenu from './tw-ui-theme.jsx';
import TWGuiThemeMenu from './tw-theme-gui.jsx';
import TWBlocksThemeMenu from './tw-theme-blocks.jsx';
import TWDesktopSettings from './tw-desktop-settings.jsx';

import menuBarStyles from './menu-bar.css';
import styles from './settings-menu.css';

import dropdownCaret from './dropdown-caret.svg';
import settingsIcon from './icon--settings.svg';

const SettingsMenu = ({
    canChangeLanguage,
    canChangeTheme,
    isRtl,
    onClickDesktopSettings,
    onOpenCustomSettings,
    onOpenSettingsWindow,
    onRequestClose,
    onRequestOpen,
    settingsMenuOpen,
    uiTheme
}) => {
    const titleMessage = (
        <FormattedMessage
            defaultMessage="Settings"
            description="Settings menu"
            id="gui.menuBar.settings"
        />
    );

    if (uiTheme === 'sky-editor') {
        return (
            <div
                className={`${menuBarStyles.menuBarItem} ${menuBarStyles.hoverable}`}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => onOpenSettingsWindow('account')}
            >
                <img
                    src={settingsIcon}
                    draggable={false}
                    width={20}
                    height={20}
                    alt=""
                />
                <span className={menuBarStyles.collapsibleLabel}>{titleMessage}</span>
            </div>
        );
    }

    return (
        <MenuLabel
            open={settingsMenuOpen}
            onOpen={onRequestOpen}
            onClose={onRequestClose}
        >
            <img
                src={settingsIcon}
                draggable={false}
                width={20}
                height={20}
            />
            <span className={styles.dropdownLabel}>{titleMessage}</span>
            <img
                src={dropdownCaret}
                draggable={false}
                width={8}
                height={5}
            />
            <MenuBarMenu
                className={menuBarStyles.menuBarMenu}
                open={settingsMenuOpen}
                place={isRtl ? 'left' : 'right'}
            >
                <MenuSection>
                    {/* SKYEditor 设置窗口入口：官方主题下设置主体仍是官方级联菜单，
                        此处只提供进入 SKYEditor 全套设置（账号 / 布局 / 云服务 / 高级特性等）
                        的入口，打开后由 ThemedWindow 渲染为官方弹窗 + 顶部横标签 */}
                    {onOpenSettingsWindow && (
                        <MenuItem
                            onClick={() => {
                                if (onRequestClose) onRequestClose();
                                onOpenSettingsWindow('account');
                            }}
                        >
                            <div className={styles.option}>
                                <img
                                    src={settingsIcon}
                                    draggable={false}
                                    width={24}
                                    height={24}
                                    alt=""
                                />
                                {titleMessage}
                                {'…'}
                            </div>
                        </MenuItem>
                    )}
                    {canChangeLanguage && <LanguageMenu onRequestCloseSettings={onRequestClose} />}
                    {canChangeTheme && (
                        <React.Fragment>
                            <TWUiThemeMenu />
                            <TWGuiThemeMenu />
                            <TWBlocksThemeMenu
                                onOpenCustomSettings={onOpenCustomSettings}
                            />
                            <TWAccentThemeMenu />
                        </React.Fragment>
                    )}
                    {onClickDesktopSettings && <TWDesktopSettings onClick={onClickDesktopSettings} />}
                </MenuSection>
            </MenuBarMenu>
        </MenuLabel>
    );
};

SettingsMenu.propTypes = {
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    isRtl: PropTypes.bool,
    onClickDesktopSettings: PropTypes.func,
    onOpenCustomSettings: PropTypes.func,
    onOpenSettingsWindow: PropTypes.func,
    onRequestClose: PropTypes.func,
    onRequestOpen: PropTypes.func,
    settingsMenuOpen: PropTypes.bool,
    uiTheme: PropTypes.string
};

export default SettingsMenu;
