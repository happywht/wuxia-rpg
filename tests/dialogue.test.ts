/**
 * Round 38 unit tests for the dialogue stack: defensive set parsing,
 * per-conversation graph validation, runtime condition visibility and the
 * pure playback session. Exercises the public engine API only — no Phaser
 * scene, no loading, no network.
 */

import { describe, expect, it } from 'vitest';

import {
  type DialogueData,
  type DialogueSetData,
  DialogueSession,
  parseDialogueSet,
  validateConversation,
} from '../src/engine/dialogue-graph';
import {
  type DialogueRuntimeContext,
  getVisibleOptions,
  isConditionMet,
} from '../src/engine/dialogue-runtime';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { createQuestJournal, type QuestData } from '../src/engine/quest-system';
import { createSocialState, teachNpcKnowledge } from '../src/engine/social-state';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuest(id: string): QuestData {
  return {
    id,
    name: `差事 ${id}`,
    description: '测试用任务说明。',
    giverNpcId: 'npc-elder',
    prerequisiteQuestIds: [],
    objectives: [
      { id: `${id}-obj`, kind: 'talkToNpc', targetId: 'npc-farmer', requiredCount: 1, text: '带话' },
    ],
    failOnEncounterIds: [],
    rewards: { experience: 10, currency: 5 },
  };
}

/** Minimal but fully-typed runtime context; overrides patch single fields. */
function createContext(overrides: Partial<DialogueRuntimeContext> = {}): DialogueRuntimeContext {
  const quests = new Map([[ 'quest-main', makeQuest('quest-main') ]]);
  return {
    quests,
    journal: createQuestJournal(quests),
    items: new Map(),
    inventory: null,
    social: createSocialState(),
    speakerNpcId: 'npc-elder',
    knownKnowledgeNodeIds: new Set(),
    knowledgeNodes: new Map(),
    character: null,
    factions: new Map(),
    martialArts: new Map(),
    factionState: createFactionMembershipState(),
    timeOfDayPeriodId: 'morning',
    ...overrides,
  };
}

const validDocument: DialogueSetData = {
  conversations: [
    {
      id: 'convo-elder',
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          text: '少侠来得正好。',
          options: [
            {
              text: '愿闻其详。',
              nextNodeId: 'farewell',
              conditions: [{ kind: 'morality', minValue: -100, maxValue: 100 }],
              effects: [{ kind: 'adjustMorality', delta: 1 }],
            },
          ],
        },
        { id: 'farewell', text: '后会有期。' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// parseDialogueSet
// ---------------------------------------------------------------------------

describe('parseDialogueSet', () => {
  it('parses a valid document and keeps conditions and effects', () => {
    const result = parseDialogueSet(validDocument);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings).toEqual([]);
    expect(result.set.conversations).toHaveLength(1);
    const conversation = result.set.conversations[0]!;
    expect(conversation.id).toBe('convo-elder');
    expect(conversation.startNodeId).toBe('start');

    const option = conversation.nodes[0]!.options![0]!;
    expect(option.text).toBe('愿闻其详。');
    expect(option.nextNodeId).toBe('farewell');
    expect(option.conditions).toEqual([{ kind: 'morality', minValue: -100, maxValue: 100 }]);
    expect(option.effects).toEqual([{ kind: 'adjustMorality', delta: 1 }]);

    const endNode = conversation.nodes[1]!;
    expect(endNode.options).toBeUndefined();
  });

  it('rejects a broken envelope without touching conversations', () => {
    for (const broken of [{}, { conversations: '不是数组' }, { conversations: [], extra: 1 }]) {
      const result = parseDialogueSet(broken);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toHaveLength(1);
    }
  });

  it('drops only the offending conversation and reports a warning', () => {
    const result = parseDialogueSet({
      conversations: [
        validDocument.conversations[0],
        {
          id: 'convo-broken',
          startNodeId: 'start',
          nodes: [{ id: 'start', text: '……', narrator: 'undeclared field' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.set.conversations).toHaveLength(1);
    expect(result.set.conversations[0]!.id).toBe('convo-elder');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('convo-broken');
  });

  it('rejects an unknown condition kind inside an option', () => {
    const result = parseDialogueSet({
      conversations: [
        {
          id: 'convo-bad-condition',
          startNodeId: 'start',
          nodes: [
            {
              id: 'start',
              text: '……',
              options: [
                { text: '去', nextNodeId: 'start', conditions: [{ kind: 'nonsense' }] },
              ],
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.set.conversations).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// validateConversation
// ---------------------------------------------------------------------------

function makeConversation(nodes: DialogueData['nodes'], startNodeId: string): DialogueData {
  return { id: 'convo-check', startNodeId, nodes };
}

describe('validateConversation', () => {
  it('accepts a well-formed conversation', () => {
    const conversation = makeConversation(validDocument.conversations[0]!.nodes, 'start');
    expect(validateConversation(conversation)).toEqual([]);
  });

  it('reports duplicate node ids', () => {
    const conversation = makeConversation(
      [
        { id: 'start', text: '一' },
        { id: 'start', text: '二' },
      ],
      'start',
    );
    const problems = validateConversation(conversation);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"start" 重复');
  });

  it('reports a missing start node', () => {
    const conversation = makeConversation([{ id: 'only', text: '一' }], 'missing');
    expect(validateConversation(conversation)).toEqual(['起始节点 "missing" 不存在']);
  });

  it('reports an option pointing at a non-existent node', () => {
    const conversation = makeConversation(
      [
        {
          id: 'start',
          text: '一',
          options: [{ text: '跳', nextNodeId: 'nowhere' }],
        },
      ],
      'start',
    );
    const problems = validateConversation(conversation);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"nowhere"');
  });
});

// ---------------------------------------------------------------------------
// Runtime condition evaluation
// ---------------------------------------------------------------------------

describe('isConditionMet', () => {
  it('questStatus matches the journal state exactly', () => {
    const context = createContext();
    context.journal.states.get('quest-main')!.status = 'active';

    expect(
      isConditionMet({ kind: 'questStatus', questId: 'quest-main', status: 'active' }, context),
    ).toBe(true);
    expect(
      isConditionMet({ kind: 'questStatus', questId: 'quest-main', status: 'completed' }, context),
    ).toBe(false);
    expect(
      isConditionMet({ kind: 'questStatus', questId: 'unknown', status: 'active' }, context),
    ).toBe(false);
  });

  it('itemCount requires an inventory and a sufficient quantity', () => {
    const context = createContext();
    expect(isConditionMet({ kind: 'itemCount', itemId: 'item-herb', minCount: 1 }, context)).toBe(
      false,
    );

    context.inventory = {
      currency: 0,
      capacity: 10,
      stacks: [{ itemId: 'item-herb', quantity: 3 }],
      equipped: {},
    };
    expect(isConditionMet({ kind: 'itemCount', itemId: 'item-herb', minCount: 3 }, context)).toBe(
      true,
    );
    expect(isConditionMet({ kind: 'itemCount', itemId: 'item-herb', minCount: 4 }, context)).toBe(
      false,
    );
  });

  it('morality bounds are inclusive', () => {
    const context = createContext();
    context.social.morality = 10;

    expect(isConditionMet({ kind: 'morality', minValue: 10 }, context)).toBe(true);
    expect(isConditionMet({ kind: 'morality', maxValue: 10 }, context)).toBe(true);
    expect(isConditionMet({ kind: 'morality', minValue: 11 }, context)).toBe(false);
    expect(isConditionMet({ kind: 'morality', maxValue: 9 }, context)).toBe(false);
  });

  it('timeOfDay matches the context clock exactly', () => {
    const context = createContext();
    expect(isConditionMet({ kind: 'timeOfDay', periodId: 'morning' }, context)).toBe(true);
    expect(isConditionMet({ kind: 'timeOfDay', periodId: 'night' }, context)).toBe(false);
  });

  it('npcKnows defaults to the speaker and follows taught knowledge', () => {
    const context = createContext();
    expect(isConditionMet({ kind: 'npcKnows', nodeId: 'node-rumor' }, context)).toBe(false);

    teachNpcKnowledge(context.social, 'npc-elder', 'node-rumor');
    expect(isConditionMet({ kind: 'npcKnows', nodeId: 'node-rumor' }, context)).toBe(true);
    expect(
      isConditionMet({ kind: 'npcKnows', npcId: 'npc-farmer', nodeId: 'node-rumor' }, context),
    ).toBe(false);
  });

  it('knowledgeKnown mirrors the known-node set', () => {
    const context = createContext();
    context.knownKnowledgeNodeIds.add('node-known');
    expect(isConditionMet({ kind: 'knowledgeKnown', nodeId: 'node-known' }, context)).toBe(true);
    expect(isConditionMet({ kind: 'knowledgeKnown', nodeId: 'node-other' }, context)).toBe(false);
  });
});

describe('getVisibleOptions', () => {
  const node = {
    id: 'start',
    text: '选吧。',
    options: [
      { text: '无条件', nextNodeId: 'end' },
      { text: '善恶达标', nextNodeId: 'end', conditions: [{ kind: 'morality' as const, minValue: 0 }] },
      { text: '时段不符', nextNodeId: 'end', conditions: [{ kind: 'timeOfDay' as const, periodId: 'night' }] },
      {
        text: '双条件',
        nextNodeId: 'end',
        conditions: [
          { kind: 'morality' as const, minValue: 0 },
          { kind: 'timeOfDay' as const, periodId: 'morning' },
        ],
      },
    ],
  };

  it('keeps unconditional options and options whose every condition holds', () => {
    const context = createContext();
    context.social.morality = 5;

    const visible = getVisibleOptions(node, context);
    expect(visible.map((entry) => entry.option.text)).toEqual(['无条件', '善恶达标', '双条件']);
    // Indices refer to the node's raw option array.
    expect(visible.map((entry) => entry.index)).toEqual([0, 1, 3]);
  });

  it('an empty result marks the node as an end node for this run', () => {
    const strictNode = {
      id: 'strict',
      text: '……',
      options: node.options.slice(1, 2), // Only the morality-gated option.
    };
    const context = createContext();
    context.social.morality = -1;

    expect(getVisibleOptions(strictNode, context)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DialogueSession playback
// ---------------------------------------------------------------------------

describe('DialogueSession', () => {
  const conversation: DialogueData = {
    id: 'convo-play',
    startNodeId: 'start',
    nodes: [
      {
        id: 'start',
        text: '起步。',
        options: [
          { text: '绕路', nextNodeId: 'mid' },
          { text: '直走', nextNodeId: 'end' },
        ],
      },
      { id: 'mid', text: '中途。', options: [{ text: '继续', nextNodeId: 'end' }] },
      { id: 'end', text: '结束。' },
    ],
  };

  it('walks options to the end node and resets to the start', () => {
    const session = new DialogueSession(conversation);
    expect(session.currentNode.id).toBe('start');
    expect(session.isAtEndNode).toBe(false);

    session.choose(0);
    expect(session.currentNode.id).toBe('mid');

    session.choose(0);
    expect(session.currentNode.id).toBe('end');
    expect(session.isAtEndNode).toBe(true);
    expect(session.options).toEqual([]);

    session.reset();
    expect(session.currentNode.id).toBe('start');
  });

  it('ignores out-of-range and dangling choices instead of crashing', () => {
    const hostile: DialogueData = {
      id: 'convo-hostile',
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          text: '……',
          options: [{ text: '坏路', nextNodeId: 'nowhere' }],
        },
      ],
    };
    const session = new DialogueSession(hostile);
    session.choose(99);
    expect(session.currentNode.id).toBe('start');
    session.choose(0); // nextNodeId does not exist — ignored.
    expect(session.currentNode.id).toBe('start');
  });
});
