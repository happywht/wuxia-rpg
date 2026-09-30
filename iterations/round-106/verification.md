# Round 106 验证

所有命令在仓库根目录执行，最终结果为真实进程退出结果。

| 命令 | 结果 | 日志 |
|---|---|---|
| npm run typecheck | 退出0 | typecheck.txt |
| npm run validate:data | 退出0，100资源Schema通过 | validate-data.txt |
| npm run inspect:mods | 退出0，静态MOD分析通过 | inspect-mods.txt |
| npm run audit:round-34 | 退出0 | audit-34.txt |
| npm run audit:round-48-docs | 退出0 | audit-48.txt |
| npx vitest run tests/round106-regional-guide.test.ts tests/round106-guide-ui.test.ts --maxWorkers=2（WUXIA_R106_REPORT=1） | 退出0，2文件24测试；生成六地区报告 | focused-tests.txt、region-route-facts.json |
| npx vitest run --maxWorkers=2 | 退出0，83文件610测试，115.35秒 | full-tests.txt |
| npm run build | 退出0，生产构建完成；既有Phaser大chunk提示保留 | build.txt |
| node iterations/round-106/check-unrelated-semantics.mjs | 退出0，既有world-map除可选指南外语义相同，其余base资料无变更 | unrelated-semantics.txt |

首次全量为609通过、1失败，新同行测试夹具把requiredCount误写成count；修正夹具后专项与最终610项全量通过。未将首次失败结果当成功。

新增18项引擎/真实资料与6项面板协议测试，覆盖22角色、六地区补给/出口、耗尽/常备/失踪掌柜/非药铺、有向可达性、时段与真实同行、隐藏地标、动态堵路、旧可选字段与错误引用隔离、增量源双重放幂等、输入卸载、空类别与列表/详情分页。完整历史回归包含旧档、MOD与坏资料自动用例；静态检查与自动协议不冒充实走。

实机：江南三格补给→正常购买→第三槽保存→正常主菜单读档→库存/坐标/时间一致，人物第二页与指南关闭锁定行为，见playtest.md与JPEG。六地区完整键盘旅程仍未完成。

当前资料仍22地图、65任务、38NPC、52物品、30武学、425图谱节点/540边。没有新扩图或重绘授权素材。大目标未达完整验收，保持active，下一轮Round107两条成长路线。
