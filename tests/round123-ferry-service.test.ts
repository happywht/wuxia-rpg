import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { addFerryService } from '../scripts/lib/round123-ferry-service.mjs';
import { parseWorldMap } from '../src/engine/world-map';
const world = JSON.parse(readFileSync('data/base/world/world-map.json', 'utf8'));
const map = JSON.parse(readFileSync('data/base/maps/round-10-mist-ferry.json', 'utf8'));
describe('Round123 authored optional ferry service', () => {
  it('keeps all 50 inter-region gates and adds only two local priced services', () => {
    const parsed = parseWorldMap(world); expect(parsed.ok).toBe(true);
    const old = world.transitions.filter((gate: { id: string }) => !gate.id.startsWith('gate.r123-'));
    expect(old).toHaveLength(50);
    expect(old.every((gate: { fare?: number }) => gate.fare === undefined)).toBe(true);
    const added = world.transitions.filter((gate: { id: string }) => gate.id.startsWith('gate.r123-'));
    expect(added).toHaveLength(2);
    for (const gate of added) {
      expect(gate.fare).toBe(8); expect(gate.travelMinutes).toBe(20);
      expect(gate.from.mapResourceId).toBe('map.round-10-mist-ferry'); expect(gate.to.mapResourceId).toBe(gate.from.mapResourceId);
      for (const point of [gate.from, gate.to]) expect(map.tileTypes[map.grid[point.row][point.col]].solid).toBe(false);
    }
  });
  it('regenerates idempotently without altering any other world fields', () => {
    const output = addFerryService(world);
    expect(output).toEqual(world); expect(addFerryService(output)).toEqual(output);
    expect({ ...output, transitions: [] }).toEqual({ ...world, transitions: [] });
  });
});
