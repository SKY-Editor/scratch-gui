import {Theme} from '.';
import AddonHooks from '../../addons/hooks';
import './global-styles.css';

const BLOCK_COLOR_NAMES = [
    // Corresponds to the name of the object in blockColors
    'motion',
    'looks',
    'sounds',
    'control',
    'event',
    'sensing',
    'pen',
    'operators',
    'data',
    'data_lists',
    'more',
    'addons'
];

/**
 * @param {string} css CSS color or var(--...)
 * @returns {string} evaluated CSS
 */
const evaluateCSS = css => {
    const variableMatch = css.match(/^var\(([\w-]+)\)$/);
    if (variableMatch) {
        return document.documentElement.style.getPropertyValue(variableMatch[1]);
    }
    return css;
};

/**
 * 把 CSS 颜色转成 [r, g, b]（支持 #hex / rgb() / hsl()，供亮度判定使用）
 * @param {string} color CSS 颜色
 * @returns {Array<number>|null} 0-255 的 RGB 三元组
 */
const parseColor = color => {
    if (!color) return null;
    const value = String(color).trim();

    const hex = value.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
        let raw = hex[1];
        if (raw.length === 3 || raw.length === 4) {
            raw = raw
                .split('')
                .map(c => c + c)
                .join('');
        }
        return [
            parseInt(raw.slice(0, 2), 16),
            parseInt(raw.slice(2, 4), 16),
            parseInt(raw.slice(4, 6), 16)
        ];
    }

    const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
        const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
        if (parts.length < 3) return null;
        return parts.slice(0, 3).map(part => (
            part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part)
        ));
    }

    const hsl = value.match(/^hsla?\(([^)]+)\)$/i);
    if (hsl) {
        const parts = hsl[1].split(/[\s,/]+/).filter(Boolean);
        if (parts.length < 3) return null;
        const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
        const s = parseFloat(parts[1]) / 100;
        const l = parseFloat(parts[2]) / 100;
        const c = (1 - Math.abs((2 * l) - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - (c / 2);
        const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][
            Math.min(Math.floor(h / 60), 5)
        ];
        return seg.map(channel => (channel + m) * 255);
    }

    return null;
};

/**
 * WCAG 相对亮度（0 = 纯黑，1 = 纯白）
 * @param {string} color CSS 颜色
 * @returns {number} 相对亮度
 */
const relativeLuminance = color => {
    const rgb = parseColor(color);
    if (!rgb) return 0;
    const [r, g, b] = rgb.map(channel => {
        const v = Math.min(Math.max(channel, 0), 255) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
};

/**
 * 读取用户「菜单栏文字颜色」偏好（mw:menu-bar-text）
 * @returns {string} 'auto' | 'light' | 'dark'
 */
const getMenuBarTextPreference = () => {
    try {
        const stored = window.localStorage.getItem('mw:menu-bar-text');
        return stored === 'light' || stored === 'dark' ? stored : 'auto';
    } catch (e) {
        return 'auto';
    }
};

/**
 * @param {Theme} theme the theme
 */
const applyGuiColors = theme => {
    const doc = document.documentElement;

    const defaultGuiColors = Theme.light.getGuiColors();
    for (const [name, value] of Object.entries(defaultGuiColors)) {
        doc.style.setProperty(`--${name}-default`, value);
    }

    const guiColors = theme.getGuiColors();
    for (const [name, value] of Object.entries(guiColors)) {
        doc.style.setProperty(`--${name}`, value);
    }

    const blockColors = theme.getBlockColors();
    doc.style.setProperty('--editorTheme3-blockText', blockColors.text);
    doc.style.setProperty('--editorTheme3-inputColor', blockColors.textField);
    doc.style.setProperty('--editorTheme3-inputColor-text', blockColors.textFieldText);
    for (const color of BLOCK_COLOR_NAMES) {
        doc.style.setProperty(`--editorTheme3-${color}-primary`, blockColors[color].primary);
        doc.style.setProperty(`--editorTheme3-${color}-secondary`, blockColors[color].secondary);
        doc.style.setProperty(`--editorTheme3-${color}-tertiary`, blockColors[color].tertiary);
        doc.style.setProperty(`--editorTheme3-${color}-field-background`, blockColors[color].quaternary);
    }

    // Some browsers will color their interfaces to match theme-color, so if we make it the same color as our
    // menu bar, it'll look pretty cool.
    let metaThemeColor = document.head.querySelector('meta[name=theme-color]');
    if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', evaluateCSS(guiColors['menu-bar-background']));

    // 顶栏文字/图标颜色：按顶栏实际底色亮度自动取黑或白。
    // 原因：不同主题色（accent）明暗差异极大（黄色、浅蓝偏亮，紫、绿偏深），
    // 固定白字会在浅色 accent 上完全看不见。用户手动指定 light/dark 时优先尊重。
    const menuBarBackground = evaluateCSS(guiColors['menu-bar-background'] || '');
    if (menuBarBackground) {
        const preference = getMenuBarTextPreference();
        let menuBarForeground = '#ffffff';
        if (preference === 'light') {
            menuBarForeground = '#ffffff';
        } else if (preference === 'dark') {
            menuBarForeground = '#000000';
        } else if (relativeLuminance(menuBarBackground) > 0.42) {
            // 阈值 0.42：yellow(#ffcc00) / pale-blue(#75C1C4) 这类浅色主题色转近黑文字，
            // blue / green / red / purple 等深一些的主题色仍保持白字。
            menuBarForeground = '#000000';
        }
        doc.style.setProperty('--menu-bar-foreground', menuBarForeground);
    }

    // 主题色 / 明暗切换后，顶栏单色图标需要按新底色重新反色，
    // 通知 lib/iconContrast.js 重算（该模块监听 sky:theme-change）。
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('sky:theme-change'));
    }

    // a horrible hack for icons...
    window.Recolor = {
        primary: guiColors['looks-secondary']
    };
    AddonHooks.recolorCallbacks.forEach(i => i());
};

export {
    applyGuiColors
};
