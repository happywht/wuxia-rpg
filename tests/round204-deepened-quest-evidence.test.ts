import { describe, expect, it } from 'vitest';
import { evaluateQuestEvidence } from '../scripts/audit-round-204-quest-evidence.mjs';

const categories = ['调查', '战斗', '物品/补给', '人物立场'];
const baseLedger = {
  quests: Array.from({ length: 12 }, (_, index) => ({
    id: `quest.${index}`,
    categories: [categories[index % categories.length]!],
    implementation: 'impl.md',
    journey: 'journey.md',
    journeyStatus: 'partial',
  })),
};
const evidenceExists = new Set(['impl.md', 'journey.md']);
const knownQuestIds = new Set(baseLedger.quests.map(row => row.id));

describe('Round204 ID-level deepened quest evidence ledger', () => {
  it('accepts 12 distinct known IDs with all categories and existing sources without upgrading partial journey status', () => {
    const result = evaluateQuestEvidence(baseLedger, { knownQuestIds, existingEvidence: evidenceExists });
    expect(result.issues).toEqual([]);
    expect(result.implementedCount).toBe(12);
    expect(result.journeyCount).toBe(0);
  });

  it('rejects duplicates, unknown IDs, missing sources, missing category coverage, and invalid journey claims', () => {
    const ledger = structuredClone(baseLedger);
    ledger.quests[1]!.id = ledger.quests[0]!.id;
    ledger.quests[2]!.journey = 'missing.md';
    ledger.quests[3]!.categories = ['战斗'];
    ledger.quests[7]!.categories = ['战斗'];
    ledger.quests[11]!.categories = ['战斗'];
    ledger.quests[4]!.journeyStatus = 'tests-passed';
    ledger.quests[5]!.id = 'quest.unknown';
    const result = evaluateQuestEvidence(ledger, { knownQuestIds, existingEvidence: evidenceExists });
    expect(result.issues.join('\n')).toContain('duplicate id');
    expect(result.issues.join('\n')).toContain('unknown quest id');
    expect(result.issues.join('\n')).toContain('missing journey evidence');
    expect(result.issues.join('\n')).toContain('invalid journeyStatus');
    expect(result.issues.join('\n')).toContain('missing category coverage: 人物立场');
  });
});
