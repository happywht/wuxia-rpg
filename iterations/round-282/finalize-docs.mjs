import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import {execFileSync} from 'node:child_process';
const dir='iterations/round-282';const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const frozen=JSON.parse(fs.readFileSync(dir+'/runtime-freeze.json','utf8'));const mismatches=frozen.files.filter(x=>sha(fs.readFileSync(path.join(frozen.runtimeRoot,x.path)))!==x.sha256);if(mismatches.length)throw Error('runtime changed');if(execFileSync('git',['rev-parse','HEAD'],{cwd:frozen.runtimeRoot,encoding:'utf8'}).trim()!==frozen.candidate)throw Error('candidate changed');
const stages=['j-new-game','j0-delivery','f0-common','f1-common-before-choice'];const rows=stages.map(stage=>{const p=dir+'/'+stage+'.json',bytes=fs.readFileSync(p),e=JSON.parse(bytes);const download=path.join('C:/Users/Hitao/Downloads',`qa-checkpoint-${e.qaRun}-${e.stage}-${e.sourceSlotId}.json`);if(!bytes.equals(fs.readFileSync(download)))throw Error('download mismatch '+p);return {path:p,bytes:bytes.length,sha256:sha(bytes),download,candidate:e.candidate,stage:e.stage,sourceSlotId:e.sourceSlotId,savedAt:e.snapshot.savedAt,exportedAt:e.exportedAt,currency:e.snapshot.inventory.currency,experience:e.snapshot.player.experience,elapsedGameMinutes:e.snapshot.elapsedGameMinutes};});
fs.writeFileSync(dir+'/evidence-integrity.json',JSON.stringify({candidate:frozen.candidate,verifiedAt:new Date().toISOString(),runtimeFilesChecked:frozen.files.length,runtimeMismatches:mismatches,rawDownloadsIdentical:true,files:rows},null,2)+'\n');
const attrs=fs.readFileSync('.gitattributes','utf8');fs.writeFileSync('.gitattributes',attrs+'\n'+stages.map(x=>dir+'/'+x+'.json -text').join('\n')+'\n');
const play=`# Round282 同候选旅程：新游戏到互斥共同父

候选 ${frozen.candidate}。独立完整Git根 ${frozen.runtimeRoot}，DEV5312；272个src/data字节冻结。QA journey-20261004-r282-common，普通抄书学徒新游戏，无赠品、修改存档或隐藏状态写入。生产包5311是另一个开局检查，不能合并成这里的旅程。

## J0 三项开局差事

- 初始43,37/08:00：Lv1/XP0/83命53气/120银/膏2丸1残篇1；正常槽一保存/F8导出 j-new-game。
- E陆贞娘接凉汤，东1南2到姜百味旁；买膏2共30银、草4共32银。Q采购4/4、当面交付0/1，仍未结算。北1到陆贞娘旁，F明确交草4：18XP/15银、关系陆+3/顾+2及见闻；首差事与新见闻成就75XP/55银单列，不把成就当任务奖励。
- 通往马尚义的直接路线有3次阻挡，实际只成功4格到43,41；误开凉汤名录未改任务。E接送药，F实际交膏3：15XP/18银、马+3。剩膏1。
- E接巷口除患，N导航东2南3东6南1东4共16成功格至55,45。敌60生命/16气：四散手各16；玩家生命119→108→85→85→85，敌重招23耗4与调息4无攻击按征兆执行。获胜40XP；退出结算30XP/25银，XP178/171银。B服剩膏1恢复25命至110/119。
- 正常槽二18:32:10保存、标题Continue读回，j0-delivery原样导出。共24成功格/48世界分钟（小雨+1），不等于真人时长。初次保存误入设置/返回标题取消，没有改设置或丢档。

## 会话中断与恢复

初次J0后推进到闻素心旁、尚未保存F0。下一工具会话原标签不可用，标签清单为空；重新打开同QA URL后只有槽一新游戏/槽二J0、槽三空。未把丢失的状态算成保存通过。正常读回槽二，重走J1/F0。初次采购/制作截图保留历史，f0-crafting-recovery与后续实际原始载荷才是当前恢复链。重走没有重复领取：读回的是此前保存状态，未修改奖励。

## J1 补给与出镇（恢复后的有效链）

- 从55,45西4北1西6北3西2共16格回马尚义，接灯下问药。北2东1到44,39商店旁，采购膏1/丹1/铁3/皮2/草2/根3，总142银，171→29，8/12格背包。两分支共同提前支付修桥材料56银；未来护送保留材料，修桥消耗材料，不能与旧未采购护送预算硬比。
- 到石阶渡口64成功格：西1南2东2南3东6；南1东7南1东3南2；东3南1东2南1东1；南3东15北1东5北1东3，到90,51/11:34。首次探索需要四次重开导航取长路线后段，恢复按已读导航重走；记为P4体验问题，冻结期间不改游戏代码。
- E关口45世界分钟→雾雨渡口1,4/12:19；北2东10到11,2/12:43。F普通开场触发问药结算20XP/12银，地区到达/识踪成就40XP/25银另记，29→66；称号不证明曾实际夜行。

## F0 制作—门派—战斗—实际用途—回报

- F专门听生肌散配方，E接药庐清点；持根3与已知方可进入制药目标。北1东2南2共5格到13,3/12:53药炉。
- E/Enter实际耗草2根1/18银：66→48，产粗制散1（18生命/0气）；炉火初温成就60XP/45银，48→93。制后界面下一炉中正28/6仅为新资格，不是刚制的粗制品。
- 南3西1到12,6/13:01，F拜云隐（根选项第二项；第一项仅守御指南），门派声望+10；入门成就50XP/30银，93→123。F分别学草木回息篇、步云履，非只满足资格。
- E接雾夜巡岸，N北1西7共8格到5,5/13:17。敌72命8气，玩家146/155命97/97气。逐回合：

| 回合 | 行动 | 玩家命/气 | 敌命/气 | 实际执行 |
| --- | --- | --- | --- | --- |
| 1 | 散手 | 138/97 | 52/8 | 打20、受8；下一步蓄势18 |
| 2 | 步云履 | 137/94 | 52/8 | 耗3气、蓄势替换为普通8，抵7受1 |
| 3 | 散手 | 137/94 | 32/8 | 喘息窗口不攻击、恢复0（已满气） |
| 4 | 散手 | 129/94 | 12/8 | 打20、受8 |
| 5 | 步云履 | 128/91 | 12/8 | 耗3、再次抵7受1 |
| 6 | 散手 | 128/91 | 0/8 | 获胜32XP，不再挨击 |

- 退出战场结算巡岸34XP/22银；升级6级，生命146/173、气102/108、145银。B实际使用粗制散1→0，生命146→164（+18），气不变，不能写成28/6或无代价回复。
- Q重选药炉回报，N北1东7北1共9格到容素青旁12,3/13:35，F结算实践22XP/16银，得守伤实践见闻；XP436/161银/修为7。普通开场即可复命的问题仍留P2，不据此声称这项已有两解。
- 空槽三18:54:44正常保存、刷新标题Continue槽三，B核164命102气161银/铁3皮2根2膏1丸1残篇1，四武学和云隐归属在原始载荷保留。f0-common导出于10:54:58.990Z。

## F1 明确交丹与共同父

- 从12,3向南到12,4，E优先开药炉（未制作，关闭）；再南2到闻素心旁12,6，只见答谢前置未完，未乱接互斥。
- R人物石北导航北2西2北3后余西5。到14:00午后石北由4,1移至3,1，5,1已不相邻；再西1到4,1/14:07，E接药队启程。材料持有仅第一项1/1，约时0/1。
- Q/N南2到白鹭洲旁4,3/14:11，F明确“无极丹已备妥，请渡董定下药队起运时辰”：丹1→0，得约时见闻、28XP/24银，XP464/185银；生命164/173与气102/108不变。
- E仅查看两分支，护送/修桥均offered，后续locked。旧J0原始下载已保留后正常覆盖QA槽二（明确选择确认），F0槽三保留；导出f1-common-before-choice。刷新标题Continue槽二后B核185银/无丹/铁3皮2根2膏1丸1残篇1，E核两支仍待接。

## 未完成与下段

本轮实际完成J0→F0→F1；F2双侧、铁嶂到云岭C1尚未在此候选实走，继续使用本轮原样F1共同父并分别建独立QA角色。完整P1、真人60—90分钟、12项两解及P2—P5均未放行。设计/游戏钟/工具墙钟均不代替真人时长。

## 工具复核

Claude默认配置交付4项工具/测试；主代理发现NPC知识误读顶层，改读social.npcKnowledge；补真实嵌套协议、缺关键数组、身份不一致、负资源与非法阶段/导出时间拒绝，共13项。common-ledger.json是四真实载荷最终结果；早期j0-ledger.json仅初步工具输出，不能用于NPC知识证明。

工具ok仅声明所检查字段一致，不能验证操作者诚实或证明完整游戏Schema，更不能鉴别伪造的完整载荷；真实UI、原下载逐字节比较、冻结运行文件及正常存读联合提供证据。源槽变化警告保留，记录1→2→3→2的正常阶段保存，未隐藏切槽。

GitHubmain Round281 CI成功37195150057；冻结tag旧工作流浅克隆历史提交缺失导致37195093853失败，原日志保留。main已修fetch-depth0；不把tag失败说成绿灯，也不把它算作游戏包构建失败。
`;
fs.writeFileSync(dir+'/playtest.md',play);
const summary='冻结bf0e8d7的272个src/data文件，正常新游戏到江南J0、渡口制药/入门/六回合巡岸/战后服药回报F0，再明确交丹约时F1。四原始载荷与下载逐字节一致，正常标题读回；F1为Lv6/XP464/185银/164命102气，铁3皮2根2膏1丸1，丹已交、两支未选。会话丢失未保存段如实记录并从J0正常恢复。新增只读账本工具，主复核修正NPC知识嵌套字段，13测试通过；ok不证明操作者真实性或P1完成。';
for(const [p,title] of [['CHANGELOG.md','同候选首段与只读资源账本'],['DEVLOG.md','渡口闭环实走与中断恢复'],['ROADMAP.md','J0—F1完成，双侧后程继续同候选']]) {fs.writeFileSync(p,`## Round 282 — ${title}\n\n${summary}\n\n下一轮：从本轮F1原始共同父分出独立护送/修桥QA，连续推进两侧F2及铁嶂—云岭C1；仍P1，不启动P2，真人60—90分钟待验。验证详情见 iterations/round-282/verification.md。\n\n`+fs.readFileSync(p,'utf8'));}
const matrix='docs/CURRENT-ACCEPTANCE.md';let m=fs.readFileSync(matrix,'utf8').replace('更新：2026-10-04 / Round281冻结发行候选（bf0e8d7）','更新：2026-10-04 / Round282同候选共同旅程（bf0e8d7）').replace('## Round281 当前增量证据','## Round281 历史增量证据').replace('## 代表旅程检查点','## 历史代表旅程检查点（不可充当当前候选通过）');const insert=`## Round282 当前增量证据\n\n${summary}\n\n| 当前同候选检查点 | 实际存读与资源 | 状态 |\n| --- | --- | --- |\n| j-new-game | 槽一，Lv1/XP0/120银/83命53气 | 正常起点 |\n| j0-delivery | 槽二，Lv3/XP178/171银/110命75气，3差事结案 | 首段已实走存读 |\n| f0-common | 槽三，Lv6/XP436/161银/164命102气，粗散已服、门派2艺、实践已回报 | 共同闭环已实走存读 |\n| f1-common-before-choice | 槽二，Lv6/XP464/185银/164命102气，丹0/铁3皮2，两支offered | 互斥共同父已实走存读 |\n| F2双侧→C1 | 还未使用本轮共同父实走 | **待验；继续同冻结候选** |\n\n原始载荷/完整性/逐回合账本见 [Round282](../iterations/round-282/playtest.md)。旧混合候选C1不补当前空格。真人时长仍待，P1未放行；P2保持0/12新合同。\n\n`;m=m.replace('## Round281 历史增量证据',insert+'## Round281 历史增量证据');fs.writeFileSync(matrix,m);
const q='docs/QA-CHECKPOINTS.md';let qs=fs.readFileSync(q,'utf8');const qi=`## 当前同候选共同父（Round282）\n\nDEV5312 / bf0e8d70f608816c7ed0127e540c39a0d4cc0268 / QA journey-20261004-r282-common。四检查点见Round282验收矩阵及原始文件，F1来自正常槽二、已标题读回；两分支未选。下一轮通过F8原样导入f1-common-before-choice.json到两个独立QA并审阅跨运行确认，分别推进后程。不得把旧Round273父存档代替它。\n\n只读账本：\n\n\`node scripts/audit-journey-ledger.mjs <candidate> <checkpoint1.json> <checkpoint2.json> ...\`\n\n每次只审计一个线性QA运行，不能将两个qaRun混在一份线性账本。CLI给出原文件哈希及快照差值，混候选/混QA/身份变化/时间倒退/缺核心字段/非法资源拒绝，切槽警告保留。ok不鉴别伪造，也不证明实走/Schema全量/P1/真人时长；必须配合UI、下载完整性与冻结证明。world分钟和保存间隔均不是主动游玩时长。\n\n`;qs=qs.replace('## 启动与隔离',qi+'## 启动与隔离');fs.writeFileSync(q,qs);
fs.appendFileSync(dir+'/plan.md','\n## 执行边界复核\n\n本轮完成J0—F1与账本；F2—C1承接本轮真实共同父继续，不重启正常新游戏或换候选。工具无法鉴别内容伪造，计划中的拒绝伪造完成标记落实为不生成完成判定；真实性由实际UI与原文件/冻结完整性提供，不能声称纯快照工具自动证明真实性。\n');
console.log('frozen',frozen.files.length,'raw',rows.length,'F1',rows.at(-1));
