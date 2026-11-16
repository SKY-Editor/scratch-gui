// SKYEditor：项目资源虚拟文件系统（测试版）—— 文件树视图
// 职责：渲染文件树节点，处理展开/折叠与资源统计展示。
// 视觉：沿用 SKY 主题令牌（--sky-theme-surface / --sky-accent 等），
//       样式全部走 CSS Modules，天然作用域隔离，不影响其他区域。
// 图标：图片类资源（造型/背景）显示真实缩略图，其余按类型使用 lucide 图标。
/* eslint-disable react/jsx-no-bind */
import classNames from 'classnames';
import {
    File as FileGlyph,
    FileCode,
    FileImage,
    Folder,
    FolderOpen,
    Volume2
} from 'lucide-react';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useState} from 'react';

import styles from './project-fs.css';

const GLYPH_SIZE = 14;

// 图标统一属性：颜色由 CSS 的 color 控制（lucide 使用 currentColor 描边）
const glyphProps = {
    'size': GLYPH_SIZE,
    'strokeWidth': 1.9,
    'aria-hidden': true,
    'focusable': false
};

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'oga', 'm4a', 'flac', 'webm'];
const CODE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'json'];
const IMAGE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

const nodePropType = PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['folder', 'file']).isRequired,
    ext: PropTypes.string,
    thumbnail: PropTypes.string,
    // 真实字节数：文件为其资源大小，目录为其下资源合计
    size: PropTypes.number,
    // 下载描述：asset / project / sprite3
    payload: PropTypes.shape({
        type: PropTypes.string,
        fileName: PropTypes.string,
        assetId: PropTypes.string,
        targetId: PropTypes.string
    }),
    children: PropTypes.array
});

// 统计目录下的文件总数（用于折叠状态下的资源计数展示）
const countFiles = node => {
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((total, child) => (
        child.kind === 'folder' ? total + countFiles(child) : total + 1
    ), 0);
};

const BYTE_UNIT = 1024;
const KB = BYTE_UNIT;
const MB = KB * BYTE_UNIT;

// 数值格式化：小于 10 保留 1 位小数，其余取整，避免「1023.6 KB」这类长串
const formatUnitValue = value => {
    if (!isFinite(value) || value < 0) return '';
    const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    return String(rounded);
};

// 真实字节数 → 人类可读大小（B / KB / MB），未知大小返回空串
const formatSize = bytes => {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '';
    if (bytes < KB) return `${Math.round(bytes)} B`;
    if (bytes < MB) return `${formatUnitValue(bytes / KB)} KB`;
    return `${formatUnitValue(bytes / MB)} MB`;
};

// 无缩略图时的类型图标：目录 → Folder/FolderOpen，
// 音频 → Volume2，脚本 → FileCode，图片 → FileImage，其他 → File
const TypeGlyph = ({node, isExpanded}) => {
    if (node.kind === 'folder') {
        const FolderGlyph = isExpanded ? FolderOpen : Folder;
        return (
            <FolderGlyph
                {...glyphProps}
                className={styles.glyphFolder}
            />
        );
    }

    const ext = node.ext || '';
    if (AUDIO_EXTENSIONS.indexOf(ext) !== -1) {
        return (
            <Volume2
                {...glyphProps}
                className={styles.glyphMuted}
            />
        );
    }
    if (CODE_EXTENSIONS.indexOf(ext) !== -1) {
        return (
            <FileCode
                {...glyphProps}
                className={styles.glyphMuted}
            />
        );
    }
    if (IMAGE_EXTENSIONS.indexOf(ext) !== -1) {
        return (
            <FileImage
                {...glyphProps}
                className={styles.glyphMuted}
            />
        );
    }
    return (
        <FileGlyph
            {...glyphProps}
            className={styles.glyphMuted}
        />
    );
};

TypeGlyph.propTypes = {
    node: nodePropType.isRequired,
    isExpanded: PropTypes.bool
};

TypeGlyph.defaultProps = {
    isExpanded: false
};

// 缩略图：图片加载失败（如资源暂不可用）时回退为类型图标
const Thumbnail = ({src, fallback}) => {
    const [failed, setFailed] = useState(false);

    const handleError = useCallback(() => {
        setFailed(true);
    }, []);

    useEffect(() => {
        setFailed(false);
    }, [src]);

    if (!src || failed) return fallback;

    return (
        <img
            className={styles.nodeThumb}
            src={src}
            alt=""
            draggable={false}
            onError={handleError}
        />
    );
};

Thumbnail.propTypes = {
    src: PropTypes.string,
    fallback: PropTypes.element.isRequired
};

Thumbnail.defaultProps = {
    src: null
};

const NodeIcon = ({node, isExpanded}) => (
    <span className={styles.nodeIcon}>
        <Thumbnail
            src={node.thumbnail}
            fallback={
                <TypeGlyph
                    node={node}
                    isExpanded={isExpanded}
                />
            }
        />
    </span>
);

NodeIcon.propTypes = {
    node: nodePropType.isRequired,
    isExpanded: PropTypes.bool
};

NodeIcon.defaultProps = {
    isExpanded: false
};

const TreeNode = ({node, depth, expandedIds, onToggle, onContextMenu}) => {
    const isFolder = node.kind === 'folder';
    const hasChildren = isFolder && node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const indent = {paddingLeft: `${8 + (depth * 16)}px`};
    const caretText = hasChildren ? '\u25B6' : '\u00B7';
    // 空目录不展示 0 B，避免与「空」提示重复
    const sizeText = isFolder && !hasChildren ? '' : formatSize(node.size);

    const handleRowContextMenu = event => {
        if (!onContextMenu) return;
        // 阻止浏览器默认菜单，改由项目自己的上下文菜单接管
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(node, event);
    };

    return (
        <div className={styles.nodeGroup}>
            <div
                className={classNames(styles.nodeRow, isFolder ? styles.nodeRowFolder : styles.nodeRowFile)}
                style={indent}
                onClick={isFolder ? () => onToggle(node.id) : null}
                onContextMenu={handleRowContextMenu}
                role="treeitem"
                aria-expanded={isFolder ? isExpanded : null}
                tabIndex={-1}
            >
                <span className={classNames(styles.caret, isExpanded && styles.caretOpen)}>
                    {isFolder ? caretText : ''}
                </span>
                <NodeIcon
                    node={node}
                    isExpanded={isExpanded}
                />
                <span className={styles.nodeName}>{node.name}</span>
                {isFolder ? (
                    <span className={styles.nodeMeta}>
                        {hasChildren ? `${countFiles(node)} 个文件` : '\u7A7A'}
                    </span>
                ) : null}
                <span className={styles.nodeSize}>{sizeText}</span>
            </div>
            {isFolder && isExpanded && hasChildren ? (
                <div
                    className={styles.children}
                    role="group"
                >
                    {node.children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            expandedIds={expandedIds}
                            onToggle={onToggle}
                            onContextMenu={onContextMenu}
                        />
                    ))}
                </div>
            ) : null}
            {isFolder && isExpanded && !hasChildren ? (
                <div
                    className={styles.emptyHint}
                    style={{paddingLeft: `${8 + ((depth + 1) * 16)}px`}}
                >
                    {'该目录暂无资源'}
                </div>
            ) : null}
        </div>
    );
};

TreeNode.propTypes = {
    node: nodePropType.isRequired,
    depth: PropTypes.number.isRequired,
    expandedIds: PropTypes.instanceOf(Set).isRequired,
    onToggle: PropTypes.func.isRequired,
    onContextMenu: PropTypes.func
};

TreeNode.defaultProps = {
    onContextMenu: null
};

const ProjectFsTreeView = ({root, expandedIds, onToggle, onContextMenu}) => (
    <div
        className={styles.tree}
        role="tree"
    >
        <TreeNode
            node={root}
            depth={0}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onContextMenu={onContextMenu}
        />
    </div>
);

ProjectFsTreeView.propTypes = {
    root: nodePropType.isRequired,
    expandedIds: PropTypes.instanceOf(Set).isRequired,
    onToggle: PropTypes.func.isRequired,
    onContextMenu: PropTypes.func
};

ProjectFsTreeView.defaultProps = {
    onContextMenu: null
};

export default ProjectFsTreeView;
