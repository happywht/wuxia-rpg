/**
 * Round 128 B: 巷口有价援药 —— 真实对话解释器事务回归。
 *
 * 马尚义告示板的 board→quest-delivered 选项保留 completed 前置与
 * itemCount≥3 条件，效果加列善恶+5；每次捐赠实耗回春膏3、关系+10、江湖
 * 声望+5，不重发任务经验/银两。以下用真实 round-03/round-07/round-06 资料
 * 与 DialogueRuntime 走真事务：缺药/未完成前置时选项不可见且效果拒绝零
 * 改动；五次连捐恰好耗 15 份、善恶+25、声望+25、关系+50（自基线 −15/0
 * 到 +10/25 的任务算术）；原子性——半途拒绝整体回滚。作者函数幂等/拒绝，
 * Ye/Liu 的西路说明节点为纯无效果保留节点。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet, type DialogueData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { parseQuestSet, createQuestJournal, type QuestData } from '../src/engine/quest-system';
import { createCharacterState, parseCharacterProfileSet } from '../src/engine/character-progression';
import { parseItemSet, indexItems, createInventoryState, countItem, grantItems } from '../src/engine/item-system';
import { createSocialState, getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';
import { repairRound03Raw, repairRound30Raw } from '../scripts/lib/round128-aid-donation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));

function runtime(ointmentCount: number) {
  const profileParse = parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json'));
  if (!profileParse.ok) throw Error(profileParse.errors.join());
  const profile = profileParse.set.profiles[0]!;
  const itemParse = parseItemSet(read('data/base/items/round-06-items.json'));
  if (!itemParse.ok) throw Error(itemParse.errors.join());
  const items = indexItems(itemParse.set).byId;
  const quests = new Map<string, QuestData>();
  const questParse = parseQuestSet(read('data/base/quests/round-07-quests.json'));
  if (!questParse.ok) throw Error(questParse.errors.join());
  for (const quest of questParse.set.quests) quests.set(quest.id, quest);
  const dialogues = new Map<string, DialogueData>();
  for (const path of ['data/base/dialogues/round-03-conversations.json', 'data/base/dialogues/round-30-conversations.json']) {
    const parsed = parseDialogueSet(read(path));
    if (!parsed.ok) throw Error(parsed.errors.join());
    for (const conversation of parsed.set.conversations) dialogues.set(conversation.id, conversation);
  }
  const ctx: DialogueRuntimeContext = {
    quests, journal: createQuestJournal(quests), items,
    inventory: createInventoryState(profile, [{ itemId: 'item.huichun-gao', quantity: ointmentCount }]),
    social: createSocialState(), speakerNpcId: 'char.ma-shangyi',
    knownKnowledgeNodeIds: new Set(), knowledgeNodes: new Map<string, KnowledgeNodeData>(),
    character: createCharacterState(profile), factions: new Map(), martialArts: new Map(),
    factionState: createFactionMembershipState(), timeOfDayPeriodId: 'period.midday',
  };
  return { ctx, dialogues };
}

const BOARD = 'dlg.ma-shangyi-notice-board';
const node = (run: ReturnType<typeof runtime>, dialogue: string, id: string) => run.dialogues.get(dialogue)!.nodes.find(n => n.id === id)!;
const completeMedicineRun = (run: ReturnType<typeof runtime>) => {
  run.ctx.journal.states.get('quest.round-07-medicine-run')!.status = 'completed';
};
const donationOption = (run: ReturnType<typeof runtime>) =>
  getVisibleOptions(node(run, BOARD, 'board'), run.ctx).find(v => v.option.nextNodeId === 'quest-delivered')?.option;

describe('Round128 aid donation transactions (real interpreter, real data)', () => {
  it('one donation consumes three ointments for morality+5, renown+5, relationship+10 — no quest XP/silver', () => {
    const run = runtime(3);
    completeMedicineRun(run);
    run.ctx.social.morality = 0;
    const option = donationOption(run);
    expect(option).toBeDefined();
    const result = applyDialogueEffects(option!.effects!, run.ctx);
    expect(result.ok).toBe(true);
    expect(countItem(run.ctx.inventory!, 'item.huichun-gao')).toBe(0);
    expect(run.ctx.social.morality).toBe(5);
    expect(run.ctx.social.renown).toBe(5);
    expect(getRelationship(run.ctx.social, 'char.ma-shangyi')).toBe(10);
    // No quest experience or silver is ever re-granted by the donation.
    expect(run.ctx.character!.experience).toBe(createCharacterState(profileOf()).experience);
    expect(run.ctx.inventory!.currency).toBe(profileOf().startingCurrency);
  });

  it('the completed precondition and item stock gate the option; effects refuse atomically', () => {
    const run = runtime(2); // One short of three.
    completeMedicineRun(run);
    expect(donationOption(run)).toBeUndefined(); // Hidden below the item count.
    // Preconditions unmet: the quest still active hides it too.
    const active = runtime(3);
    expect(donationOption(active)).toBeUndefined();
    // Direct effect refusal leaves every counter untouched (atomic rollback).
    const before = { morality: run.ctx.social.morality, renown: run.ctx.social.renown, relationship: getRelationship(run.ctx.social, 'char.ma-shangyi'), items: countItem(run.ctx.inventory!, 'item.huichun-gao') };
    const effects = node(run, BOARD, 'board').options!.find(option => option.nextNodeId === 'quest-delivered')!.effects!;
    const refused = applyDialogueEffects(effects, run.ctx);
    expect(refused.ok).toBe(false);
    expect(run.ctx.social.morality).toBe(before.morality);
    expect(run.ctx.social.renown).toBe(before.renown);
    expect(getRelationship(run.ctx.social, 'char.ma-shangyi')).toBe(before.relationship);
    expect(countItem(run.ctx.inventory!, 'item.huichun-gao')).toBe(before.items);
  });

  it('five donations from the stated baseline land exactly on the intended arithmetic', () => {
    const run = runtime(15);
    completeMedicineRun(run);
    run.ctx.social.morality = -15;
    run.ctx.social.renown = 0;
    for (let round = 1; round <= 5; round += 1) {
      const option = donationOption(run);
      expect(option, `round ${round}`).toBeDefined();
      expect(applyDialogueEffects(option!.effects!, run.ctx).ok).toBe(true);
    }
    expect(countItem(run.ctx.inventory!, 'item.huichun-gao')).toBe(0); // 15 consumed.
    expect(run.ctx.social.morality).toBe(10); // -15 + 25.
    expect(run.ctx.social.renown).toBe(25); // 0 + 25.
    expect(getRelationship(run.ctx.social, 'char.ma-shangyi')).toBe(50); // 5 × 10.
    // A sixth round without restocking is refused and changes nothing.
    const stalled = donationOption(run);
    expect(stalled).toBeUndefined();
    expect(run.ctx.social.morality).toBe(10);
    // Restock (the normal shop purchase path) re-opens the option.
    grantItems(run.ctx.inventory!, run.ctx.items.get('item.huichun-gao')!, 3);
    expect(donationOption(run)).toBeDefined();
  });

  it('social caps apply to paid donations without reducing the three-item cost', () => {
    const run=runtime(3);completeMedicineRun(run);run.ctx.social.morality=99;run.ctx.social.renown=999;run.ctx.social.relationships.set('char.ma-shangyi',99);
    expect(applyDialogueEffects(donationOption(run)!.effects!,run.ctx).ok).toBe(true);
    expect(run.ctx.social.morality).toBe(100);expect(run.ctx.social.renown).toBe(1000);expect(getRelationship(run.ctx.social,'char.ma-shangyi')).toBe(100);expect(countItem(run.ctx.inventory!,'item.huichun-gao')).toBe(0);
  });
  it('a later refused effect rolls back already-staged item and social changes', () => {
    const run=runtime(3);completeMedicineRun(run);const option=donationOption(run)!;
    const before=JSON.stringify({inventory:run.ctx.inventory,social:{morality:run.ctx.social.morality,renown:run.ctx.social.renown,relations:[...run.ctx.social.relationships]},character:run.ctx.character});
    expect(applyDialogueEffects([...option.effects!,{kind:'learnMartialArt',martialArtId:'art.missing'}],run.ctx).ok).toBe(false);
    expect(JSON.stringify({inventory:run.ctx.inventory,social:{morality:run.ctx.social.morality,renown:run.ctx.social.renown,relations:[...run.ctx.social.relationships]},character:run.ctx.character})).toBe(before);
  });
  it('the authored prose states the per-round cost and returns; wicket direction nodes carry no mechanics', () => {
    const boardConversation = parseBoard();
    const boardNode = boardConversation.nodes.find(n => n.id === 'board')!;
    const option = boardNode.options!.find(option => option.nextNodeId === 'quest-delivered')!;
    expect(option.text).toContain('三份');
    expect(boardNode.text).toContain('三份45银');
    const delivered = boardConversation.nodes.find(n => n.id === 'quest-delivered')!;
    expect(delivered.text).toContain('善恶+5、江湖声望+5、与我关系+10');
    expect(delivered.text).toContain('不再发已办差事的酬金');
    for (const [dialogueId, file] of [['dlg.ye-tingzhou-mentor', 'round-03-conversations.json'], ['dlg.liu-tinglan-mentor', 'round-30-conversations.json']] as const) {
      const parsed = parseDialogueSet(read(`data/base/dialogues/${file}`));
      if (!parsed.ok) throw Error(parsed.errors.join());
      const conversation = parsed.set.conversations.find(entry => entry.id === dialogueId)!;
      const wicket = conversation.nodes.find(n => n.id === 'r128-west-wicket')!;
      expect(wicket.options).toBeUndefined(); // Pure direction text, no mechanics.
      expect(wicket).not.toHaveProperty('conditions');
      expect(wicket).not.toHaveProperty('effects');
      expect(wicket.text).toContain('(42,37)');
      const linked = conversation.nodes.find(n=>n.id===conversation.startNodeId)!.options?.some(option => option.nextNodeId === 'r128-west-wicket');
      expect(linked).toBe(true);
    }
  });

  it('the raw repairs are idempotent and refuse drifted anchors', () => {
    const raw03 = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    const raw30 = readFileSync(join(root, 'data/base/dialogues/round-30-conversations.json'), 'utf8');
    expect(repairRound03Raw(raw03)).toBe(raw03); // Already applied.
    expect(repairRound30Raw(raw30)).toBe(raw30);
    const drift=JSON.parse(raw03);
    const conv=drift.conversations.find((c:{id:string})=>c.id===BOARD);
    conv.nodes.find((n:{id:string})=>n.id==='board').options.find((o:{nextNodeId:string})=>o.nextNodeId==='quest-delivered').conditions[1].minCount=1;
    expect(()=>repairRound03Raw(JSON.stringify(drift))).toThrow();
    const broken=JSON.parse(raw30);broken.conversations[0].nodes.find((n:{id:string})=>n.id==='r128-west-wicket').text='changed';
    expect(()=>repairRound30Raw(JSON.stringify(broken))).toThrow();
  });
});

function parseBoard(): DialogueData {
  const parsed = parseDialogueSet(read('data/base/dialogues/round-03-conversations.json'));
  if (!parsed.ok) throw Error(parsed.errors.join());
  return parsed.set.conversations.find(entry => entry.id === BOARD)!;
}
function profileOf() {
  const parsed = parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json') as never);
  if (!parsed.ok) throw Error(parsed.errors.join());
  return parsed.set.profiles[0]!;
}
