import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {}, Input: { Keyboard: { KeyCodes: {} } },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
} }));
import { GridScene } from '../src/game/grid-scene';
import { GameClock, parseGameCalendar } from '../src/engine/game-calendar';
import type { RegionTransitionData } from '../src/engine/world-map';

function host(currency = 10) {
  const parsed = parseGameCalendar(JSON.parse(readFileSync('data/base/worldview/calendar.json', 'utf8')));
  if (!parsed.ok) throw new Error('calendar fixture rejected');
  const gate: RegionTransitionData = { id: 'gate.test', name: '测试交通', fare: 8, travelMinutes: 20,
    from: { mapResourceId: 'map.a', col: 1, row: 1 }, to: { mapResourceId: 'map.a', col: 3, row: 1 } };
  const clock = new GameClock(parsed.calendar, 0);
  const inventory = { currency };
  const destination = { canEnter: () => true };
  const assembly = { npcsByPeriod: new Map(), npcs: [] as unknown[], encounters: [] as unknown[] };
  const scene = new GridScene();
  const notice = vi.fn();
  Object.assign(scene, { currentMapResourceId: 'map.a', playerCol: 0, playerRow: 1,
    inventory, clock, world: { calendar: parsed.calendar, maps: new Map([['map.a', destination]]), worldMap: { transitions: [gate] }, assembly },
    showRegionNotice: notice });
  const travel = () => (scene as unknown as { switchRegion: (gate: RegionTransitionData) => void }).switchRegion(gate);
  return { scene, gate, clock, inventory, destination, assembly, notice, travel };
}
describe('Round123 actual scene refusal path preserves resources', () => {
  it('refuses insufficient currency without advancing or spending', () => {
    const h = host(7); h.travel();
    expect(h.inventory.currency).toBe(7); expect(h.clock.elapsedMinutes).toBe(0);
    expect(h.notice).toHaveBeenCalledWith(expect.stringContaining('尚缺 1'));
  });
  it('refuses impassable terrain before charging', () => {
    const h = host(); h.destination.canEnter = () => false; h.travel();
    expect(h.inventory.currency).toBe(10); expect(h.clock.elapsedMinutes).toBe(0);
  });
  it('uses the arrival period when checking an occupied destination', () => {
    const h = host();
    h.clock.advance(100); // 09:40 morning; the authored 20 minutes arrives at midday.
    expect(h.clock.currentPeriod().id).toBe('period.morning');
    h.assembly.npcsByPeriod.set('period.midday', [{ record: { id: 'npc.test', mapResourceId: 'map.a' }, col: 3, row: 1 }]);
    h.travel(); expect(h.inventory.currency).toBe(10); expect(h.clock.elapsedMinutes).toBe(100);
    expect(h.notice).toHaveBeenCalledWith(expect.stringContaining('暂被挡住'));
  });
  it('rejects a moved player and does not spend', () => {
    const h = host(); Object.assign(h.scene, { playerCol: 9 }); h.travel();
    expect(h.inventory.currency).toBe(10); expect(h.clock.elapsedMinutes).toBe(0);
  });
});
