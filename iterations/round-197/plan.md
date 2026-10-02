# Round 197 计划：存档任务知识回填与淡泉线索验证

- **目标：** 修复任务知识节点在旧存档中缺失的百科关联，并验证接取/完成状态都能让雾航任务与已知地点建立可见图谱联系；在不丢失现有未保存旅程的前提下，推进石涧淡泉探索证据。
- **用户故事：** 我已接取或完成一项差事，即使旧档是在百科效果加入前保存，重进世界后也能在百科查看这项差事以及它与已知地点的联系；新档仍由接取时的数据效果发现任务词条。
- **验收标准：** 世界恢复后，active/completed/failed任务对应的同ID知识节点仅在节点kind为quest时回填；offered/locked任务不提前曝光；新接受效果保留；回归覆盖雾航 requires/rewards边且不泄露未发现端点；从界面实测旧完成态回填前后差异，档位不被覆盖。
- **子任务：** ①核查Round196复用现场：雾航任务已完成、石涧淡泉已知但百科关联为空；定位已知完成任务恢复时缺少任务节点回填；②加入数据无关的运行时恢复回填，并覆盖旧active/completed与locked/offered边界及端点可见性；③在现有未保存状态下仅做不破坏进度的百科验证，避免重载/存档；④运行定向测试、Round87 smoke、类型/Schema校验，更新目标与日志。
- **涉及文件：** `iterations/round-197/`、`src/game/grid-scene.ts`、`src/game/quest-ui.ts`、`src/engine/quest-consequences.ts`、`tests/round87-southwest-isles.test.ts`、`tests/round119-quest-panel-detail.test.ts`、`docs/PROJECT-GOALS.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`，必要时更新外部goal目标附件。
- **风险：** 当前完成进度仅在5200页面内存中；用户未授权覆盖槽3。绝不保存、热重载、回主菜单或重置页面；若验证操作会影响运行态则停止。
- **预计人类工程师工时：** 90–120分钟，含存档恢复链排查、旧档兼容实现、正反边界回归和无损实机核验。
