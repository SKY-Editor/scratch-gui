import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage} from './i18n';

// 新建歌单浮层（v6）：居中 360px 轻浮层（不是系统 modal）
//  - 入场：opacity + scale(.96→1) + translateY(8px→0) 180ms；背板 rgba(0,0,0,.28) 淡入 160ms；
//  - 关闭：背板/浮层 140ms 退出动画结束后再卸载（由上层控制卸载时机）；
//  - 点击背板或 Esc 关闭，Enter 等同点「创建」；
//  - 校验：去首尾空格为空→不可为空；与现有歌单重名→已存在；两种情况下「创建」按钮均禁用（40% 不透明）。
const CreatePlaylistDialog = memo(function CreatePlaylistDialog ({
    intl,
    existingNames,
    onSubmit,
    onClose
}) {
    const t = useCallback((key, values) => mpMessage(intl, key, values), [intl]);
    const [name, setName] = useState('');
    const [touched, setTouched] = useState(false);
    const [closing, setClosing] = useState(false);
    const inputRef = useRef(null);

    // 挂载后自动聚焦并全选，用户可直接输入
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        if (typeof el.select === 'function') el.select();
    }, []);

    const trimmed = name.trim();
    const names = existingNames || [];
    const duplicated = trimmed
        ? names.some(n => String(n || '').trim().toLowerCase() === trimmed.toLowerCase())
        : false;
    const errorText = !trimmed
        ? (touched ? t('createEmptyError') : '')
        : (duplicated ? t('createExistError') : '');
    const canCreate = !!trimmed && !duplicated;

    const close = useCallback(() => {
        if (closing) return;
        setClosing(true);
        window.setTimeout(() => onClose(), 140);
    }, [closing, onClose]);

    const submit = useCallback(() => {
        if (closing || !trimmed || duplicated) return;
        setClosing(true);
        window.setTimeout(() => {
            onSubmit(trimmed);
            onClose();
        }, 140);
    }, [closing, trimmed, duplicated, onSubmit, onClose]);

    return (
        <div
            className={closing
                ? `${styles.createOverlay} ${styles.createOverlayOut}`
                : styles.createOverlay}
            onMouseDown={e => {
                if (e.target === e.currentTarget) close();
            }}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    close();
                }
            }}
        >
            <div
                className={closing
                    ? `${styles.createDialog} ${styles.createDialogOut}`
                    : styles.createDialog}
                role="dialog"
                aria-modal="true"
                aria-label={t('newPlaylist')}
            >
                <div className={styles.createTitle}>{t('newPlaylist')}</div>
                <input
                    ref={inputRef}
                    className={styles.createInput}
                    value={name}
                    placeholder={t('newPlaylistPlaceholder')}
                    spellCheck={false}
                    onChange={e => {
                        setName(e.target.value);
                        setTouched(true);
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            close();
                        }
                    }}
                    aria-invalid={!!errorText}
                />
                <div className={errorText ? `${styles.createHint} ${styles.createHintError}` : styles.createHint}>
                    {errorText || (name.trim() ? t('createHint') : t('createHintIdle'))}
                </div>
                <div className={styles.createActions}>
                    <button className={styles.createCancel} onClick={close}>{t('cancel')}</button>
                    <button
                        className={styles.createSubmit}
                        disabled={!canCreate}
                        onClick={submit}
                    >
                        {t('create')}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default injectIntl(CreatePlaylistDialog);
