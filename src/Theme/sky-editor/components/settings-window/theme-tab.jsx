/**
 * ThemeTab —— 设置窗口页面（theme-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {ThemeColorIcon, Check} from './settings-widgets';
import {GUI_DARK, GUI_LIGHT, Theme} from '../../../../lib/themes/index.js';
import {THEME_PRESETS} from '../../../../lib/themes/presets.js';
import check from '../../../../components/menu-bar/check.svg';
import lightModeIcon from '../../../../components/menu-bar/tw-sun.svg';
import darkModeIcon from '../../../../components/menu-bar/tw-moon.svg';


const ThemeTab = ({
    canChangeTheme,
    onChangeTheme,
    onChangeUiTheme,
    theme,
    uiTheme
}) => (
    <div className={styles.windowSettings}>
        {canChangeTheme && (
            <React.Fragment>
                {THEME_PRESETS.map(preset => (
                    <div
                        key={preset.id}
                        className={styles.windowOption}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => onChangeUiTheme(preset.id)}
                    >
                        <Check selected={uiTheme === preset.id} />
                        <ThemeColorIcon color={preset.iconColor} />
                        <span>{preset.name}</span>
                    </div>
                ))}
                <div
                    className={styles.windowOption}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => onChangeTheme(theme.set('gui', theme.gui === GUI_DARK ? GUI_LIGHT : GUI_DARK))}
                >
                    <Check selected={false} />
                    <img
                        src={theme.gui === GUI_DARK ? lightModeIcon : darkModeIcon}
                        draggable={false}
                        width={24}
                        height={24}
                        alt=""
                    />
                    <span>
                        {theme.gui === GUI_DARK ? (
                            <FormattedMessage
                                defaultMessage="Switch To Light Mode"
                                description="Menu item to change color scheme to light (it is currently dark)"
                                id="tw.darkMode"
                            />
                        ) : (
                            <FormattedMessage
                                defaultMessage="Switch To Dark Mode"
                                description="Menu item to change color scheme to dark (it is currently light)"
                                id="tw.lightMode"
                            />
                        )}
                    </span>
                </div>
            </React.Fragment>
        )}
    </div>
);

ThemeTab.propTypes = {
    canChangeTheme: PropTypes.bool,
    onChangeTheme: PropTypes.func,
    onChangeUiTheme: PropTypes.func,
    theme: PropTypes.instanceOf(Theme),
    uiTheme: PropTypes.string
};

export {ThemeTab};
