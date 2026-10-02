# 既有差事深化 ID 证据账本

本账本把“深化至少12项既有差事”落实到稳定任务 ID。它是证据导航和缺口清单，不是自动验收结论：`iterations/round-204/deepened-quests.json`逐项区分资料实现来源、旅程记录与旅程状态；`npm run audit:round-204-quest-evidence`只核查ID存在、去重、类别覆盖和来源文件，不判定旅程是否充分。

状态含义：**部分实走**表示所引的手动记录覆盖了该任务的某些阶段，但不能外推至完整任务因果、双分支或同候选发行验证；**未验证**表示目前没有可引用的正常键盘旅程。自动测试仅记在对应轮次验证文件，不能将 `journeyStatus` 改为 `played`。当前十四项皆为部分实走，没有一项被本账本宣称完整体验验收通过。

| 稳定任务 ID | 区域 | 深化覆盖 | 资料实现证据 | 旅程证据与边界 |
|---|---|---|---|---|
| `quest.r62-north-pass-marks` | 铁嶂 | 调查、人物立场 | [R100 内容证据](../iterations/round-100/content-evidence.md) | [R153](../iterations/round-153/playtest.md)：界石调查/结算已走；全章结果未证 |
| `quest.r62-post-ledger` | 铁嶂/盐道 | 调查、人物立场 | [R100 内容证据](../iterations/round-100/content-evidence.md) | [R153](../iterations/round-153/playtest.md)：接取、核簿结算及立场记录有实走；所有跨区双结果仍待复核 |
| `quest.r62-clear-ridge-road` | 铁嶂 | 战斗、人物立场 | [R100 内容证据](../iterations/round-100/content-evidence.md) | [R154](../iterations/round-154/playtest.md)：接取/战斗/复命链有阶段记录；不代表选择两侧都完成 |
| `quest.r67-well-waterline` | 西陲盐道 | 调查、补给、人物立场 | [R100 内容证据](../iterations/round-100/content-evidence.md) | [R154](../iterations/round-154/playtest.md)：井壁调查与留药一路实走；援药完整云岭回应仍缺 |
| `quest.r74-cloud-marks` | 云岭 | 调查、人物立场 | [R100 内容证据](../iterations/round-100/content-evidence.md) | [R155](../iterations/round-155/playtest.md)：刻痕调查与阶段对照有记录；另一组大陆后果另验 |
| `quest.r74-cloud-bridge` | 云岭 | 战斗、调查 | [R100 内容证据](../iterations/round-100/content-evidence.md) | [R155](../iterations/round-155/playtest.md)：悬桥战斗、调查/结案路线有记录；不外推区域节奏优化 |
| `quest.r91-goose-vigil` | 雁回崖 | 调查、人物立场 | [R101 内容证据](../iterations/round-101/content-evidence.md) | [R156](../iterations/round-156/playtest.md)：雁候与限定传号旅程；公开反向路线另核 |
| `quest.r92-snow-beacon` | 照雪关 | 调查、战斗、人物立场 | [R101 内容证据](../iterations/round-101/content-evidence.md) | [R156](../iterations/round-156/playtest.md)：烽号、代表挑战、限定传号；公开侧另核 |
| `quest.r93-boundary-mark` | 霜松谷 | 调查、补给、人物立场 | [R101 内容证据](../iterations/round-101/content-evidence.md) | [R157](../iterations/round-157/playtest.md)：旧界调查、内部留录、跨区转述；公开侧另核 |
| `quest.r94-homeward-lantern` | 天门关 | 调查 | [R101 内容证据](../iterations/round-101/content-evidence.md) | [R157](../iterations/round-157/playtest.md)：旧驿线调查/复命；不等于三章交付通过 |
| `quest.r83-net-recovery` | 青帆埠 | 战斗、补给 | [R102 内容证据](../iterations/round-102/content-evidence.md) | [R160](../iterations/round-160/playtest.md)：夺网战斗所在的海路旅程；整章选择链另验 |
| `quest.r84-lantern-ledger` | 风回岛 | 调查、人物立场 | [R102 内容证据](../iterations/round-102/content-evidence.md) | [R160](../iterations/round-160/playtest.md)：风灯调查/复命所在路线；未单独覆盖最终两组代价分支 |
| `quest.r85-low-tide-channel` | 潮生屿 | 调查、补给、人物立场 | [R102 内容证据](../iterations/round-102/content-evidence.md) | [R160](../iterations/round-160/playtest.md)：潮道、补给选择阶段记录；完整跨区回应看R161 |
| `quest.r97-tide-ledger` | 澜心洲 | 调查、人物立场 | [R102 内容证据](../iterations/round-102/content-evidence.md) | [R159](../iterations/round-159/playtest.md)：潮簿/传航一路记录；第二组分支整体仍缺 |

## 类别覆盖及未满足项

十四个候选 ID 覆盖调查、战斗、物品/补给和人物立场四类，并横跨大陆、北境、海路。两个制作/使用任务 `quest.r31-herbal-stocktaking` 与 `quest.r31-blade-quench-stock` 另有 Round104 实际新局流水记录（实现见 [R104 内容证据](../iterations/round-104/content-evidence.md)，键盘流水见 [R104 经济账](../iterations/round-104/economy-ledger.md)），可作为后续扩充候选，但当前不混入上述十四项，因为本账本挑选的是R100–102三章深化任务。

该账本证明“至少12个稳定 ID 已被识别并链接到实现材料与阶段性旅程记录”；它**不证明至少12项差事均已完成足够深度的完整玩家体验验收**。自动结构检查通过后，仍须逐项复核旅程是否亲自完成相关调查/战斗/制作/选择、回响及所需存读，并修正发现的问题。海路第二组成本分支、井药援助云岭后果和章节双结果等缺口保持未完成。
