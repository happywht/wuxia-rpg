import { describe, expect, it } from 'vitest';
import { quoteTransitionCost } from '../src/engine/transition-cost';
import { parseWorldMap } from '../src/engine/world-map';

const atlasFixture = (cost: Record<string, unknown>) => ({
  id: 'world.test', startingMapResourceId: 'map.a',
  regions: [{ mapResourceId: 'map.a', name: '测试区域', description: '', atlasPosition: { x: 0, y: 0 } }],
  transitions: [{ id: 'gate.service', name: '测试交通', from: { mapResourceId: 'map.a', col: 1, row: 1 }, to: { mapResourceId: 'map.a', col: 3, row: 1 }, ...cost }],
  events: [],
});

describe('Round123 defensive atlas cost parser', () => {
  it('retains authored costs and leaves legacy fields absent', () => {
    const paid = parseWorldMap(atlasFixture({ travelMinutes: 20, fare: 8 }));
    expect(paid.ok).toBe(true);
    if (paid.ok) expect(paid.data.transitions[0]).toMatchObject({ travelMinutes: 20, fare: 8 });
    const old = parseWorldMap(atlasFixture({}));
    expect(old.ok).toBe(true);
    if (old.ok) expect(old.data.transitions[0]).not.toHaveProperty('fare');
  });
  it.each([{ fare: -1 }, { fare: 1.5 }, { fare: '8' }, { fare: null }, { fare: 1_000_001 }, { travelMinutes: -1 }, { travelMinutes: 1441 }, { travelMinutes: 1.5 }, { travelMinutes: '20' }])('rejects invalid authored costs %j', cost => {
    expect(parseWorldMap(atlasFixture(cost)).ok).toBe(false);
  });
});

describe('Round123 travel quote boundaries', () => {
  it('preserves free legacy travel and does not mutate the input', () => {
    const data = Object.freeze({});
    expect(quoteTransitionCost(data, 45, 0)).toEqual({ minutes: 45, fare: 0, affordable: true, missingCurrency: 0 });
  });
  it('quotes a priced route with exact and insufficient balances', () => {
    expect(quoteTransitionCost({ fare: 8, travelMinutes: 20 }, 45, 8)).toEqual({ minutes: 20, fare: 8, affordable: true, missingCurrency: 0 });
    expect(quoteTransitionCost({ fare: 8, travelMinutes: 20 }, 45, 3).missingCurrency).toBe(5);
    expect(quoteTransitionCost({ fare: 8 }, 45, 3).affordable).toBe(false);
  });
  it.each([-1, 0.5, NaN, Infinity, 1441])('rejects invalid time %s', travelMinutes => {
    expect(() => quoteTransitionCost({ travelMinutes }, 45, 10)).toThrow(RangeError);
  });
  it.each([-1, 0.5, NaN, Infinity, 1_000_001])('rejects invalid fare %s', fare => {
    expect(() => quoteTransitionCost({ fare }, 45, 10)).toThrow(RangeError);
  });
  it('retains explicit free and zero-time authored travel', () => {
    expect(quoteTransitionCost({ fare: 0, travelMinutes: 0 }, 45, 0).minutes).toBe(0);
  });
});
