/**
 * Round 121: 江南地面覆盖层不再遮挡站立者 —— 数据与再生源回归。
 *
 * 根因：import-round51 导入的五层中 layer-2 是地面覆盖层（路面帧 576-580
 * 等，跨图均为地面证据），round-78 给 layer-2~5加了 depthSort:"y"，
 * 于是 323 格不透明路面进入前景深度行——站在可走路面格上的玩家被整格
 * 盖住（观察于 43,41 与 89,50）。修复只移除 layer-2 的 y 标注：路面回到
 * 地面烘焙通道，屋顶/树/建筑（layer-3/4/5 等）保持合法遮挡；网格、碰撞、
 * tileTypes、层 id 与锚点不动；导入器同步固化"仅物件层遮挡"语义。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGridMap } from '../src/engine/grid-map';
import { repairTownGroundOverlay } from '../scripts/lib/round121-town-floors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const authored = read('data/base/maps/round-01-grid.json') as {
  grid: string[]; tileTypes: Record<string, { solid?: boolean }>;
  art: { layers: { id: string; tilesetId: string; depthSort?: string; cells: number[][] }[] };
  playerStart: { col: number; row: number };
};
const parse = () => {
  const result = parseGridMap(authored);
  if (!result.ok) throw Error(result.errors.join('\n'));
  return result.map;
};

const OBSERVED_CELLS = [[43, 41], [89, 50]] as const;

describe('Round121 Jiangnan pavement no longer occludes (ground overlay back to the floor channel)', () => {
  it('the observed walkable cells have a fully transparent foreground', () => {
    const map = parse();
    for (const [col, row] of OBSERVED_CELLS) {
      expect(map.canEnter(col, row)).toBe(true);
      for (const layer of authored.art.layers) {
        if (layer.depthSort === 'y') {
          expect((layer.cells[row] ?? [])[col] ?? 0, `${layer.id} at ${col},${row}`).toBe(0);
        }
      }
    }
  });

  it('the ground overlay layer itself is no longer y-sorted, while object layers keep occluding', () => {
    const overlay = authored.art.layers.find(layer => layer.id === 'layer-2')!;
    expect(overlay.depthSort).toBeUndefined();
    // Pavement frames really live on that layer (this is what used to cover actors).
    const pavementCells = overlay.cells.flat().filter(gid => gid >= 576 && gid <= 580).length;
    expect(pavementCells).toBeGreaterThan(300);
    // Roofs/trees/buildings keep their occlusion layers — no global actor raise,
    // no disabled depth sorting.
    const occluding = authored.art.layers.filter(layer => layer.depthSort === 'y');
    expect(occluding.length).toBeGreaterThanOrEqual(4);
    for (const [, row] of OBSERVED_CELLS) {
      const rowStillHasForeground = occluding.some(layer => (layer.cells[row] ?? []).some(gid => gid !== 0));
      expect(rowStillHasForeground).toBe(true); // The same rows still draw合法前景 elsewhere.
    }
  });

  it('collision, grid, anchors and other layers are byte-identical through the repair', () => {
    const before = structuredClone(authored);
    const restored = structuredClone(authored);
    (restored.art.layers.find(layer => layer.id === 'layer-2')! as { depthSort?: string }).depthSort = 'y';
    const repaired = repairTownGroundOverlay(restored);
    expect(repaired).toEqual(before); // Exactly the authored state, nothing else moved.
    expect(repairTownGroundOverlay(repaired)).toEqual(repaired); // Idempotent.
    // The huge cells arrays are shared, not cloned.
    expect(repaired.art.layers.find(layer => layer.id === 'layer-2')!.cells).toBe(restored.art.layers.find(layer => layer.id === 'layer-2')!.cells);
  });

  it('refuses a world whose layer shape no longer matches the authored protocol', () => {
    for (const cause of ['missing', 'duplicate', 'wrong-tileset', 'no-foreground'] as const) {
      const bad = structuredClone(authored);
      if (cause === 'missing') bad.art.layers = bad.art.layers.filter(layer => layer.id !== 'layer-2');
      if (cause === 'duplicate') bad.art.layers.push(structuredClone(bad.art.layers.find(layer => layer.id === 'layer-2')!));
      if (cause === 'wrong-tileset') bad.art.layers.find(layer => layer.id === 'layer-2')!.tilesetId = 'other.set';
      if (cause === 'no-foreground') for (const layer of bad.art.layers) delete layer.depthSort;
      expect(() => repairTownGroundOverlay(bad), cause).toThrow();
    }
  });

  it('keeps the regeneration source aligned: only object layers get depthSort on import', () => {
    const source = readFileSync(join(root, 'scripts/import-round51-kenney-world.mjs'), 'utf8');
    expect(source).toContain("...(index >= 2 ? { depthSort: 'y' } : {})");
    // And the historical round-78 depth re-generator no longer re-flags the
    // ground overlay — running it on today's data must not reintroduce the bug.
    const depthScript = readFileSync(join(root, 'scripts/generate-round78-actor-depth.mjs'), 'utf8');
    const townSet = depthScript.slice(depthScript.indexOf("'round-01-grid.json'"), depthScript.indexOf('round-10-mist-ferry'));
    expect(townSet).not.toContain("'layer-2'");
  });
});
