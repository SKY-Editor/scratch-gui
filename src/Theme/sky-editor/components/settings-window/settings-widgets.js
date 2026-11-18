/**
 * 设置窗口共享小部件：主题色圆点 / 方形色块 / 勾选图标 / 主题卡片。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出，供 Theme/MergedTheme 等页面复用。
 */
import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import check from '../../../../components/menu-bar/check.svg';


const ThemeColorIcon = ({color}) => (
    <div
        className={styles.accentIconOuter}
        style={{
            backgroundColor: color
        }}
    />
);

ThemeColorIcon.propTypes = {
    color: PropTypes.string
};

const SquareColorIcon = ({color}) => (
    <div
        className={styles.squareColorIcon}
        style={{
            backgroundColor: color
        }}
    />
);

SquareColorIcon.propTypes = {
    color: PropTypes.string
};

const Check = ({selected}) => (
    <img
        className={classNames(styles.check, {[styles.selected]: selected})}
        src={check}
        draggable={false}
        width={15}
        height={12}
        alt=""
    />
);

Check.propTypes = {
    selected: PropTypes.bool
};

const ThemeCard = ({
    selected,
    disabled,
    onClick,
    icon,
    label,
    extra
}) => (
    <div
        className={classNames(styles.themeCard, {
            [styles.themeCardSelected]: selected,
            [styles.disabled]: disabled
        })}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={onClick}
    >
        <div className={styles.themeCardIcon}>
            {icon}
        </div>
        <div className={styles.themeCardLabel}>
            {label}
        </div>
        {extra}
    </div>
);

ThemeCard.propTypes = {
    disabled: PropTypes.bool,
    extra: PropTypes.node,
    icon: PropTypes.node,
    label: PropTypes.node,
    onClick: PropTypes.func,
    selected: PropTypes.bool
};

export {ThemeColorIcon, SquareColorIcon, Check, ThemeCard};
