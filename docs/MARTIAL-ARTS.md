# 武学目录

基础武学位于 `data/base/skills/round-04-martial-arts.json`，使用 `martial-arts-set` Schema。Round 32 后共有 **30 种武学**；本轮新增 24 种，分属五个门派。授艺对话按门派和当前资格显示选项，已习得的招式会自动隐藏。门派资格、等级和属性门槛均由武学资料定义。

战斗协议使用资料中的 `combat.kind`（attack/heal）、`power` 与 `qiCost`。攻击伤害为 `max(1, power + 力道 − floor(敌方体魄/3))`；治疗量为 `power + floor(定力/2)`。类别是武学展示和内容分类，具体战斗作用以 `combat` 字段为准。下表括号内数值为“威力 / 内力消耗”。

## 听雨剑阁 · 叶庭舟（5 项新增）

| ID | 名称 | 类别 | 等级 / 属性门槛 | 战斗 |
|---|---|---|---|---|
| `skill.r32-tingyu-luoyu-jian` | 落雨七分剑 | 剑法 | 2 / 身法 11、悟性 11 | 攻击 12 / 3 |
| `skill.r32-tingyu-fushui-jian` | 覆水回澜剑 | 剑法 | 4 / 身法 12、悟性 13 | 攻击 16 / 5 |
| `skill.r32-tingyu-huilan-jian` | 回澜照影剑 | 剑法 | 6 / 身法 14、悟性 15 | 攻击 20 / 8 |
| `skill.r32-tingyu-huaiyin-jue` | 怀音养息诀 | 内功 | 4 / 悟性 14、定力 12 | 治疗 17 / 7 |
| `skill.r32-tingyu-tingchao-jian` | 听潮入微剑 | 剑法 | 10 / 身法 18、悟性 18 | 攻击 27 / 13 |

## 铁嶂派 · 石北（5 项新增）

| ID | 名称 | 类别 | 等级 / 属性门槛 | 战斗 |
|---|---|---|---|---|
| `skill.r32-tiezhang-tiezhuang-quan` | 铁桩靠山拳 | 拳脚 | 2 / 体魄 11、定力 9 | 攻击 13 / 3 |
| `skill.r32-tiezhang-fanbang-jin` | 翻磅劲 | 外功 | 4 / 体魄 13、定力 10 | 攻击 17 / 5 |
| `skill.r32-tiezhang-kaishan-dao` | 开山扛鼎刀 | 刀法 | 5 / 体魄 15、力道 13 | 攻击 20 / 7 |
| `skill.r32-tiezhang-jieding-zhuang` | 截顶护身桩 | 外功 | 7 / 体魄 17、定力 13 | 攻击 22 / 9 |
| `skill.r32-tiezhang-shishou-tui` | 十手推碑腿 | 拳脚 | 10 / 体魄 19、身法 14 | 攻击 27 / 12 |

## 云隐山庄 · 闻素心（5 项新增）

| ID | 名称 | 类别 | 等级 / 属性门槛 | 战斗 |
|---|---|---|---|---|
| `skill.r32-yunyin-caomu-xinfa` | 草木回息篇 | 内功 | 2 / 定力 10、悟性 11 | 治疗 15 / 6 |
| `skill.r32-yunyin-buyun-lu` | 步云履 | 身法 | 2 / 身法 11、悟性 10 | 攻击 12 / 3 |
| `skill.r32-yunyin-qingfeng-zhang` | 清风拂穴掌 | 拳脚 | 4 / 身法 12、定力 12 | 攻击 18 / 6 |
| `skill.r32-yunyin-huiyang-jue` | 回阳引气诀 | 内功 | 7 / 定力 15、悟性 15 | 治疗 24 / 10 |
| `skill.r32-yunyin-luqiang-shenfa` | 露墙穿枝步 | 身法 | 8 / 身法 16、悟性 15 | 攻击 20 / 8 |

## 寒山书院 · 柳听澜（5 项新增）

| ID | 名称 | 类别 | 等级 / 属性门槛 | 战斗 |
|---|---|---|---|---|
| `skill.r32-hanshan-zhumo-bi` | 朱墨点腕笔 | 拳脚 | 2 / 悟性 11、身法 10 | 攻击 12 / 3 |
| `skill.r32-hanshan-dianjin-bi` | 点津校脉笔 | 拳脚 | 4 / 悟性 13、身法 12 | 攻击 16 / 5 |
| `skill.r32-hanshan-fengzhe-bi` | 锋折批隙手 | 外功 | 6 / 悟性 15、定力 13 | 攻击 20 / 7 |
| `skill.r32-hanshan-jinglun-xinfa` | 经纶定息篇 | 内功 | 6 / 悟性 16、定力 14 | 治疗 21 / 9 |
| `skill.r32-hanshan-dingli-jue` | 定理贯脉诀 | 内功 | 10 / 悟性 19、定力 17 | 治疗 27 / 13 |

## 盘舷刀场 · 祝九弦（4 项新增）

| ID | 名称 | 类别 | 等级 / 属性门槛 | 战斗 |
|---|---|---|---|---|
| `skill.r32-panzhou-fanjing-dao` | 翻桨刀 | 刀法 | 2 / 体魄 11、身法 11 | 攻击 14 / 4 |
| `skill.r32-panzhou-jielan-dao` | 截浪回舷刀 | 刀法 | 4 / 体魄 13、身法 13 | 攻击 18 / 6 |
| `skill.r32-panzhou-shunxun-bu` | 顺汛换步 | 身法 | 3 / 身法 12、体魄 10 | 攻击 12 / 3 |
| `skill.r32-panzhou-pobai-dao` | 破白连环刀 | 刀法 | 9 / 体魄 17、身法 16 | 攻击 26 / 11 |

## 授艺规则与资料作者说明

- 授艺入口在导师问话菜单中单独显示，只对本门弟子开放；进入招式列表后，`martialArtEligible` 条件按角色等级、属性、门派身份和已学状态逐项过滤。选中后由 `learnMartialArt` 效果原子授艺；退出会话或重复选择不会绕过资格检查。
- 新武学从零熟练度开始。`proficiencyCap` 和 `initialProficiency` 决定可增长范围；战斗公式目前直接读取 `combat` 与角色属性，熟练度不额外乘入伤害。
- 五位导师菜单同时保留原有本门传授：听雨剑法、铁嶂桩功、云隐身法，以及盘舷刀场可学的通用拦门刀法。
- 扩展时在武学集合追加资料项，使用稳定 `skill.` ID；门派专属武学必须填写有效 `factionIds`。完成后运行 `npm run validate:data` 与 `npm run smoke:round-32`。
