/**
 * LanguageTab —— 设置窗口页面（language-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React, {useState, useEffect, useRef} from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {messages} from './settings-messages';
import {Check} from './settings-widgets';
import {SkyDropdownMenu} from '../../../../components/sky-popover/sky-popover.jsx';
import locales from '@turbowarp/scratch-l10n';
import check from '../../../../components/menu-bar/check.svg';
import desktopIcon from '../../../../components/menu-bar/tw-desktop-icon.svg';
import languageIcon from '../../../../components/language-selector/language-icon.svg';


const LanguageTab = ({
    canChangeLanguage,
    currentLocale,
    onChangeLanguage,
    onClickDesktopSettings
}) => {
    const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
    const languageMenuRef = useRef(null);

    useEffect(() => {
        if (!languageMenuOpen) return undefined;
        const handleMouseDown = e => {
            if (languageMenuRef.current && !languageMenuRef.current.contains(e.target)) {
                setLanguageMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [languageMenuOpen]);

    const currentLanguageName = locales[currentLocale] ?
        locales[currentLocale].name :
        '';

    return (
        <div className={styles.windowSettings}>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={languageIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.languageTab} />
                <div className={styles.windowSectionDivider} />
            </div>
            {canChangeLanguage && (
                <div
                    ref={languageMenuRef}
                    className={styles.languageDropdown}
                >
                    <button
                        className={styles.languageDropdownButton}
                        onClick={() => setLanguageMenuOpen(open => !open)}
                    >
                        <span>{currentLanguageName}</span>
                        <span
                            className={classNames(styles.languageDropdownCaret, {
                                [styles.languageDropdownCaretOpen]: languageMenuOpen
                            })}
                        >
                            {'▾'}
                        </span>
                    </button>
                    <SkyDropdownMenu
                            open={languageMenuOpen}
                            anchorRef={languageMenuRef}
                        >

                            {Object.keys(locales).map(locale => (
                                <div
                                    key={locale}
                                    className={styles.windowOption}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={() => {
                                        onChangeLanguage(locale);
                                        setLanguageMenuOpen(false);
                                    }}
                                >
                                    <Check selected={currentLocale === locale} />
                                    <span>{locales[locale].name}</span>
                                </div>
                            ))}
                                                </SkyDropdownMenu>
                </div>
            )}
            {onClickDesktopSettings && (
                <div
                    className={styles.windowOption}
                    onClick={onClickDesktopSettings}
                >
                    <img
                        src={desktopIcon}
                        draggable={false}
                        width={24}
                        height={24}
                        alt=""
                    />
                    <FormattedMessage
                        defaultMessage="Desktop Settings"
                        description="Button in menu bar under settings to open desktop app settings"
                        id="tw.menuBar.desktopSettings"
                    />
                </div>
            )}
        </div>
    );
};

LanguageTab.propTypes = {
    canChangeLanguage: PropTypes.bool,
    currentLocale: PropTypes.string,
    onChangeLanguage: PropTypes.func,
    onClickDesktopSettings: PropTypes.func
};

export {LanguageTab};
