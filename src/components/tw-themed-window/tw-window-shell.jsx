/**
 * TWWindowShell —— TurboWarp 官方弹窗外壳（双主题窗口适配的 TW 侧实现）
 * ---------------------------------------------------------------------------
 * 与 Win11Window（SKYEditor 侧外壳）平行：业务只写标题 + 内容，由 ThemedWindow
 * 按当前主题选择外壳。
 *
 * 本外壳严格复刻上游 TurboWarp（scratch-gui 基线）的 Modal 形态，不引入任何
 * SKY 专属变量 / 圆角 / 字体口径：
 *   - 深灰标题栏（$ui-modal-header-background）、标题居中、右上角圆形关闭按钮；
 *   - 4px 白色描边 + $space 圆角（沿用 modal.css 官方口径）；
 *   - 内容区为 $ui-modal-background 纯底 + 官方内边距 1.5rem 2.25rem；
 *   - 尺寸由 width / height 精确控制：外壳宽度即业务声明的宽度（border-box，
 *     含官方 4px 描边），内容区按 flex 填满剩余高度，不再由内容反向撑出外壳。
 *
 * 尺寸为什么必须写在内联 style 上：modal.css 的 .modal-content 只声明了
 * margin / border / padding，没有宽高；若不给外壳定宽，块级元素会吃满视口
 * （仅受 max-width 约束），表现为"被拉成最大化的窗口 + 内容缩在中间"。
 * react-modal 在传入 className 时 contentStyles 为空，style.content 会与空对象
 * 合并后生效，所以这里用内联 style 精确下发宽高，避免 CSS Modules 无法动态取值。
 *
 * 为什么不用 containers/modal.jsx：官方 Modal 不接受尺寸参数（宽度由各弹窗自己的
 * class 决定），而 SKY 新增功能需要统一的宽度/高度声明。这里复用官方 modal.css 的
 * 类名与结构，视觉与官方一致，同时保留尺寸入口。
 * ---------------------------------------------------------------------------
 */
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import ReactModal from 'react-modal';

import CloseButton from '../close-button/close-button.jsx';

import modalStyles from '../modal/modal.css';
import styles from './tw-window-shell.css';

const TWWindowShell = ({
    title,
    onClose,
    width,
    height,
    className,
    headerActions,
    flushBody,
    children
}) => {
    // 外壳尺寸：border-box，宽度/高度即业务声明值（官方 4px 描边算在内）。
    const contentStyle = {
        boxSizing: 'border-box',
        margin: '100px auto'
    };
    if (width) contentStyle.width = `${width}px`;
    if (height) contentStyle.height = `${height}px`;

    return (
        <ReactModal
            isOpen
            className={classNames(modalStyles.modalContent, styles.content, className)}
            overlayClassName={modalStyles.modalOverlay}
            style={{content: contentStyle}}
            contentLabel={typeof title === 'string' ? title : ''}
            onRequestClose={onClose}
        >
            <div className={styles.inner}>
                <div className={classNames(modalStyles.header, styles.header)}>
                    {headerActions ? (
                        <div
                            className={classNames(
                                modalStyles.headerItem,
                                styles.headerActions
                            )}
                        >
                            {headerActions}
                        </div>
                    ) : null}
                    <div
                        className={classNames(
                            modalStyles.headerItem,
                            modalStyles.headerItemTitle
                        )}
                    >
                        {title}
                    </div>
                    <div
                        className={classNames(
                            modalStyles.headerItem,
                            modalStyles.headerItemClose
                        )}
                    >
                        <CloseButton
                            size={CloseButton.SIZE_LARGE}
                            onClick={onClose}
                        />
                    </div>
                </div>
                <div
                    className={classNames(
                        styles.body,
                        flushBody ? styles.bodyFlush : null
                    )}
                >
                    {children}
                </div>
            </div>
        </ReactModal>
    );
};

TWWindowShell.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    flushBody: PropTypes.bool,
    headerActions: PropTypes.node,
    height: PropTypes.number,
    onClose: PropTypes.func,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
    width: PropTypes.number
};

export default TWWindowShell;
