// SKYEditor：项目资源虚拟文件系统（测试版）—— 节点右键菜单
// 职责：按节点类型给出可用动作（下载 / 展开折叠），并以右键坐标定位弹出。
// 视觉：复用 SKY 主题上下文菜单的观感（白底、1px 描边、圆角、轻阴影、
//       12px 字号、6px 12px 内边距、hover 为 8% 黑叠加），样式走 CSS Modules。
// 行为：Portal 到 body，脱离窗口层叠与 overflow 裁切；坐标按视口夹取，
//       保证菜单不会被屏幕边缘或窗口边界切掉；
//       点击空白处 / 任意滚动 / 窗口失焦 / Esc 均关闭。
/* eslint-disable react/jsx-no-bind */
import classNames from 'classnames';
import {ChevronDown, ChevronRight, Download} from 'lucide-react';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import styles from './project-fs.css';

const GLYPH_SIZE = 14;
// 菜单与屏幕边缘的最小留白
const VIEWPORT_MARGIN = 4;

const glyphProps = {
    'size': GLYPH_SIZE,
    'strokeWidth': 1.9,
    'aria-hidden': true,
    'focusable': false
};

const nodePropType = PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['folder', 'file']).isRequired,
    ext: PropTypes.string,
    thumbnail: PropTypes.string,
    size: PropTypes.number,
    payload: PropTypes.shape({
        type: PropTypes.string,
        fileName: PropTypes.string,
        assetId: PropTypes.string,
        targetId: PropTypes.string
    }),
    children: PropTypes.array
});

// 菜单动作与图标：action 直接交给窗口处理
const ACTION_DOWNLOAD = 'download';
const ACTION_TOGGLE = 'toggle';

const ICON_DOWNLOAD = 'download';
const ICON_EXPAND = 'expand';
const ICON_COLLAPSE = 'collapse';

const MenuGlyph = ({name}) => {
    if (name === ICON_EXPAND) {
        return (
            <ChevronRight
                {...glyphProps}
                className={styles.menuIcon}
            />
        );
    }
    if (name === ICON_COLLAPSE) {
        return (
            <ChevronDown
                {...glyphProps}
                className={styles.menuIcon}
            />
        );
    }
    return (
        <Download
            {...glyphProps}
            className={styles.menuIcon}
        />
    );
};

MenuGlyph.propTypes = {
    name: PropTypes.string
};

MenuGlyph.defaultProps = {
    name: ICON_DOWNLOAD
};

// 按节点类型生成菜单项：
// - 造型/声音（asset）  → 下载原始资源
// - 项目 .js（project） → 下载工程 JSON
// - 角色 .sprite3       → 下载打包后的 .sprite3
// - 目录                → 展开 / 折叠（空目录禁用）
const buildMenuItems = (node, isExpanded) => {
    if (!node) return [];

    const items = [];
    const payload = node.payload;
    if (payload && payload.type === 'asset') {
        items.push({
            key: 'download',
            label: '\u4E0B\u8F7D',
            icon: ICON_DOWNLOAD,
            action: ACTION_DOWNLOAD
        });
    } else if (payload && payload.type === 'project') {
        items.push({
            key: 'download',
            label: '\u4E0B\u8F7D\u5DE5\u7A0B JSON',
            icon: ICON_DOWNLOAD,
            action: ACTION_DOWNLOAD
        });
    } else if (payload && payload.type === 'sprite3') {
        items.push({
            key: 'download',
            label: '\u4E0B\u8F7D .sprite3',
            icon: ICON_DOWNLOAD,
            action: ACTION_DOWNLOAD
        });
    }

    if (node.kind === 'folder') {
        if (items.length > 0) items.push({key: 'separator', separator: true});
        const isEmpty = !node.children || node.children.length === 0;
        items.push({
            key: 'toggle',
            label: isExpanded ? '\u6298\u53E0' : '\u5C55\u5F00',
            icon: isExpanded ? ICON_COLLAPSE : ICON_EXPAND,
            action: ACTION_TOGGLE,
            disabled: isEmpty
        });
    }

    return items;
};

const ContextMenu = ({node, x, y, isExpanded, onClose, onAction}) => {
    const menuRef = useRef(null);
    const [position, setPosition] = useState({left: x, top: y});
    const items = buildMenuItems(node, isExpanded);

    // 测量真实尺寸后夹取到视口内：右/下越界时整体回收，保证菜单完整可见
    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element || typeof window === 'undefined') return;
        const rect = element.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width - VIEWPORT_MARGIN;
        const maxTop = window.innerHeight - rect.height - VIEWPORT_MARGIN;
        setPosition({
            left: Math.max(VIEWPORT_MARGIN, Math.min(x, maxLeft)),
            top: Math.max(VIEWPORT_MARGIN, Math.min(y, maxTop))
        });
    }, [x, y]);

    // 关闭时机：点击/右键菜单外、任意滚动（含树容器滚动）、窗口失焦、Esc、尺寸变化
    useEffect(() => {
        if (typeof document === 'undefined') return null;

        const handlePointerDown = event => {
            const element = menuRef.current;
            if (element && element.contains(event.target)) return;
            onClose();
        };
        const handleScroll = () => onClose();
        const handleKeyDown = event => {
            if (event.key !== 'Escape') return;
            // 菜单独占 Esc：阻止事件继续传播到窗口层，
            // 否则 Win11Window 的 document 冒泡监听会连带关闭整个文件树窗口。
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
            onClose();
        };
        const handleBlur = () => onClose();

        document.addEventListener('mousedown', handlePointerDown, true);
        document.addEventListener('contextmenu', handlePointerDown, true);
        document.addEventListener('scroll', handleScroll, true);
        document.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('resize', handleBlur);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown, true);
            document.removeEventListener('contextmenu', handlePointerDown, true);
            document.removeEventListener('scroll', handleScroll, true);
            document.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('resize', handleBlur);
        };
    }, [onClose]);

    const handleItemClick = useCallback(item => {
        if (item.disabled || item.separator) return;
        onAction(item.action);
    }, [onAction]);

    if (items.length === 0) return null;

    const menuNode = (
        <div
            className={styles.menuLayer}
            style={{left: `${position.left}px`, top: `${position.top}px`}}
        >
            <div
                className={styles.contextMenu}
                ref={menuRef}
                role="menu"
            >
                {items.map(item => (
                    item.separator ? (
                        <div
                            key={item.key}
                            className={styles.menuSeparator}
                            role="separator"
                        />
                    ) : (
                        <div
                            key={item.key}
                            className={classNames(
                                styles.menuItem,
                                item.disabled && styles.menuItemDisabled
                            )}
                            role="menuitem"
                            tabIndex={-1}
                            aria-disabled={item.disabled ? 'true' : 'false'}
                            onClick={() => handleItemClick(item)}
                        >
                            <MenuGlyph name={item.icon} />
                            <span className={styles.menuLabel}>{item.label}</span>
                        </div>
                    )
                ))}
            </div>
        </div>
    );

    if (typeof document === 'undefined') return menuNode;

    return createPortal(menuNode, document.body);
};

ContextMenu.propTypes = {
    node: nodePropType.isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    isExpanded: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onAction: PropTypes.func.isRequired
};

ContextMenu.defaultProps = {
    isExpanded: false
};

export default ContextMenu;
