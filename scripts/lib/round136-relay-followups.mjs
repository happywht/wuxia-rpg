export const relayFollowups = {
  ledger: [
    '聂栖雁把更簿判断另记一行：「你公开了署名，路客可据人查牌；秦素砚担心的报信人暴露也没有消失。我留这层风险，不拿雁候记录替证人的处境作保证。此前认同已记过，这次复谈不再结算。」',
    '聂栖雁按住无名的一栏：「你保护了姓名，报信人少受追问，路客却不能按公开证人直接核查。秦素砚的顾虑我听过，证词缺口也仍留着；以后核牌要另问，不把隐名说成证据齐全。此前关系后果不再重记。」',
  ],
  carving: [
    '柳寻径指着碑旁注记：「你公开说明前朝屯界，外人能查年代，也会有人拿旧账争路。沈雨霁的索孔与步记各自成立，不能替谷中界标断代；巡路争执仍须我们处理。那次认同已结算，复谈只回顾后果。」',
    '柳寻径翻开巡簿：「你把年代说明留在私记里，眼下巡路人少卷入争执，外人却不便核看。沈雨霁的分项判断与界标证据分别保存，不混成今日疆令。此前关系已记过，这次没有额外认同。」',
  ],
  'road-sea': [
    '季无潮翻到散船可看的潮时：「你公开传示，散船较容易辨潮，虞星槎辨假号的负担却更重。顾夜尘提醒照顾熟人圈外的人，这层好处与代价都留下；没有替守灯人免去核号。此前认同已记过，复谈不再重付。」',
    '季无潮停在熟船名册旁：「你限定熟船传示，报码较容易核对，未入册的散船仍要等。顾夜尘提醒别只顾熟人，这与当前传示范围仍有张力；我不会把散船说成已经安置。此前关系后果已记过，复谈不再扣或补。」',
  ],
};

/** Pure dialogue authoring; delivered knowledge alone cannot infer a branch. */
export function addRelayFollowups(conversation, relays) {
  for (const relay of relays) {
    if (conversation.id !== relay.targetDialogueId) continue;
    const greet = conversation.nodes.find(node => node.id === conversation.startNodeId);
    if (!greet?.options) throw new Error(`Missing relay entrance ${conversation.id}`);
    for (const [index, variant] of relay.variants.entries()) {
      const id = `r136-${relay.key}-followup-${index}`;
      const node = { id, text: relayFollowups[relay.key][index] };
      const old = conversation.nodes.findIndex(node => node.id === id);
      if (old < 0) conversation.nodes.push(node); else conversation.nodes[old] = node;
      const option = {
        text: '再谈我当时的选择留下什么代价。', nextNodeId: id,
        conditions: [
          { kind: 'knowledgeKnown', nodeId: `event.r105-${relay.key}-delivered` },
          { kind: 'knowledgeKnown', nodeId: variant.flag },
          { kind: 'npcKnows', nodeId: `event.r105-${relay.key}-message` },
          { kind: 'npcKnows', nodeId: variant.flag },
        ],
      };
      const oldOption = greet.options.findIndex(option => option.nextNodeId === id);
      if (oldOption < 0) greet.options.splice(Math.max(0, greet.options.length - 1), 0, option);
      else greet.options[oldOption] = option;
    }
  }
  return conversation;
}
