import React, {memo} from 'react';
import {injectIntl} from 'react-intl';
import styles from './music-player.css';
import {mpMessage} from './i18n';
import {MusicIcon, HeartIcon, PlusIcon, GearIcon, FolderIcon, HomeIcon, UserIcon} from './icons.jsx';
import {SOURCE_BUILTIN, SOURCE_FAVORITES, SOURCE_HOME} from './utils';

// 左侧导航栏（220px）：全界面唯一侧边栏，两个分组 + 底部「管理」「设置」两枚入口（v7）。
// 分组一「曲库」= 本地音乐；分组二「我的歌单」= 我的歌单（收藏）+ 自建歌单列表，
// 分组标题右侧 24x24 的 + 是新建歌单入口之一（另两处为 HERO「+ 添加」菜单与空态引导），
// 三处统一回调上层 openCreatePlaylist()，新建弹层由上层渲染（居中 360px 浮层），侧栏不再自带弹窗。
// 设置态：侧栏原样常驻（不隐藏、不遮罩），点击底部「设置」时该按钮进入选中态，
// 歌单/曲库导航项取消选中态；点击任一歌单项即切回列表并退出设置态（由上层统一处理）。
// 选中态由 .nav-item-active 呈现「左侧 3px 主题色指示条（scaleY 生成）+ 主题色 10% 浅底」，不使用实心色块。
// v7：导入/创建/管理从设置剥离，底部并排「管理」「设置」两枚 32px 入口，各自独立选中态；
// 自建歌单支持右键菜单（重命名/删除/导出），内置曲库与「我的歌单」为只读，不触发右键。
const Sidebar = memo(function Sidebar ({
    intl,
    activeId,
    customSources,
    onSelect,
    onOpenSettings,
    onOpenManage,
    onNewPlaylist,
    onPlaylistContextMenu,
    settingsActive,
    manageActive,
    account,
    myActive,
    onOpenMy
}) {
    const t = (key, values) => mpMessage(intl, key, values);

    // 设置 / 管理 属于右侧页面态，任一开启时导航项全部取消选中
    // 弹窗（v9）不再占用主内容区：myActive 只表示账号按钮自身的激活态，
    // 不能再并入 paneActive 把导航高亮压掉，否则弹窗打开时左侧「主页」会变成无选中项。
    const paneActive = settingsActive || manageActive;
    const navItemClass = id =>
        (!paneActive && activeId === id
            ? `${styles.navItem} ${styles.navItemActive}`
            : styles.navItem);

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarNav}>
                {/* 主页：网易云首页视图，固定排在侧栏最上方（内置曲库分组之上） */}
                <div
                    className={navItemClass(SOURCE_HOME)}
                    onClick={() => onSelect(SOURCE_HOME)}
                    title="主页"
                >
                    <HomeIcon size={15} />
                    <span>主页</span>
                </div>
                {/* 分组一：曲库（仅本地音乐；网易云不再是独立导航项，能力并入 HERO「+ 添加」菜单） */}
                <div className={styles.navGroup}>
                    <div className={styles.navGroupHead}>
                        <span className={styles.navGroupTitle}>{t('sourceBuiltin')}</span>
                    </div>
                    <div
                        className={navItemClass(SOURCE_BUILTIN)}
                        onClick={() => onSelect(SOURCE_BUILTIN)}
                        title={t('navLocalTip')}
                    >
                        <MusicIcon size={15} />
                        <span>{t('navLocal')}</span>
                    </div>
                </div>
                {/* 分组二：我的歌单（收藏 + 自建歌单列表；标题右侧 24x24 新建入口，复用 newPlaylist 文案） */}
                <div className={styles.navGroup}>
                    <div className={styles.navGroupHead}>
                        <span className={styles.navGroupTitle}>{t('navFavorites')}</span>
                        <button
                            className={styles.navGroupAdd}
                            onClick={onNewPlaylist}
                            title={t('newPlaylist')}
                        >
                            <PlusIcon size={13} />
                        </button>
                    </div>
                    <div
                        className={navItemClass(SOURCE_FAVORITES)}
                        onClick={() => onSelect(SOURCE_FAVORITES)}
                        title={t('navFavoritesTip')}
                    >
                        <HeartIcon size={15} />
                        <span>{t('navFavorites')}</span>
                    </div>
                    {customSources.map(s => (
                        <div
                            key={s.id}
                            className={navItemClass(s.id)}
                            onClick={() => onSelect(s.id)}
                            onContextMenu={event => {
                                if (!onPlaylistContextMenu) return;
                                event.preventDefault();
                                onPlaylistContextMenu(event, s);
                            }}
                            title={s.name}
                        >
                            <MusicIcon size={15} />
                            <span>{s.name}</span>
                        </div>
                    ))}
                </div>
            </div>
            {/* 底部固定操作区（v8）：「我的 / 登录」+「管理」「设置」两枚纯图标入口 */}
            <div className={styles.sidebarFooter}>
                <button
                    className={myActive
                        ? `${styles.sidebarAccount} ${styles.sidebarAccountActive}`
                        : styles.sidebarAccount}
                    type="button"
                    onClick={e => {
                        // 与窗口关闭逻辑解耦：点击不再向 GUI / 窗口外壳的全局监听冒泡，
                        // 同时阻止默认行为（按钮若落在表单内也不会触发提交导致整页重载）。
                        // 代码合成 click() 与真实点击因此走完全相同的路径。
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenMy();
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    aria-pressed={!!myActive}
                    title={account && account.nickname ? account.nickname : t('login')}
                >
                    {account && account.avatar ? (
                        <img className={styles.sidebarAccountAvatar} src={account.avatar} alt="" />
                    ) : (
                        <UserIcon size={14} />
                    )}
                    <span className={styles.sidebarAccountText}>
                        {account && account.nickname ? account.nickname : t('login')}
                    </span>
                </button>
                <button
                    className={manageActive
                        ? `${styles.sidebarIconBtn} ${styles.sidebarIconBtnActive}`
                        : styles.sidebarIconBtn}
                    onClick={onOpenManage}
                    aria-pressed={!!manageActive}
                    title={t('manage')}
                    aria-label={t('manage')}
                >
                    <FolderIcon size={14} />
                </button>
                <button
                    className={settingsActive
                        ? `${styles.sidebarIconBtn} ${styles.sidebarIconBtnActive}`
                        : styles.sidebarIconBtn}
                    onClick={onOpenSettings}
                    aria-pressed={!!settingsActive}
                    title={t('settings')}
                    aria-label={t('settings')}
                >
                    <GearIcon size={14} />
                </button>
            </div>
        </div>
    );
});

export default injectIntl(Sidebar);
