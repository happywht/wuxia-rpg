import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Position { col: number; row: number }
interface TraceWalk {
  kind: 'walk';
  stage: string;
  mapResourceId: string;
  start: Position;
  end: Position;
  targetName: string;
  stop: 'gate' | 'arrived';
  directions: string;
}
interface TraceGate {
  kind: 'gate';
  key: 'E';
  gateId: string;
  fromMapResourceId: string;
  toMapResourceId: string;
  landing: Position;
}
interface TraceCheckpoint {
  kind: 'checkpoint';
  id: string;
  mapResourceId: string;
  position: Position;
  saveKeys?: string[];
  continueKeys?: string[];
  endingKey?: 'E';
  endingId?: string;
}
interface JourneyTrace {
  schemaVersion: number;
  sourceTest: string;
  start: { mapResourceId: string; position: Position };
  actions: Array<TraceWalk | TraceGate | TraceCheckpoint | { kind: 'wait'; key: 'V'; minutes: number }>;
  expected: { regions: string[]; transitionIds: string[]; steps: number; endingId: string };
}

function trace(): JourneyTrace {
  return JSON.parse(readFileSync(new URL('../iterations/round-71/browser-trace.json', import.meta.url), 'utf8')) as JourneyTrace;
}

describe('Round 71 浏览器路线轨迹', () => {
  it('从引擎长旅程导出 749 次逐格方向输入和五次关口交互', () => {
    const journey = trace();
    expect(journey.schemaVersion).toBe(1);
    expect(journey.sourceTest).toBe('tests/round68-long-journey.test.ts');
    expect(journey.start).toMatchObject({
      mapResourceId: 'map.round-01-grid',
      position: { col: 43, row: 37 },
    });
    expect(journey.expected.regions).toEqual([
      'map.round-01-grid', 'map.round-10-mist-ferry',
      'map.round-62-iron-ridge', 'map.round-67-salt-road',
    ]);
    expect(journey.expected.transitionIds).toEqual([
      'gate.trial-to-ferry',
      'gate.ferry-north-to-iron-ridge',
      'gate.iron-ridge-to-salt-road',
      'gate.salt-road-to-iron-ridge',
      'gate.iron-ridge-to-ferry-north',
    ]);

    const walks = journey.actions.filter((action): action is TraceWalk => action.kind === 'walk');
    expect(walks.length).toBeGreaterThanOrEqual(7);
    expect(walks.reduce((sum, walk) => sum + walk.directions.length, 0)).toBe(journey.expected.steps);
    for (const walk of walks) {
      let position = { ...walk.start };
      expect(walk.directions).toMatch(/^[RLUD]+$/);
      for (const direction of walk.directions) {
        if (direction === 'R') position.col += 1;
        else if (direction === 'L') position.col -= 1;
        else if (direction === 'U') position.row -= 1;
        else position.row += 1;
      }
      expect(position, `${walk.stage}/${walk.mapResourceId} 终点`).toEqual(walk.end);
    }

    const gates = journey.actions.filter((action): action is TraceGate => action.kind === 'gate');
    expect(gates.map(({ gateId }) => gateId)).toEqual(journey.expected.transitionIds);
    const save = journey.actions.find((action): action is TraceCheckpoint =>
      action.kind === 'checkpoint' && action.id === 'save-and-refresh-in-salt-road');
    expect(save).toMatchObject({
      mapResourceId: 'map.round-67-salt-road',
      saveKeys: ['Escape', 'ArrowDown', 'Enter', 'Enter'],
      continueKeys: ['ArrowDown', 'Enter', 'Enter'],
    });
    expect(journey.actions.at(-1)).toMatchObject({
      kind: 'checkpoint',
      id: 'ending-gate',
      endingKey: 'E',
      endingId: 'ending.open-water',
    });
    expect(journey.expected.endingId).toBe('ending.open-water');
  });
});
