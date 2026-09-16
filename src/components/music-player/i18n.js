// 音乐播放器多语言支持（跟随编辑器语言设置，react-intl）
//
//  - 所有界面文案统一走 sky.musicPlayer.* 消息 id：mpMessage(intl, key, values)；
//  - 英文原文与各语言译文集中在
//    src/lib/tw-translations/sky-editor-music-player-translations.json，
//    由 src/lib/tw-translations/index.js 在 addAdditionalTranslations 中混入编辑器 messages；
//  - 未显式覆盖的语言由 index.js 回退到 en（不会残留中文）；
//  - 歌曲自身的数据（歌名/歌手/专辑/用户新建歌单名）一律不翻译，
//    仅「未知歌手 / 自定义 / 内置曲库 / 我的歌单」这类系统兜底值在渲染时替换。
import translations from '../../lib/tw-translations/sky-editor-music-player-translations.json';
import {SOURCE_BUILTIN, SOURCE_FAVORITES} from './utils';

const MESSAGE_PREFIX = 'sky.musicPlayer.';
const EN = translations.en || {};

// 数据层兜底值（持久化在歌曲/歌单数据里的原始常量，不随语言变化）
const DATA_UNKNOWN_ARTIST = '未知歌手';
export const DATA_CUSTOM_ALBUM = '自定义';

// 取词：intl 由 react-intl 的 injectIntl 注入；key 为 JSON 中的 en 键名
export const mpMessage = (intl, key, values) => intl.formatMessage(
    {
        id: MESSAGE_PREFIX + key,
        defaultMessage: EN[MESSAGE_PREFIX + key] || EN[key] || key
    },
    values
);

// 歌手列：系统兜底值走翻译，用户/歌曲自带歌手原样显示
export const displayArtist = (intl, artist) => (
    !artist || artist === DATA_UNKNOWN_ARTIST ? mpMessage(intl, 'unknownArtist') : artist
);

// 专辑列：自定义 / 本地音乐 等系统占位专辑名走翻译
const DATA_LOCAL_ALBUM = '本地音乐';
export const displayAlbum = (intl, album) => {
    if (album === DATA_CUSTOM_ALBUM) return mpMessage(intl, 'customAlbum');
    if (album === DATA_LOCAL_ALBUM) return mpMessage(intl, 'navLocal');
    return album;
};

// 歌单名：内置曲库 / 我的歌单为系统来源（翻译），用户自建歌单名原样显示
export const displaySourceName = (intl, source) => {
    if (!source) return '';
    if (source.id === SOURCE_BUILTIN) return mpMessage(intl, 'sourceBuiltin');
    if (source.id === SOURCE_FAVORITES) return mpMessage(intl, 'sourceFavorites');
    return source.name;
};
