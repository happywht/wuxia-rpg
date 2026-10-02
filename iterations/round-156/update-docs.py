from pathlib import Path

root = Path(__file__).resolve().parents[2]
body = '''## Round 156 行路可读性与北境限定传号

行路HUD基础字号由10增至13，创建/注册/重排/名称测宽一致；仍保留三行上限、时间估计和资格说明。续谈/回响列表标题附原问题，同一人物多入口可辨，既有测量省略与完整详情分页继续适用；不改稳定ID、导航目标、条件和效果。新增两项回归，兼顾所有字号和长MOD标题。

独立5179正常延续R155第三栏：领取云阶转述，雁回崖夜间与拂晓门控实际拒绝，晨光调查并复命；照雪落雪黄昏核烽、冒号头目四行动胜利、复命并限定报码。限定实扣膏1、谷关系+4/聂关系−3/声望−2；默认取消再确认，谷处回应和正常读档均验证。最终Lv8照雪59,24/青阳3日18:09、银475命87/209气89/130、残篇1丸1膏0、空装备，第三栏12:02:53正常存读，独立前两栏仍空，原5178未写。

本轮282成功格，90关口分钟、89雪地格额外178分钟、11次V共660分钟，合1210游戏分钟。雁回入口76格、照雪入口70格（210分钟）仍显空走；仅改可读性，不把这些区域记为已优化。云阶转述待送、聂处限定后果、霜松私记与北境结案待R157。援药完整云岭回应、海路另一组、剩余两种新终章、六区节奏及兼容独立发行仍待证据；M2–M5未整体通过，大目标active。

验证命令与最终结果见iterations/round-156/verification.md，实走逐段记录与截图见playtest.md。
'''
for name in ['README.md', 'CHANGELOG.md', 'DEVLOG.md', 'docs/PROJECT-GOALS.md', 'docs/DEEPENING-ACCEPTANCE.md', 'docs/PLAYER-GUIDE.md']:
    p = root / name
    text = p.read_text(encoding='utf-8')
    if name == 'README.md':
        text = text.replace('Round 155 已完成；下一轮 Round 156', 'Round 156 已完成；下一轮 Round 157')
    p.write_text(text.rstrip() + '\n\n' + body, encoding='utf-8')
checkpoint = '''## 最新执行检查点 Round156（覆盖下方历史记录）

目标持续active：交付完整江湖体验深化版，M1–M5原验收不缩减。R156改善行路字号及同人物问题辨识，真实完成雁候/核烽战斗与限定报码本地后果；独立第三栏12:02:53正常读回Lv8照雪59,24/青阳3日18:09、银475命87气89、残篇1丸1膏0。最终验证以iterations/round-156/verification.md为准。

下一轮R157返回雁回崖听限定后果，转述至霜松、私记选择与北境结案；之后海路另一组、剩余两新终章、援药完整云岭回应、六代表区域节奏和兼容独立发行。雁回76格/照雪70格空走尚未修复，不能以走通或测试通过代替整体完成。当前活动桌面目标保持启动，不关闭重建。

'''
p = root / 'docs/PROJECT-GOALS.md'
p.write_text(checkpoint + p.read_text(encoding='utf-8'), encoding='utf-8')
p = root / 'ROADMAP.md'
p.write_text(p.read_text(encoding='utf-8').rstrip() + '''

- **R156** — 已完成：HUD路线字号13与原问题辨识、实际雁候/照雪核烽战斗/限定报码及阶段存读；北境尚未整章结案。
- **R157** — 待执行：限定传号跨区回响、云阶转述送达、霜松私记与北境结案；随后海路另一组、剩余两终章、援药完整回响和六区节奏/发行验收。
''', encoding='utf-8')
for name in ['docs/ARCHITECTURE.md','docs/DATA-GUIDE.md']:
    p=root/name
    p.write_text(p.read_text(encoding='utf-8').rstrip()+'''

## Round 156 行路与对白指引展示

导航基准13px贯穿Phaser创建、字号注册、布局、刷新名称测量；三行预算与背景矩形随实际测量重排，坐标/任务分带。只读续谈/回响标题使用当前NPC名称及原选项文字，稳定ID/原索引/目标不变；长标题已有省略和详情全文分页。无新Schema/数据/效果协议，无旧v1/MOD迁移。
''',encoding='utf-8')

p=root/'iterations/round-156/goose-day-investigation.png'
if p.exists(): p.rename(p.with_name('goose-dawn-gate.png'))
