import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from './music-player.css';

// 通用浮层（v7）：沿用新建歌单浮层的视觉规范（居中 360px、背板、Esc 关闭、140ms 退场）。
// 三种用途：
//   mode='confirm' → 二次确认（删除歌曲/删除歌单/清除本地数据）
//   mode='input'   → 单行输入（重命名歌单），自动聚焦、空值禁用提交
//   mode='info'    → 只读信息（查看歌曲信息），仅一个关闭按钮
// items: mode='info' 时的键值行 [{label, value}]
// danger: 确认按钮实心红（--mp-danger），用于不可恢复操作

const ConfirmDialog = function (props) {
    const {
        title, message, items, confirmLabel, cancelLabel, danger, mode, initialValue,
        placeholder, validate, onSubmit, onClose
    } = props;
    const [value, setValue] = React.useState(initialValue || '');
    const [closing, setClosing] = React.useState(false);
    const inputRef = React.useRef(null);

    React.useEffect(() => {
        if (mode === 'input' && inputRef.current) inputRef.current.focus();
    }, [mode]);

    const close = React.useCallback(() => {
        setClosing(true);
        window.setTimeout(onClose, 140);
    }, [onClose]);

    const errorText = mode === 'input' && validate ? validate(value) : null;
    const canSubmit = mode === 'info' ? true : (mode === 'input' ? !errorText : true);

    const handleSubmit = () => {
        if (!canSubmit) return;
        setClosing(true);
        const payload = mode === 'input' ? value.trim() : undefined;
        window.setTimeout(() => {
            if (onSubmit) onSubmit(payload);
            onClose();
        }, 140);
    };

    const handleKeyDown = event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            close();
        } else if (event.key === 'Enter' && mode !== 'info') {
            event.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div
            className={classNames(styles.createOverlay, {[styles.createOverlayOut]: closing})}
            onClick={event => {
                if (event.target === event.currentTarget) close();
            }}
            onKeyDown={handleKeyDown}
        >
            <div className={classNames(styles.createDialog, {[styles.createDialogOut]: closing})}>
                <div className={styles.createTitle}>{title}</div>
                {mode === 'info' && Array.isArray(items) ? (
                    <div className={styles.confirmInfoList}>
                        {items.map(row => (
                            <div className={styles.confirmInfoRow} key={row.label}>
                                <span className={styles.confirmInfoLabel}>{row.label}</span>
                                <span className={styles.confirmInfoValue}>{row.value}</span>
                            </div>
                        ))}
                    </div>
                ) : null}
                {mode === 'input' ? (
                    <input
                        className={styles.createInput}
                        onChange={event => setValue(event.target.value)}
                        placeholder={placeholder}
                        ref={inputRef}
                        spellCheck={false}
                        type="text"
                        value={value}
                    />
                ) : null}
                {message && mode !== 'info' ? (
                    <div className={styles.confirmMessage}>{message}</div>
                ) : null}
                {errorText ? (
                    <div className={classNames(styles.createHint, styles.createHintError)}>{errorText}</div>
                ) : null}
                <div className={styles.createActions}>
                    {mode === 'info' ? null : (
                        <button
                            className={styles.createCancel}
                            onClick={close}
                            type="button"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        className={classNames(styles.createSubmit, {
                            [styles.confirmDanger]: danger
                        })}
                        disabled={!canSubmit}
                        onClick={mode === 'info' ? close : handleSubmit}
                        type="button"
                    >
                        {mode === 'info' ? cancelLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

ConfirmDialog.propTypes = {
    title: PropTypes.node,
    message: PropTypes.node,
    items: PropTypes.arrayOf(PropTypes.shape({label: PropTypes.string, value: PropTypes.string})),
    confirmLabel: PropTypes.node,
    cancelLabel: PropTypes.node,
    danger: PropTypes.bool,
    mode: PropTypes.oneOf(['confirm', 'input', 'info']),
    initialValue: PropTypes.string,
    placeholder: PropTypes.string,
    validate: PropTypes.func,
    onSubmit: PropTypes.func,
    onClose: PropTypes.func
};

ConfirmDialog.defaultProps = {
    mode: 'confirm',
    danger: false
};

export default ConfirmDialog;
