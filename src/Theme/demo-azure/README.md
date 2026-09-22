---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8caf5a5285e38b1ae7e57554b1d0e672_d64c2879b69b11f18db252540024e231
    ReservedCode1: 88b3jXeggE/CAy2LW44OeFll9xfIAft/vYnDTHv04dYxG/4u93laONOVZMqp65cgPaA0uVBCQrpc3YiOToXXtyiy5dEXzPATEQr1rHQrs3Hor7M19fvgStz3vHNACyqBRMwaQtnJwGO3pSupsDgQzawG+pv5JwI98NBvr98HHRwqRv14ENU+tP73Viw=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8caf5a5285e38b1ae7e57554b1d0e672_d64c2879b69b11f18db252540024e231
    ReservedCode2: 88b3jXeggE/CAy2LW44OeFll9xfIAft/vYnDTHv04dYxG/4u93laONOVZMqp65cgPaA0uVBCQrpc3YiOToXXtyiy5dEXzPATEQr1rHQrs3Hor7M19fvgStz3vHNACyqBRMwaQtnJwGO3pSupsDgQzawG+pv5JwI98NBvr98HHRwqRv14ENU+tP73Viw=
---

# demo-azure 主题差异包

本目录存放 demo-azure 主题相对 TurboWarp 基线的差异文件（已完成迁移）。

## 现状

- `ui-demo-azure.css`：主题专属样式，选择器已按 `html.demo-azure-theme` / `html[data-ui-theme='demo-azure']` 限定作用域；由 `../common/ui-theme-registry.js` 顶部 import 挂载。
- 注册表条目见 `../common/ui-theme-registry.js`（id: `demo-azure`）：
  - attribute: `demo-azure`
  - namespace: `demo-azure-theme`
  - variables: `--demo-accent` / `--demo-surface`（light/dark 两套）

## 定位

本主题是**新增主题的最小示例模板**（仅演示"注册即生效"，不追求完整视觉）。新主题可参考本目录结构：一个专属 CSS + 一条注册记录即可跑通全链路。
*（内容由AI生成，仅供参考）*
