/**
 * 统一导出窗口
 * ---------------------------------------------------------------------------
 * 所有「导出 / 另存为 / 保存到电脑」类入口（不含覆盖保存）统一打开本窗口，
 * 由用户选择导出格式后再落盘：
 *   .sb3   标准 Scratch 3 工程，最通用
 *   .star  StartEditor（Bilup）工程
 *   .rj    RemixWarp 工程
 *
 * 窗口外壳走 ThemedWindow：SKYEditor 主题 → Win11Window；
 * 其它主题 → TurboWarp 原生 Modal，保证 TW 主题观感不被改变。
 * ---------------------------------------------------------------------------
 */
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import ThemedWindow from '../tw-themed-window/themed-window.jsx';
import ThemedButton from '../tw-themed-button/themed-button.jsx';
import downloadBlob from '../../lib/download-blob';
import {FORMAT} from '../../lib/project-formats/detect';
import {exportProjectArchive} from '../../lib/project-formats/export-formats';
import styles from './export-window.css';

const TEXT = {
    windowTitle: '导出作品',
    sectionFormat: '选择导出格式',
    recommended: '推荐',
    tipIcon: 'i',
    tipSb3Strong: '.sb3 是最通用的格式',
    tipSb3Body: '：Scratch 3 官方、TurboWarp 以及几乎所有改版编辑器都能直接打开。' +
        '要分享给别人、或不确定对方用什么编辑器时，优先选它。',
    tipOtherStrong: ' 为该编辑器专用格式',
    tipOtherBody: '：只有对应编辑器能直接打开，其它编辑器可能无法识别。' +
        '需要通用分享时请改用 .sb3。',
    filenameLabel: '文件名',
    errorPrefix: '导出失败：',
    footerHint: '导出后会保存到浏览器的下载目录',
    cancel: '取消',
    exporting: '正在导出…',
    exportPrefix: '导出 '
};

const FORMAT_OPTIONS = [
    {
        value: FORMAT.SB3,
        extension: '.sb3',
        badge: 'sb3',
        title: 'Scratch 3 标准工程',
        description: '兼容 Scratch 3、TurboWarp 与绝大多数改版编辑器，任何情况下都能打开。',
        recommended: true
    },
    {
        value: FORMAT.STAR,
        extension: '.star',
        badge: '★',
        title: 'Bilup 工程',
        description: 'Bilup / StartEditor 系（.star）格式，供该体系编辑器直接导入。'
    },
    {
        value: FORMAT.RJ,
        extension: '.rj',
        badge: 'RJ',
        title: 'RemixWarp 工程',
        description: 'RemixWarp（.rj）格式，元数据与实体分离，适合与使用该编辑器的伙伴交换工程。'
    }
];

const MAX_TITLE_LENGTH = 100;

const getOption = value => (
    FORMAT_OPTIONS.find(option => option.value === value) || FORMAT_OPTIONS[0]
);

const sanitizeFilename = value => {
    const raw = typeof value === 'string' ? value : '';
    // 去掉文件名非法字符，避免 Windows / macOS 上无法落盘
    const cleaned = raw.replace(/[\\/:*?"<>|]/g, ' ').trim();
    return cleaned || 'project';
};

class ExportWindow extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            format: FORMAT.SB3,
            filename: sanitizeFilename(props.projectTitle).substring(0, MAX_TITLE_LENGTH),
            busy: false,
            error: null
        };
        this.handleFormatCardClick = this.handleFormatCardClick.bind(this);
        this.handleFormatCardKeyDown = this.handleFormatCardKeyDown.bind(this);
        this.handleChangeFilename = this.handleChangeFilename.bind(this);
        this.handleExport = this.handleExport.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
    }
    handleFormatCardClick (event) {
        if (this.state.busy) return;
        const format = event.currentTarget.dataset.format;
        if (!format) return;
        this.setState({format: format, error: null});
    }
    handleFormatCardKeyDown (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleFormatCardClick(event);
        }
    }
    handleChangeFilename (event) {
        this.setState({filename: event.target.value});
    }
    handleCancel () {
        if (this.state.busy) return;
        if (this.props.onClose) this.props.onClose();
    }
    handleCloseBlocked () {
        // 导出进行中：忽略外壳的关闭请求，避免半途中断
    }
    handleExport () {
        if (this.state.busy) return;
        if (!this.props.saveProjectSb3) {
            this.setState({error: `${TEXT.errorPrefix}项目尚未就绪`});
            return;
        }

        const option = getOption(this.state.format);
        const filename = `${sanitizeFilename(this.state.filename)}${option.extension}`;

        // 先进入加载态，避免大工程导出过程中被重复点击
        this.setState({busy: true, error: null});

        this.props.saveProjectSb3()
            .then(sb3Blob => exportProjectArchive(sb3Blob, option.value, {
                title: sanitizeFilename(this.state.filename)
            }))
            .then(blob => {
                downloadBlob(filename, blob);
                this.setState({busy: false});
                if (this.props.onClose) this.props.onClose();
            })
            .catch(error => {
                this.setState({
                    busy: false,
                    error: TEXT.errorPrefix + (error && error.message ? error.message : String(error))
                });
            });
    }
    renderOption (option) {
        const selected = this.state.format === option.value;
        const className = selected ?
            `${styles.formatCard} ${styles.formatCardSelected}` :
            styles.formatCard;
        return (
            <div
                key={option.value}
                className={className}
                data-format={option.value}
                role="button"
                tabIndex={0}
                onClick={this.handleFormatCardClick}
                onKeyDown={this.handleFormatCardKeyDown}
            >
                <div className={styles.cardHeader}>
                    <span className={styles.formatBadge}>{option.badge}</span>
                    {option.recommended && (
                        <span className={styles.recommendTag}>{TEXT.recommended}</span>
                    )}
                    <span className={selected ? styles.radioDotSelected : styles.radioDot} />
                </div>
                <div className={styles.formatTitle}>{option.title}</div>
                <div className={styles.formatDescription}>{option.description}</div>
            </div>
        );
    }
    render () {
        const option = getOption(this.state.format);
        const isSb3 = option.value === FORMAT.SB3;
        return (
            <ThemedWindow
                title={TEXT.windowTitle}
                width={820}
                height={560}
                disableMaximize
                disableResize
                className={styles.modalContent}
                id="exportWindow"
                onClose={this.state.busy ? this.handleCloseBlocked : this.props.onClose}
            >
                <div className={styles.body}>
                    <div className={styles.sectionLabel}>{TEXT.sectionFormat}</div>
                    <div className={styles.cardRow}>
                        {FORMAT_OPTIONS.map(item => this.renderOption(item))}
                    </div>

                    <div className={styles.tipBar}>
                        <span className={styles.tipIcon}>{TEXT.tipIcon}</span>
                        <div className={styles.tipText}>
                            {isSb3 ? (
                                <span>
                                    <strong>{TEXT.tipSb3Strong}</strong>{TEXT.tipSb3Body}
                                </span>
                            ) : (
                                <span>
                                    <strong>
                                        {option.extension}
                                        {TEXT.tipOtherStrong}
                                    </strong>
                                    {TEXT.tipOtherBody}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className={styles.filenameRow}>
                        <span className={styles.filenameLabel}>{TEXT.filenameLabel}</span>
                        <div className={styles.filenameField}>
                            <input
                                className={styles.filenameInput}
                                type="text"
                                value={this.state.filename}
                                spellCheck={false}
                                disabled={this.state.busy}
                                onChange={this.handleChangeFilename}
                            />
                            <span className={styles.filenameExtension}>{option.extension}</span>
                        </div>
                    </div>

                    {this.state.error && (
                        <div className={styles.errorBar}>
                            {this.state.error}
                        </div>
                    )}

                    <div className={styles.footer}>
                        <span className={styles.footerHint}>{TEXT.footerHint}</span>
                        <div className={styles.footerButtons}>
                            <ThemedButton
                                variant="secondary"
                                disabled={this.state.busy}
                                onClick={this.handleCancel}
                            >
                                {TEXT.cancel}
                            </ThemedButton>
                            <ThemedButton
                                variant="primary"
                                disabled={this.state.busy}
                                onClick={this.handleExport}
                            >
                                {this.state.busy ?
                                    TEXT.exporting :
                                    `${TEXT.exportPrefix}${option.extension}`}
                            </ThemedButton>
                        </div>
                    </div>
                </div>
            </ThemedWindow>
        );
    }
}

ExportWindow.propTypes = {
    onClose: PropTypes.func,
    projectTitle: PropTypes.string,
    saveProjectSb3: PropTypes.func
};

ExportWindow.defaultProps = {
    projectTitle: ''
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    saveProjectSb3: state.scratchGui.vm.saveProjectSb3.bind(state.scratchGui.vm)
});

export default connect(
    mapStateToProps,
    null
)(ExportWindow);
