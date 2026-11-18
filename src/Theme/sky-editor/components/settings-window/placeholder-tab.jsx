/**
 * PlaceholderTab —— 设置窗口页面（placeholder-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import styles from '../../../../components/menu-bar/settings-menu.css';


const PlaceholderTab = ({
    title,
    description,
    icon
}) => (
    <div className={styles.windowSettings}>
        <div className={styles.windowSectionHeader}>
            <img
                className={styles.windowTabIcon}
                src={icon}
                draggable={false}
                width={16}
                height={16}
                alt=""
            />
            <FormattedMessage {...title} />
            <div className={styles.windowSectionDivider} />
        </div>
        <div className={styles.windowPlaceholder}>
            <FormattedMessage {...description} />
        </div>
    </div>
);

PlaceholderTab.propTypes = {
    title: PropTypes.shape({
        id: PropTypes.string
    }),
    description: PropTypes.shape({
        id: PropTypes.string
    }),
    icon: PropTypes.string
};

export {PlaceholderTab};
