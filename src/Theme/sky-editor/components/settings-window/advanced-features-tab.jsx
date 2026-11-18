/**
 * AdvancedFeaturesTab —— 设置窗口页面（advanced-features-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React, {useState, useEffect, useRef} from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {messages, audioEditorStyleOptions} from './settings-messages';
import {Check} from './settings-widgets';
import {SkyDropdownMenu} from '../../../../components/sky-popover/sky-popover.jsx';
import check from '../../../../components/menu-bar/check.svg';
import advancedIcon from '../../../../components/menu-bar/tw-advanced.svg';
import layoutIcon from '../../../../components/menu-bar/tw-layout.svg';


const AdvancedFeaturesTab = ({
    audioEditorStyle,
    onChangeAudioEditorStyle
}) => {
    const [styleMenuOpen, setStyleMenuOpen] = useState(false);
    const styleMenuRef = useRef(null);

    useEffect(() => {
        if (!styleMenuOpen) return;
        const handleMouseDown = e => {
            if (styleMenuRef.current && !styleMenuRef.current.contains(e.target)) {
                setStyleMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [styleMenuOpen]);

    const styleOptionsList = [
        {id: 'scratch', message: audioEditorStyleOptions.scratch},
        {id: 'advanced', message: audioEditorStyleOptions.advanced}
    ];
    const currentStyle = styleOptionsList.find(o => o.id === audioEditorStyle) ||
        styleOptionsList[1];

    return (
        <div className={styles.windowSettings}>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={advancedIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.advancedFeaturesTab} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={layoutIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.audioEditorStyleLabel} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div
                ref={styleMenuRef}
                className={styles.languageDropdown}
            >
                <button
                    className={styles.languageDropdownButton}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => setStyleMenuOpen(open => !open)}
                >
                    <span><FormattedMessage {...currentStyle.message} /></span>
                    <span
                        className={classNames(styles.languageDropdownCaret, {
                            [styles.languageDropdownCaretOpen]: styleMenuOpen
                        })}
                    >
                        {'▾'}
                    </span>
                </button>
                <SkyDropdownMenu
                        open={styleMenuOpen}
                        anchorRef={styleMenuRef}
                    >

                        {styleOptionsList.map(option => (
                            <div
                                key={option.id}
                                className={styles.windowOption}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={() => {
                                    onChangeAudioEditorStyle(option.id);
                                    setStyleMenuOpen(false);
                                }}
                            >
                                <Check selected={audioEditorStyle === option.id} />
                                <FormattedMessage {...option.message} />
                            </div>
                        ))}
                                        </SkyDropdownMenu>
            </div>
        </div>
    );
};

AdvancedFeaturesTab.propTypes = {
    audioEditorStyle: PropTypes.string,
    onChangeAudioEditorStyle: PropTypes.func
};

export {AdvancedFeaturesTab};
