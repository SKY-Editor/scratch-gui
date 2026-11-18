/**
 * LayoutTab —— 设置窗口页面（layout-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React, {useState, useEffect, useRef} from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {messages, menuBarPositionOptions, windowButtonStyleOptions, tabLayoutOptions, contextMenuStyleOptions} from './settings-messages';
import {Check} from './settings-widgets';
import {detectWindowButtonStyle, persistWindowButtonStyle} from '../../../../lib/sky-settings-store.js';
import {SkyDropdownMenu} from '../../../../components/sky-popover/sky-popover.jsx';
import check from '../../../../components/menu-bar/check.svg';
import desktopIcon from '../../../../components/menu-bar/tw-desktop-icon.svg';
import menuBarIcon from '../../../../components/menu-bar/tw-menu-bar.svg';
import tabsIcon from '../../../../components/menu-bar/tw-tabs.svg';
import contextMenuIcon from '../../../../components/menu-bar/tw-context-menu.svg';


const LayoutTab = ({
    menuBarPosition,
    onChangeMenuBarPosition,
    tabLayout,
    onChangeTabLayout,
    contextMenuStyle,
    onChangeContextMenuStyle
}) => {
    const [positionMenuOpen, setPositionMenuOpen] = useState(false);
    const positionMenuRef = useRef(null);
    const [tabLayoutMenuOpen, setTabLayoutMenuOpen] = useState(false);
    const tabLayoutMenuRef = useRef(null);
    const [contextMenuStyleOpen, setContextMenuStyleOpen] = useState(false);
    const contextMenuStyleRef = useRef(null);
    const [windowButtonStyle, setWindowButtonStyle] = useState(() => detectWindowButtonStyle());
    const [windowButtonStyleOpen, setWindowButtonStyleOpen] = useState(false);
    const windowButtonStyleRef = useRef(null);

    useEffect(() => {
        if (!positionMenuOpen && !tabLayoutMenuOpen && !contextMenuStyleOpen && !windowButtonStyleOpen) return undefined;
        const handleMouseDown = e => {
            if (positionMenuRef.current && !positionMenuRef.current.contains(e.target)) {
                setPositionMenuOpen(false);
            }
            if (tabLayoutMenuRef.current && !tabLayoutMenuRef.current.contains(e.target)) {
                setTabLayoutMenuOpen(false);
            }
            if (contextMenuStyleRef.current && !contextMenuStyleRef.current.contains(e.target)) {
                setContextMenuStyleOpen(false);
            }
            if (windowButtonStyleRef.current && !windowButtonStyleRef.current.contains(e.target)) {
                setWindowButtonStyleOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [positionMenuOpen, tabLayoutMenuOpen, contextMenuStyleOpen, windowButtonStyleOpen]);

    const positionOptions = [
        {id: 'left', message: menuBarPositionOptions.left},
        {id: 'center', message: menuBarPositionOptions.center}
    ];
    const currentPosition = positionOptions.find(o => o.id === menuBarPosition) ||
        positionOptions[1];

    const tabLayoutOptionsList = [
        {id: 'vertical', message: tabLayoutOptions.vertical},
        {id: 'horizontal', message: tabLayoutOptions.horizontal}
    ];
    const currentTabLayout = tabLayoutOptionsList.find(o => o.id === tabLayout) ||
        tabLayoutOptionsList[0];

    const contextMenuStyleOptionsList = [
        {id: 'tw', message: contextMenuStyleOptions.tw},
        {id: 'se', message: contextMenuStyleOptions.se}
    ];
    const currentContextMenuStyle = contextMenuStyleOptionsList.find(o => o.id === contextMenuStyle) ||
        contextMenuStyleOptionsList[0];

    const windowButtonStyleOptionsList = [
        {id: 'windows', message: windowButtonStyleOptions.windows},
        {id: 'mac', message: windowButtonStyleOptions.mac}
    ];
    const currentWindowButtonStyle = windowButtonStyleOptionsList.find(o => o.id === windowButtonStyle) ||
        windowButtonStyleOptionsList[0];

    return (
        <div className={styles.windowSettings}>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={menuBarIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.menuBarPositionLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={positionMenuRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    onClick={() => setPositionMenuOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentPosition.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: positionMenuOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                        open={positionMenuOpen}
                        anchorRef={positionMenuRef}
                    >

                        {positionOptions.map(option => (
                            <div
                                key={option.id}
                                className={styles.windowOption}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={() => {
                                    onChangeMenuBarPosition(option.id);
                                    setPositionMenuOpen(false);
                                }}
                            >
                                <Check selected={menuBarPosition === option.id} />
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
                <FormattedMessage {...messages.tabLayoutLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={tabLayoutMenuRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    onClick={() => setTabLayoutMenuOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentTabLayout.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: tabLayoutMenuOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                        open={tabLayoutMenuOpen}
                        anchorRef={tabLayoutMenuRef}
                    >

                        {tabLayoutOptionsList.map(option => (
                            <div
                                key={option.id}
                                className={styles.windowOption}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={() => {
                                    onChangeTabLayout(option.id);
                                    setTabLayoutMenuOpen(false);
                                }}
                            >
                                <Check selected={tabLayout === option.id} />
                                <FormattedMessage {...option.message} />
                            </div>
                        ))}
                                        </SkyDropdownMenu>
            </div>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={contextMenuIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.contextMenuStyleLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={contextMenuStyleRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    onClick={() => setContextMenuStyleOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentContextMenuStyle.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: contextMenuStyleOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                        open={contextMenuStyleOpen}
                        anchorRef={contextMenuStyleRef}
                    >

                        {contextMenuStyleOptionsList.map(option => (
                            <div
                                key={option.id}
                                className={styles.windowOption}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={() => {
                                    onChangeContextMenuStyle(option.id);
                                    setContextMenuStyleOpen(false);
                                }}
                            >
                                <Check selected={contextMenuStyle === option.id} />
                                <FormattedMessage {...option.message} />
                            </div>
                        ))}
                                        </SkyDropdownMenu>
            </div>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={desktopIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.windowButtonStyleLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={windowButtonStyleRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    onClick={() => setWindowButtonStyleOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentWindowButtonStyle.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: windowButtonStyleOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                        open={windowButtonStyleOpen}
                        anchorRef={windowButtonStyleRef}
                    >

                        {windowButtonStyleOptionsList.map(option => (
                            <div
                                key={option.id}
                                className={styles.windowOption}
                                onClick={() => {
                                    setWindowButtonStyle(option.id);
                                    persistWindowButtonStyle(option.id);
                                    setWindowButtonStyleOpen(false);
                                }}
                            >
                                <Check selected={windowButtonStyle === option.id} />
                                <FormattedMessage {...option.message} />
                            </div>
                        ))}
                                        </SkyDropdownMenu>
            </div>
        </div>
    );
};

LayoutTab.propTypes = {
    menuBarPosition: PropTypes.string,
    onChangeMenuBarPosition: PropTypes.func,
    tabLayout: PropTypes.string,
    onChangeTabLayout: PropTypes.func,
    contextMenuStyle: PropTypes.string,
    onChangeContextMenuStyle: PropTypes.func
};

export {LayoutTab};
