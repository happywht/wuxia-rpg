import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCharacterState, parseCharacterProfileSet, parseFactionSet, parseMartialArtSet } from '../src/engine/character-progression';
import { projectFactionDeparture, describeFactionDeparture } from '../src/engine/faction-departure';
import { applyDialogueEffects, getVisibleOptions, getVisibleOptionsForDisplay, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { type DialogueNodeData, parseDialogueSet } from '../src/engine/dialogue-graph';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { createQuestJournal } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
const read = (path: string) => JSON.parse(readFileSync(new URL('../data/base/' + path, import.meta.url), 'utf8'));
const fp = parseFactionSet(read('factions/round-04-factions.json'));
const ap = parseMartialArtSet(read('skills/round-04-martial-arts.json'));
const pp = parseCharacterProfileSet(read('characters/round-04-profiles.json'));
if (!fp.ok || !ap.ok || !pp.ok) throw Error('Base data failed parsing');
const profiles = pp.set.profiles;
const factions = fp.set.factions;
const arts = new Map(ap.set.martialArts.map(art => [art.id, art]));
function context(faction = factions[0]!): DialogueRuntimeContext {
  const character = createCharacterState(profiles[0]!);
  character.martialArtIds = [...arts.keys()];
  const social = createSocialState();
  social.morality = -98; social.renown = 3; social.factionRenown.set(faction.id, 2);
  return { character, social, factions: new Map(factions.map(f => [f.id, f])), martialArts: arts,
    factionState: createFactionMembershipState({ factionId: faction.id, masterNpcId: faction.mentorNpcIds[0]! }),
    speakerNpcId: faction.mentorNpcIds[0]!, quests: new Map(), journal: createQuestJournal(new Map()),
    items: new Map(), inventory: null, knownKnowledgeNodeIds: new Set(), knowledgeNodes: new Map(), timeOfDayPeriodId: 'period.morning' };
}
const node: DialogueNodeData = { id: 'start', text: '门规', options: [
  { text: '不可见', nextNodeId: 'end', conditions: [{ kind: 'factionMembership', factionId: 'missing', isMember: true }] },
  { text: '退门', nextNodeId: 'end', effects: [{ kind: 'leaveFaction' }] },
  { text: '继续', nextNodeId: 'end' },
] };

describe('Round125 departure projection', () => {
  it('uses protocol upper bounds and does not invent missing membership previews', () => {
    const ctx = context();
    ctx.social.morality = 99; ctx.social.renown = 999;
    ctx.social.factionRenown.set(factions[0]!.id, 999);
    const faction = { ...factions[0]!, departure: { ...factions[0]!.departure, moralityDelta: 50, renownDelta: 50, factionRenownDelta: 50 } };
    expect(projectFactionDeparture(faction, ctx.social, ctx.character, arts)).toMatchObject({ morality: 100, renown: 1000, factionRenown: 1000 });
    ctx.factionState.membership = null;
    const before = structuredClone(ctx);
    expect(getVisibleOptionsForDisplay(node, ctx)[0]!.option.text).toBe('退门');
    expect(applyDialogueEffects([{ kind: 'leaveFaction' }], ctx).ok).toBe(false);
    expect(ctx).toEqual(before);
  });
  it.each(factions)('matches transaction for $name without mutating preview inputs', faction => {
    const ctx = context(faction);
    const before = structuredClone(ctx);
    const projected = projectFactionDeparture(faction, ctx.social, ctx.character, arts);
    const displayed = getVisibleOptionsForDisplay(node, ctx);
    expect(ctx).toEqual(before);
    expect(displayed.map(v => v.index)).toEqual([1, 2]);
    expect(displayed[0]!.option.text).toContain(`${before.social.morality}→${projected.morality}`);
    expect(displayed[0]!.option.effects).toBe(node.options![1]!.effects);
    expect(getVisibleOptions(node, ctx)[0]!.option.text).toBe('退门');
    expect(applyDialogueEffects(displayed[0]!.option.effects!, ctx).ok).toBe(true);
    expect(ctx.social.morality).toBe(projected.morality);
    expect(ctx.social.renown).toBe(projected.renown);
    expect(ctx.social.factionRenown.get(faction.id)).toBe(projected.factionRenown);
    expect(ctx.character!.martialArtIds).toEqual(before.character!.martialArtIds.filter(id => !projected.forgottenArtIds.includes(id)));
    expect(ctx.factionState.membership).toBeNull();
  });
  it('lists only owned affected arts and retains unknown/other arts', () => {
    const ctx = context(); ctx.character!.martialArtIds = ['unknown', ...arts.keys()].slice(0, 6);
    const faction = factions[0]!;
    const projected = projectFactionDeparture(faction, ctx.social, ctx.character, arts);
    expect(projected.forgottenArtIds).not.toContain('unknown');
    for (const id of projected.forgottenArtIds) expect(describeFactionDeparture(faction, ctx.social, ctx.character, arts)).toContain(arts.get(id)!.name);
    expect(describeFactionDeparture(faction, ctx.social, null, arts)).toContain('当前没有已学本门武学');
  });
  it('refuses unavailable or forbidden departures without state changes', () => {
    for (const missing of [true, false]) {
      const ctx = context();
      if (missing) ctx.factions = new Map();
      else ctx.factions = new Map([[factions[0]!.id, { ...factions[0]!, departure: { ...factions[0]!.departure, allowed: false } }]]);
      const before = structuredClone(ctx);
      expect(getVisibleOptionsForDisplay(node, ctx)[0]!.option.text).toBe('退门');
      expect(applyDialogueEffects([{ kind: 'leaveFaction' }], ctx).ok).toBe(false);
      expect(ctx).toEqual(before);
    }
  });
  it('does not quote an unprojected earlier effect; later failure rolls back departure', () => {
    const ctx = context(); const before = structuredClone(ctx);
    const composite: DialogueNodeData = { id: 'start', text: '', options: [{ text: '组合', nextNodeId: 'end', effects: [{ kind: 'adjustRenown', delta: 5 }, { kind: 'leaveFaction' }] }] };
    expect(getVisibleOptionsForDisplay(composite, ctx)[0]!.option.text).toBe('组合');
    expect(applyDialogueEffects([{ kind: 'leaveFaction' }, { kind: 'learnMartialArt', martialArtId: 'unknown' }], ctx).ok).toBe(false);
    expect(ctx).toEqual(before);
  });
  it('all authored departures are first-step options and retain graph identity', () => {
    let count = 0;
    for (const file of readdirSync(new URL('../data/base/dialogues', import.meta.url)).filter(f => f.endsWith('.json'))) {
      const parsed = parseDialogueSet(read(`dialogues/${file}`)); if (!parsed.ok) throw Error(parsed.errors.join());
      for (const conversation of parsed.set.conversations) for (const current of conversation.nodes) for (const option of current.options ?? []) {
        if (option.effects?.some(e => e.kind === 'leaveFaction')) { expect(option.effects[0]!.kind).toBe('leaveFaction'); count++; }
      }
    }
    expect(count).toBe(5);
    const source = readFileSync(new URL('../src/game/grid-scene.ts', import.meta.url), 'utf8');
    expect(source).toContain('getVisibleOptionsForDisplay(node, this.dialogueContextFor(target.record.id))');
  });
});
