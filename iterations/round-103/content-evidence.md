# Round 103 内容证据（对表实际数据，2026-10-01）

每条证据给出可直接复核的数据位置；文案与数值若与本文冲突，以数据文件为准。

## 五任务深化（data/base/quests/round-07-quests.json）

| 任务 | 有序目标链（kind@target） | 奖励（原经验/银两保持） |
| --- | --- | --- |
| quest.r43-tingyu-eave-rain | talk 柳听澜 → discoverKnowledge place.r74-cloud-markers → talk 叶庭舟（回镇里） | 36/22；声望 听雨剑阁+5；见闻 r103-tingyu-practice + r43 outcome |
| quest.r43-tiezhang-stone-post | talk 顾夜尘 → defeatEncounter encounter.r62-ridge-roadblock → talk 石北（回雾雨渡口） | 40/18；声望 铁嶂派+5 |
| quest.r43-yunyin-herb-road | talk 容素青 → discoverKnowledge place.r67-brine-well → collectItem item.huichun-gao×2 → talk 闻素心 | 34/20；声望 云隐山庄+5 |
| quest.r43-hanshan-copybook | talk 沈墨涵 → discoverKnowledge place.r93-old-mark → talk 柳听澜（回讲书堂） | 38/24；声望 寒山书院+5 |
| quest.r43-panzhou-return-tide | talk 白鹭洲 → defeatEncounter encounter.r83-tide-wake-looters → talk 祝九弦（回栈桥） | 42/26；声望 盘舷刀场+5 |

回程地名对照 round-03-npcs.json 实际放置：叶庭舟/柳听澜/沈墨涵/顾夜尘在 map.round-01-grid（江南），石北/闻素心/容素青/祝九弦/白鹭洲在 map.round-10-mist-ferry（雾雨渡口）。

## 引用目标的真实世界挂载（data/base/world/world-map.json）

- place.r74-cloud-markers：event.r74-cloud-inscription 与 landmark.r74-cloud-markers 双挂载，(27,31) 云纹石阶；用途为旧索孔/刻痕观察（r74 既有任务"云阶辨刻"同源），**不是听取山中声音的系统，不能证明江岸剑鸣来源**——听雨全部文案已按此证据边界书写并有负向测试断言。
- place.r67-brine-well：event.r67-well-reading + landmark，(26,28) 回声苦井。
- place.r93-old-mark：event.r93-old-mark + landmark，(24,32) 旧界标；界刻年头不能断纸龄（寒山文案明示）。
- encounter.r62-ridge-roadblock：碎岭拦路客，map.round-62-iron-ridge (71,63)，repeatable=true，胜 48 经验。
- encounter.r83-tide-wake-looters：潮沟夺网客，map.round-82-east-coast (73,68)，repeatable=true。repeatable 语义下复命文案不承诺永久通路（铁嶂/盘舷 echo 已改为"这一趟散了/若再来再清"）。

## 导航关口（world-map.json transitions，文案中全部坐标可溯源）

- 江南/雾雨渡口 → 铁嶂北道：gate.ferry-north-to-iron-ridge (89,15)→(4,7)。
- 铁嶂北道 → 云岭古道：gate.iron-ridge-to-cloud-ridge (50,2)→(50,97)；云纹石阶邻云栈客舍(39,43)。
- 铁嶂北道 → 西陲盐道：gate.iron-ridge-to-salt-road (52,90)→(95,74)；青岩驿(48,49)。
- 云岭古道 → 雁回崖(62,2)、照雪关(50,2)、霜松谷(3,64)→(96,50 东口)。
- 云岭古道 → 青帆埠：gate.r82-cloud-ridge-to-east-coast (96,50)→(6,50)。

## 修习提示数值（data/base/skills/round-04-martial-arts.json，文案逐门可对表）

听雨：落雨七分剑 2/敏11/悟11 攻12耗3；覆水回澜剑 4/敏12/悟13 攻16耗5；怀音养息诀 4/悟14/定12 恢17耗7；回澜照影剑 6/敏14/悟15 攻20耗8；听潮入微剑 10/敏18/悟18 攻27耗13。
铁嶂：铁桩靠山拳 2/体11/定9 攻13耗3；翻磅劲 4/体13/定10 攻17耗5；开山扛鼎刀 5/体15/**力道**13 攻20耗7；截顶护身桩 7/体17/定13 攻22耗9；十手推碑腿 10/体19/敏14 攻27耗12。
云隐：草木回息篇 2/定10/悟11 恢15耗6；步云履 2/敏11/悟10 守9耗3；清风拂穴掌 4/敏12/定12 攻18耗6；回阳引气诀 7/定15/悟15 恢24耗10；露墙穿枝步 8/敏16/悟15 守16耗6。
寒山：朱墨点腕笔 2/悟11/敏10 攻12耗3；点津校脉笔 4/悟13/敏12 攻16耗5；锋折批隙手 6/悟15/定13 攻20耗7；经纶定息篇 6/悟16/定14 恢21耗9；定理贯脉诀 10/悟19/定17 恢27耗13。
盘舷：翻桨刀 2/体11/敏11 攻14耗4；顺汛换步 3/敏12/体10 守9耗3；截浪回舷刀 4/体13/敏13 攻18耗6；破白连环刀 9/体17/敏16 攻26耗11。

措辞协议：heal=疗伤回复生命（要耗内力、不补内力）；guard=守只挡得住下一击；force 显示名"力道"（round-04-profiles.json attributeLabels）。测试以 `toContain('养是疗伤回复生命')`、`not.toContain('回气养伤')`、`not.toContain('臂力')` 锁定。

## 知识图谱（nodes.json/edges.json）

- 5 实践见闻 event.r103-{tingyu,tiezhang,yunyin,hanshan,panzhou}-practice（knownByDefault:false，唯一来源=任务完成奖励）。
- 5 静态边 kg.edge.r103-*-practice（fromId=各师傅 char，relation knows）。
- event.r43-wayfarer-letter 摘要改写为"写信人未具名，入门弟子也可请本派师傅转抄与己派相关的一段"——师傅转抄/道路奇遇两来源，不伪造原作者。
- 图规模 417 节点/529 边（round58/round59 测试快照同步更新并注明来源）。

## 云隐备药结算协议（引擎事实，非本轮改动）

grid-scene.ts 的 applyQuestUpdate 每次调用 reconcileQuestFacts（quest-system.ts:746），collect 目标按**当前持有量**结算：已备 2 份回春膏的玩家在井见闻后的下一次任务更新即完成备药目标，不需要再购买，任务不扣物品。round103 测试按此真实链路断言（accept 携带库存→核询→井见闻→reconcile→复命）。

## 受管同步与幂等（scripts/lib/round103-faction-practice.mjs）

- 增量脚本对已深资料不再跳过：受管 description/追加目标/奖励字段/对话节点与选项与配置逐项比对，不一致即文本级替换（未涉及字节不动）；缺受管目标抛可读错误。本轮纠错文案（回程地名/疗伤措辞/听雨证据边界/绳结删除）即由该机制原地同步到已落盘 JSON。
- 幂等测试：重跑两次后五个数据文件 SHA-256 稳定。

## 证据边界

以上均为数据/引擎层证据。五派真实键盘旅程、UI 呈现与节奏乐趣未经浏览器验证；三章与总体 goal 保持 active。
