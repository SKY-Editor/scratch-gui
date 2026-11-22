import PropTypes from 'prop-types';
import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {connect} from 'react-redux';
// 窗口交互上下文（Win11 外壳提供 bringToFront；官方弹窗外壳下为 no-op 默认值）
import {Win11WindowInteractionContext} from '../../Theme/sky-editor/components/win11-window/win11-window.jsx';
// 主题感知窗口：SKYEditor 主题 → Win11 窗口外壳；TurboWarp 主题 → 官方 Modal 弹窗
import ThemedWindow from '../tw-themed-window/themed-window.jsx';
import {PACKAGER_URL, PACKAGER_ORIGIN} from '../../lib/tw-packager-integration-hoc.jsx';

// SKY Editor: 打包/解包器窗口
// 在 SKYEditor 主题下，File 菜单的「Package project」不再新开标签页，
// 而是以内嵌 iframe 的 Win11Window 窗口呈现（iframe 指向本地打包/解包器整合页）。
// 打包器页面（P4.svelte -> import-external-project.js）在 URL 带 import_from 参数时
// 会主动向父窗口发送 ready-for-import 消息，由 tw-packager-integration-hoc.jsx 的
// handleMessage 响应并回传项目数据（postMessage 导入），此处无需重复通知。
// 窗口标题栏图标（打包箱内联 SVG 转 data URI，React 版 Win11Window icon prop）
const WINDOW_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#4c97ff"><path d="M20 8h-2.5L16 3.5A1.5 1.5 0 0 0 14.6 2.5H9.4A1.5 1.5 0 0 0 8 3.5L6.5 8H4a2 2 0 0 0-2 2v2h20v-2a2 2 0 0 0-2-2zM6.1 8L7.4 4h9.2l1.3 4H6.1zM2 14v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5H2z"/></svg>'
)}`;

// SKY Editor: 编辑器主题 -> 打包/解包器主题名（与编辑器 uiTheme 保持一致的亮/暗判定）
const getEditorThemeName = theme => (
    theme && typeof theme.isDark === 'function' && theme.isDark() ? 'dark' : 'light'
);

const PackagerContent = ({themeName, locale}) => {
    const {bringToFront} = useContext(Win11WindowInteractionContext);
    const iframeRef = useRef(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    // iframe 地址只在首次挂载时确定，先把当前主题/语言作为初始参数带入，避免首屏闪烁；
    // 之后编辑器切换主题/语言时改用 postMessage 同步，不重设 src（否则 iframe 会重新加载、丢失打包器内部状态）。
    const src = useMemo(() => (
        `${PACKAGER_URL}/?import_from=${encodeURIComponent(window.location.origin)}` +
        `&theme=${encodeURIComponent(themeName)}&locale=${encodeURIComponent(locale)}`
    ), []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!iframeLoaded) {
            return;
        }
        const iframeWindow = iframeRef.current && iframeRef.current.contentWindow;
        if (!iframeWindow) {
            return;
        }
        iframeWindow.postMessage({
            p4: {
                type: 'editor-sync',
                theme: themeName,
                locale: locale
            }
        }, PACKAGER_ORIGIN);
    }, [themeName, locale, iframeLoaded]);

    // iframe 内点击不冒泡到父窗口，需消费 InteractionContext 把窗口置前
    const handleIframeMouseDown = () => {
        bringToFront();
    };

    const handleIframeLoad = () => {
        setIframeLoaded(true);
    };

    return (
        <div
            style={{
                height: '100%',
                overflow: 'hidden',
                position: 'relative'
            }}
        >
            <iframe
                ref={iframeRef}
                src={src}
                onLoad={handleIframeLoad}
                onMouseDown={handleIframeMouseDown}
                title="Packager"
                style={{
                    border: 'none',
                    height: '100%',
                    width: '100%'
                }}
            />
        </div>
    );
};

PackagerContent.propTypes = {
    themeName: PropTypes.string,
    locale: PropTypes.string
};

const PackagerWindow = ({onClose, themeName, locale}) => (
    <ThemedWindow
        windowId="packager"
        title={locale && locale.indexOf('zh') === 0 ? '打包/解包器' : 'Packager'}
        onClose={onClose}
        icon={WINDOW_ICON}
        defaultWidth={1080}
        defaultHeight={700}
        disableMaximize={false}
        disableResize={false}
        flushBody
    >
        <PackagerContent
            themeName={themeName}
            locale={locale}
        />
    </ThemedWindow>
);

PackagerWindow.propTypes = {
    onClose: PropTypes.func.isRequired,
    themeName: PropTypes.string,
    locale: PropTypes.string
};

const mapStateToProps = state => ({
    // theme 挂在 scratchGui.theme.theme，locales 挂在顶层 state.locales
    //（与 menu-bar.jsx 一致），两者均做空值兜底，避免窗口打开时因字段缺失崩溃。
    themeName: getEditorThemeName(
        state.scratchGui && state.scratchGui.theme && state.scratchGui.theme.theme
    ),
    locale: (state.locales && state.locales.locale) || 'en'
});

export default connect(mapStateToProps)(PackagerWindow);
