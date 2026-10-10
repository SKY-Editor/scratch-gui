# Theme/public 公共主题切换工具

新框架架构调整：原 `Theme/common` 已改名 `Theme/public`，定位收窄为
**「读取当前主题 + 切换」的纯工具**。真正的主题清单唯一真源已迁移至
`src/editor-framework-core/theme-registry.js`，本目录**不维护任何注册表副本**。

## 文件清单与职责

| 文件 | 职责 |
| --- | --- |
| `ui-theme-registry.js` | **兼容 re-export 层**：从 `editor-framework-core/theme-registry.js` 原样转发全部主题清单与作用域接口。旧代码 import 路径 `../../Theme/common/ui-theme-registry` 仅需将 `common` 改为 `public`，逻辑零改动。 |
| `ui-theme-reducer.js` | redux reducer（`scratch-gui/ui-theme/SET_UI_THEME`），`initialState` 来自 `detectUiTheme()`；导出 `reducer as default`、`uiThemeInitialState`、`setUiTheme`。 |
| `uiThemePersistance.js` | localStorage 持久化与启动探测：`detectUiTheme()`（启动时读取存储并同步 `<html data-ui-theme>` 与命名空间类）、`persistUiTheme(themeId)`、`DEFAULT_UI_THEME`（当前为 sky-editor）。 |

## 接口速览（re-export 自 editor-framework-core）

- `UI_THEME_REGISTRY` / `DEFAULT_UI_THEME_ID`
- `getUiThemePresets()` / `getUiThemeById(id)` / `normalizeUiThemeId(id)`
- `getUiThemeAttribute(id)` / `getUiThemeNamespace(id)` / `getUiThemeVariables(id, isDark)`
- `isUiTheme(id, targetId)` / `isSkyEditor(id)`
- `applyUiThemeChrome(themeId, isDark?)`：唯一写 `<html>` 的入口（持久化 + data 属性 + 命名空间类 + 专属变量注入，幂等）

## 新增主题的标准流程（改 core，不动本目录）

1. 在 `src/editor-framework-core/theme-registry.js` 顶部加一行 `import '../Theme/{主题名}/ui-{主题名}.css';`；
2. 在 `UI_THEME_REGISTRY` 末尾追加注册记录（id / name / iconColor / attribute / namespace / accent / gui / inheritsBase / variables / shells / note）；
3. 有 GUI/VM 差异外壳的在 `shell-registry.js` 注册外壳，有零件需求在 `part-registry.js` 注册零件；
4. 选择入口 / 持久化 / reducer / 作用域标记 / 专属变量自动生效，业务代码零改动。

## 铁律

- 差异化逻辑严格限定本主题作用域（data 属性 + namespace 类），严禁影响其它主题（TurboWarp 零回归）。
- namespace 类 / 变量前缀必须全局唯一，主题间互不串扰。
- 本目录仅做主题切换纯工具；新增主题一律走 core 注册表，禁止在本目录追加注册逻辑。
*（内容由AI生成，仅供参考）*
