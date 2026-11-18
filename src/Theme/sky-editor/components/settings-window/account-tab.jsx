/**
 * AccountTab —— 设置窗口页面（account-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {FormattedMessage, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {messages} from './settings-messages';
import {apiClient, sessionManager, solvePow} from '../../../../../../skyeditor-account/src/index.js';
import {setSkyEditorCloud, clearSkyEditorCloud} from '../../../../lib/sky-editor-cloud.js';
import settingsIcon from '../../../../components/menu-bar/icon--settings.svg';


/**
 * 账号设置页
 *
 * 形态 A（未登录）：
 *   - 大标题「登录SKYEditor」+ 圆角方框登录入口
 *   - 点击入口后可选两种登录方式：
 *     a. SKY Studio 扫码登录 —— 「未完成」占位
 *     b. 创客次元账号登录 —— 用户名/密码/图形验证码 表单（验证码来自 /captcha，PoW 自动求解）
 * 形态 B（已登录）：圆形头像 + ID(username) + 个人简介(bio/signature)，退出登录按钮
 *
 * 登录态由 skyeditor-account 的 sessionManager 统一管理（localStorage 持久化），
 * 登录成功后把 token/用户/云服务常量/云项目接口挂到 window.__SKYEDITOR_CLOUD__ 供云变量接入复用。
 * @returns {JSX.Element} 账号设置页内容
 */
const AccountTab = ({
    intl
}) => {
    const [snapshot, setSnapshot] = useState(sessionManager.getSnapshot());
    // 未登录页的导航阶段：landing(登录入口) | choose(选择方式) | sky(扫码占位) | ctspace(账号表单) | register(注册表单)
    const [stage, setStage] = useState('landing');
    const [notice, setNotice] = useState('');
    const [errorText, setErrorText] = useState('');

    // 创客次元登录表单
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [captchaAnswer, setCaptchaAnswer] = useState('');

    // 注册表单
    const [email, setEmail] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // 图形验证码 / PoW
    const [captchaDataUrl, setCaptchaDataUrl] = useState('');
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaPowNonce, setCaptchaPowNonce] = useState('');
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [captchaError, setCaptchaError] = useState(false);
    // 验证码图片已显示后，后台仍在并行求解 PoW（difficulty 较大时可能耗时数秒）
    const [powSolving, setPowSolving] = useState(false);
    const captchaReqRef = useRef(0);
    const [submitting, setSubmitting] = useState(false);

    const [avatarBroken, setAvatarBroken] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        const unsubscribe = sessionManager.subscribe(next => {
            if (mountedRef.current) setSnapshot(next);
        });
        return () => {
            mountedRef.current = false;
            unsubscribe();
        };
    }, []);

    const loggedIn = Boolean(snapshot && snapshot.loggedIn);
    const user = (snapshot && snapshot.user) || null;

    // 获取验证码：图片立即显示，PoW（口令）在后台并行求解，用户无需等待
    const loadCaptcha = useCallback(async () => {
        const reqId = ++captchaReqRef.current;
        setCaptchaLoading(true);
        setCaptchaError(false);
        setCaptchaDataUrl('');
        setCaptchaToken('');
        setCaptchaPowNonce('');
        setPowSolving(false);
        try {
            const cap = await apiClient.getCaptcha();
            // 只接受最新一次请求的结果，防止刷新后旧响应回填 state
            if (!mountedRef.current || captchaReqRef.current !== reqId) return;
            setCaptchaToken(cap.token);
            // 先展示验证码图片，不等待 PoW
            setCaptchaDataUrl(cap.imageDataUrl);
            setCaptchaLoading(false);
            // 后台并行求解 PoW（失败也不阻断图片显示）
            setPowSolving(true);
            try {
                const nonce = await solvePow(cap.pow.challenge, cap.pow.difficulty);
                if (!mountedRef.current || captchaReqRef.current !== reqId) return;
                setCaptchaPowNonce(nonce);
            } catch (e) {
                if (mountedRef.current && captchaReqRef.current === reqId) {
                    // PoW 失败（如非 Secure Context 下 crypto.subtle 不可用）：口令留空，按钮禁用并提示
                    setCaptchaPowNonce('');
                }
            } finally {
                if (mountedRef.current && captchaReqRef.current === reqId) {
                    setPowSolving(false);
                }
            }
        } catch (e) {
            if (mountedRef.current && captchaReqRef.current === reqId) {
                setCaptchaError(true);
                setCaptchaLoading(false);
            }
        }
    }, []);

    // 进入创客次元登录/注册表单时初始化验证码
    useEffect(() => {
        if ((stage === 'ctspace' || stage === 'register') && !loggedIn) {
            setNotice('');
            setErrorText('');
            setUsername('');
            setPassword('');
            setCaptchaAnswer('');
            if (stage === 'register') {
                setEmail('');
                setConfirmPassword('');
            }
            setAvatarBroken(false);
            loadCaptcha();
        }
    }, [stage, loggedIn, loadCaptcha]);

    // 把完整用户资料与云接入桥统一写入登录态（登录/注册成功后共用）
    const finalizeLogin = useCallback((token, usernameValue) => {
        // 拉取完整资料：优先公开资料（可能含头像/简介），失败回退 /auth/me
        let profile = null;
        return apiClient.getUserByUsername(usernameValue)
            .catch(() => null)
            .then(found => {
                profile = found || null;
                return apiClient.getMe().catch(() => null);
            })
            .then(me => {
                const mergedUser = {
                    username: usernameValue,
                    ...(profile || {}),
                    ...(me || {})
                };
                // token + 用户资料已由 sessionManager 持久化到 localStorage
                sessionManager.setSession({token, user: mergedUser});
                // 云变量接入桥：令牌 / 用户 / 创客次元云服务器 / 云项目 REST 接口，供后续接入复用
                setSkyEditorCloud(token, mergedUser);
                if (mountedRef.current) {
                    setStage('landing');
                    setNotice('');
                }
            });
    }, []);

    const handleLoginClick = async () => {
        if (submitting || captchaLoading || !captchaToken || !captchaPowNonce) return;
        setSubmitting(true);
        setErrorText('');
        try {
            const result = await apiClient.login({
                username,
                password,
                captchaToken,
                captchaAnswer,
                captchaPowNonce
            });
            const token = result && result.token;
            if (!token) {
                throw new Error('服务器未返回登录令牌');
            }
            await finalizeLogin(token, result.username || username);
        } catch (e) {
            if (mountedRef.current) {
                setErrorText(intl.formatMessage(messages.accountLoginFail, {
                    error: (e && e.message) || '未知错误'
                }));
                // 登录失败后刷新验证码，避免复用失效口令
                loadCaptcha();
            }
        } finally {
            if (mountedRef.current) setSubmitting(false);
        }
    };

    const handleRegisterClick = async () => {
        if (submitting || captchaLoading || !captchaToken || !captchaPowNonce) return;
        // 前端校验：两次密码一致 & 邮箱格式
        if (password !== confirmPassword) {
            setErrorText(intl.formatMessage(messages.accountPasswordMismatch));
            return;
        }
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailOk) {
            setErrorText(intl.formatMessage(messages.accountEmailInvalid));
            return;
        }
        setSubmitting(true);
        setErrorText('');
        try {
            const result = await apiClient.register({
                username,
                email,
                password,
                captchaToken,
                captchaAnswer,
                captchaPowNonce
            });
            const token = result && result.token;
            if (!token) {
                throw new Error('服务器未返回注册令牌');
            }
            await finalizeLogin(token, result.username || username);
            if (mountedRef.current) {
                setNotice(intl.formatMessage(messages.accountRegisterSuccess));
            }
        } catch (e) {
            if (mountedRef.current) {
                setErrorText(intl.formatMessage(messages.accountLoginFail, {
                    error: (e && e.message) || '未知错误'
                }));
                // 注册失败后刷新验证码，避免复用失效口令
                loadCaptcha();
            }
        } finally {
            if (mountedRef.current) setSubmitting(false);
        }
    };

    const handleLogoutClick = () => {
        sessionManager.clear();
        clearSkyEditorCloud();
        setStage('landing');
        setNotice('');
        setErrorText('');
    };

    // ---------- 形态 B：已登录 ----------
    if (loggedIn) {
        // 简介字段多来源兼容（公开资料/登录资料字段可能不同），过滤空白后无内容再回退占位文案
        const rawBio = user ? (user.signature || user.bio || user.description || user.introduction || user.sign) : '';
        const bioText = (typeof rawBio === 'string' ? rawBio.trim() : '');
        const bio = bioText || intl.formatMessage(messages.accountBioFallback);
        const avatarUrl = user && typeof user.avatar === 'string' ? user.avatar : '';
        return (
            <div className={styles.windowSettings}>
                <div className={styles.windowSectionHeader}>
                    <img
                        className={styles.windowTabIcon}
                        src={settingsIcon}
                        draggable={false}
                        width={16}
                        height={16}
                        alt=""
                    />
                    <FormattedMessage {...messages.accountTab} />
                    <div className={styles.windowSectionDivider} />
                </div>
                <div className={styles.accountCard}>
                    <div className={styles.accountAvatarWrap}>
                        {avatarUrl && !avatarBroken ? (
                            <img
                                className={styles.accountAvatar}
                                src={avatarUrl}
                                draggable={false}
                                alt=""
                                // eslint-disable-next-line react/jsx-no-bind
                                onError={() => setAvatarBroken(true)}
                            />
                        ) : (
                            <div className={styles.accountAvatarPlaceholder}>
                                {user && user.username ? user.username[0].toUpperCase() : '?'}
                            </div>
                        )}
                    </div>
                    <div className={styles.accountCardBody}>
                        <div className={styles.accountCardIdValue}>
                            {user ? user.username : '—'}
                        </div>
                        <div
                            className={bioText ? styles.accountCardBio : styles.accountCardBioFallback}
                        >
                            {bio}
                        </div>
                    </div>
                </div>
                <div className={styles.accountCloudHint}>
                    <FormattedMessage {...messages.accountCloudBridgeTip} />
                </div>
                <button
                    className={styles.accountDangerButton}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={handleLogoutClick}
                >
                    <FormattedMessage {...messages.accountLogout} />
                </button>
            </div>
        );
    }

    // ---------- 形态 A：未登录 ----------
    return (
        <div className={styles.windowSettings}>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={settingsIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.accountTab} />
                <div className={styles.windowSectionDivider} />
            </div>

            {stage === 'landing' && (
                <div className={styles.accountLanding}>
                    <div className={styles.accountLoginTitle}>
                        <FormattedMessage {...messages.accountLoginTitle} />
                    </div>
                    <div className={styles.accountLoginIntro}>
                        <FormattedMessage {...messages.accountLoginIntro} />
                    </div>
                    <div
                        className={styles.accountLoginBox}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('choose')}
                    >
                        <span className={styles.accountLoginBoxLabel}>
                            <FormattedMessage {...messages.accountLoginEntry} />
                        </span>
                    </div>
                    <button
                        className={classNames(styles.accountGhostButton, styles.accountRegisterEntry)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('register')}
                    >
                        <FormattedMessage {...messages.accountRegisterEntry} />
                    </button>
                </div>
            )}

            {stage === 'choose' && (
                <div className={styles.accountMethods}>
                    <button
                        className={styles.accountMethodButton}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => {
                            setNotice(intl.formatMessage(messages.accountNotImplemented));
                            setStage('sky');
                        }}
                    >
                        <FormattedMessage {...messages.accountLoginWithSkyStudio} />
                    </button>
                    <button
                        className={styles.accountMethodButton}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('ctspace')}
                    >
                        <FormattedMessage {...messages.accountLoginWithCtspace} />
                    </button>
                    <button
                        className={styles.accountGhostButton}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('landing')}
                    >
                        <FormattedMessage {...messages.accountBack} />
                    </button>
                    <button
                        className={classNames(styles.accountGhostButton, styles.accountRegisterEntry)}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('register')}
                    >
                        <FormattedMessage {...messages.accountRegisterEntry} />
                    </button>
                </div>
            )}

            {stage === 'register' && (
                <div className={styles.accountForm}>
                    <div className={styles.accountRegisterTitle}>
                        <FormattedMessage {...messages.accountRegisterTitle} />
                    </div>
                    <div className={styles.accountLoginIntro}>
                        <FormattedMessage {...messages.accountRegisterIntro} />
                    </div>
                    {notice && <div className={styles.accountNotice}>{notice}</div>}
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountUsername} />
                        </label>
                        <input
                            className={styles.cloudServerInput}
                            type="text"
                            value={username}
                            autoComplete="username"
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setUsername(e.target.value)}
                        />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountEmail} />
                        </label>
                        <input
                            className={styles.cloudServerInput}
                            type="email"
                            value={email}
                            autoComplete="email"
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountPassword} />
                        </label>
                        <input
                            className={styles.cloudServerInput}
                            type="password"
                            value={password}
                            autoComplete="new-password"
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountConfirmPassword} />
                        </label>
                        <input
                            className={styles.cloudServerInput}
                            type="password"
                            value={confirmPassword}
                            autoComplete="new-password"
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountCaptcha} />
                        </label>
                        <div className={styles.accountCaptchaRow}>
                            {captchaLoading ? (
                                <div className={styles.accountCaptchaPlaceholder}>
                                    <FormattedMessage {...messages.accountLoggingInWait} />
                                </div>
                            ) : captchaError || !captchaDataUrl ? (
                                <div
                                    className={styles.accountCaptchaError}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={loadCaptcha}
                                >
                                    <FormattedMessage {...messages.accountCaptchaFail} />
                                </div>
                            ) : (
                                <img
                                    className={styles.accountCaptchaImage}
                                    src={captchaDataUrl}
                                    draggable={false}
                                    alt="captcha"
                                    title={intl.formatMessage(messages.accountCaptchaRefresh)}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={loadCaptcha}
                                />
                            )}
                            <input
                                className={styles.cloudServerInput}
                                type="text"
                                value={captchaAnswer}
                                autoComplete="off"
                                // eslint-disable-next-line react/jsx-no-bind
                                onChange={e => setCaptchaAnswer(e.target.value)}
                            />
                        </div>
                        <div className={styles.accountCaptchaHint}>
                            {powSolving ?
                                <FormattedMessage {...messages.accountPowSolving} /> :
                                <FormattedMessage {...messages.accountCaptchaRefresh} />}
                        </div>
                    </div>
                    {errorText && <div className={styles.accountError}>{errorText}</div>}
                    <div className={styles.accountFormActions}>
                        <button
                            className={styles.accountPrimaryButton}
                            disabled={submitting || captchaLoading || powSolving}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={handleRegisterClick}
                        >
                            {submitting ?
                                <FormattedMessage {...messages.accountRegistering} /> :
                                <FormattedMessage {...messages.accountRegister} />}
                        </button>
                        <button
                            className={styles.accountGhostButton}
                            disabled={submitting}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => setStage('ctspace')}
                        >
                            <FormattedMessage {...messages.accountGoLogin} />
                        </button>
                    </div>
                </div>
            )}

            {stage === 'sky' && (
                <div className={styles.accountMethods}>
                    {notice && <div className={styles.accountNotice}>{notice}</div>}
                    <button
                        className={styles.accountGhostButton}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('choose')}
                    >
                        <FormattedMessage {...messages.accountBack} />
                    </button>
                </div>
            )}

            {stage === 'ctspace' && (
                <div className={styles.accountForm}>
                    <div className={styles.accountRegisterTitle}>
                        <FormattedMessage {...messages.accountLoginWithCtspace} />
                    </div>
                    <div className={styles.accountLoginIntro}>
                        <FormattedMessage {...messages.accountLoginIntro} />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountUsername} />
                        </label>
                        <input
                            className={styles.cloudServerInput}
                            type="text"
                            value={username}
                            autoComplete="username"
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setUsername(e.target.value)}
                        />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountPassword} />
                        </label>
                        <input
                            className={styles.cloudServerInput}
                            type="password"
                            value={password}
                            autoComplete="current-password"
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    <div className={styles.accountFormRow}>
                        <label className={styles.accountFormLabel}>
                            <FormattedMessage {...messages.accountCaptcha} />
                        </label>
                        <div className={styles.accountCaptchaRow}>
                            {captchaLoading ? (
                                <div className={styles.accountCaptchaPlaceholder}>
                                    <FormattedMessage {...messages.accountLoggingInWait} />
                                </div>
                            ) : captchaError || !captchaDataUrl ? (
                                <div
                                    className={styles.accountCaptchaError}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={loadCaptcha}
                                >
                                    <FormattedMessage {...messages.accountCaptchaFail} />
                                </div>
                            ) : (
                                <img
                                    className={styles.accountCaptchaImage}
                                    src={captchaDataUrl}
                                    draggable={false}
                                    alt="captcha"
                                    title={intl.formatMessage(messages.accountCaptchaRefresh)}
                                    // eslint-disable-next-line react/jsx-no-bind
                                    onClick={loadCaptcha}
                                />
                            )}
                            <input
                                className={styles.cloudServerInput}
                                type="text"
                                value={captchaAnswer}
                                autoComplete="off"
                                // eslint-disable-next-line react/jsx-no-bind
                                onChange={e => setCaptchaAnswer(e.target.value)}
                            />
                        </div>
                        <div className={styles.accountCaptchaHint}>
                            {powSolving ?
                                <FormattedMessage {...messages.accountPowSolving} /> :
                                <FormattedMessage {...messages.accountCaptchaRefresh} />}
                        </div>
                    </div>
                    {errorText && <div className={styles.accountError}>{errorText}</div>}
                    <div className={styles.accountFormActions}>
                        <button
                            className={styles.accountPrimaryButton}
                            disabled={submitting || captchaLoading || powSolving}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={handleLoginClick}
                        >
                            {submitting ?
                                <FormattedMessage {...messages.accountLoggingIn} /> :
                                <FormattedMessage {...messages.accountLogin} />}
                        </button>
                        <button
                            className={styles.accountGhostButton}
                            disabled={submitting}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => setStage('choose')}
                        >
                            <FormattedMessage {...messages.accountBack} />
                        </button>
                    </div>
                    <button
                        className={classNames(styles.accountGhostButton, styles.accountRegisterEntry)}
                        disabled={submitting}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setStage('register')}
                    >
                        <FormattedMessage {...messages.accountRegisterEntry} />
                    </button>
                </div>
            )}
        </div>
    );
};

AccountTab.propTypes = {
    intl: intlShape
};

export {AccountTab};
