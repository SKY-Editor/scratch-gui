/**
 * ThemedButton —— 主题统一按钮模板
 * ---------------------------------------------------------------------------
 * SKYEditor 主题的统一按钮：
 *   - variant: primary（主操作）/ secondary（次要）/ danger（危险操作）
 *   - 颜色统一从主题色板取变量（--sky-accent 等），明暗自适应；
 *   - 非 SKYEditor 主题下使用中性配色（不入侵其它主题的既有按钮样式）。
 *
 * 特殊按钮：先在本组件上按需扩展 variant / className，不要在各功能里
 * 各自写一套按钮样式；确实需要全新样式时，在主题目录 components/ 下
 * 新增一个按钮模板组件并在零件树中登记（见《SKYEditor-单独组件化GUI指南》）。
 * ---------------------------------------------------------------------------
 */
import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './themed-button.css';

const ThemedButton = ({
    variant,
    icon,
    iconAlt,
    children,
    className,
    onClick,
    disabled,
    title,
    type
}) => (
    <button
        type={type || 'button'}
        className={classNames(
            styles.themedButton,
            styles[variant] || styles.primary,
            className
        )}
        onClick={onClick}
        disabled={disabled}
        title={title}
    >
        {icon ? (
            <img
                className={styles.icon}
                src={icon}
                alt={iconAlt || ''}
                draggable={false}
            />
        ) : null}
        {children}
    </button>
);

ThemedButton.propTypes = {
    variant: PropTypes.oneOf(['primary', 'secondary', 'danger']),
    icon: PropTypes.string,
    iconAlt: PropTypes.string,
    children: PropTypes.node,
    className: PropTypes.string,
    onClick: PropTypes.func,
    disabled: PropTypes.bool,
    title: PropTypes.string,
    type: PropTypes.string
};

export default ThemedButton;
