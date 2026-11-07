import PropTypes from 'prop-types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import ReactDOM from 'react-dom';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';

import searchIcon from '../action-menu/icon--search.svg';
import styles from './sky-spotlight-search.css';

const messages = defineMessages({
    placeholder: {
        id: 'gui.gui.spotlightSearchPlaceholder',
        defaultMessage: '搜索当前角色的积木',
        description: 'Placeholder of the drop-down block search panel'
    },
    noMatch: {
        id: 'gui.gui.spotlightSearchNoMatch',
        defaultMessage: '没有找到匹配的积木',
        description: 'Shown when the block search has no result'
    },
    noBlocks: {
        id: 'gui.gui.spotlightSearchEmpty',
        defaultMessage: '当前角色还没有积木，先拼一段脚本试试',
        description: 'Shown when the current target has no block at all'
    },
    notReady: {
        id: 'gui.gui.spotlightSearchNotReady',
        defaultMessage: '积木编辑器还没准备好，稍等片刻再打开',
        description: 'Shown when scratch-blocks is not available'
    },
    sectionTitle: {
        id: 'gui.gui.spotlightSearchSection',
        defaultMessage: '当前角色的积木',
        description: 'Section label above block search results'
    },
    clear: {
        id: 'gui.gui.spotlightSearchClear',
        defaultMessage: '清空',
        description: 'Tooltip of the clear button in the block search panel'
    },
    hint: {
        id: 'gui.gui.spotlightSearchHint',
        defaultMessage: '选择 · Enter 定位 · Esc 关闭',
        description: 'Keyboard hint at the bottom of the block search panel'
    }
});

// 结果条数上限：避免大项目一次渲染上千行卡顿
const MAX_RESULTS = 200;
const FALLBACK_COLOUR = '#4c97ff';
const FLASH_CLASS = 'sky-spotlight-block-flash';

// scratch-blocks 是懒加载的，编辑器渲染积木前不可用
const getBlockly = () => {
    try {
        return LazyScratchBlocks.isLoaded() ? LazyScratchBlocks.get() : null;
    } catch (e) {
        return null;
    }
};

const getWorkspace = () => {
    const Blockly = getBlockly();
    if (!Blockly || typeof Blockly.getMainWorkspace !== 'function') return null;
    try {
        return Blockly.getMainWorkspace() || null;
    } catch (e) {
        return null;
    }
};

const getBlockSvg = block => {
    if (!block) return null;
    if (typeof block.getSvgRoot === 'function') {
        const root = block.getSvgRoot();
        if (root) return root;
    }
    return block.svgGroup_ || null;
};

// 取积木在画布上真实显示的文字：包含默认文案、下拉值、变量名、输入框内容，
// 也就是用户“眼睛看到什么就能搜到什么”。
const readBlockText = block => {
    const svg = getBlockSvg(block);
    if (svg && typeof svg.querySelectorAll === 'function') {
        const nodes = svg.querySelectorAll('.blocklyText');
        const parts = [];
        for (let i = 0; i < nodes.length; i++) {
            const value = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (value) parts.push(value);
        }
        if (parts.length) return parts.join(' ');
    }
    // 未渲染（隐藏 / 折叠的块）时退回 Blockly 的字符串表示
    try {
        if (typeof block.toString === 'function') {
            return String(block.toString())
                .replace(/\s+/g, ' ')
                .trim();
        }
    } catch (e) {
        // 忽略
    }
    return '';
};

const buildSearchIndex = () => {
    const workspace = getWorkspace();
    if (!workspace || typeof workspace.getAllBlocks !== 'function') return null;
    let blocks = [];
    try {
        blocks = workspace.getAllBlocks(false) || [];
    } catch (e) {
        return null;
    }
    const items = [];
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        // 附属的 shadow 积木（数字、文本输入框）单独列出来没有意义，跳过
        try {
            if (typeof block.isShadow === 'function' && block.isShadow()) continue;
        } catch (e) {
            // 忽略
        }
        const text = readBlockText(block);
        const type = block.type || '';
        if (!text && !type) continue;
        let colour = FALLBACK_COLOUR;
        try {
            if (typeof block.getColour === 'function') colour = block.getColour() || colour;
        } catch (e) {
            colour = FALLBACK_COLOUR;
        }
        items.push({
            id: block.id,
            type: type,
            text: text || type,
            colour: colour,
            haystack: `${text} ${type}`.toLowerCase()
        });
    }
    return items;
};

const searchItems = (items, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, MAX_RESULTS);
    const scored = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.haystack.indexOf(needle) === -1) continue;
        const text = item.text.toLowerCase();
        let score = 1;
        if (text === needle) {
            score = 4;
        } else if (text.indexOf(needle) === 0) {
            score = 3;
        } else if (text.indexOf(needle) > 0) {
            score = 2;
        }
        scored.push({score: score, length: item.text.length, item: item});
    }
    scored.sort((a, b) => (b.score - a.score) || (a.length - b.length));
    return scored.slice(0, MAX_RESULTS).map(entry => entry.item);
};

const renderHighlighted = (text, query) => {
    const needle = query.trim();
    if (!needle) return text;
    const lowerText = text.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const nodes = [];
    let cursor = 0;
    let index = lowerText.indexOf(lowerNeedle);
    let key = 0;
    while (index !== -1) {
        if (index > cursor) nodes.push(text.slice(cursor, index));
        nodes.push(<mark key={`hit-${key++}`}>{text.slice(index, index + lowerNeedle.length)}</mark>);
        cursor = index + lowerNeedle.length;
        index = lowerText.indexOf(lowerNeedle, cursor);
    }
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
};

// 定位到目标积木：画布居中 + 闪烁高亮
const revealBlock = blockId => {
    const workspace = getWorkspace();
    if (!workspace || typeof workspace.getBlockById !== 'function') return false;
    let block = null;
    try {
        block = workspace.getBlockById(blockId);
    } catch (e) {
        block = null;
    }
    if (!block) return false;
    try {
        if (typeof workspace.centerOnBlock === 'function') workspace.centerOnBlock(blockId, true);
    } catch (e) {
        // 忽略居中失败
    }
    const svg = getBlockSvg(block);
    if (svg && svg.classList) {
        svg.classList.remove(FLASH_CLASS);
        // 触发一次重排，保证重复定位同一个积木也能重播动画
        if (typeof svg.getBoundingClientRect === 'function') svg.getBoundingClientRect();
        svg.classList.add(FLASH_CLASS);
        window.setTimeout(() => svg.classList.remove(FLASH_CLASS), 2400);
    }
    return true;
};

// SKYEditor：顶部下滑式积木搜索（参考 iOS Spotlight）。
// 直接读取 scratch-blocks 主工作区的积木数据自行检索，不再依赖 find-bar 插件的
// 搜索栏 DOM，避免窗口搬运带来的焦点 / 下拉层级问题。
const SkySpotlightSearch = ({intl, onClose}) => {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [entered, setEntered] = useState(false);
    const [closing, setClosing] = useState(false);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const resultsRef = useRef([]);
    const closingRef = useRef(false);

    const closeSelf = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        setClosing(true);
        window.setTimeout(() => onClose(), 230);
    }, [onClose]);

    // 打开：建立索引、播放入场动画、聚焦输入框
    useEffect(() => {
        setItems(buildSearchIndex());
        const raf = window.requestAnimationFrame(() => setEntered(true));
        const focusTimer = window.setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 90);
        return () => {
            window.cancelAnimationFrame(raf);
            window.clearTimeout(focusTimer);
        };
    }, []);

    // 面板开着的时候用户可能还在改积木，监听工作区变化防抖重建索引
    useEffect(() => {
        const workspace = getWorkspace();
        if (!workspace || typeof workspace.addChangeListener !== 'function') return null;
        let timer = null;
        const handleWorkspaceChange = () => {
            if (timer) return;
            timer = window.setTimeout(() => {
                timer = null;
                setItems(buildSearchIndex());
            }, 400);
        };
        workspace.addChangeListener(handleWorkspaceChange);
        return () => {
            if (timer) window.clearTimeout(timer);
            if (typeof workspace.removeChangeListener === 'function') {
                workspace.removeChangeListener(handleWorkspaceChange);
            }
        };
    }, []);

    const results = useMemo(() => (items ? searchItems(items, query) : []), [items, query]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    useEffect(() => {
        const container = listRef.current;
        if (!container) return;
        const node = container.querySelector(`[data-index="${activeIndex}"]`);
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({block: 'nearest'});
        }
    }, [activeIndex, results]);

    const pick = useCallback(item => {
        if (!item) return;
        revealBlock(item.id);
        closeSelf();
    }, [closeSelf]);

    // 键盘：Esc 关闭、↑↓ 选择、Enter 定位。
    // 用 capture 阶段拦截，避免 GUI 自身的快捷键（Esc 退出全屏等）同时响应。
    useEffect(() => {
        const handleKeyDown = e => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeSelf();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex(index => (results.length ? (index + 1) % results.length : 0));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex(index => (
                    results.length ? (index - 1 + results.length) % results.length : 0
                ));
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (results.length) pick(results[Math.min(activeIndex, results.length - 1)]);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [activeIndex, closeSelf, pick, results]);

    // 列表项事件走委托，避免在 JSX 里逐项创建闭包
    const readIndexFromEvent = event => {
        const target = event.target && event.target.closest ?
            event.target.closest('[data-index]') :
            null;
        if (!target) return -1;
        const index = Number(target.getAttribute('data-index'));
        return Number.isNaN(index) ? -1 : index;
    };

    const handleListClick = useCallback(event => {
        const index = readIndexFromEvent(event);
        if (index < 0) return;
        const item = resultsRef.current[index];
        if (item) pick(item);
    }, [pick]);

    const handleListHover = useCallback(event => {
        const index = readIndexFromEvent(event);
        if (index < 0) return;
        setActiveIndex(index);
    }, []);

    const handleInputChange = useCallback(event => {
        setQuery(event.target.value);
    }, []);

    const handleStopMouseDown = useCallback(event => {
        event.stopPropagation();
    }, []);

    const handleClear = useCallback(() => {
        setQuery('');
        if (inputRef.current) inputRef.current.focus();
    }, []);

    resultsRef.current = results;

    const panelClass = [
        styles.panel,
        entered && !closing ? styles.panelOpen : '',
        closing ? styles.panelClosing : ''
    ].filter(Boolean).join(' ');

    let emptyNode = null;
    if (items === null) {
        emptyNode = intl.formatMessage(messages.notReady);
    } else if (!results.length) {
        emptyNode = query.trim() ?
            intl.formatMessage(messages.noMatch) :
            intl.formatMessage(messages.noBlocks);
    }

    return ReactDOM.createPortal((
        <div
            className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`}
            onMouseDown={closeSelf}
            role="presentation"
        >
            <div
                aria-label={intl.formatMessage(messages.placeholder)}
                aria-modal="true"
                className={panelClass}
                onMouseDown={handleStopMouseDown}
                role="dialog"
            >
                <div className={styles.grabber} />
                <div className={styles.searchRow}>
                    <img
                        alt="search"
                        className={styles.searchIcon}
                        draggable={false}
                        src={searchIcon}
                    />
                    <input
                        autoComplete="off"
                        className={styles.searchInput}
                        onChange={handleInputChange}
                        placeholder={intl.formatMessage(messages.placeholder)}
                        ref={inputRef}
                        spellCheck={false}
                        type="text"
                        value={query}
                    />
                    {query ? (
                        <button
                            aria-label={intl.formatMessage(messages.clear)}
                            className={styles.clearButton}
                            onClick={handleClear}
                            title={intl.formatMessage(messages.clear)}
                            type="button"
                        >
                            {'\u00d7'}
                        </button>
                    ) : null}
                </div>
                <div
                    className={styles.results}
                    onClick={handleListClick}
                    onMouseOver={handleListHover}
                    ref={listRef}
                    role="presentation"
                >
                    {results.length ? (
                        <div className={styles.sectionLabel}>
                            {intl.formatMessage(messages.sectionTitle)}
                        </div>
                    ) : null}
                    {results.length ? results.map((item, index) => (
                        <button
                            className={`${styles.resultItem} ${
                                index === activeIndex ? styles.resultItemActive : ''
                            }`}
                            data-index={index}
                            key={item.id}
                            type="button"
                        >
                            <span
                                className={styles.colorDot}
                                style={{backgroundColor: item.colour}}
                            />
                            <span className={styles.resultText}>
                                {renderHighlighted(item.text, query)}
                            </span>
                            {item.type ? (
                                <span className={styles.resultType}>{item.type}</span>
                            ) : null}
                        </button>
                    )) : (
                        <div className={styles.empty}>{emptyNode}</div>
                    )}
                </div>
                <div className={styles.footer}>
                    <span>
                        <span className={styles.footerKey}>{'\u2191'}</span>
                        {' '}
                        <span className={styles.footerKey}>{'\u2193'}</span>
                        {` ${intl.formatMessage(messages.hint)}`}
                    </span>
                    <span>{`${results.length}`}</span>
                </div>
            </div>
        </div>
    ), document.body);
};

SkySpotlightSearch.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(SkySpotlightSearch);
