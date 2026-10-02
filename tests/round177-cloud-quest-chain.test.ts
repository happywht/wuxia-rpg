/** Round 177: cloud-ridge clue, quest, dialogue, and graph handoff. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readJson(path: string): any {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as any;
}

const world = readJson('../data/base/world/world-map.json');
const quests = readJson('../data/base/quests/round-74-cloud-ridge-quests.json').quests;
const conversation = readJson('../data/base/dialogues/round-74-cloud-ridge-conversations.json').conversations[0];
const nodes = readJson('../data/base/knowledge_graph/nodes.json').nodes;
const edges = readJson('../data/base/knowledge_graph/edges.json').edges;

function quest(id: string): any {
  return quests.find((entry: any) => entry.id === id);
}

function node(id: string): any {
  return conversation.nodes.find((entry: any) => entry.id === id);
}

function hasQuestState(option: any, questId: string, status: string): boolean {
  return option.conditions?.some((condition: any) =>
    condition.kind === 'questStatus' && condition.questId === questId && condition.status === status,
  ) ?? false;
}

describe('Round 177 cloud-ridge discovery to quest chain', () => {
  it('links the two authored place discoveries to the correct quest objectives', () => {
    const markers = world.events.find((event: any) => event.id === 'event.r74-cloud-inscription');
    const bridge = world.events.find((event: any) => event.id === 'event.r74-cloud-bridge');
    expect(markers?.discoverKnowledgeNodeId).toBe('place.r74-cloud-markers');
    expect(bridge?.discoverKnowledgeNodeId).toBe('place.r74-cloud-bridge');
    expect(bridge?.interaction?.approachDirections).toEqual(['left', 'right']);

    const marks = quest('quest.r74-cloud-marks');
    expect(marks.prerequisiteQuestIds ?? []).toEqual([]);
    expect(marks.objectives).toContainEqual(expect.objectContaining({
      kind: 'discoverKnowledge', targetId: 'place.r74-cloud-markers',
    }));

    const clearBridge = quest('quest.r74-cloud-bridge');
    expect(clearBridge.prerequisiteQuestIds).toContain('quest.r74-cloud-marks');
    expect(clearBridge.objectives).toContainEqual(expect.objectContaining({
      kind: 'defeatEncounter', targetId: 'encounter.r74-cloud-bridge-bandits',
    }));
  });

  it('offers quests only in their authored states and preserves the repair boundary in dialogue', () => {
    const greet = node('greet');
    const offerMarks = greet.options.find((option: any) => option.effects?.some((effect: any) =>
      effect.kind === 'acceptQuest' && effect.questId === 'quest.r74-cloud-marks',
    ));
    const offerBridge = greet.options.find((option: any) => option.effects?.some((effect: any) =>
      effect.kind === 'acceptQuest' && effect.questId === 'quest.r74-cloud-bridge',
    ));
    const markComplete = greet.options.find((option: any) => option.nextNodeId === 'marks-complete');
    const bridgeComplete = greet.options.find((option: any) => option.nextNodeId === 'bridge-complete');

    expect(hasQuestState(offerMarks, 'quest.r74-cloud-marks', 'offered')).toBe(true);
    expect(hasQuestState(offerBridge, 'quest.r74-cloud-bridge', 'offered')).toBe(true);
    expect(hasQuestState(markComplete, 'quest.r74-cloud-marks', 'completed')).toBe(true);
    expect(hasQuestState(bridgeComplete, 'quest.r74-cloud-bridge', 'completed')).toBe(true);
    expect(node('marks-complete').text).toContain('先到断索悬桥看看');
    expect(node('bridge-accepted').text).toContain('确认没有人被困');
    expect(node('bridge-complete').text).toContain('护索还要另行修补');
  });

  it('keeps event, character, quest, and place relationships represented in the knowledge graph', () => {
    const nodeIds = new Set(nodes.map((entry: any) => entry.id));
    for (const id of [
      'event.r74-cloud-inscription', 'event.r74-cloud-bridge',
      'place.r74-cloud-markers', 'place.r74-cloud-bridge',
      'char.r74-shen-yuji', 'quest.r74-cloud-marks', 'quest.r74-cloud-bridge',
    ]) expect(nodeIds.has(id), `${id} should exist`).toBe(true);

    expect(edges).toContainEqual(expect.objectContaining({
      fromId: 'event.r74-cloud-inscription', toId: 'place.r74-cloud-markers', relation: 'triggers',
    }));
    expect(edges).toContainEqual(expect.objectContaining({
      fromId: 'event.r74-cloud-bridge', toId: 'place.r74-cloud-bridge', relation: 'triggers',
    }));
    expect(edges).toContainEqual(expect.objectContaining({
      fromId: 'char.r74-shen-yuji', toId: 'quest.r74-cloud-marks', relation: 'participatesIn',
    }));
    expect(edges).toContainEqual(expect.objectContaining({
      fromId: 'quest.r74-cloud-bridge', toId: 'quest.r74-cloud-marks', relation: 'requires',
    }));
  });
});
