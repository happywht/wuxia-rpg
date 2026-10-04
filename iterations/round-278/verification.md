# Round278 验证

- 委派实现结果由主代理复核；初版入口6,4与NPC邻接冲突/末页Enter直接购票/历史指南漂移判定有缺口，修正后冻结候选再真实操作。default模型/权限不改，使用与成本见delegation-summary.json；不宣称缓存节省。
- 新round278作者17项，含整批预检/幂等/原54关口全部值保持/同图实扣8银20分钟/导航不购票/不足与坏落点拒绝/全日程NPC邻接/E实际选择/重复source与漂移拒绝。TravelConfirmation新增5项默认取消/早按Down不买/PgUp复位/Up取消/重开复位与绑定释放，既有分页2项继续。
- 定向：primary-focused-first.txt保留初3失败；修正后primary-focused-final.txt三文件33通过；新增严格边界后primary-boundaries-final.txt三文件36通过；historical-focused.txt16文件97通过。初primary-typecheck.txt退出2因测试fixture未收紧元组类型，随后as const修正，最终类型通过。
- npm run build初build-first.txt退出1（15旧断言失败，1730通过）；修正仅过滤确切新2ID仍保留原54完整断言，历史全树重放接入新的合法作者链。build-before-doc-ids.txt代码全195文件1746测试通过，文档缺新关口ID退出1；最终代码build-before-doc-format.txt195文件1748测试通过、100资源Schema/MOD/类型通过，但地图表格缺完整from/to地图及规范坐标，文档审计退出1。
- 只改文档表格后 npm run audit:round-34、npm run audit:round-48-docs、npx vite build依次退出0（docs-build-final.txt）。175模块、main725.54KB/Phaser1374.54KB，已有块体积警告。最终所有build组成门槛通过；不把历史npm run build退出1改写成退出0，不重复与文档无关的全测试。
- node scripts/apply-round278.mjs退出0幂等（author-idempotence.txt），原54关口保留、世界56/渡口8出口，新current结构盘点content-counts.json。原Category counts明确承接未改的Round273类别。
- 真实QA见playtest/checkpoint-summary/截图：护送默认取消再购票4格73分钟，船费8与到达成就40XP25银分账，正常存读最终XP686/343银；修桥免费94格、返程再北上两票16银，96格181分钟，正常存读XP674/310银。生命/内力/物品/任务/对白变量不变，水尺不随乘船自动赠送。
- 提交前最终文档审计、git diff --cached --check与Download=disk=index、源码冻结校验另记final-audit.txt/evidence-integrity.json。正式QA在源码冻结后进行，无隐藏状态写入。

范围：P1渡口段减负已验；余下长路、完整同候选、新游戏旅程与普通玩家60–90分钟仍待。P2新合同0/12；整体Goal未完成。保护Round144用户日志与旧未跟踪文件。
