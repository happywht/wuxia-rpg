# Round263 实机与自动验证记录

## 目标启动

- 读取用户指定的 `C:\Users\Hitao\.codex\attachments\4c50acb7-1161-43f6-8448-59cd317d996a\goal-objective.md`，确认当前持续目标要求保留完整项目范围、按轮推进、全部同版验收后才可关闭。
- 用户授权启动新目标。沿用同项目桌面Goal，状态保持active，不创建重复Goal。附件及仓库 `docs/PROJECT-GOALS.md` 继续承载权威细节；已在附件追加Round263检查点。

## 实机边界

- IAB标签31仍指向隔离来源 `http://127.0.0.1:5208/`，标题 `wuxia-rpg · 江湖见闻`；IAB AX树只暴露游戏画布和自创武学名号输入框，没有槽位/任务菜单文本节点。
- 尝试采用Windows `computer-use` 技能以正常窗口输入恢复实机；`@oai/sky`初始化失败：`Trusted RPC service is not configured`。没有发出Windows窗口键鼠事件，没有动存档，没有改变玩家进度。本轮未观察到任务面板、地图HUD或背包状态，不把Round262状态冒称本轮读回。
- 因此没有完成本计划原定的药道实走、巡岸战斗、保存/Continue读回。等待窗口辅助恢复或使用者提供可交互预览时续行。

## 资料与自动回归

- 只读任务资料确认链路：`灯下问药`前置开局送药；完成后解锁`药庐清点`。药庐清点按有序目标执行：苍崖根×3 → 发现生肌散配方 → 炼制 → 损耗后实际疗伤 → 向容素青复核。之后解锁`雾夜巡岸`；完成巡岸后才满足`药队启程`的两个前置。
- 护送与修桥共用互斥组，测试仅检查数据组相同，没有接受任一任务，也未替玩家决定。
- 新增 `tests/round263-medicine-chain.test.ts`：检查任务前置与阶段顺序、跳步信号不结案、探子遭遇可在渡口地图抵达相邻格、药方Recipe引用可解析、护送/修桥互斥。

验证命令与结果：

- 首轮聚焦测试：1个新用例因测试夹具没满足任务前置而失败；修正夹具模拟前置任务完成后复跑。
- `npm test -- tests/round263-medicine-chain.test.ts tests/round104-crafting-loops.test.ts tests/round254-caravan-appointment.test.ts tests/round255-caravan-branches.test.ts`：4文件、24项通过。
- `npm run typecheck`：通过。
- `npm run validate:data`：manifest与100个基础资源Schema通过。

## 文档校正

- 更正Round262中按键称呼：Q面板内N做当前任务目标导航；R为区域行旅指南；M直接开世界舆图；离开Q后N开经脉内修。
- 更新项目目标、玩家指南、路线图、开发日志与变更日志。完整项目Goal仍为active。

## 下一步

恢复5208隔离页可操作窗口后先Continue只读核对槽一身份/摘要及任务状态，再从真实状态决定下一格任务；完成巡岸前保存并核查战斗风险。互斥护送/修桥分支留给用户选择。八组全局验收、分支和结局、旧档/MOD/空坏资料、素材授权与同一候选独立发行实启仍未完成。
