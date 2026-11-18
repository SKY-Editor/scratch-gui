import PropTypes from 'prop-types';
import React, {useCallback, useRef} from 'react';
import MenuComponent from '../menu/menu.jsx';
import {SkyPopover} from '../sky-popover/sky-popover.jsx';
import styles from './menu-bar-menu.css';

/**
 * 顶栏菜单（MenuBarMenu）
 * ---------------------------------------------------------------------------
 * 菜单本体通过 SkyPopover Portal 到 body 下的浮层容器，而不是留在顶栏 DOM 里：
 *   1. 层级由浮层统一控制（SKY_POPOVER_Z_INDEX），天然高于编辑器内所有窗口
 *      （窗口 overlay 从 z-index 510 起递增），不会再被窗口盖住；
 *   2. 不会被任何祖先容器的 overflow 裁剪；
 *   3. 展开/收起带过渡动画（浮层 entrance='menu'）。
 * 外层 div 保留作为定位锚点，原 className 与布局位置不变。
 */
const MenuBarMenu = ({
    children,
    className,
    open,
    place = 'right'
}) => {
    const anchorRef = useRef(null);
    /*
     * 锚点必须是整条菜单项（.menu-bar-item）：下面这个包裹 div 没有内容、
     * 宽度为 0，在 flex 里被挤到菜单项的右内边距处，拿它当锚点会让下拉
     * 面板从"菜单项右边缘"开始绘制，整体右移约一个项宽。
     */
    const setAnchor = useCallback(node => {
        if (!node) {
            anchorRef.current = null;
            return;
        }
        const item = node.closest('[class*="menu-bar-item"]');
        anchorRef.current = item || node;
    }, []);

    return (
        <div
            className={className}
            ref={setAnchor}
        >
            <SkyPopover
                open={open}
                anchorRef={anchorRef}
                align={place === 'left' ? 'right' : 'left'}
                className={styles.menuPopover}
                entrance="menu"
                scrollable={false}
            >
                <MenuComponent
                    className={styles.menuInPopover}
                    place={place}
                >
                    {children}
                </MenuComponent>
            </SkyPopover>
        </div>
    );
};

MenuBarMenu.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    open: PropTypes.bool,
    place: PropTypes.oneOf(['left', 'right'])
};

export default MenuBarMenu;
