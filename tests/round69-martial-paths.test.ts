import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  checkMartialArtEligibility,
  createCharacterState,
  grantExperience,
  parseCharacterProfileSet,
  parseMartialArtSet,
} from '../src/engine/character-progression';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

interface RawCondition {
  kind: string;
  factionId?: string;
  isMember?: boolean;
  martialArtId?: string;
}

interface RawEffect {
  kind: string;
  martialArtId?: string;
}

interface RawOption {
  nextNodeId?: string;
  conditions?: RawCondition[];
  effects?: RawEffect[];
}

interface RawConversation {
  id: string;
  startNodeId: string;
  nodes: Array<{ id: string; options?: RawOption[] }>;
}

interface RawFaction {
  id: string;
  mentorNpcIds: string[];
}

interface RawNpc {
  id: string;
  dialogueId: string;
}

interface LearningRoute {
  artId: string;
  conversationId: string;
  npcId: string | undefined;
  membershipGates: Array<{ factionId: string | undefined; isMember: boolean | undefined }>;
  hasMatchingEligibilityCondition: boolean;
}

function loadConversations(): RawConversation[] {
  const folder = new URL('../data/base/dialogues/', import.meta.url);
  return readdirSync(folder)
    .filter((fileName) => fileName.endsWith('.json'))
    .flatMap((fileName) => {
      const raw = JSON.parse(readFileSync(new URL(fileName, folder), 'utf8')) as {
        conversations?: RawConversation[];
      };
      return raw.conversations ?? [];
    });
}

function collectLearningRoutes(
  conversations: RawConversation[],
  npcByDialogueId: ReadonlyMap<string, string>,
): LearningRoute[] {
  const routes: LearningRoute[] = [];
  for (const conversation of conversations) {
    const nodeById = new Map(conversation.nodes.map((node) => [node.id, node]));
    const queue: Array<{
      nodeId: string;
      membershipGates: LearningRoute['membershipGates'];
    }> = [{ nodeId: conversation.startNodeId, membershipGates: [] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const state = queue.shift()!;
      const stateKey = `${state.nodeId}:${JSON.stringify(state.membershipGates)}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      const node = nodeById.get(state.nodeId);
      if (node === undefined) continue;
      for (const option of node.options ?? []) {
        const nextGates = [
          ...state.membershipGates,
          ...(option.conditions ?? [])
            .filter((condition) => condition.kind === 'factionMembership')
            .map((condition) => ({ factionId: condition.factionId, isMember: condition.isMember })),
        ];
        const artIds = (option.effects ?? [])
          .filter((effect) => effect.kind === 'learnMartialArt' && effect.martialArtId !== undefined)
          .map((effect) => effect.martialArtId!);
        for (const artId of artIds) {
          routes.push({
            artId,
            conversationId: conversation.id,
            npcId: npcByDialogueId.get(conversation.id),
            membershipGates: nextGates,
            hasMatchingEligibilityCondition: (option.conditions ?? []).some(
              (condition) => condition.kind === 'martialArtEligible' && condition.martialArtId === artId,
            ),
          });
        }
        if (option.nextNodeId !== undefined) {
          queue.push({ nodeId: option.nextNodeId, membershipGates: nextGates });
        }
      }
    }
  }
  return routes;
}

describe('Round 69 martial-art access paths', () => {
  const parsedArts = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
  const parsedProfiles = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
  if (!parsedArts.ok || !parsedProfiles.ok) throw new Error('基础角色或武学资料未通过协议解析');

  const arts = parsedArts.set.martialArts;
  const profiles = parsedProfiles.set.profiles;
  const npcs = readJson<{ npcs: RawNpc[] }>('../data/base/characters/round-03-npcs.json').npcs;
  const factions = readJson<{ factions: RawFaction[] }>('../data/base/factions/round-04-factions.json').factions;
  const npcByDialogueId = new Map(npcs.map((npc) => [npc.dialogueId, npc.id]));
  const routes = collectLearningRoutes(loadConversations(), npcByDialogueId);

  it('accounts for all 30 arts with a reachable starter or eligible teacher route', () => {
    expect(arts).toHaveLength(30);
    const startingArtIds = new Set(profiles.flatMap((profile) => profile.startingMartialArtIds));
    const uncovered: string[] = [];
    const brokenRoutes: string[] = [];

    for (const art of arts) {
      if (startingArtIds.has(art.id)) continue;
      const artRoutes = routes.filter(
        (route) => route.artId === art.id && route.hasMatchingEligibilityCondition,
      );
      const reachableRoute = artRoutes.find((route) => {
        if (route.npcId === undefined) return false;
        if (art.factionIds.length === 0) {
          return !route.membershipGates.some((gate) => gate.isMember === true);
        }
        const isTeacherForArt = art.factionIds.some((factionId) =>
          factions.find((faction) => faction.id === factionId)?.mentorNpcIds.includes(route.npcId!) === true,
        );
        const hasConflictingMemberGate = route.membershipGates.some(
          (gate) => gate.isMember === true && gate.factionId !== undefined && !art.factionIds.includes(gate.factionId),
        );
        return isTeacherForArt && !hasConflictingMemberGate;
      });
      if (reachableRoute === undefined) uncovered.push(art.id);
      if (artRoutes.length > 0 && artRoutes.every((route) => route.npcId === undefined)) brokenRoutes.push(art.id);
    }

    expect({ uncovered, brokenRoutes }).toEqual({ uncovered: [], brokenRoutes: [] });
    expect(startingArtIds.size).toBe(2);

    const factionCounts = Object.fromEntries(
      factions.map((faction) => [
        faction.id,
        arts.filter((art) => art.factionIds.includes(faction.id)).length,
      ]),
    );
    expect(factionCounts).toEqual({
      'faction.tingyu-jiange': 6,
      'faction.tiezhang-pai': 6,
      'faction.yunyin-shanzhuang': 6,
      'faction.hanshan-shuyuan': 5,
      'faction.panzhou-daochang': 4,
    });
  });

  it('keeps the unbound Lanmen saber lesson available to non-members who meet its level and attributes', () => {
    const art = arts.find((candidate) => candidate.id === 'skill.lanmen-daofa')!;
    const publicRoute = routes.find(
      (route) => route.artId === art.id && route.membershipGates.some(
        (gate) => gate.factionId === 'faction.panzhou-daochang' && gate.isMember === false,
      ),
    );
    expect(publicRoute?.npcId).toBe('char.zhu-jiuxian');
    expect(publicRoute?.hasMatchingEligibilityCondition).toBe(true);

    const profile = profiles[0]!;
    const character = createCharacterState(profile);
    grantExperience(profile, character, 100);
    expect(character.level).toBe(3);
    expect(checkMartialArtEligibility(art, {
      level: character.level,
      attributes: character.attributes,
      factionId: null,
    }).eligible).toBe(true);
  });

  it('keeps every art reachable by the profile growth curve and maps all footwork to guard', () => {
    const profile = profiles[0]!;
    const unreachable: string[] = [];
    for (const art of arts) {
      const factionId = art.factionIds[0] ?? null;
      const reachable = Array.from(
        { length: profile.maxLevel - profile.startingLevel + 1 },
        (_, offset) => profile.startingLevel + offset,
      ).some((level) => {
        const gainedLevels = level - profile.startingLevel;
        const attributes = Object.fromEntries(
          Object.keys(profile.attributes).map((attributeId) => {
            const id = attributeId as keyof typeof profile.attributes;
            return [id, Math.min(profile.attributeCap, profile.attributes[id] + profile.growth[id] * gainedLevels)];
          }),
        ) as typeof profile.attributes;
        return checkMartialArtEligibility(art, { level, attributes, factionId }).eligible;
      });
      if (!reachable) unreachable.push(art.id);
    }
    expect(unreachable).toEqual([]);

    const footwork = arts.filter((art) => art.category === '身法');
    expect(footwork).toHaveLength(4);
    expect(footwork.every((art) => art.combat.kind === 'guard')).toBe(true);
  });
});
