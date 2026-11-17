/* 窗口配色工具（纯计算，无状态、无持久化）

   设计约定（2026-11 修订）：
   - 窗口配色是**开发期行为**：调用方写 <Win11Window windowColor="#1f2430"> 指定，
     或干脆不传，由样式表按「主题色窗口标签栏」开关决定主题色/纯白。
   - 已废除面向终端用户的逐窗口配色（右键色板 + localStorage），
     因此本模块不再读写任何存储，也不再广播配色变更事件。
*/

export const TITLEBAR_FOREGROUND_DARK = '#ffffff';
export const TITLEBAR_FOREGROUND_LIGHT = '#1f2430';

/* ── 颜色计算工具 ────────────────────────────────────────────── */

/**
 * 把任意常见颜色写法规范化为 #rrggbb；无法解析返回空字符串
 * @param {string} value
 * @returns {string}
 */
export const normalizeHexColor = value => {
    if (typeof value !== 'string') return '';
    const raw = value.trim();
    if (!raw) return '';
    const short = /^#?([0-9a-f]{3})$/i.exec(raw);
    if (short) {
        const [r, g, b] = short[1].split('');
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const long = /^#?([0-9a-f]{6})$/i.exec(raw);
    if (long) return `#${long[1].toLowerCase()}`;
    return '';
};

/**
 * 解析颜色为 {r, g, b}（0-255）；支持 #rgb / #rrggbb / rgb(a)()
 * @param {string} value
 * @returns {{r: number, g: number, b: number}|null}
 */
export const parseColor = value => {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    const hex = normalizeHexColor(raw);
    if (hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }
    const rgb = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i.exec(raw);
    if (rgb) {
        return {r: Math.round(+rgb[1]), g: Math.round(+rgb[2]), b: Math.round(+rgb[3])};
    }
    return null;
};

/**
 * WCAG 相对亮度（0=纯黑，1=纯白）
 * @param {string} value
 * @returns {number}
 */
export const relativeLuminance = value => {
    const rgb = parseColor(value);
    if (!rgb) return 1;
    const channel = c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return (0.2126 * channel(rgb.r)) + (0.7152 * channel(rgb.g)) + (0.0722 * channel(rgb.b));
};

/**
 * 判断背景是否为深色（深色背景需要白色前景，浅色背景需要黑色前景）
 * @param {string} value
 * @returns {boolean}
 */
export const isDarkColor = value => relativeLuminance(value) < 0.46;

/**
 * 取与给定背景对比度最高的前景色（仅黑白两档，符合"深底转白、浅底转黑"）
 * @param {string} value
 * @returns {string}
 */
export const oppositeForeground = value => (isDarkColor(value) ?
    TITLEBAR_FOREGROUND_DARK :
    TITLEBAR_FOREGROUND_LIGHT);

/**
 * 计算窗口标题栏最终配色
 * 优先级：窗口自定义色 > 主题色（仅"主题色窗口标签栏"开启时）> 白色
 * @param {object} options
 * @param {string} [options.customColor] 该窗口自己的配色
 * @param {string} [options.accentColor] 主题色模式下的主题色
 * @param {boolean} [options.useAccent] 是否允许回退到主题色
 * @returns {{background: string, foreground: string, tone: string, source: string}}
 */
export const resolveTitlebarTheme = ({customColor, accentColor, useAccent}) => {
    const custom = normalizeHexColor(customColor);
    if (custom) {
        return {
            background: custom,
            foreground: oppositeForeground(custom),
            tone: isDarkColor(custom) ? 'dark' : 'light',
            source: 'window'
        };
    }
    if (useAccent && accentColor) {
        // 主题色可能是渐变（menu-bar-background-image），无法按单色算亮度；
        // 沿用既有约定：主题色标题栏一律白字，保证与改造前完全一致。
        return {
            background: accentColor,
            foreground: TITLEBAR_FOREGROUND_DARK,
            tone: 'dark',
            source: 'accent'
        };
    }
    return {
        background: '',
        foreground: TITLEBAR_FOREGROUND_LIGHT,
        tone: 'light',
        source: 'default'
    };
};
