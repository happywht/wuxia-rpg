import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const file=resolve('data/base/battles/round-05-encounters.json');
const encounter={
 id:'encounter.r142-patrol-drill',name:'霜松巡路合练',mapResourceId:'map.round-93-snow-pine-valley',position:{col:49,row:61},profileId:'char.scribe-apprentice',
 enemy:{name:'巡路合练人',attributes:{body:10,force:12,agility:8,insight:6,resolve:8},health:160,qi:0,martialArtIds:['skill.jianghu-sanshou'],behavior:[{kind:'art',artId:'skill.jianghu-sanshou',cue:'合练人收劲摆拳，准备试你守势'}]},
 victoryExperience:0,defeatRecovery:{healthRatio:0.25,qiRatio:0.25},repeatable:true,
 texts:{approach:'巡路合练：无报酬、会受伤，可撤退；按E开始',intro:'谷口巡路人摆好守势：「这只是合练，不付经验或银两，也会受伤；随时可以撤退。暂缓同样让对手出招，与你的伙伴配合时先算清行动。」',victory:'合练人收拳拱手，邀你日后再练。此处不发战斗报酬，不改变界标或烽号结案。',defeat:'你退出合练，伤势只恢复少许；可先补给再来，不结算报酬。',flee:'你示意暂歇合练，巡路人收拳让开，无战斗报酬。'}
};
const source=await readFile(file,'utf8');
const data=JSON.parse(source);
const existing=data.encounters.find(e=>e.id===encounter.id);
if(existing && JSON.stringify(existing)!==JSON.stringify(encounter)) throw Error('巡路合练资料已改动，拒绝覆盖');
if(!existing) {
 const tail=/\s*\]\s*\}\s*$/;
 if(!tail.test(source)) throw Error('遭遇集格式不符，拒绝改写');
 const serialized=JSON.stringify(encounter,null,2).split('\n').map(line=>'    '+line).join('\n');
 await writeFile(file,source.replace(tail,',\n'+serialized+'\n  ]\n}\n'));
}
console.log('巡路合练已应用，重复应用保持既有遭遇。');
