# Round177 计划：核验云岭发现到差事的承接

- 目标：核验断索桥线索、云阶石刻差事与沈雨霁对白之间的实际解锁路径，找出并修复玩家发现线索后仍无法理解/启动下一步的承接断点。
- 用户故事：玩家偶然发现断索桥后，能从当前见闻、差事说明或沈雨霁的回应中辨认先后顺序，并在满足条件时正常接取/推进相应差事。
- 验收标准：以正常游戏UI查看桥见闻、差事日志、导航及沈雨霁对白；记录当前存档真实前置状态与可选项；确认「云阶辨刻」和「断索清桥」的前置与调查目标一致；若发现无提示死路，则补充数据驱动的下一步提示/对白或修复条件，并有自动回归与正常UI复验；不覆盖存档，不把已发现桥位置等同于修桥/清桥。
- 预计人类工时：≥10分钟（逐条资料链审阅、正常UI对话验证、条件/回归实现与复测、文档记录）。
- 子任务一：沿正常UI检查江湖见闻、差事日志和沈雨霁对话，核对可见状态与资料条件；记录未满足前置条件，不注入变量或存档。
- 子任务二：审阅 quest/dialogue/knowledge graph 的引用闭合及可理解性；必要时以最小数据改动补足行动提示，写条件/对白回归并正常UI重验。
- 涉及文件：iterations/round-177/*；data/base/quests/round-74-cloud-ridge-quests.json；data/base/dialogues/round-74-cloud-ridge-conversations.json；data/base/knowledge_graph/nodes.json、edges.json；可能修改 docs/QUESTS.md、docs/REGION-ROLES.md、CHANGELOG.md、DEVLOG.md、ROADMAP.md、docs/PROJECT-GOALS.md 与 DEEPENING-ACCEPTANCE.md；相关对话/差事测试。
- 风险：第一栏角色已携带海路主线的历史进度，和新档前置状态不同；必须按当前UI显示记录，不能强行改档或倒推“新档必然无法接取”。任务内容存在既定条件，本轮只补足可理解的承接，不绕过玩法门槛。
