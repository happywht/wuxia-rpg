import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='iterations/round-280/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const freeze=JSON.parse(fs.readFileSync(dir+'runtime-freeze.json'));
const changed=freeze.files.filter(x=>hash(fs.readFileSync(x.path))!==x.sha256);
if(changed.length)throw Error(JSON.stringify(changed));
const evidence={candidate:freeze.candidate,frozenFileCount:freeze.files.length,runtimeUnchanged:true,exports:[]};
for(const branch of ['escort','repair']){
 const file=dir+branch+'-c1-return.json', raw=fs.readFileSync(file), d=JSON.parse(raw);
 const download='C:/Users/Hitao/Downloads/qa-checkpoint-journey-20261004-road-'+branch+'-cloud-c1-'+branch+'-return-slot-3.json';
 if(!raw.equals(fs.readFileSync(download)))throw Error('download mismatch');
 evidence.exports.push({file,sha256:hash(raw),downloadMatches:true,sourceSlotId:d.sourceSlotId,savedAt:d.snapshot.savedAt,exportedAt:d.exportedAt,player:d.snapshot.player,inventory:d.snapshot.inventory,elapsedGameMinutes:d.snapshot.elapsedGameMinutes,quests:d.snapshot.quests,dialogueVariables:d.snapshot.dialogueVariables});
}
fs.writeFileSync(dir+'evidence-integrity.json',JSON.stringify(evidence,null,2)+'\n');
const report=`## Round280 当前增量证据\n\n云岭挑战接取明确断口与挑战坐标、Q/N导航、蓄势征兆和有限补给；回报说明奖励已到账、清退不等于修索、本次无需返回渡口。两侧从Round279真实C0按键推进124格、调查、战斗、回客舍报告，槽三明确覆盖后标题Continue读回并F8原样导出。护送Lv8/XP806/185命118气/395银/膏2；修桥Lv8/XP794/189命121气/362银/膏0丸2，最后一膏实际恢复25命。没有赠品或修改存档。198文件1789测试、102资源Schema/MOD/类型/两审计/Vite通过；272运行文件冻结校验及下载原样校验见本轮evidence-integrity.json。完整新游戏同候选及真人60—90分钟仍待，P1未放行，P2不启动。\n\n`;
fs.writeFileSync(dir+'playtest.md','# Round280 双侧云岭收束实走\n\n'+report+'## 实际操作与战斗\n\n两侧共同路线：C0(40,43) N12 W13查看刻痕，E13 S11 W1回客舍接断索；E1 S1 E31 N1到断口相邻格E检查，再E4挑战，胜后S1 W35回客舍F报告。护送侧实际使用Q/N检查新接任务及可走路线。\n\n护送四回合：散手25、步云履耗3气将重击压至12、散手25、散手终结；累计损命23，未用药。修桥三次散手：受11及31重击共42命，胜后B实际用最后一膏+25命；无购买。刻痕28XP20银、战斗48XP、差事44XP32银，两侧总增120XP52银。护送世界时间761→985，修桥3943→4067；天气权重导致时间不同，不能作为真人游玩时长。原C0保留于Round279，QA槽一二不动。\n\n正常保存→刷新标题→Continue→槽三→B读回，两侧资源与导出一致。修桥保存09:55:22（准确毫秒见原始导出）；导出10:00:51.272Z。全部操作使用游戏UI，无隐藏状态写入。\n\n## 限制\n\n本段双侧通过不代表P1完整同版本新游戏旅程通过；未做真人时长验收，未做当前候选干净发行包复现。\n');
for(const file of ['CHANGELOG.md','DEVLOG.md','ROADMAP.md'])fs.writeFileSync(file,'## Round 280 — 云岭挑战回程与双侧收束存读\n\n'+report.replace('## Round280 当前增量证据\n\n','')+'下一轮：同候选完整新游戏旅程与干净发行包复现，继续P1。\n\n'+fs.readFileSync(file,'utf8'));
const matrix='docs/CURRENT-ACCEPTANCE.md';let m=fs.readFileSync(matrix,'utf8');m=m.replace('Round279冻结候选（基于51f3355）','Round280冻结候选（基于bff5245）');m=m.replace('## Round279 当前增量证据',report+'## Round279 历史增量证据');fs.writeFileSync(matrix,m);
let guide=fs.readFileSync('docs/PLAYER-GUIDE.md','utf8');guide=guide.replace('当前版本双侧实走待完成，不能以说明代替验收。','Round280双侧本段已实际挑战、返回、正常存读；完整同候选新游戏旅程仍待验证。').replace('（Round280，在研）','（Round280）');fs.writeFileSync('docs/PLAYER-GUIDE.md',guide);
fs.appendFileSync('docs/QA-CHECKPOINTS.md','\n'+report+'原始检查点：iterations/round-280/escort-c1-return.json、repair-c1-return.json。来源均slot-3；明确确认覆盖，父C0原样保留Round279。\n');
fs.appendFileSync('docs/PROJECT-GOALS.md','\n## 当前推进位置（Round280）\n\n云岭C0→C1双侧本段真实挑战、报告与存读完成，详见当前验收矩阵。下一步完整同候选新游戏旅程与发行复现；P1未放行，五阶段全部条件仍有效，大目标不得关闭。\n');
fs.appendFileSync(dir+'implementation-notes.md','\n完整npm run build实际退出0：198文件1789测试/102资源及全部检查、Vite通过。两侧C1完成正常保存、标题Continue和F8原样导出，冻结272文件未变。下载字节匹配，详见playtest/evidence-integrity。\n');
fs.appendFileSync('.gitattributes','\niterations/round-280/escort-c1-return.json -text\niterations/round-280/repair-c1-return.json -text\n');
console.log('freeze',freeze.files.length,'exports',evidence.exports.map(x=>({file:x.file,sha256:x.sha256})));
