// Because there are all brand names, it is unnecessary for them to be translatable.
// SKY Editor 扩展库聚合来源分类：仅收录拥有独立扩展画廊、可运行时拉取真实扩展的来源
// （对齐 02Engine 聚合实现 + 《SKY-Editor-总目标.md》§3 改版速查表，见扩展兼容方案 §4.2）
// 顺序即左侧栏标签渲染顺序（前缀"所有"）：
// 所有、Scratch、TurboWarp、SKYEditor、02Engine、AstraEditor、Bilup、RemixWarp、
// PenguinMod、CY ScrExt Hub、Mist、SharkPool、Yesshape
export default [
    {tag: 'scratch', intlLabel: 'Scratch'},
    {tag: 'tw', intlLabel: 'TurboWarp'},
    // SKYEditor 标签：目前仅占位，暂无任何扩展库内容与链接（后续接入自家扩展库时再填充）
    {tag: 'skyeditor', intlLabel: 'SKYEditor'},
    // PointerEditor 扩展库：内置来源，与 TurboWarp/02Engine 同级列在「常规」分类
    {tag: 'peditor', intlLabel: 'PointerEditor'},
    {tag: 'ztengine', intlLabel: '02Engine'},
    {tag: 'astra', intlLabel: 'AstraEditor'},
    {tag: 'bilup', intlLabel: 'Bilup'},
    {tag: 'remixwarp', intlLabel: 'RemixWarp'},
    {tag: 'pm', intlLabel: 'PenguinMod'},
    {tag: 'cy', intlLabel: 'CY ScrExt Hub'},
    {tag: 'mist', intlLabel: 'Mist'},
    {tag: 'sp', intlLabel: 'SharkPool'},
    {tag: 'yesshape', intlLabel: 'Yesshape'},
    // SKY Editor：用户自定义扩展库（地址由用户在左侧栏「自定义扩展库」页面自行添加/删除）
    {tag: 'custom', intlLabel: '自定义'}
];
