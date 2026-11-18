/**
 * MergedThemeTab —— 设置窗口页面（merged-theme-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React, {useState, useEffect, useRef} from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {messages, blockOptions, blockIcons, menuBarThemeOptions, windowTabBarThemeOptions} from './settings-messages';
import {SquareColorIcon, Check, ThemeCard} from './settings-widgets';
import {WINDOW_TAB_BAR_THEME_THEMED, WINDOW_TAB_BAR_THEME_WHITE, detectWindowTabBarTheme, persistWindowTabBarTheme, MENU_BAR_THEME_THEMED, MENU_BAR_THEME_PLAIN, detectMenuBarTheme, persistMenuBarTheme} from '../../../../lib/sky-settings-store.js';
import {GUI_DARK, GUI_LIGHT, BLOCKS_CUSTOM, BLOCKS_DARK, BLOCKS_HIGH_CONTRAST, BLOCKS_THREE, Theme} from '../../../../lib/themes/index.js';
import {THEME_PRESETS} from '../../../../lib/themes/presets.js';
import {accentOptions, ColorIcon} from '../../../../lib/themes/accent-options.jsx';
import {SkyDropdownMenu} from '../../../../components/sky-popover/sky-popover.jsx';
import check from '../../../../components/menu-bar/check.svg';
import threeIcon from '../../../../components/menu-bar/tw-blocks-three.svg';
import lightModeIcon from '../../../../components/menu-bar/tw-sun.svg';
import darkModeIcon from '../../../../components/menu-bar/tw-moon.svg';
import themePaletteIcon from '../../../../components/menu-bar/tw-theme-palette.svg';
import openLinkIcon from '../../../../components/menu-bar/tw-open-link.svg';
import rainbowIcon from '../../../../components/menu-bar/tw-accent-rainbow.svg';
import menuBarIcon from '../../../../components/menu-bar/tw-menu-bar.svg';
import tabsIcon from '../../../../components/menu-bar/tw-tabs.svg';


const MergedThemeTab = ({
    canChangeTheme,
    onChangeTheme,
    onChangeUiTheme,
    onOpenCustomSettings,
    theme,
    uiTheme
}) => {
    const [accentMenuOpen, setAccentMenuOpen] = useState(false);
    const accentMenuRef = useRef(null);
    const [tabBarThemeMenuOpen, setTabBarThemeMenuOpen] = useState(false);
    const tabBarThemeMenuRef = useRef(null);
    // 主题色窗口标签栏：读 localStorage 初始化，改动即持久化并立刻生效
    const [windowTabBarTheme, setWindowTabBarThemeState] = useState(() => detectWindowTabBarTheme());
    // 编辑器菜单栏（顶栏）主题色：独立的一条设置，与上面窗口标签栏互不影响
    const [menuBarThemeMenuOpen, setMenuBarThemeMenuOpen] = useState(false);
    const menuBarThemeMenuRef = useRef(null);
    const [menuBarTheme, setMenuBarThemeState] = useState(() => detectMenuBarTheme());

    useEffect(() => {
        if (!accentMenuOpen) return undefined;
        const handleMouseDown = e => {
            if (accentMenuRef.current && !accentMenuRef.current.contains(e.target)) {
                setAccentMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [accentMenuOpen]);

    useEffect(() => {
        if (!tabBarThemeMenuOpen) return;
        const handleMouseDown = e => {
            if (tabBarThemeMenuRef.current && !tabBarThemeMenuRef.current.contains(e.target)) {
                setTabBarThemeMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [tabBarThemeMenuOpen]);

    useEffect(() => {
        if (!menuBarThemeMenuOpen) return;
        const handleMouseDown = e => {
            if (menuBarThemeMenuRef.current && !menuBarThemeMenuRef.current.contains(e.target)) {
                setMenuBarThemeMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [menuBarThemeMenuOpen]);

    const handleWindowTabBarThemeChange = value => {
        setWindowTabBarThemeState(value);
        persistWindowTabBarTheme(value);
    };

    const handleMenuBarThemeChange = value => {
        setMenuBarThemeState(value);
        persistMenuBarTheme(value);
    };

    const menuBarThemeOptionsList = [
        {id: MENU_BAR_THEME_THEMED, message: menuBarThemeOptions.themed},
        {id: MENU_BAR_THEME_PLAIN, message: menuBarThemeOptions.plain}
    ];
    const currentMenuBarTheme = menuBarThemeOptionsList.find(
        o => o.id === menuBarTheme
    ) || menuBarThemeOptionsList[0];

    const windowTabBarThemeOptionsList = [
        {id: WINDOW_TAB_BAR_THEME_THEMED, message: windowTabBarThemeOptions.themed},
        {id: WINDOW_TAB_BAR_THEME_WHITE, message: windowTabBarThemeOptions.white}
    ];
    const currentWindowTabBarTheme = windowTabBarThemeOptionsList.find(
        o => o.id === windowTabBarTheme
    ) || windowTabBarThemeOptionsList[0];

    const currentAccent = accentOptions[theme.accent] ?
        <FormattedMessage {...accentOptions[theme.accent]} /> :
        theme.accent;

    return (
        <div className={styles.windowSettings}>
            {canChangeTheme && (
                <React.Fragment>
                    <div className={styles.windowSectionHeader}>
                        <img
                            className={styles.windowTabIcon}
                            src={rainbowIcon}
                            draggable={false}
                            width={16}
                            height={16}
                            alt=""
                        />
                        <FormattedMessage {...messages.accentTab} />
                        <div className={styles.windowSectionDivider} />
                    </div>
                    <div
                        ref={accentMenuRef}
                        className={styles.languageDropdown}
                    >
                        <button
                            className={styles.languageDropdownButton}
                            onClick={() => setAccentMenuOpen(open => !open)}
                        >
                            <span>{currentAccent}</span>
                            <span
                                className={classNames(styles.languageDropdownCaret, {
                                    [styles.languageDropdownCaretOpen]: accentMenuOpen
                                })}
                            >
                                {'▾'}
                            </span>
                        </button>
                        <SkyDropdownMenu
                                open={accentMenuOpen}
                                anchorRef={accentMenuRef}
                            >

                                {Object.keys(accentOptions).map(id => (
                                    <div
                                        key={id}
                                        className={styles.windowOption}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onClick={() => {
                                            onChangeTheme(theme.set('accent', id));
                                            setAccentMenuOpen(false);
                                        }}
                                    >
                                        <Check selected={theme.accent === id} />
                                        <ColorIcon id={id} />
                                        <FormattedMessage {...accentOptions[id]} />
                                    </div>
                                ))}
                                                        </SkyDropdownMenu>
                    </div>
                    <div className={styles.windowSectionHeader}>
                        <img
                            className={styles.windowTabIcon}
                            src={themePaletteIcon}
                            draggable={false}
                            width={16}
                            height={16}
                            alt=""
                        />
                        <FormattedMessage {...messages.themeTab} />
                        <div className={styles.windowSectionDivider} />
                    </div>
                    <div className={styles.themeCardRow}>
                        <ThemeCard
                            selected={false}
                            onClick={() => onChangeTheme(theme.set('gui', theme.gui === GUI_DARK ? GUI_LIGHT : GUI_DARK))}
                            icon={
                                <img
                                    src={theme.gui === GUI_DARK ? lightModeIcon : darkModeIcon}
                                    className={theme.gui === GUI_DARK ? undefined : styles.themeCardIconInvert}
                                    draggable={false}
                                    width={24}
                                    height={24}
                                    alt=""
                                />
                            }
                            label={
                                theme.gui === GUI_DARK ? (
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
                                )
                            }
                        />
                    </div>
                    <div className={styles.themeCardRow}>
                        {THEME_PRESETS.map(preset => (
                            <ThemeCard
                                key={preset.id}
                                selected={uiTheme === preset.id}
                                onClick={() => onChangeUiTheme(preset.id)}
                                icon={<SquareColorIcon color={preset.iconColor} />}
                                label={<span>{preset.name}</span>}
                            />
                        ))}
                    </div>
                    <div className={styles.windowSectionHeader}>
                        <img
                            className={styles.windowTabIcon}
                            src={threeIcon}
                            draggable={false}
                            width={16}
                            height={16}
                            alt=""
                        />
                        <FormattedMessage {...messages.blocksTab} />
                        <div className={styles.windowSectionDivider} />
                    </div>
                    <div className={styles.themeCardRow}>
                        {[
                            BLOCKS_THREE,
                            BLOCKS_HIGH_CONTRAST,
                            BLOCKS_DARK,
                            ...(onOpenCustomSettings ? [BLOCKS_CUSTOM] : [])
                        ].map(id => {
                            const disabled = id !== BLOCKS_CUSTOM && theme.blocks === BLOCKS_CUSTOM;
                            return (
                                <ThemeCard
                                    key={id}
                                    selected={theme.blocks === id}
                                    disabled={disabled}
                                    onClick={
                                        id === BLOCKS_CUSTOM ?
                                            onOpenCustomSettings :
                                            (disabled ? undefined : () => onChangeTheme(theme.set('blocks', id)))
                                    }
                                    icon={
                                        <img
                                            src={blockIcons[id]}
                                            className={id === BLOCKS_CUSTOM ? styles.themeCardIconInvert : undefined}
                                            draggable={false}
                                            width={24}
                                            height={24}
                                            alt=""
                                        />
                                    }
                                    label={<FormattedMessage {...blockOptions[id]} />}
                                    extra={id === BLOCKS_CUSTOM ? (
                                        <img
                                            className={styles.openLink}
                                            src={openLinkIcon}
                                            draggable={false}
                                            width={16}
                                            height={16}
                                            alt=""
                                        />
                                    ) : null}
                                />
                            );
                        })}
                    </div>
                </React.Fragment>
            )}
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={menuBarIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.menuBarThemeLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={menuBarThemeMenuRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => setMenuBarThemeMenuOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentMenuBarTheme.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: menuBarThemeMenuOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                    open={menuBarThemeMenuOpen}
                    anchorRef={menuBarThemeMenuRef}
                >
                    {menuBarThemeOptionsList.map(option => (
                        <div
                            key={option.id}
                            className={styles.windowOption}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => {
                                handleMenuBarThemeChange(option.id);
                                setMenuBarThemeMenuOpen(false);
                            }}
                        >
                            <Check selected={menuBarTheme === option.id} />
                            <FormattedMessage {...option.message} />
                        </div>
                    ))}
                </SkyDropdownMenu>
            </div>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={tabsIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.windowTabBarThemeLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={tabBarThemeMenuRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => setTabBarThemeMenuOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentWindowTabBarTheme.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: tabBarThemeMenuOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                        open={tabBarThemeMenuOpen}
                        anchorRef={tabBarThemeMenuRef}
                    >

                        {windowTabBarThemeOptionsList.map(option => (
                            <div
                                key={option.id}
                                className={styles.windowOption}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={() => {
                                    handleWindowTabBarThemeChange(option.id);
                                    setTabBarThemeMenuOpen(false);
                                }}
                            >
                                <Check selected={windowTabBarTheme === option.id} />
                                <FormattedMessage {...option.message} />
                            </div>
                        ))}
                                        </SkyDropdownMenu>
            </div>
        </div>
    );
};

MergedThemeTab.propTypes = {
    canChangeTheme: PropTypes.bool,
    onChangeTheme: PropTypes.func,
    onChangeUiTheme: PropTypes.func,
    onOpenCustomSettings: PropTypes.func,
    theme: PropTypes.instanceOf(Theme),
    uiTheme: PropTypes.string
};

export {MergedThemeTab};
