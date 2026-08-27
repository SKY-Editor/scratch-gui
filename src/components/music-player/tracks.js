// 内置曲库：真实 MP3（来源 E:\秦始皇计划\SKY Editor\Music）。
// 音频经 url-loader 打包（与既有 `!url-loader!./audio/xx.wav` 用法一致），
// file 字段直接为 webpack 资源 URL。
// 均无歌词（歌词页按既有逻辑显示「纯音乐」）。

import strikes from '!url-loader!./audio/3-strikes.mp3';
import dawm from '!url-loader!./audio/dawm.mp3';
import flirtingJune from '!url-loader!./audio/flirting-with-june.mp3';
import gotYou from '!url-loader!./audio/got-you.mp3';
import inTheSummer from '!url-loader!./audio/in-the-summer.mp3';
import newSoul from '!url-loader!./audio/new-soul.mp3';
import miaoCuijiaoMarch from '!url-loader!./audio/miao-cuijiao-march.mp3';
import xingheZhuimeng from '!url-loader!./audio/xinghe-zhuimeng.mp3';

export const TRACKS = [
    {
        title: '3 Strikes',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 176,
        c1: '#ff9a56',
        c2: '#ff2e63',
        file: strikes
    },
    {
        title: 'Dawm',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 243,
        c1: '#4c6ef5',
        c2: '#9b5de5',
        file: dawm
    },
    {
        title: 'Flirting With June',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 167,
        c1: '#43c6ac',
        c2: '#5a8f7b',
        file: flirtingJune
    },
    {
        title: 'GOT YOU',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 205,
        c1: '#f953c6',
        c2: '#b91d73',
        file: gotYou
    },
    {
        title: 'In The Summer',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 181,
        c1: '#00b4db',
        c2: '#0083b0',
        file: inTheSummer
    },
    {
        title: 'New Soul',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 196,
        c1: '#f7b733',
        c2: '#fc4a1a',
        file: newSoul
    },
    {
        title: '妙脆角进行曲',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 142,
        c1: '#ff9a9e',
        c2: '#fecfef',
        file: miaoCuijiaoMarch
    },
    {
        title: '星河追梦',
        artist: '未知歌手',
        album: '本地音乐',
        seconds: 217,
        c1: '#4facfe',
        c2: '#00f2fe',
        file: xingheZhuimeng
    }
];
