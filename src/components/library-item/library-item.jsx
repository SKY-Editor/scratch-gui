import {FormattedMessage, intlShape, defineMessages} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';

import Box from '../box/box.jsx';
import PlayButton from '../../containers/play-button.jsx';
import styles from './library-item.css';
import classNames from 'classnames';

import bluetoothIconURL from './bluetooth.svg';
import internetConnectionIconURL from './internet-connection.svg';
import favoriteInactiveIcon from './favorite-inactive.svg';
import favoriteActiveIcon from './favorite-active.svg';

const messages = defineMessages({
    favorite: {
        defaultMessage: 'Favorite',
        description: 'Alt text of icon in costume, sound, and extension libraries to mark an item as favorite.',
        id: 'tw.favorite'
    },
    unfavorite: {
        defaultMessage: 'Unfavorite',
        description: 'Alt text of icon in costume, sound, and extension libraries to unmark an item as favorite.',
        id: 'tw.unfavorite'
    }
});

// SKY Editor：扩展来源显示名映射（卡片右下角来源彩色标签文案）。
// 与 extension-library.jsx 的 sourceTag 注入值对应；无映射时回退显示 sourceTag 原值。
const SOURCE_LABELS = {
    scratch: 'Scratch',
    tw: 'TurboWarp',
    peditor: 'PointerEditor',
    skyeditor: 'SKY Editor',
    ztengine: '02Engine',
    astra: 'AstraEditor',
    pm: 'PenguinMod',
    sp: 'SharkPool',
    bilup: 'Bilup',
    remixwarp: 'RemixWarp',
    mist: 'Mist',
    cy: 'CY ScrExt Hub',
    yesshape: 'Yesshape',
    // SKY Editor：用户自定义扩展库来源标签
    custom: '自定义'
};

// SKY Editor：图标加载失败时的兜底占位图（自定义扩展库的图标地址常出现 404/503）
const FALLBACK_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="372" viewBox="0 0 600 372">' +
    '<rect width="600" height="372" fill="#2D2D2D"/>' +
    '<rect x="250" y="152" width="100" height="68" rx="10" fill="none" stroke="#8A8A8A" stroke-width="4"/>' +
    '<circle cx="276" cy="172" r="7" fill="#8A8A8A"/>' +
    '<path d="M256 208l22-22 16 16 12-12 20 22z" fill="#8A8A8A"/>' +
    '</svg>'
)}`;
const handleIconError = e => {
    const img = e.currentTarget;
    if (img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = '1';
    img.src = FALLBACK_ICON;
};

/* eslint-disable react/prefer-stateless-function */
class LibraryItemComponent extends React.PureComponent {
    render () {
        const favoriteMessage = this.props.intl.formatMessage(
            this.props.favorite ? messages.unfavorite : messages.favorite
        );
        const favorite = (
            <button
                className={classNames(
                    styles.favoriteButton,
                    {[styles.favoriteButtonActive]: this.props.favorite}
                )}
                onClick={this.props.onFavorite}
                title={favoriteMessage}
                aria-label={favoriteMessage}
            >
                <img
                    src={this.props.favorite ? favoriteActiveIcon : favoriteInactiveIcon}
                    className={styles.favoriteIcon}
                    draggable={false}
                    alt={favoriteMessage}
                />
            </button>
        );

        // SKY Editor 窗口化扩展库：忽略 featured，所有扩展（含内置扩展）统一渲染为同一种
        // 上图下文长卡，杜绝大卡小卡混排导致的“每个卡片样式都不一样”。非窗口化（其他主题）
        // 仍保留原版 featured 精选大卡行为。
        const isFeatured = this.props.featured && !this.props.windowed;

        // SKY Editor 窗口化扩展库：卡片本身不再承担「点击即安装」的角色——
        // 安装/删除只由底部按钮触发；因此 windowed 下不挂 role/tabIndex/点击/回车，
        // 避免用户误点卡片就把扩展装上。其他主题（非 windowed）保持原行为不变。
        return isFeatured ? (
            <div
                className={classNames(
                    styles.libraryItem,
                    styles.featuredItem,
                    {
                        [styles.disabled]: this.props.disabled
                    },
                    typeof this.props.extensionId === 'string' ? styles.libraryItemExtension : null,
                    this.props.hidden ? styles.hidden : null
                )}
                onClick={this.props.onClick}
            >
                <div className={styles.featuredImageContainer}>
                    {this.props.disabled ? (
                        <div className={styles.comingSoonText}>
                            <FormattedMessage
                                defaultMessage="Coming Soon"
                                description="Label for extensions that are not yet implemented"
                                id="gui.extensionLibrary.comingSoon"
                            />
                        </div>
                    ) : null}
                    <img
                        className={styles.featuredImage}
                        loading="lazy"
                        draggable={false}
                        src={this.props.iconURL}
                    />
                </div>
                {this.props.insetIconURL ? (
                    <div className={styles.libraryItemInsetImageContainer}>
                        <img
                            className={styles.libraryItemInsetImage}
                            src={this.props.insetIconURL}
                            draggable={false}
                        />
                    </div>
                ) : null}
                <div
                    className={typeof this.props.extensionId === 'string' ?
                        classNames(styles.featuredExtensionText, styles.featuredText) : styles.featuredText
                    }
                >
                    <span className={styles.libraryItemName}>{this.props.name}</span>
                    <br />
                    <span className={styles.featuredDescription}>{this.props.description}</span>
                </div>

                {(this.props.docsURI || this.props.samples) && (
                    <div className={styles.extensionLinks}>
                        {this.props.docsURI && (
                            <a
                                href={this.props.docsURI}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <FormattedMessage
                                    defaultMessage="Documentation"
                                    // eslint-disable-next-line max-len
                                    description="Appears in the extension list. Links to additional extension documentation."
                                    id="tw.documentation"
                                />
                            </a>
                        )}

                        {this.props.samples && (
                            <a
                                href={this.props.samples[0].href}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <FormattedMessage
                                    defaultMessage="Sample project"
                                    // eslint-disable-next-line max-len
                                    description="Appears in the extension list. Links to a sample project for an extension."
                                    id="tw.sample"
                                />
                            </a>
                        )}
                    </div>
                )}

                {this.props.credits && this.props.credits.length > 0 && (
                    <div className={styles.extensionLinks}>
                        <div>
                            <FormattedMessage
                                defaultMessage="Created by:"
                                description="Appears in the extension list. Followed by a list of names."
                                id="tw.createdBy"
                            />
                            {' '}
                            {this.props.credits.map((credit, index) => (
                                <React.Fragment key={index}>
                                    {credit}
                                    {index !== this.props.credits.length - 1 && (
                                        ', '
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                {this.props.bluetoothRequired || this.props.internetConnectionRequired || this.props.collaborator ? (
                    <div className={styles.featuredExtensionMetadata}>
                        <div className={styles.featuredExtensionRequirement}>
                            {this.props.bluetoothRequired || this.props.internetConnectionRequired ? (
                                <div>
                                    <div>
                                        <FormattedMessage
                                            defaultMessage="Requires"
                                            description="Label for extension hardware requirements"
                                            id="gui.extensionLibrary.requires"
                                        />
                                    </div>
                                    <div
                                        className={styles.featuredExtensionMetadataDetail}
                                    >
                                        {this.props.bluetoothRequired ? (
                                            <img
                                                src={bluetoothIconURL}
                                                draggable={false}
                                            />
                                        ) : null}
                                        {this.props.internetConnectionRequired ? (
                                            <img
                                                src={internetConnectionIconURL}
                                                draggable={false}
                                            />
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className={styles.featuredExtensionCollaboration}>
                            {this.props.collaborator ? (
                                <div>
                                    <div>
                                        <FormattedMessage
                                            defaultMessage="Collaboration with"
                                            description="Label for extension collaboration"
                                            id="gui.extensionLibrary.collaboration"
                                        />
                                    </div>
                                    <div
                                        className={styles.featuredExtensionMetadataDetail}
                                    >
                                        {this.props.collaborator}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {favorite}
            </div>
        ) : (
            <Box
                className={classNames(
                    styles.libraryItem,
                    'sky-library-card', {
                        [styles.hidden]: this.props.hidden
                    }
                )}
                role={this.props.windowed ? null : 'button'}
                tabIndex={this.props.windowed ? null : '0'}
                onBlur={this.props.onBlur}
                onClick={this.props.windowed ? null : this.props.onClick}
                onFocus={this.props.onFocus}
                onKeyPress={this.props.windowed ? null : this.props.onKeyPress}
                onMouseEnter={this.props.showPlayButton ? null : this.props.onMouseEnter}
                onMouseLeave={this.props.showPlayButton ? null : this.props.onMouseLeave}
            >
                {/* Layers of wrapping is to prevent layout thrashing on animation */}
                <Box className={styles.libraryItemImageContainerWrapper}>
                    <Box
                        className={styles.libraryItemImageContainer}
                        onMouseEnter={this.props.showPlayButton ? this.props.onMouseEnter : null}
                        onMouseLeave={this.props.showPlayButton ? this.props.onMouseLeave : null}
                    >
                        <img
                            className={styles.libraryItemImage}
                            loading="lazy"
                            src={this.props.iconURL}
                            draggable={false}
                            onError={handleIconError}
                        />
                    </Box>
                    {this.props.windowed && this.props.sourceTag ? (
                        /* SKY Editor：来源彩色标签（卡片图片区右下角，胶囊+深色下边框，仿 TW settings_tag）。
                           仅 windowed 模式渲染；背景色由上层 sourceColors 映射注入，无值时透明 */
                        <span
                            className={styles.skySourceTag}
                            style={this.props.sourceColor ? {backgroundColor: this.props.sourceColor} : null}
                        >
                            {SOURCE_LABELS[this.props.sourceTag] || this.props.sourceTag}
                        </span>
                    ) : null}
                </Box>
                <span className={styles.libraryItemName}>{this.props.name}</span>
                {this.props.windowed ? (
                    /* SKY Editor 窗口化扩展库：普通方卡也展示简介/开发者/文档/示例（有则显示） */
                    <div className={styles.skyCardInfo}>
                        {this.props.description ? (
                            <div className={styles.skyCardDescription}>
                                {this.props.description}
                            </div>
                        ) : null}
                        {this.props.credits && this.props.credits.length > 0 ? (
                            <div className={styles.skyCardCredits}>
                                <FormattedMessage
                                    defaultMessage="Created by:"
                                    description="Appears in the extension list. Followed by a list of names."
                                    id="tw.createdBy"
                                />
                                {' '}
                                {this.props.credits.map((credit, index) => (
                                    <React.Fragment key={index}>
                                        {credit}
                                        {index !== this.props.credits.length - 1 ? (
                                            ', '
                                        ) : null}
                                    </React.Fragment>
                                ))}
                            </div>
                        ) : null}
                        {(this.props.docsURI || this.props.samples) ? (
                            <div className={styles.skyCardLinks}>
                                {this.props.docsURI ? (
                                    <a
                                        href={this.props.docsURI}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <FormattedMessage
                                            defaultMessage="Documentation"
                                            // eslint-disable-next-line max-len
                                            description="Appears in the extension list. Links to additional extension documentation."
                                            id="tw.documentation"
                                        />
                                    </a>
                                ) : null}
                                {this.props.samples ? (
                                    <a
                                        href={this.props.samples[0].href}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <FormattedMessage
                                            defaultMessage="Sample project"
                                            // eslint-disable-next-line max-len
                                            description="Appears in the extension list. Links to a sample project for an extension."
                                            id="tw.sample"
                                        />
                                    </a>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {this.props.showPlayButton ? (
                    <PlayButton
                        isPlaying={this.props.isPlaying}
                        onPlay={this.props.onPlay}
                        onStop={this.props.onStop}
                    />
                ) : null}

                {this.props.windowed ? (
                    /* SKY Editor 窗口化扩展库：卡片底部操作区。
                       ①「安装/删除」按钮：未安装显示「安装」，已安装显示「删除」（再次点击即卸载）；
                       ② 只有按钮能添加/删除扩展，卡片其余区域点击不再触发安装。
                       按钮区横向布局，配合卡片固定高度用 margin-top:auto 贴底 */
                    <div className={styles.skyLibraryFooter}>
                        <button
                            type="button"
                            className={classNames(
                                styles.skyLibraryEnableButton,
                                {'sky-library-enable-button-installed': this.props.installed}
                            )}
                            onClick={this.props.onEnable}
                            onKeyPress={e => e.stopPropagation()}
                        >
                            {this.props.installed ? '删除' : '安装'}
                        </button>
                        {favorite}
                    </div>
                ) : (
                    favorite
                )}
            </Box>
        );
    }
}
/* eslint-enable react/prefer-stateless-function */


LibraryItemComponent.propTypes = {
    intl: intlShape,
    bluetoothRequired: PropTypes.bool,
    collaborator: PropTypes.string,
    description: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    disabled: PropTypes.bool,
    extensionId: PropTypes.string,
    featured: PropTypes.bool,
    hidden: PropTypes.bool,
    iconURL: PropTypes.string,
    insetIconURL: PropTypes.string,
    internetConnectionRequired: PropTypes.bool,
    isPlaying: PropTypes.bool,
    name: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    credits: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ])),
    docsURI: PropTypes.string,
    samples: PropTypes.arrayOf(PropTypes.shape({
        href: PropTypes.string,
        text: PropTypes.string
    })),
    favorite: PropTypes.bool,
    // SKY Editor：是否已安装（决定底部按钮显示「删除」还是「安装」）
    installed: PropTypes.bool,
    onEnable: PropTypes.func,
    onFavorite: PropTypes.func,
    onBlur: PropTypes.func.isRequired,
    onClick: PropTypes.func.isRequired,
    onFocus: PropTypes.func.isRequired,
    onKeyPress: PropTypes.func.isRequired,
    onMouseEnter: PropTypes.func.isRequired,
    onMouseLeave: PropTypes.func.isRequired,
    onPlay: PropTypes.func.isRequired,
    onStop: PropTypes.func.isRequired,
    showPlayButton: PropTypes.bool,
    sourceTag: PropTypes.string,
    sourceColor: PropTypes.string,
    windowed: PropTypes.bool
};

LibraryItemComponent.defaultProps = {
    disabled: false,
    installed: false,
    showPlayButton: false
};

export default LibraryItemComponent;
