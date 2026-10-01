import { factionPracticeConfigs } from './round103-faction-practice.mjs';
export const TRANSFER_DIRECTION_NODE = 'r127-transfer-readiness';
export function addTransferDirections(set) {
  const config=factionPracticeConfigs.find(c=>c.key==='tingyu');
  return {...set,conversations:set.conversations.map(c=>c.id!=='dlg.ye-tingzhou-mentor'?c:{...c,nodes:[
    ...c.nodes.filter(n=>n.id!==TRANSFER_DIRECTION_NODE).map(n=>({...n,
      text:n.id==='r103-tingyu-next'?config.mentorBrief:n.text.replaceAll('朱九弦','祝九弦'),
      ...(n.id!==c.startNodeId?{}:{options:[...(n.options??[]).filter(o=>o.nextNodeId!==TRANSFER_DIRECTION_NODE),
        {text:'改投之前，怎样核对入门资格与这一程实践？',nextNodeId:TRANSFER_DIRECTION_NODE}]}),
    })),
    {id:TRANSFER_DIRECTION_NODE,text:'叶庭舟把名册摊开：「先按J看当前师门退出后的真实声望、善恶及各派缺口，别只看未退门的数。我这里江湖声望门槛是0，善恶须在−20至80，悟性至少9，与我关系至少5；先请教剑意建立关系，再按规矩拜师。不是每派都要先刷声望。入听雨后核柳教习的时辰，再看云纹石阶，回来复命；旧见闻可推进记录，但记录回填不能冒充此行观察。听潮入微剑还要身法18，够不着就先练可学的剑式。出手、养息皆花真实内力，师门不替你白补。」',
      options:[{text:'明白了，我照实际条件准备。',nextNodeId:c.startNodeId}]},
  ]})};
}
