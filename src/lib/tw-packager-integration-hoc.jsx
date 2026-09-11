import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import log from './log';
import {getIsShowingProject} from '../reducers/project-state';

// SKY Editor: 打包功能已从官方 packager.turbowarp.org 重定向到本地 SKY 打包器。
// 日后部署到正式域名时，仅需修改下方 PACKAGER_URL 即可（PACKAGER_ORIGIN 自动同源跟随）。
// 注意：PACKAGER_ORIGIN 必须与 PACKAGER_URL 同源，它同时用于 postMessage 消息来源校验。
const PACKAGER_URL = 'http://localhost:8947';
const PACKAGER_ORIGIN = PACKAGER_URL;

export {
    PACKAGER_URL,
    PACKAGER_ORIGIN
};

// 编辑器主题 -> 打包/解包器主题名（与 packager-window.jsx 保持一致的亮/暗判定）
const getEditorThemeName = theme => (
    theme && typeof theme.isDark === 'function' && theme.isDark() ? 'dark' : 'light'
);

const PackagerIntegrationHOC = function (WrappedComponent) {
    class PackagerIntegrationComponent extends React.Component {
        constructor (props) {
            super(props);
            this.handleClickPackager = this.handleClickPackager.bind(this);
            this.handleMessage = this.handleMessage.bind(this);
        }
        componentDidMount () {
            window.addEventListener('message', this.handleMessage);
        }
        componentWillUnmount () {
            window.removeEventListener('message', this.handleMessage);
        }
        handleClickPackager () {
            if (this.props.canOpenPackager) {
                window.open(`${PACKAGER_URL}/?import_from=${location.origin}`);
            }
        }
        handleMessage (e) {
            if (e.origin !== PACKAGER_ORIGIN) {
                return;
            }

            const packagerData = e.data && e.data.p4;
            if (!packagerData || !packagerData.type) {
                return;
            }

            // 打包器窗口内嵌加载完成时会主动索取一次当前主题/语言，
            // 此处直接回发，保证与编辑器当前状态一致（不依赖时机）。
            if (packagerData.type === 'request-editor-state') {
                e.source.postMessage({
                    p4: {
                        type: 'editor-sync',
                        theme: this.props.editorThemeName,
                        locale: this.props.editorLocale
                    }
                }, e.origin);
                return;
            }

            if (!this.props.canOpenPackager) {
                return;
            }

            if (packagerData.type !== 'ready-for-import') {
                return;
            }

            // The packager needs to know that we will be importing something so it can display a loading screen
            e.source.postMessage({
                p4: {
                    type: 'start-import'
                }
            }, e.origin);

            this.props.vm.saveProjectSb3('arraybuffer')
                .then(buffer => {
                    const name = `${this.props.reduxProjectTitle}.sb3`;
                    e.source.postMessage({
                        p4: {
                            type: 'finish-import',
                            data: buffer,
                            name
                        }
                    }, e.origin, [buffer]);
                })
                .catch(err => {
                    log.error(err);
                    e.source.postMessage({
                        p4: {
                            type: 'cancel-import'
                        }
                    }, e.origin);
                });
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                canOpenPackager,
                editorThemeName,
                editorLocale,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    onClickPackager={this.handleClickPackager}
                    {...props}
                />
            );
        }
    }
    PackagerIntegrationComponent.propTypes = {
        canOpenPackager: PropTypes.bool,
        reduxProjectTitle: PropTypes.string,
        vm: PropTypes.shape({
            saveProjectSb3: PropTypes.func
        }),
        editorThemeName: PropTypes.string,
        editorLocale: PropTypes.string
    };
    const mapStateToProps = state => ({
        canOpenPackager: getIsShowingProject(state.scratchGui.projectState.loadingState),
        reduxProjectTitle: state.scratchGui.projectTitle,
        vm: state.scratchGui.vm,
        // 供 request-editor-state 回发使用（字段位置与 packager-window.jsx 一致）
        editorThemeName: getEditorThemeName(
            state.scratchGui && state.scratchGui.theme && state.scratchGui.theme.theme
        ),
        editorLocale: (state.locales && state.locales.locale) || 'en'
    });
    const mapDispatchToProps = () => ({});
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(PackagerIntegrationComponent);
};

export {
    PackagerIntegrationHOC as default
};
