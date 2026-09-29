import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  directionBetweenCells,
  oppositeGridMapActorDirection,
  parseGridMap,
} from '../src/engine/grid-map';
import {
  gridMapActorDepth,
  gridMapArtTextureKey,
  gridMapDepthRowDepth,
  gridMapDepthRowIndexes,
  gridMapDepthTextureKey,
  gridMapGroundTextureKey,
} from '../src/engine/grid-map-renderer';
import { assembleNpcPlacements, parseNpcSet } from '../src/engine/npc-placement';

const mapPaths = [
  '../data/base/maps/round-01-grid.json',
  '../data/base/maps/round-10-mist-ferry.json',
  '../data/base/maps/round-62-iron-ridge.json',
  '../data/base/maps/round-67-salt-road.json',
  '../data/base/maps/round-74-cloud-ridge.json',
] as const;

const npcPaths = [
  '../data/base/characters/round-03-npcs.json',
  '../data/base/characters/round-74-cloud-ridge-npcs.json',
] as const;

function parseMap(path: string) {
  const result = parseGridMap(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.map;
}

describe('Round 78 actor facing and map depth data', () => {
  it('turns the player and a conversation partner toward each other in all four directions', () => {
    const player = { col: 12, row: 12 };
    const cases = [
      [{ col: 12, row: 11 }, 'up', 'down'],
      [{ col: 11, row: 12 }, 'left', 'right'],
      [{ col: 13, row: 12 }, 'right', 'left'],
      [{ col: 12, row: 13 }, 'down', 'up'],
    ] as const;
    for (const [npc, playerFacing, npcFacing] of cases) {
      expect(directionBetweenCells(player, npc)).toBe(playerFacing);
      expect(oppositeGridMapActorDirection(playerFacing)).toBe(npcFacing);
    }
  });

  it('places only explicitly y-sorted, non-empty rows in the foreground channel', () => {
    for (const path of mapPaths) {
      const map = parseMap(path);
      const rows = gridMapDepthRowIndexes(map);
      expect(rows.length, path).toBeGreaterThan(0);
      expect(rows).toEqual([...new Set(rows)].sort((a, b) => a - b));
      expect(rows.every((row) => row >= 0 && row < map.rows), path).toBe(true);
      expect(gridMapGroundTextureKey(map)).not.toBe(gridMapDepthTextureKey(map));
      expect(gridMapArtTextureKey(map)).not.toBe(gridMapGroundTextureKey(map));
    }
  });

  it('orders same-row foreground after an actor and puts the next actor row in front', () => {
    const originY = 29;
    const tileSize = 48;
    const actorAtRowTwo = gridMapActorDepth(originY + 2 * tileSize + tileSize / 2, tileSize);
    expect(gridMapDepthRowDepth(originY, 1, tileSize)).toBeLessThan(actorAtRowTwo);
    expect(gridMapDepthRowDepth(originY, 2, tileSize)).toBeGreaterThan(actorAtRowTwo);
  });

  it('declares four idle frames for every NPC while retaining a static-frame fallback', () => {
    for (const path of npcPaths) {
      const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as {
        npcs: Array<{ spriteFrame?: number; spriteFrames?: Record<string, number> }>;
      };
      const parsed = parseNpcSet(raw);
      expect(parsed.ok, path).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.set.npcs.length).toBeGreaterThan(0);
      for (const npc of parsed.set.npcs) {
        expect(npc.spriteFrame).toBeDefined();
        expect(npc.spriteFrames).toEqual({
          down: expect.any(Number),
          left: expect.any(Number),
          right: expect.any(Number),
          up: expect.any(Number),
        });
        const frames = Object.values(npc.spriteFrames ?? {});
        expect(frames).toHaveLength(4);
        expect(frames.every((frame) => frame >= 0 && frame < 320)).toBe(true);
        expect(new Set(frames).size).toBe(4);
      }
    }
  });

  it('accepts old static NPC records and rejects malformed direction maps', () => {
    const source = JSON.parse(readFileSync(new URL(npcPaths[0], import.meta.url), 'utf8')) as {
      npcs: Array<Record<string, unknown>>;
    };
    const oldRecord = { ...source.npcs[0] };
    delete oldRecord.spriteFrames;
    expect(parseNpcSet({ npcs: [oldRecord] }).ok).toBe(true);

    expect(parseNpcSet({ npcs: [{
      ...oldRecord,
      spriteFrames: { down: 1, left: 2, right: 3 },
    }] }).ok).toBe(false);
  });

  it('cross-validates every NPC direction frame against its map actor atlas', () => {
    const map = parseMap(mapPaths[0]);
    const source = JSON.parse(readFileSync(new URL(npcPaths[0], import.meta.url), 'utf8')) as {
      npcs: Array<Record<string, unknown>>;
    };
    const record = { ...source.npcs[0] };
    record.spriteFrames = { down: 1, left: 2, right: 3, up: 320 };
    const parsed = parseNpcSet({ npcs: [record] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const assembled = assembleNpcPlacements({
      npcSet: parsed.set,
      knownResourceIds: new Set([map.data.id]),
      maps: new Map([[map.data.id, map]]),
      currentMapResourceId: map.data.id,
      dialogueIds: new Set(parsed.set.npcs.map((npc) => npc.dialogueId)),
    });
    expect(assembled.npcs).toHaveLength(0);
    expect(assembled.warnings.join('\n')).toContain('人物精灵帧 320 超出地图声明的人物图集');
  });

  it('rejects unknown depth-order rules in runtime parsing as well as JSON Schema', () => {
    const raw = JSON.parse(readFileSync(new URL(mapPaths[0], import.meta.url), 'utf8')) as {
      art: { layers: Array<Record<string, unknown>> };
    };
    raw.art.layers[1]!.depthSort = 'front';
    const parsed = parseGridMap(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toContain('depthSort');
  });
});
