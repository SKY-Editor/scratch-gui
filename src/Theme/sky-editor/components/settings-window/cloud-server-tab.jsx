/**
 * CloudServerTab —— 设置窗口页面（cloud-server-tab.jsx）。
 * 2026-11-18 刀7 自 settings-window.jsx 拆出；由 SettingsWindow 壳按 tab 渲染，
 * intl / 页面级 props 由壳透传，接口与拆分前一致。
 */
import React, {useState, useEffect, useRef} from 'react';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import styles from '../../../../components/menu-bar/settings-menu.css';
import {messages} from './settings-messages';
import {Check} from './settings-widgets';
import {setCloudHost, setCloudHostName} from '../../../../reducers/tw';
import {SkyDropdownMenu} from '../../../../components/sky-popover/sky-popover.jsx';
import check from '../../../../components/menu-bar/check.svg';
import desktopIcon from '../../../../components/menu-bar/tw-desktop-icon.svg';


const CLOUD_HOST_SCRATCH = 'wss://clouddata.turbowarp.org';
const CLOUD_HOST_MAKER = 'wss://vable.ctspace.xyz';

// 与 cloud-provider.js openConnection 的协议补齐逻辑保持一致：
// 缺少 ws:// 或 wss:// 前缀时，按当前页面协议自动补全（http: → ws://，其余 → wss://）
const normalizeCloudHost = host => {
    if (host && !host.includes('ws://') && !host.includes('wss://')) {
        return (window.location.protocol === 'http:' ? 'ws://' : 'wss://') + host;
    }
    return host;
};

const CloudServerTab = ({
    cloudHost,
    cloudHostName,
    onSetCloudHost,
    onSetCloudHostName
}) => {
    const builtInHosts = [
        {id: 'scratch', host: CLOUD_HOST_SCRATCH, message: messages.cloudServerScratch},
        {id: 'maker', host: CLOUD_HOST_MAKER, message: messages.cloudServerMaker}
    ];
    const currentServer = builtInHosts.find(i => i.host === cloudHost) || null;
    const currentMode = currentServer ? currentServer.id : 'custom';
    const [serverMenuOpen, setServerMenuOpen] = useState(false);
    const serverMenuRef = useRef(null);
    // 用户当前选择的服务器模式（scratch / maker / custom），独立于 cloudHost，使"自定义"可先点选再输入地址
    const [selectedMode, setSelectedMode] = useState(currentMode);
    // 自定义地址草稿：仅作为输入框临时文本，提交（回车/失焦）时才写入 redux，避免输入过程中反复触发重连
    const [addressDraft, setAddressDraft] = useState(
        currentMode === 'custom' ? cloudHost : ''
    );
    // 连通性测试：testing 表示正在连接；testResult 为 null | 'ok' | 'fail' | 'empty'
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const testWsRef = useRef(null);
    const testTimerRef = useRef(null);

    // 卸载时清理正在进行的测试连接，避免残留定时器
    useEffect(() => () => {
        if (testTimerRef.current) clearTimeout(testTimerRef.current);
        if (testWsRef.current) {
            try {
                testWsRef.current.close();
            } catch (e) {
                // 忽略关闭旧连接时的异常
            }
        }
    }, []);

    useEffect(() => {
        if (!serverMenuOpen) return undefined;
        const handleMouseDown = e => {
            if (serverMenuRef.current && !serverMenuRef.current.contains(e.target)) {
                setServerMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [serverMenuOpen]);

    // 选中的是内置服务器时，同步展示其地址；自定义模式下保留用户草稿
    useEffect(() => {
        const server = builtInHosts.find(i => i.host === cloudHost);
        if (server) {
            setSelectedMode(server.id);
            setAddressDraft(server.host);
        }
    }, [cloudHost]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelectServer = mode => {
        setSelectedMode(mode);
        if (mode === 'custom') {
            // 切到自定义：清空地址草稿，方便直接输入新地址
            setAddressDraft('');
        } else {
            const host = builtInHosts.find(i => i.id === mode).host;
            onSetCloudHost(host);
            setAddressDraft(host);
        }
        setServerMenuOpen(false);
    };

    const handleAddressCommit = () => {
        const trimmed = addressDraft.trim();
        if (trimmed) {
            onSetCloudHost(normalizeCloudHost(trimmed));
        }
    };

    // 测试连通性：对当前目标地址发起一次 WebSocket 握手，open 即视为可达并立即断开。
    // 自定义模式优先用地址草稿（用户可能刚输入还未失焦提交）；内置模式用固定地址。
    const handleTestConnection = () => {
        if (testing) return;
        let targetHost = '';
        if (selectedMode === 'custom') {
            const draft = (addressDraft || '').trim();
            targetHost = normalizeCloudHost(draft || cloudHost || '');
        } else {
            const server = builtInHosts.find(i => i.id === selectedMode);
            targetHost = server ? server.host : '';
        }
        if (!targetHost) {
            setTestResult('empty');
            return;
        }
        setTesting(true);
        setTestResult(null);
        let ws = null;
        const finish = ok => {
            if (testTimerRef.current) clearTimeout(testTimerRef.current);
            testTimerRef.current = null;
            setTesting(false);
            setTestResult(ok ? 'ok' : 'fail');
            if (testWsRef.current) {
                try {
                    testWsRef.current.close();
                } catch (e) {
                    // 忽略关闭时的异常
                }
                testWsRef.current = null;
            }
        };
        try {
            ws = new WebSocket(targetHost);
            testWsRef.current = ws;
            // 8 秒内未完成握手视为失败
            testTimerRef.current = setTimeout(() => finish(false), 8000);
            ws.onopen = () => finish(true);
            ws.onerror = () => finish(false);
        } catch (e) {
            finish(false);
        }
    };

    const menuOptions = [
        ...builtInHosts.map(option => (
            <div
                key={option.id}
                className={styles.windowOption}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => handleSelectServer(option.id)}
            >
                <Check selected={selectedMode === option.id} />
                <FormattedMessage {...option.message} />
            </div>
        )),
        <div
            key="custom"
            className={styles.windowOption}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => handleSelectServer('custom')}
        >
            <Check selected={selectedMode === 'custom'} />
            <FormattedMessage {...messages.cloudServerCustom} />
        </div>
    ];

    return (
        <div className={styles.windowSettings}>
            <div className={styles.windowSectionHeader}>
                <img
                    className={styles.windowTabIcon}
                    src={desktopIcon}
                    draggable={false}
                    width={16}
                    height={16}
                    alt=""
                />
                <FormattedMessage {...messages.cloudServerTab} />
                <div className={styles.windowSectionDivider} />
            </div>
            <div className={styles.windowPlaceholder}>
                <FormattedMessage {...messages.cloudServerDescription} />
            </div>
            <div className={styles.cloudServerSection}>
                <div className={styles.cloudServerLabel}>
                    <FormattedMessage {...messages.cloudServerTypeLabel} />
                </div>
                <div
                    ref={serverMenuRef}
                    className={styles.languageDropdown}
                >
                    <button
                        className={styles.languageDropdownButton}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() => setServerMenuOpen(open => !open)}
                    >
                        <span>
                            <FormattedMessage
                                {...(selectedMode === 'custom'
                                    ? messages.cloudServerCustom
                                    : (builtInHosts.find(i => i.id === selectedMode) || {}).message || messages.cloudServerCustom)}
                            />
                        </span>
                        <span
                            className={classNames(styles.languageDropdownCaret, {
                                [styles.languageDropdownCaretOpen]: serverMenuOpen
                            })}
                        >
                            {'▾'}
                        </span>
                    </button>
                    <SkyDropdownMenu
                            open={serverMenuOpen}
                            anchorRef={serverMenuRef}
                        >

                            {menuOptions}
                                                </SkyDropdownMenu>
                </div>
            </div>
            {selectedMode === 'custom' && (
                <React.Fragment>
                    <div className={styles.cloudServerSection}>
                        <div className={styles.cloudServerLabel}>
                            <FormattedMessage {...messages.cloudServerAddressLabel} />
                        </div>
                        <input
                            className={styles.cloudServerInput}
                            type="text"
                            placeholder="example.ctspace.xyz"
                            value={addressDraft}
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => setAddressDraft(e.target.value)}
                            // eslint-disable-next-line react/jsx-no-bind
                            onBlur={handleAddressCommit}
                            // eslint-disable-next-line react/jsx-no-bind
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.target.blur();
                                }
                            }}
                        />
                    </div>
                    <div className={styles.cloudServerSection}>
                        <div className={styles.cloudServerLabel}>
                            <FormattedMessage {...messages.cloudServerNameLabel} />
                        </div>
                        <input
                            className={styles.cloudServerInput}
                            type="text"
                            placeholder="我的服务器"
                            value={cloudHostName}
                            // eslint-disable-next-line react/jsx-no-bind
                            onChange={e => onSetCloudHostName(e.target.value)}
                        />
                    </div>
                </React.Fragment>
            )}
            <div className={styles.cloudServerTestRow}>
                <button
                    className={styles.accountGhostButton}
                    disabled={testing}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={handleTestConnection}
                >
                    {testing ?
                        <FormattedMessage {...messages.cloudServerTesting} /> :
                        <FormattedMessage {...messages.cloudServerTest} />}
                </button>
            </div>
            {testResult === 'ok' && (
                <div className={styles.cloudServerTestStatusOk}>
                    <FormattedMessage {...messages.cloudServerTestOk} />
                </div>
            )}
            {testResult === 'fail' && (
                <div className={styles.cloudServerTestStatusFail}>
                    <FormattedMessage {...messages.cloudServerTestFail} />
                </div>
            )}
            {testResult === 'empty' && (
                <div className={styles.cloudServerTestStatusFail}>
                    <FormattedMessage {...messages.cloudServerTestEmpty} />
                </div>
            )}
            <div className={styles.cloudServerTestHint}>
                <FormattedMessage {...messages.cloudServerTestHint} />
            </div>
        </div>
    );
};

CloudServerTab.propTypes = {
    cloudHost: PropTypes.string,
    cloudHostName: PropTypes.string,
    onSetCloudHost: PropTypes.func,
    onSetCloudHostName: PropTypes.func
};

export {CloudServerTab};
