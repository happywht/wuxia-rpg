from pathlib import Path
checkpoint='''## 最新执行检查点 Round164（覆盖历史）

公开独立第一栏 r163 正常完成送药、巷口四回合胜利、捐3膏、购2膏、拜铁嶂与桩功/翻滚劲/靠山拳。第一栏14:25:17，Lv5渡口3,2/青阳1日16:43轻雾、银266命121/155气97/97体17力14身11悟12定11、残篇1丸2膏2空装备；正常重读师门、善恶5江湖5本派10及物资匹配。第二空、第三R162有限终章13:56:46保留，原5178未写。

最终保存线路112成功格+雾112+过关45+引路120=389分钟。首次未保存误选退门，经正常旧第一栏重读重新实走，记录保留，不冒充无误操作或注入修复。通用胜利/撤退接续提示补齐，真实新版胜利页面通过；163文件1451测试97.68秒、build再测97.04秒 exit0。三新终章仍2/3，公开三章与大陆援药完整云岭后果、六区剩余优化、兼容授权独立发行待验。goal active，完整M1–M5保持。下一Round165公开旅程出镇调查与井药援助。

'''
for name in ['docs/PROJECT-GOALS.md','docs/DEEPENING-ACCEPTANCE.md',r'C:\Users\Hitao\.codex\attachments\4c50acb7-1161-43f6-8448-59cd317d996a\goal-objective.md']:
 p=Path(name);p.write_bytes((checkpoint+p.read_text(encoding='utf-8')).encode('utf-8'))
record='''公开独立第一栏完成送药、巷口胜利、捐药/补给、拜铁嶂及三武学；正常14:25:17存读保留Lv5渡口3,2/青阳1日16:43、银266命121/155气97/97残篇1丸2膏2，本派10善恶5江湖5。第三栏有限终章不动。首次未保存误退门通过正常旧档恢复并重新实走，证据诚实记录。

胜利与撤退通用结果补齐离场差事/Q日志/R后续或B补给提示，不发奖励、不改状态。实际新版胜利通过；专项2文件10测试，全量163文件1451测试97.68秒，build再测97.04秒exit0。目标当前启动说明纠正历史陈旧指向，三种新终章2/3及完整验收保留active。尚未计公开三章/援药跨区与独立发行完成。详见iterations/round-164/plan.md、playtest.md、verification.md。
'''
for name,heading in [('CHANGELOG.md','### Changed (Round 164)'),('DEVLOG.md','## Round 164 公开旅程成长与目标接续')]:
 p=Path(name);s=p.read_text(encoding='utf-8');p.write_bytes((s+'\n'+heading+'\n\n'+record).encode('utf-8'))
p=Path('README.md');s=p.read_text(encoding='utf-8');p.write_bytes((s+'\n## Round164 当前推进\n\n'+record).encode('utf-8'))
p=Path('ROADMAP.md');s=p.read_text(encoding='utf-8');p.write_bytes((s+'\n- **R164 已完成** — 公开独立新档战斗、捐药/补給、拜铁嶂三武学与正常存读；战斗结果接续提示、目标当前说明修正，1451测试/build通过。\n- **R165 计划** — 公开旅程出镇、大陆调查及井药援助，后续完整云岭回应；北境/海路公开三章终章、六区剩余优化与兼容授权独立发行持续。\n').encode('utf-8'))
p=Path('docs/PLAYER-GUIDE.md');s=p.read_text(encoding='utf-8');p.write_bytes((s+'\n## 战斗结果与后续（Round164）\n\n结果页的本场经验已由战斗结算；相关差事后果在离场时处理。回到行路后按Q查看实际状态，按R查找后续委托。撤退不算胜利，按B整理补给后再决定是否重试；战败恢复数值见结果页。师门与授艺选项会随身份、已学武学变化，请每次确认当前文字再选择。\n').encode('utf-8'))
p=Path('iterations/round-164/playtest.md');s=p.read_text(encoding='utf-8');p.write_bytes((s+'\n## 正常恢复结果\n\n保存后刷新/继续/第一栏，实际渡口3,2/16:43恢复。J铁嶂弟子师从石北，本派声望10善恶5江湖5；B266银121/155命97/97气、残篇1丸2膏2空装备一致。read-faction.png/read-resources.png。没有保存退门分支。\n').encode('utf-8'))
