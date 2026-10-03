# Round 256 验证记录

## 自动化验证

- `npx vitest run tests/round255-caravan-branches.test.ts tests/round254-caravan-appointment.test.ts`：2个文件、6项通过。
- 新覆盖调用引擎正式 `getVisibleOptions`：无路线见闻时两个回应都隐藏；仅护送见闻只显示护送回应；仅修桥见闻只显示修桥回应；若存档因导入或未来内容同时持有两条见闻，两项各自回应均可见。
- 同一专项断言后续任务的发布NPC、分支前置任务和知识图谱 `requires`/`participatesIn` 关系吻合。
- `npm run typecheck`：通过。
- `npm run validate:data`：通过，manifest与100个基础资源Schema有效。

## 玩家存档与实机边界

本轮没有活动浏览器的当前状态快照或可复核的Round254存档导出。仓库中旧`.playwright-mcp`为9月历史诊断产物，不足以证明当前页面/存档状态。本轮未打开浏览器、未读写任何存档、未选择路线。Round254最近权威检查点仍记为Slot1完成约时后、两支线均未接取；该状态不是本轮重新实机确认。

本轮自动化验证对白条件求值及静态任务/图谱联接，没有验证实际游戏画面、告示板呈现或分支实走。后续如当前浏览器可用，先只读恢复玩家检查点，再根据玩家选择推进。

## 全局目标

完整新游戏闭环、三章真实旅程、双分支真实结算、三结局、六区域打磨、兼容/发行验收仍未完成；持续目标保持active。
