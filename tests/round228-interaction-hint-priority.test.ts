import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(new URL('../src/game/grid-scene.ts', import.meta.url), 'utf8');
const hint = scene.slice(
  scene.indexOf('  private refreshInteractHintRaw(): void {'),
  scene.indexOf('  /**\n   * Measured bottom band', scene.indexOf('  private refreshInteractHintRaw(): void {')),
);

describe('Round228 interaction prompt parity', () => {
  it('shows the ready event prompt when E dispatches an event ahead of a talk-only NPC', () => {
    const eventTarget = hint.indexOf('const mapEventTarget = this.interactableRegionEventTarget();');
    const priority = hint.indexOf('shouldPreferRegionalEventInteraction(mapEventTarget !== null, npcHasDedicatedInteraction)');
    const npcPrompt = hint.indexOf('if (npcTarget !== null) {');

    expect(eventTarget).toBeGreaterThanOrEqual(0);
    expect(priority).toBeGreaterThan(eventTarget);
    expect(hint.slice(priority, npcPrompt)).toContain('按 E · ${mapEventTarget!.prompt}');
    expect(priority).toBeLessThan(npcPrompt);
  });

  it('preserves dedicated shop and quest-giver actions before event priority is applied', () => {
    expect(hint).toContain('npcShop !== undefined && npcStock !== undefined && this.inventory !== null');
    expect(hint).toContain('npcTarget.record.questGiver && npcHasQuests && this.inventory !== null && this.questPanel !== null');
  });
});
