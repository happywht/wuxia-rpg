/**
 * Round 122 authoring repair: the Yunyin practice brief must quote the real
 * purchasable price. The Huichun ointment costs 15 silver per unit in the
 * authored item set (round-06), so two cost 30; the errand is self-supply
 * for the road, not a donation — the manor neither takes nor demands the
 * medicine. Only the one field-brief sentence changes: route coordinates,
 * task ids/objectives/rewards, other factions and completed states stay
 * byte-identical. Idempotent; refuses a dialogue file whose anchor text
 * no longer matches.
 */
const ANCHOR_OLD = '回春膏渡镇姜百味的担子上就有，青帆埠金云帆的摊上也备着；各备两份防身——路上要用是真，不逼你交出来。';
const ANCHOR_NEW = '回春膏按现行铺价一份十五两、自购两份共三十两：渡镇姜百味的担子上就有，青帆埠金云帆的摊上也备着；买来防身自用，庄中不收药、也不逼你交出来。';

export function repairYunyinPracticeBrief(dialogues) {
  let replaced = 0;
  const result = {
    ...dialogues,
    conversations: dialogues.conversations.map(conversation => ({
      ...conversation,
      nodes: conversation.nodes.map(node => {
        if (typeof node.text !== 'string') return node;
        if (node.text.includes(ANCHOR_NEW)) {
          replaced += 1; // Already repaired: idempotent pass-through.
          return node;
        }
        if (node.text.includes(ANCHOR_OLD)) {
          replaced += 1;
          return { ...node, text: node.text.replace(ANCHOR_OLD, ANCHOR_NEW) };
        }
        return node;
      }),
    })),
  };
  if (replaced !== 1) {
    throw new Error(`云隐实践简报应恰好有一处待修/已修锚点，实际 ${replaced} 处，请人工复核。`);
  }
  return result;
}

export const YUNYIN_PRICE_ANCHOR_NEW = ANCHOR_NEW;
