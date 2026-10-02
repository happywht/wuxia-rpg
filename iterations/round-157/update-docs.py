from pathlib import Path

root=Path(__file__).resolve().parents[2]
body='''## Round 157 可谈转述与北境另一组完整阶段

R差事新增当前可谈转述：从可见无效果入口查找分享已知见闻的原选项，允许分享/发现见闻与关系变化，不代替F交谈，不泄露答复，不改资源。真实资料的隐名转述关系−1也保留，避免只展示有利结果；交药、战斗、传送、确认等不混入此投影。位置沿用当前日程/伙伴，稳定ID含原索引。八项新增回归覆盖只读、资格、成本过滤、循环/位置、缺资料、真实私记/公开和隐名负关系转述。

独立5179正常延续R156：雁回读限定传号反方回应，雨中回云岭买最后膏1/15银，沿北境回霜松调查/复命30经验22银，内部留录实扣膏1、柳关系+4/沈问秋关系−3/声望−2；云阶转述私记一路正常送达（关系+1），R送达入口移除并保留纯回响。再正常至天门调查旧驿线/复命36经验28银，沈处读私记反方回应及北境四地阶段结案。雁候/今烽/前朝屯界/旧驿线分项成立，不据此认残篇作者，海路继续查纸药墨。

本轮1043成功格、8关口360分钟、天气额外560分钟，共1963分钟（青阳3日18:09→5日02:52），无V/状态注入；长距离补给与空走仍待修整，未标为区域优化。最终Lv9天门46,42、银510命105/227气100/141、残篇1丸1膏0空装备，独立第三栏12:29:19保存，正常读回以实走记录为准。原5178未写，独立前两栏仍空。

当前限定+私记的北境完整阶段已实走，仍不是整个产品验收。海路另一组、剩余两种新终章、援药完整云岭后果、六代表区域节奏及兼容独立发行仍待证据；goal active，M2–M5未整体通过。验证见iterations/round-157/verification.md，逐段行程与截图见playtest.md。
'''
for name in ['README.md','CHANGELOG.md','DEVLOG.md','docs/PLAYER-GUIDE.md','docs/PROJECT-GOALS.md','docs/DEEPENING-ACCEPTANCE.md']:
 p=root/name
 text=p.read_text(encoding='utf-8')
 if name=='README.md':text=text.replace('Round 156 已完成；下一轮 Round 157','Round 157 已完成；下一轮 Round 158')
 p.write_text(text.rstrip()+'\n\n'+body,encoding='utf-8')
for name in ['docs/ARCHITECTURE.md','docs/DATA-GUIDE.md']:
 p=root/name
 text=p.read_text(encoding='utf-8').replace('截至 Round 156','截至 Round 157')
 p.write_text(text.rstrip()+'''

## Round 157 当前可谈转述

通用R差事投影追加delivery条目：仅沿可见无效果入口，非确认节点上确有shareKnowledgeNode且所分享见闻均已知；其余效果仅discoverKnowledgeNode/adjustRelationship。关系允许负向，投影列原问题但不代执行，不提前展示目标节点正文。currentMap/daily/follower位置与原选项索引沿用既有解析，资格随装配/时间重算；一次性消失由对白条件决定，没有新已读状态或Schema/v1迁移。八项回归含真实柳寻径两种转述与雁回隐名关系−1转述；后者仅自动测试，不冒充本轮实走。
''',encoding='utf-8')
p=root/'ROADMAP.md'
p.write_text(p.read_text(encoding='utf-8').rstrip()+'''

- **R157** — 已完成：可谈转述投影、实际限定/私记跨区后果、云阶判断送达、界标与天门旧线及北境另一组结案、阶段存读；完整验证见本轮记录。
- **R158** — 待执行：从天门正常接海路另一组（护航人手方向）及剩余终章；推进补给/长空走修整，保持援药完整回响、六区节奏与兼容独立发行验收范围。
''',encoding='utf-8')
p=root/'docs/PROJECT-GOALS.md'
p.write_text('''## 最新执行检查点 Round157（覆盖下方历史记录）

持续交付完整江湖体验深化版，原M1–M5范围不变。限定报码+内部留录另一组北境完整阶段已实际核验：两处跨区反方代价、霜松与天门调查、云阶私记转述及四地结案；独立第三栏12:29:19，Lv9天门46,42/青阳5日02:52、银510命105气100、残篇1丸1膏0空装备。可谈转述指南保留正/负关系结果、投影不代结算。最终全量验证以iterations/round-157/verification.md为准。

Round158接续海路另一组、剩余两种新终章；援药完整云岭回应、六区节奏/北境补给距离与兼容独立发行仍待证据。三新终章仍只有1/3完整旅程，不因北境另一组结案或测试数量关闭大目标。Goal active。

'''+p.read_text(encoding='utf-8'),encoding='utf-8')
