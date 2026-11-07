/* SKYEditor：此文件已停用。
 *
 * 早期版本的「独立搜索窗口」通过把 find-bar 插件注入的 .sa-find-bar DOM
 * 搬进 Win11Window 来实现搜索，存在输入框被 portal 移出窗口、焦点被窗口
 * 管理抢占、下拉层级错乱等问题，导致 Ctrl+F 后无法正常搜索。
 *
 * 现由顶部下滑式搜索面板（./sky-spotlight-search.jsx）取代：它直接读取
 * scratch-blocks 主工作区的积木数据自行检索，不再依赖 find-bar 的搜索栏 DOM。
 *
 * 保留本文件仅为记录，不再被任何模块引用，可随时删除。
 */
