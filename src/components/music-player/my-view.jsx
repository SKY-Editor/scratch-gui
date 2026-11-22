import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage} from './i18n';
import {CloseIcon, UserIcon} from './icons.jsx';
import {
    checkQrCode,
    clearAuth,
    clearBrowserCookie,
    completeLogin,
    fetchProfile,
    fetchQrCode,
    readAuth
} from './netease-auth';

// 「我的」网易云账号弹窗（v9）：居中卡片 + 遮罩，不再占用右侧主内容区。
//  - 未登录：二维码 + 状态胶囊 + 过期/失败后可刷新 + 登录方式说明；
//  - 已登录：头像 / 昵称 / UID 与退出登录按钮，并把资料回传给上层（侧栏按钮同步显示）；
//  - 关闭：Esc / 点击遮罩 / 右上角关闭按钮，140ms 退出动画结束后由上层卸载，回到打开前的视图。
// 登录态持久化见 netease-auth.js（localStorage + 浏览器 cookie 双通道）。
const POLL_INTERVAL = 2000;
const MAX_POLLS = 90; // 约 3 分钟后按过期处理，避免无限轮询

const STATE_TEXT_KEY = {
    loading: 'qrLoading',
    waiting: 'qrWaitScan',
    scanned: 'qrWaitConfirm',
    success: 'qrSuccess',
    expired: 'qrExpired',
    error: 'qrError'
};

const MyView = memo(function MyView ({intl, onAuthChange, onToast, onClose}) {
    const [closing, setClosing] = useState(false);
    const closingRef = useRef(false);
    // t 必须稳定引用：下方 effect 依赖 startLogin -> poll -> finishLogin -> t，
    // 若每次渲染都新建 t，会把整个扫码轮询流程重置（二维码反复刷新、永远扫不上）。
    const t = useCallback((key, values) => mpMessage(intl, key, values), [intl]);
    const [profile, setProfile] = useState(() => readAuth().profile);
    // 关闭：先播 140ms 退出动画，再交给上层卸载（与新建歌单浮层同一节奏）
    const close = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        setClosing(true);
        window.setTimeout(() => {
            if (onClose) onClose();
        }, 140);
    }, [onClose]);
    // Esc 关闭：捕获阶段监听，焦点落在窗口内其它控件时也能关掉；
    // 用 stopImmediatePropagation 挡住窗口外壳既有的「Esc 关窗口」行为，避免弹窗连窗口一起关。
    useEffect(() => {
        const handleKeyDown = e => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            close();
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [close]);
    const [state, setState] = useState('loading');
    const [qr, setQr] = useState(null);
    const aliveRef = useRef(true);
    const timerRef = useRef(null);
    const qrKeyRef = useRef('');
    const pollsRef = useRef(0);

    const stopPolling = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // 扫码成功后：换账号资料 → 落盘 → 通知上层（payload 为 803 响应体，内含登录 cookie）
    const finishLogin = useCallback(async payload => {
        setState('success');
        stopPolling();
        try {
            const next = await completeLogin(payload);
            if (!aliveRef.current) return;
            if (!next) {
                // cookie 没落地（或已失效）：提示重试，不写入假登录态
                setState('error');
                return;
            }
            setProfile(next);
            if (onAuthChange) onAuthChange(next);
            if (onToast) onToast(t('loginWelcome', {name: next.nickname || ''}));
        } catch (e) {
            if (aliveRef.current) setState('error');
        }
    }, [onAuthChange, onToast, stopPolling, t]);

    const poll = useCallback(() => {
        const key = qrKeyRef.current;
        if (!key) return;
        timerRef.current = setTimeout(async () => {
            if (!aliveRef.current) return;
            pollsRef.current += 1;
            if (pollsRef.current > MAX_POLLS) {
                setState('expired');
                stopPolling();
                return;
            }
            try {
                const res = await checkQrCode(key);
                if (!aliveRef.current) return;
                if (res.code === 803) {
                    await finishLogin(res);
                    return;
                }
                if (res.code === 802) {
                    setState('scanned');
                } else if (res.code === 800) {
                    setState('expired');
                    stopPolling();
                    return;
                } else {
                    setState(prev => (prev === 'scanned' ? prev : 'waiting'));
                }
            } catch (e) {
                // 偶发网络抖动不打断轮询，交给下一轮
            }
            if (qrKeyRef.current === key) poll();
        }, POLL_INTERVAL);
    }, [finishLogin, stopPolling]);

    // 生成二维码并开始轮询
    const startLogin = useCallback(async () => {
        stopPolling();
        setState('loading');
        setQr(null);
        qrKeyRef.current = '';
        pollsRef.current = 0;
        try {
            const data = await fetchQrCode();
            if (!aliveRef.current) return;
            qrKeyRef.current = data.key;
            setQr(data);
            setState('waiting');
            poll();
        } catch (e) {
            if (aliveRef.current) setState('error');
        }
    }, [poll, stopPolling]);

    // 进入页面：已登录则后台校验一次登录态（失效则回到扫码）
    useEffect(() => {
        aliveRef.current = true;
        const saved = readAuth();
        if (saved.profile) {
            setProfile(saved.profile);
            setState('success');
            // 本地没存 cookie（历史登录数据）时借用浏览器 cookie 校验，避免被 __nc 剥离误判登出
            fetchProfile(!saved.cookie)
                .then(next => {
                    if (!aliveRef.current) return;
                    if (next) {
                        setProfile(next);
                        if (onAuthChange) onAuthChange(next);
                    } else {
                        clearAuth();
                        setProfile(null);
                        if (onAuthChange) onAuthChange(null);
                        startLogin();
                    }
                })
                .catch(() => {
                    // 网络异常时保留本地登录态展示，不强制登出
                });
        } else {
            startLogin();
        }
        return () => {
            aliveRef.current = false;
            stopPolling();
        };
    }, [onAuthChange, startLogin, stopPolling]);

    const handleLogout = useCallback(() => {
        clearAuth();
        clearBrowserCookie();
        setProfile(null);
        if (onAuthChange) onAuthChange(null);
        if (onToast) onToast(t('logoutDone'));
        startLogin();
    }, [onAuthChange, onToast, startLogin, t]);

    const stateText = t(STATE_TEXT_KEY[state] || 'qrWaitScan');

    return (
        <div
            className={closing ? `${styles.myOverlay} ${styles.myOverlayOut}` : styles.myOverlay}
            role="presentation"
            onMouseDown={e => {
                // 遮罩同时承担两件事：判定点空白关闭 + 拦截冒泡，
                // 不让 mousedown / click 继续上抛到编辑器画布与 iframe，避免事件穿透导致重载。
                e.stopPropagation();
                if (e.target === e.currentTarget) close();
            }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.stopPropagation()}
        >
            <div
                className={closing ? `${styles.myDialog} ${styles.myDialogOut}` : styles.myDialog}
                role="dialog"
                aria-modal="true"
                aria-label={profile ? t('accountTitle') : t('loginTitle')}
                onMouseDown={e => e.stopPropagation()}
            >
                <div className={styles.myDialogHead}>
                    <span className={styles.myDialogTitle}>
                        {profile ? t('accountTitle') : t('loginTitle')}
                    </span>
                    <button
                        className={styles.myDialogClose}
                        onClick={close}
                        title={t('close')}
                        aria-label={t('close')}
                    >
                        <CloseIcon size={14} />
                    </button>
                </div>
                {profile ? (
                    <div className={styles.myCard}>
                        <div className={styles.myProfileRow}>
                            {profile.avatar
                                ? <img className={styles.myAvatar} src={profile.avatar} alt="" />
                                : (
                                    <span className={`${styles.myAvatar} ${styles.myAvatarEmpty}`}>
                                        <UserIcon size={26} />
                                    </span>
                                )}
                            <span className={styles.myProfileText}>
                                <span className={styles.myNickname}>{profile.nickname || '-'}</span>
                                <span className={styles.myUid}>{t('accountUid', {uid: profile.userId})}</span>
                            </span>
                            <button className={styles.myLogoutBtn} onClick={handleLogout}>
                                {t('logout')}
                            </button>
                        </div>
                        <div className={styles.myLoginHint}>{t('loginHint')}</div>
                    </div>
                ) : (
                    <div className={styles.myCard}>
                        <div className={styles.myQrWrap}>
                            <div className={styles.myQrBox} data-state={state}>
                                {qr && qr.image ? (
                                    <img
                                        className={styles.myQrImage}
                                        src={qr.image}
                                        alt=""
                                        style={state === 'expired' ? {opacity: 0.16} : null}
                                    />
                                ) : null}
                                {state === 'expired' && (
                                    <button className={styles.myQrMask} onClick={startLogin}>
                                        <span>{t('qrRefresh')}</span>
                                    </button>
                                )}
                                {state === 'scanned' && (
                                    <span className={styles.myQrMask}>
                                        <span>{t('qrWaitConfirm')}</span>
                                    </span>
                                )}
                                {!qr && (
                                    <span className={styles.myQrEmpty}>
                                        {state === 'error' ? t('qrError') : t('qrLoading')}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className={styles.myQrStatus}>
                            <span className={styles.myQrDot} data-state={state} />
                            <span>{stateText}</span>
                        </div>
                        {state === 'error' && (
                            <button className={styles.myRefreshBtn} onClick={startLogin}>
                                {t('qrRefresh')}
                            </button>
                        )}
                        <div className={styles.myLoginHowto}>
                            <div className={styles.myLoginHowtoTitle}>{t('loginHowTo')}</div>
                            <div className={styles.myLoginStep}>{t('loginStep1')}</div>
                            <div className={styles.myLoginStep}>{t('loginStep2')}</div>
                            <div className={styles.myLoginStep}>{t('loginStep3')}</div>
                        </div>
                        <div className={styles.myLoginHint}>{t('loginHint')}</div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default injectIntl(MyView);
