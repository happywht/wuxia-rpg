# Round 88 计划：雾航湾雾候与守烽日程

## 本轮目标

扩展现有逐日气候协议，让资料作者可以声明轻雾粒子效果；将轻雾加入季节天气表，并以程序生成的缓慢雾带在探索画面中呈现。把雾哨崖调查改成一条有环境条件的可玩路线：玩家须在雾日拂晓或晨光时段、敖晚晴当值且在身边时调查信号。为敖晚晴安排七时段日程，继续复用已有历法、天气、区域事件条件和只保存游戏时间的存档协议。

## 用户故事

- 作为雾航旅人，我能从 HUD 看见当天的轻雾，并在地图上辨认出缓慢移动的雾带；降低动态效果设置后环境画面不再持续动画。
- 作为正在校准烽信的玩家，我能从孟海洲与敖晚晴的对白得知调查窗口，等到轻雾日的拂晓/晨光，在敖晚晴守烽时靠近信号台完成勘验，之后仍可按原路线跨区复命。
- 作为岛上访客，我能在一天不同时间于雾哨崖和村落找到敖晚晴；读档后时段、天气与她的位置按既有协议重新推导。
- 作为资料作者，我可以通过气候 JSON 的通用视觉参数启用轻雾，不需加入商业图像或写入具体天气名称到引擎。

## 验收标准

1. 本计划先于本轮任何实现改动落盘；开发拆为至少两个可分别验证的子任务，预计人类工程师工时不少于 10 分钟。
2. `climate` Schema 和 Phaser-free 解析新增可选 `precipitation.kind: "fog"`，保留旧雨雪格式；恶意密度、未知类型仍有可读拒绝结果。基础天气按种子/历日确定性抽取轻雾。
3. 轻雾使用程序纹理和气候资料中的密度，不下载素材、不加入未登记许可资源；效果受 reduced-motion 设置约束，HUD/地图面板保持清晰。
4. 敖晚晴具备全部七个日历时段的可达、无冲突位置；雾哨崖调查只在 `weather.mist`、拂晓/晨光且身边有守望人时可用，满足时仍可完成既有跨区任务并返回复命。
5. 专项验证覆盖 Schema/确定性天气/轻雾显示协议、NPC 位置和日程、调查条件真值组合、任务顺序及既有区域/MOD 兼容；`npm run validate:data`、专项测试、`npm run typecheck`、`npm test`、生产构建通过。浏览器实测当前 HUD、按 V 等候后的时钟更新及舆图平移/缩放；雾哨崖调查条件由专项测试验证，本轮不把长距离实走作为浏览器验收项。
6. 更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、`docs/CLIMATE.md`、`docs/NPC-SCHEDULES.md`、`docs/QUESTS.md`、相关地图/数据说明与测试说明，以 `round-88: ...` 独立提交。

## 子任务

1. 扩展气候 Schema、解析类型和探索场景的通用轻雾绘制；为基础季节增加低频轻雾权重并验证种子/历日确定性及 reduced-motion 降级。
2. 为敖晚晴配置历法日程，加入环境条件下的烽信勘验和清晰时机提示；逐时段检查地图可达性、区域条件、任务阶段与存档重推导。
3. 添加 Round 88 专项验证和手动/浏览器走查，回归旧气候格式、旧日程、全域地图以及既有舆图交互。
4. 更新气候、人物、任务、地图、路线图和开发记录；审核差异与未跟踪文件后执行本轮 commit。

## 涉及文件

- `iterations/round-88/plan.md`
- `data/schema/climate.schema.json`、`data/base/worldview/climate.json`
- `src/engine/climate-system.ts`、`src/game/grid-scene.ts`
- `data/base/characters/round-87-southwest-isles-npcs.json`
- `data/base/dialogues/round-87-southwest-isle-conversations.json`
- `data/base/quests/round-87-southwest-isle-quests.json`
- `data/base/world/world-map.json`、`scripts/generate-round87-southwest-isles.mjs`
- `tests/round88-mist-schedule.test.ts`、`package.json`
- `README.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`
- `docs/CLIMATE.md`、`docs/NPC-SCHEDULES.md`、`docs/QUESTS.md`、`docs/MAP-ATLAS.md`、`docs/DATA-GUIDE.md`、`docs/TESTING.md`

## 风险

- 天气气候目前是全域逐日共用；雾会在多个地区以低权重出现。表现必须柔和且不遮挡地图，并可通过系统既有 reduced-motion 设置关闭粒子漂移。
- 任务调查叠加天气、时段和 NPC 相邻条件，若提示不足会像任务卡死。两位相关人物的对白与任务目标需明确写明调查窗口，HUD 继续显示当前天气/时段，等候时重新求值。
- 敖晚晴的新日程不能堵住烽台调查接近格、固定交互格、出生点或区域通路；每个时段均需装配并以网格寻路验证。
- 事件条件可能影响旧档进行中的 Round 87 任务。已有进度和知识发现必须保持不重置，未满足条件时事件不得被消耗，满足后沿用同一个发现节点 id。
- `precipitation` 是既有 wire 字段，虽然可承载非降水粒子，但文档必须说明这是历史兼容的天气粒子表现字段，不把新效果误称为雨雪。

## 预计人类工程师工时

约 12–18 小时，含通用气候协议扩展、程序粒子视觉联调、固定调查与日程冲突排查、跨区任务兼容回归、浏览器手动走查和文档记录。
