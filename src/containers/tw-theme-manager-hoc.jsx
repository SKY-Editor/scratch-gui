import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import {applyGuiColors} from '../lib/themes/guiHelpers';
import {applyUiThemeChrome, getUiThemeById} from '../Theme/public/ui-theme-registry.js';
import {BLOCKS_CUSTOM, Theme} from '../lib/themes';
import {
    detectTheme,
    hasStoredGuiPreference,
    onSystemPreferenceChange,
    persistTheme
} from '../lib/themes/themePersistance';
import {setTheme} from '../reducers/theme';
// 副作用导入：在编辑器启动时登记 SKY 新增功能的双主题呈现形态（唯一登记处）
import '../editor-framework-core/feature-surfaces.js';

const TWThemeManagerHOC = function (WrappedComponent) {
    class TWThemeManagerComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleSystemThemeChange',
                'syncThemeGui'
            ]);
            applyGuiColors(props.reduxTheme);
            applyUiThemeChrome(props.uiTheme, props.reduxTheme.isDark());
        }
        componentDidMount () {
            this.removeListeners = onSystemPreferenceChange(this.handleSystemThemeChange);
            // 只有用户从未显式选择过明暗时，才用主题声明的默认明暗做首次同步；
            // 已持久化的选择必须原样保留，否则刷新后会被主题默认值覆盖（深浅色复原）
            if (!hasStoredGuiPreference()) {
                this.syncThemeGui(this.props.uiTheme);
            }
        }
        componentDidUpdate (prevProps) {
            if (prevProps.reduxTheme !== this.props.reduxTheme) {
                applyGuiColors(this.props.reduxTheme);
                applyUiThemeChrome(this.props.uiTheme, this.props.reduxTheme.isDark());
            } else if (prevProps.uiTheme !== this.props.uiTheme) {
                applyUiThemeChrome(this.props.uiTheme, this.props.reduxTheme.isDark());
                this.syncThemeGui(this.props.uiTheme);
            }
        }
        // 切换 UI 主题时，把明暗基础同步为该主题注册表声明的默认值（主题自带主视觉明暗）
        syncThemeGui (uiTheme) {
            const preset = getUiThemeById(uiTheme);
            const targetGui = preset && preset.gui;
            if (!targetGui) return;
            const current = this.props.reduxTheme;
            if (!current || current.gui === targetGui) return;
            const nextTheme = current.set('gui', targetGui);
            this.props.onChangeTheme(nextTheme);
            // 同步后的明暗要立即落盘，否则刷新会回退到切换前的明暗
            persistTheme(nextTheme);
        }
        componentWillUnmount () {
            this.removeListeners();
        }
        handleSystemThemeChange () {
            let newTheme = detectTheme();
            if (this.props.reduxTheme.blocks === BLOCKS_CUSTOM) {
                newTheme = newTheme.set('blocks', BLOCKS_CUSTOM);
            }
            this.props.onChangeTheme(newTheme);
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                reduxTheme,
                uiTheme,
                onChangeTheme,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }

    TWThemeManagerComponent.propTypes = {
        reduxTheme: PropTypes.instanceOf(Theme),
        uiTheme: PropTypes.string,
        onChangeTheme: PropTypes.func
    };

    const mapStateToProps = (state, ownProps) => ({
        // Allow embed page to override theme
        reduxTheme: ownProps.theme || state.scratchGui.theme.theme,
        uiTheme: state.scratchGui.uiTheme
    });

    const mapDispatchToProps = dispatch => ({
        onChangeTheme: theme => dispatch(setTheme(theme))
    });

    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(TWThemeManagerComponent);
};

export default TWThemeManagerHOC;
