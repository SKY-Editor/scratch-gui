import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from './music-player.css';
import {ChevronRightIcon} from './icons.jsx';

// 自绘右键菜单（v7）：替代浏览器原生菜单，支持多级、边界翻转、键盘/滚轮/失焦关闭。
// items 结构：
//   {id, label, icon?, danger?, disabled?, onClick?, children?: items[]}
//   {separator: true} 渲染分隔线
// 只有一级子菜单（「加入歌单」），children 存在时右侧显示箭头并在 hover 时展开。

const EDGE = 8; // 距视口边缘最小安全距离

const MenuPanel = function (props) {
    const {x, y, items, anchorLeft, registerRef, onHoverItem, onClose} = props;
    const panelRef = React.useRef(null);
    const [pos, setPos] = React.useState(null);

    // 定位：先渲染（visibility:hidden）量尺寸，再按视口右/下边界翻转
    React.useLayoutEffect(() => {
        const node = panelRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x;
        let top = y;
        if (left + rect.width > vw - EDGE) {
            // 超出右边界：子菜单优先翻到锚点左侧，主菜单则整体左移
            left = typeof anchorLeft === 'number' ? anchorLeft - rect.width - 2 : x - rect.width;
            if (left < EDGE) left = Math.max(EDGE, vw - rect.width - EDGE);
        }
        if (top + rect.height > vh - EDGE) {
            top = Math.max(EDGE, vh - rect.height - EDGE);
        }
        if (top < EDGE) top = EDGE;
        setPos({left, top});
    }, [x, y, anchorLeft, items]);

    return (
        <div
            className={styles.contextMenu}
            onContextMenu={event => event.preventDefault()}
            ref={node => {
                panelRef.current = node;
                if (registerRef) registerRef.current = node;
            }}
            style={{
                left: pos ? pos.left : x,
                top: pos ? pos.top : y,
                visibility: pos ? 'visible' : 'hidden'
            }}
        >
            {items.map((item, index) => {
                if (item.separator) {
                    // eslint-disable-next-line react/no-array-index-key
                    return <div key={`sep-${index}`} className={styles.contextMenuSeparator} />;
                }
                return (
                    <button
                        className={classNames(styles.contextMenuItem, {
                            [styles.contextMenuItemDanger]: item.danger,
                            [styles.contextMenuItemDisabled]: item.disabled
                        })}
                        disabled={item.disabled}
                        key={item.id}
                        onClick={() => {
                            if (item.disabled || item.children) return;
                            if (item.onClick) item.onClick();
                            onClose();
                        }}
                        onMouseEnter={event => {
                            if (onHoverItem) {
                                onHoverItem(item, event.currentTarget.getBoundingClientRect());
                            }
                        }}
                        onMouseLeave={() => {
                            if (onHoverItem && item.children) return;
                            if (onHoverItem) onHoverItem(null, null);
                        }}
                        type="button"
                    >
                        <span className={styles.contextMenuItemIcon}>
                            {item.icon || null}
                        </span>
                        <span className={styles.contextMenuItemText}>{item.label}</span>
                        {item.children ? (
                            <span className={styles.contextMenuItemArrow}>
                                <ChevronRightIcon size={12} />
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
};

MenuPanel.propTypes = {
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    items: PropTypes.arrayOf(PropTypes.object),
    anchorLeft: PropTypes.number,
    registerRef: PropTypes.object,
    onHoverItem: PropTypes.func,
    onClose: PropTypes.func
};

const ContextMenu = function ({x, y, items, onClose}) {
    const rootRef = React.useRef(null);
    const subRef = React.useRef(null);
    const [subMenu, setSubMenu] = React.useState(null);

    // 关闭时机：点击菜单外任意处、页面滚动（含容器内滚动）、窗口失焦、Esc
    React.useEffect(() => {
        const handleDown = event => {
            if (rootRef.current && rootRef.current.contains(event.target)) return;
            if (subRef.current && subRef.current.contains(event.target)) return;
            onClose();
        };
        const handleKey = event => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            }
        };
        const handleScroll = () => onClose();
        const handleBlur = () => onClose();
        document.addEventListener('mousedown', handleDown, true);
        document.addEventListener('contextmenu', handleDown, true);
        document.addEventListener('keydown', handleKey, true);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);
        window.addEventListener('blur', handleBlur);
        return () => {
            document.removeEventListener('mousedown', handleDown, true);
            document.removeEventListener('contextmenu', handleDown, true);
            document.removeEventListener('keydown', handleKey, true);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
            window.removeEventListener('blur', handleBlur);
        };
    }, [onClose]);

    const handleHover = (item, rect) => {
        if (!item || !item.children || !rect) {
            setSubMenu(null);
            return;
        }
        setSubMenu({
            items: item.children,
            x: rect.right + 2,
            y: rect.top - 6,
            anchorLeft: rect.left
        });
    };

    return (
        <div className={styles.contextMenuLayer}>
            <MenuPanel
                items={items}
                onClose={onClose}
                onHoverItem={handleHover}
                registerRef={rootRef}
                x={x}
                y={y}
            />
            {subMenu ? (
                <MenuPanel
                    anchorLeft={subMenu.anchorLeft}
                    items={subMenu.items}
                    onClose={onClose}
                    onHoverItem={() => {}}
                    registerRef={subRef}
                    x={subMenu.x}
                    y={subMenu.y}
                />
            ) : null}
        </div>
    );
};

ContextMenu.propTypes = {
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    items: PropTypes.arrayOf(PropTypes.object),
    onClose: PropTypes.func
};

export default ContextMenu;
