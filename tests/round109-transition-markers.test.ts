/**
 * Round 109 tests for the data-driven transition gate markers.
 *
 * Two halves, mirroring the module's own split:
 *
 * 1. Pure projection over the REAL base world (22 maps / 50 transitions,
 *    six representative regions): only the current map's outgoing gates are
 *    projected, destination names come from the world map's own region
 *    records (never raw ids), proximity flags follow the exact Manhattan
 *    semantics of `selectAdjacentTransition`, and the authored inputs are
 *    never mutated (deep-freeze proof).
 * 2. Renderer on a recording mock scene: one world-scroll container, exact
 *    world-pixel badge/label positions, proximity-gated labels and E-key
 *    glyph, idempotent repeated updates, idempotent destroy that ignores
 *    later updates, wrapped long labels, and zero input/interactivity
 *    bindings — the module is presentation only.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(_key?: string) {} },
    Input: { Keyboard: { KeyCodes: {} } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
  },
}));
vi.mock('../src/game/settings', async (importOriginal) => ({
  // Only the font resolver is deterministic here; every other export
  // (DEFAULT_GAME_SETTINGS and friends) stays real for the GridScene import.
  ...(await importOriginal<typeof import('../src/game/settings')>()),
  uiFontSize: (n: number) => `${n}px`,
}));

import { parseWorldMap } from '../src/engine/world-map';
import type { CellPosition } from '../src/engine/grid-map';
import { GridScene } from '../src/game/grid-scene';
import { UI_FONT_FAMILY, UI_PALETTE } from '../src/game/ui-theme';
import {
  TRANSITION_MARKER_DEPTH,
  TRANSITION_MARKER_LABEL_RADIUS,
  createTransitionGateMarkers,
  projectTransitionGates,
  type TransitionMarkerRenderer,
} from '../src/game/transition-markers';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parsedWorld = parseWorldMap(
  JSON.parse(readFileSync(path.join(repoRoot, 'data/base/world/world-map.json'), 'utf8')),
);
if (!parsedWorld.ok) throw new Error(parsedWorld.errors.join('; '));
const worldData = parsedWorld.data;
const regionNames = new Map(worldData.regions.map((region) => [region.mapResourceId, region.name]));

const FERRY_ID = 'map.round-10-mist-ferry';
const FERRY_NORTH_GATE = 'gate.ferry-north-to-iron-ridge'; // (89, 15) → iron ridge
const FERRY_WEST_GATE = 'gate.ferry-to-trial'; // (2, 4) → trial grid
const FERRY_SOUTH_GATE = 'gate.r79-ferry-to-isles'; // (97, 90) → isles
const SIX_MAPS = [
  'map.round-01-grid', // mainland start, single gate
  FERRY_ID, // the crowded ferry crossroads (3 gates)
  'map.round-74-cloud-ridge', // cloud ridge
  'map.round-82-east-coast', // eastern coastal port
  'map.round-92-north-pass', // snow pass
  'map.round-97-lanxin-isle', // far-flung late island
] as const;

const PROJECTION_BASE = {
  transitions: worldData.transitions,
  regions: worldData.regions,
  tileSize: 32,
  mapOrigin: { x: 40, y: 20 },
} as const;

/** Deep-freezes authored data so any mutation attempt throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('Round109 pure gate projection over the real base world', () => {
  it('locks the real-data premise: 22 regions, 50 transitions, no dangling destinations', () => {
    expect(worldData.regions).toHaveLength(22);
    expect(worldData.transitions).toHaveLength(50);
    for (const transition of worldData.transitions) {
      expect(regionNames.has(transition.to.mapResourceId)).toBe(true);
    }
  });

  it('projects exactly the outgoing gates of six representative maps with exact cell/pixel geometry', () => {
    let projectedTotal = 0;
    for (const mapId of SIX_MAPS) {
      const expected = worldData.transitions.filter((t) => t.from.mapResourceId === mapId);
      expect(expected.length).toBeGreaterThan(0); // every representative map has gates
      const projections = projectTransitionGates({ ...PROJECTION_BASE, mapResourceId: mapId });
      expect(projections).toHaveLength(expected.length);
      projectedTotal += projections.length;

      // Stable, deterministic order; only this map's own gates.
      expect(projections.map((p) => p.transitionId)).toEqual(
        [...expected].sort((a, b) => a.id.localeCompare(b.id)).map((t) => t.id),
      );
      for (const projection of projections) {
        const authored = worldData.transitions.find((t) => t.id === projection.transitionId)!;
        expect(authored.from.mapResourceId).toBe(mapId);
        expect(projection.col).toBe(authored.from.col);
        expect(projection.row).toBe(authored.from.row);
        expect(projection.x).toBe(PROJECTION_BASE.mapOrigin.x + (authored.from.col + 0.5) * 32);
        expect(projection.y).toBe(PROJECTION_BASE.mapOrigin.y + (authored.from.row + 0.5) * 32);
      }
    }
    expect(projectedTotal).toBeGreaterThanOrEqual(13); // the six maps carry a real gate load
  });

  it('names destinations from world-map regions only and never narrates ids or coordinates', () => {
    for (const mapId of SIX_MAPS) {
      for (const projection of projectTransitionGates({ ...PROJECTION_BASE, mapResourceId: mapId })) {
        const authored = worldData.transitions.find((t) => t.id === projection.transitionId)!;
        expect(projection.destinationRegionName).toBe(regionNames.get(authored.to.mapResourceId));
        expect(projection.destinationRegionName).not.toMatch(/^(map|gate)\./);
        expect(projection.gateName).not.toMatch(/^(map|gate)\./);
        expect(projection.destinationRegionName).not.toMatch(/^\d+\s*,\s*\d+$/); // no coordinate prose
      }
    }
  });

  it('labels only within Manhattan radius 6 and flags only orthogonal adjacency', () => {
    expect(TRANSITION_MARKER_LABEL_RADIUS).toBe(6);
    const byId = (projections: ReturnType<typeof projectTransitionGates>) =>
      new Map(projections.map((p) => [p.transitionId, p]));

    // The reported invisible gate: player at (88,15), gate at (89,15).
    const adjacent = byId(projectTransitionGates({
      ...PROJECTION_BASE, mapResourceId: FERRY_ID, playerCell: { col: 88, row: 15 },
    }));
    expect(adjacent.get(FERRY_NORTH_GATE)).toMatchObject({
      manhattanDistance: 1, isAdjacent: true, showDestinationLabel: true,
    });
    expect(adjacent.get(FERRY_WEST_GATE)).toMatchObject({
      manhattanDistance: 97, isAdjacent: false, showDestinationLabel: false,
    });
    expect(adjacent.get(FERRY_SOUTH_GATE)).toMatchObject({
      manhattanDistance: 84, isAdjacent: false, showDestinationLabel: false,
    });

    // Radius boundary: distance 6 labels, distance 7 does not.
    const atSix = byId(projectTransitionGates({
      ...PROJECTION_BASE, mapResourceId: FERRY_ID, playerCell: { col: 83, row: 15 },
    }));
    expect(atSix.get(FERRY_NORTH_GATE)).toMatchObject({ manhattanDistance: 6, showDestinationLabel: true });
    const atSeven = byId(projectTransitionGates({
      ...PROJECTION_BASE, mapResourceId: FERRY_ID, playerCell: { col: 82, row: 15 },
    }));
    expect(atSeven.get(FERRY_NORTH_GATE)).toMatchObject({ manhattanDistance: 7, showDestinationLabel: false });

    // Diagonal neighbours are near, but never interaction-adjacent.
    const diagonal = byId(projectTransitionGates({
      ...PROJECTION_BASE, mapResourceId: FERRY_ID, playerCell: { col: 88, row: 16 },
    }));
    expect(diagonal.get(FERRY_NORTH_GATE)).toMatchObject({ manhattanDistance: 2, isAdjacent: false });
  });

  it('keeps badges projectable without a live player cell', () => {
    const withPlayer = projectTransitionGates({
      ...PROJECTION_BASE, mapResourceId: FERRY_ID, playerCell: { col: 88, row: 15 },
    });
    const withoutPlayer = projectTransitionGates({ ...PROJECTION_BASE, mapResourceId: FERRY_ID });
    expect(withoutPlayer).toHaveLength(withPlayer.length);
    for (const projection of withoutPlayer) {
      expect(projection.manhattanDistance).toBeNull();
      expect(projection.showDestinationLabel).toBe(false);
      expect(projection.isAdjacent).toBe(false);
    }
  });

  it('never mutates the authored transitions or regions (frozen inputs survive)', () => {
    const transitionsBefore = structuredClone(worldData.transitions);
    const regionsBefore = structuredClone(worldData.regions);
    const frozen = {
      transitions: deepFreeze(worldData.transitions.map((t) => ({ ...t }))),
      regions: deepFreeze(worldData.regions.map((r) => ({ ...r }))),
    };
    const projections = projectTransitionGates({
      mapResourceId: FERRY_ID,
      transitions: frozen.transitions,
      regions: frozen.regions,
      tileSize: 48,
      mapOrigin: { x: 120, y: 40 },
      playerCell: { col: 88, row: 15 },
    });
    expect(projections.length).toBe(3);
    expect(frozen.transitions.map((t) => t.id).sort()).toEqual(
      [...transitionsBefore.map((t) => t.id)].sort(),
    );
    expect(frozen.regions).toEqual(regionsBefore);
    expect(worldData.transitions).toEqual(transitionsBefore);
    expect(worldData.regions).toEqual(regionsBefore);
  });

  it('projects every one of the 50 authored gates exactly once across all 22 regions', () => {
    const seen = new Map<string, ReturnType<typeof projectTransitionGates>[number]>();
    for (const region of worldData.regions) {
      for (const projection of projectTransitionGates({
        ...PROJECTION_BASE,
        mapResourceId: region.mapResourceId,
      })) {
        expect(seen.has(projection.transitionId)).toBe(false); // exactly one owner map
        seen.set(projection.transitionId, projection);
      }
    }
    expect(seen.size).toBe(50);
    for (const transition of worldData.transitions) {
      const projection = seen.get(transition.id);
      expect(projection).toBeDefined();
      expect(projection!.col).toBe(transition.from.col);
      expect(projection!.row).toBe(transition.from.row);
      expect(projection!.gateName).toBe(transition.name);
      // Exact world-pixel projection of every authored gate cell.
      expect(projection!.x).toBe(PROJECTION_BASE.mapOrigin.x + (transition.from.col + 0.5) * 32);
      expect(projection!.y).toBe(PROJECTION_BASE.mapOrigin.y + (transition.from.row + 0.5) * 32);
      expect(projection!.destinationRegionName).toBe(regionNames.get(transition.to.mapResourceId));
      expect(projection!.manhattanDistance).toBeNull(); // no player cell in this sweep
    }
  });
});

/** Every scene object the renderer can create, with full call recording. */
interface RecordedObject {
  kind: 'container' | 'rectangle' | 'text';
  x: number;
  y: number;
  color?: number;
  text?: string;
  style?: Record<string, unknown>;
  visible: boolean;
  destroyed: boolean;
  destroyCalls: number;
  strokeCalls: number;
  origin?: [number, number];
  setTextCalls: string[];
  setFontSizeCalls: string[];
  depthCalls: number[];
  children: RecordedObject[];
  /** Measuring context: 10 px per grapheme, mirroring the real font-synced one. */
  context: { measureText(value: string): { width: number } };
  setScrollFactor(value: number): RecordedObject;
  setVisible(value: boolean): RecordedObject;
  setOrigin(x: number, y: number): RecordedObject;
  setText(value: string): RecordedObject;
  setFontSize(value: string): RecordedObject;
  setStrokeStyle(width: number, color: number, alpha: number): RecordedObject;
  setDepth(value: number): RecordedObject;
  setInteractive(...args: unknown[]): RecordedObject;
  add(items: unknown): RecordedObject;
  destroy(): void;
}

function createRecordingScene(): {
  scene: Phaser.Scene;
  objects: RecordedObject[];
  containers: RecordedObject[];
  rectangles: RecordedObject[];
  texts: RecordedObject[];
  scrollFactorValues: number[];
  interactiveCalls: () => number;
  inputAccesses: () => number;
} {
  const objects: RecordedObject[] = [];
  const containers: RecordedObject[] = [];
  const rectangles: RecordedObject[] = [];
  const texts: RecordedObject[] = [];
  const scrollFactorValues: number[] = [];
  let interactiveCalls = 0;
  let inputAccesses = 0;

  const make = (
    partial: Partial<Omit<RecordedObject, 'context'>> & { kind: RecordedObject['kind'] },
  ): RecordedObject => {
    const object: RecordedObject = {
      x: 0, y: 0, visible: true, destroyed: false, destroyCalls: 0, strokeCalls: 0,
      setTextCalls: [], setFontSizeCalls: [], depthCalls: [], children: [],
      ...partial,
      context: { measureText: (value: string) => ({ width: value.length * 10 }) },
      setScrollFactor(value: number) { scrollFactorValues.push(value); return object; },
      setVisible(value: boolean) { object.visible = value; return object; },
      setOrigin(x: number, y: number) { object.origin = [x, y]; return object; },
      setText(value: string) { object.setTextCalls.push(value); object.text = value; return object; },
      setFontSize(value: string) { object.setFontSizeCalls.push(value); return object; },
      setStrokeStyle() { object.strokeCalls += 1; return object; },
      setDepth(value: number) { object.depthCalls.push(value); return object; },
      setInteractive(..._args: unknown[]) { interactiveCalls += 1; return object; },
      add(items: unknown) {
        for (const item of Array.isArray(items) ? items : [items]) object.children.push(item as RecordedObject);
        return object;
      },
      destroy() {
        object.destroyCalls += 1;
        object.destroyed = true;
        for (const child of object.children) if (!child.destroyed) child.destroy();
      },
    };
    objects.push(object);
    return object;
  };

  const scene = {
    // Any input binding attempt is a contract violation — the getter traps it.
    get input() { inputAccesses += 1; return undefined; },
    add: {
      container: (x: number, y: number) => { const o = make({ kind: 'container', x, y }); containers.push(o); return o; },
      rectangle: (x: number, y: number, _w: number, _h: number, color: number) => {
        const o = make({ kind: 'rectangle', x, y, color }); rectangles.push(o); return o;
      },
      text: (x: number, y: number, text: string, style: Record<string, unknown>) => {
        const o = make({ kind: 'text', x, y, text, style }); texts.push(o); return o;
      },
    },
  };

  return {
    scene: scene as unknown as Phaser.Scene,
    objects, containers, rectangles, texts, scrollFactorValues,
    interactiveCalls: () => interactiveCalls,
    inputAccesses: () => inputAccesses,
  };
}

const RENDER_BASE = {
  mapResourceId: FERRY_ID,
  transitions: worldData.transitions,
  regions: worldData.regions,
  tileSize: 48,
  mapOrigin: { x: 120, y: 40 },
  resolveFontSize: (n: number) => `${n}px`,
} as const;

function setupRender(
  playerCell: CellPosition | null,
  overrides: Record<string, unknown> = {},
): { renderer: TransitionMarkerRenderer; rec: ReturnType<typeof createRecordingScene> } {
  const rec = createRecordingScene();
  const renderer = createTransitionGateMarkers(rec.scene, {
    ...RENDER_BASE, ...overrides, playerCell,
  } as Parameters<typeof createTransitionGateMarkers>[1]);
  return { renderer, rec };
}

describe('Round109 gate marker renderer on a mock scene', () => {
  it('creates one world-scroll container with exact badge/label world geometry', () => {
    const { rec } = setupRender({ col: 88, row: 15 });
    expect(rec.containers).toHaveLength(1);
    expect(rec.containers[0]!.x).toBe(0);
    expect(rec.containers[0]!.y).toBe(0);
    // 3 gates × (5 badge rects + 1 glyph square + 1 glyph key + 1 label) + container.
    expect(rec.rectangles).toHaveLength(3 * 6);
    expect(rec.texts).toHaveLength(3 * 2);
    expect(rec.scrollFactorValues).toHaveLength(3 * 8 + 1);
    expect(rec.scrollFactorValues.every((value) => value === 1)).toBe(true);

    // Gate order is the projection order: north (89,15), west (2,4), south (97,90).
    // Badge centre: origin + (cell + 0.5) * tileSize; unit = 48/16 = 3, badge height 27.
    const northX = 120 + 89.5 * 48;
    const northY = 40 + 15.5 * 48;
    const badgePosts = rec.rectangles.filter((r) => r.color === UI_PALETTE.frame);
    expect(badgePosts).toHaveLength(6); // two posts per gate
    expect(badgePosts[0]!.x).toBe(northX - 7.5);
    expect(badgePosts[1]!.x).toBe(northX + 7.5);
    expect(rec.rectangles.filter((r) => r.color === UI_PALETTE.frameLight)).toHaveLength(3); // lintels
    expect(rec.rectangles.filter((r) => r.strokeCalls === 1)).toHaveLength(3); // E-glyph squares
    expect(rec.rectangles.some((r) => r.color === UI_PALETTE.selected)).toBe(true); // passage dot
    expect(rec.rectangles.some((r) => r.x === northX && r.y === northY)).toBe(true); // dot at gate centre

    const northLabel = rec.texts[0]!;
    expect(northLabel.x).toBe(northX);
    expect(northLabel.y).toBe(northY - 27 / 2 - 4); // bottom-anchored above the arch
    expect(northLabel.origin).toEqual([0.5, 1]);
    expect(northLabel.style).toMatchObject({
      fontFamily: UI_FONT_FAMILY, fontSize: '10px', color: UI_PALETTE.text,
    });
    // Measured grapheme wrapping instead of Phaser's space-only native
    // wordWrap: no wrap style is configured at all.
    expect(northLabel.style!.wordWrap).toBeUndefined();
    expect(northLabel.text).toBe('雾岬北口\n→ 铁嶂北道·岩关驿镇'); // real copy, unwrapped at this width
  });

  it('shows destination labels only near the player and the E glyph only when adjacent', () => {
    const { renderer, rec } = setupRender(null);
    const labels = rec.texts.filter((t) => t.text !== 'E');
    const eKeys = rec.texts.filter((t) => t.text === 'E');
    expect(labels).toHaveLength(3);
    expect(eKeys).toHaveLength(3);
    expect(labels.every((label) => !label.visible)).toBe(true);
    expect(eKeys.every((key) => !key.visible)).toBe(true);

    renderer.update({ col: 88, row: 15 });
    const [north, west, south] = labels;
    expect(north!.visible).toBe(true);
    expect(north!.text).toContain('雾岬北口');
    expect(north!.text).toContain('铁嶂北道·岩关驿镇'); // real world-map region name
    expect(north!.text).not.toContain('map.round-62-iron-ridge'); // ids never narrated
    expect(west!.visible).toBe(false);
    expect(south!.visible).toBe(false);
    expect(eKeys[0]!.visible).toBe(true);
    expect(eKeys[1]!.visible).toBe(false);
    expect(eKeys[2]!.visible).toBe(false);

    // Walking to a cell orthogonally adjacent to the west gate (2,4) flips
    // which label and glyph show — standing ON the gate cell is distance 0,
    // not adjacency.
    renderer.update({ col: 3, row: 4 });
    expect(north!.visible).toBe(false);
    expect(west!.visible).toBe(true);
    expect(west!.text).toContain('江南道·七镇行旅');
    expect(eKeys[0]!.visible).toBe(false);
    expect(eKeys[1]!.visible).toBe(true);
  });

  it('repeated updates reuse the same objects and skip redundant text writes', () => {
    const { renderer, rec } = setupRender(null);
    renderer.update({ col: 88, row: 15 });
    const counts = {
      containers: rec.containers.length, rectangles: rec.rectangles.length, texts: rec.texts.length,
    };
    const textWrites = rec.texts.reduce((sum, t) => sum + t.setTextCalls.length, 0);

    renderer.update({ col: 88, row: 15 });
    renderer.update({ col: 88, row: 15 });
    expect(rec.containers).toHaveLength(counts.containers);
    expect(rec.rectangles).toHaveLength(counts.rectangles);
    expect(rec.texts).toHaveLength(counts.texts);
    expect(rec.texts.reduce((sum, t) => sum + t.setTextCalls.length, 0)).toBe(textWrites);
  });

  it('destroys idempotently and ignores updates afterwards', () => {
    const { renderer, rec } = setupRender(null);
    const root = rec.containers[0]!;
    renderer.update({ col: 88, row: 15 });
    renderer.destroy();
    expect(root.destroyCalls).toBe(1);
    expect(root.children.length).toBeGreaterThan(0);
    expect(root.children.every((child) => child.destroyed)).toBe(true); // Phaser container semantics
    const objectsAfterDestroy = rec.objects.length;

    renderer.destroy();
    expect(root.destroyCalls).toBe(1);

    renderer.update({ col: 88, row: 15 }); // must be a no-op, not a rebuild
    expect(rec.objects).toHaveLength(objectsAfterDestroy);
    expect(rec.containers).toHaveLength(1);
  });

  it('never binds input, interactivity or keyboard handlers across its whole life', () => {
    const { renderer, rec } = setupRender({ col: 88, row: 15 });
    renderer.update({ col: 90, row: 15 });
    renderer.destroy();
    expect(rec.inputAccesses()).toBe(0);
    expect(rec.interactiveCalls()).toBe(0);
  });

  it('wraps long MOD gate names by measured grapheme width and keeps the full text', () => {
    const longNames = worldData.transitions
      .filter((t) => t.from.mapResourceId === FERRY_ID)
      .map((t) => ({ ...t, name: '雾雨渡口以北的极长关口名'.repeat(12) }));
    const { rec } = setupRender({ col: 88, row: 15 }, { transitions: longNames, maxLabelWidth: 200 });
    const north = rec.texts.filter((t) => t.text !== 'E')[0]!;
    expect(north.style!.wordWrap).toBeUndefined(); // measured wrap, never native wordWrap
    const lines = north.text!.split('\n');
    expect(lines.length).toBeGreaterThan(2); // genuinely reflowed, not one overflowing line
    for (const line of lines) {
      expect(line.length * 10).toBeLessThanOrEqual(200); // mock measure: every line fits
    }
    const flattened = north.text!.replace(/\n/g, '');
    expect(flattened).toContain('雾雨渡口以北的极长关口名'.repeat(12).slice(0, 100)); // full MOD name kept
    expect(flattened).toContain('铁嶂北道·岩关驿镇'); // still the authored destination
    expect(flattened).not.toContain('…'); // wrapping preserves text; it never truncates
    expect(rec.containers[0]!.children.length).toBe(3 * 8); // bounded object count, one row of parts per gate
  });

  it('refreshFonts re-applies the resolved size and re-wraps without rebuilding any object', () => {
    let scale = 1;
    const { renderer, rec } = setupRender({ col: 88, row: 15 }, {
      resolveFontSize: (n: number) => `${n * scale}px`,
    });
    const counts = {
      containers: rec.containers.length, rectangles: rec.rectangles.length, texts: rec.texts.length,
    };
    const textsBefore = rec.texts.map((t) => t.text);

    scale = 2; // the live text-scale setting changed
    renderer.refreshFonts();
    expect(rec.containers).toHaveLength(counts.containers);
    expect(rec.rectangles).toHaveLength(counts.rectangles);
    expect(rec.texts).toHaveLength(counts.texts); // same objects, resized in place
    for (const label of rec.texts.filter((t) => t.text !== 'E')) {
      expect(label.setFontSizeCalls).toContain('20px');
    }
    expect(rec.texts.filter((t) => t.text === 'E').every((key) => key.setFontSizeCalls.includes('20px'))).toBe(true);
    expect(rec.texts.map((t) => t.text)).toEqual(textsBefore); // same measured wrap width: copy unchanged

    renderer.destroy();
    expect(() => renderer.refreshFonts()).not.toThrow(); // destroyed: no stale refresh
  });
});

/** Shared helpers for the GridScene wiring checks below. */
const IRON_RIDGE_ID = 'map.round-62-iron-ridge';
const gridInternals = (scene: GridScene): Record<string, unknown> => scene as unknown as Record<string, unknown>;
const gridCall = (scene: GridScene, method: string): void =>
  (gridInternals(scene)[method] as () => void).call(scene);

function seedGridScene(overrides: Record<string, unknown> = {}) {
  const rec = createRecordingScene();
  const scene = new GridScene();
  Object.assign(gridInternals(scene), {
    add: rec.scene.add,
    world: { worldMap: worldData },
    map: { tileSize: 48 },
    currentMapResourceId: IRON_RIDGE_ID,
    mapOrigin: { x: 40, y: 20 },
    playerCol: 4,
    playerRow: 7,
    transitionMarkers: null,
    ...overrides,
  });
  return { scene, rec, I: gridInternals(scene) };
}

describe('Round109 GridScene wiring and lifecycle for gate markers', () => {
  it('rebuildTransitionMarkers creates the current map gates in world space below the daylight wash', () => {
    const { scene, rec } = seedGridScene();
    gridCall(scene, 'rebuildTransitionMarkers');
    const ironGates = worldData.transitions.filter((t) => t.from.mapResourceId === IRON_RIDGE_ID);
    expect(ironGates.length).toBeGreaterThan(0);
    expect(rec.containers).toHaveLength(1);
    expect(rec.containers[0]!.depthCalls).toEqual([TRANSITION_MARKER_DEPTH]);
    expect(TRANSITION_MARKER_DEPTH).toBeGreaterThan(0);
    expect(TRANSITION_MARKER_DEPTH).toBeLessThan(50); // below the daylight wash, above world layers
    expect(rec.scrollFactorValues.length).toBeGreaterThan(0);
    expect(rec.scrollFactorValues.every((value) => value === 1)).toBe(true); // scene add-hook pins 0
    expect(rec.texts.filter((t) => t.text !== 'E')).toHaveLength(ironGates.length);
    expect(rec.inputAccesses()).toBe(0); // E keeps the old interaction priority
    expect(rec.interactiveCalls()).toBe(0);
  });

  it('rebuild destroys the previous renderer first (world replacement / map switch semantics)', () => {
    const old = { update: vi.fn(), refreshFonts: vi.fn(), destroy: vi.fn() };
    const { scene, rec } = seedGridScene({ transitionMarkers: old });
    gridCall(scene, 'rebuildTransitionMarkers');
    expect(old.destroy).toHaveBeenCalledTimes(1);
    expect(rec.containers).toHaveLength(1); // the new generation is already up
  });

  it('updateTransitionMarkerProximity forwards the live player cell after a successful step', () => {
    const fake = { update: vi.fn(), refreshFonts: vi.fn(), destroy: vi.fn() };
    const { scene } = seedGridScene({ transitionMarkers: fake, playerCol: 4, playerRow: 8 });
    gridCall(scene, 'updateTransitionMarkerProximity');
    expect(fake.update).toHaveBeenCalledWith({ col: 4, row: 8 });
    gridCall(scene, 'destroyTransitionMarkers');
    expect(fake.destroy).toHaveBeenCalledTimes(1);
    expect(() => gridCall(scene, 'updateTransitionMarkerProximity')).not.toThrow();
    expect(fake.update).toHaveBeenCalledTimes(1); // stale reference dropped with the field
  });

  it('disposeWorldPanels tears the markers down and clears the field (replacement and shutdown share it)', () => {
    const fake = { update: vi.fn(), refreshFonts: vi.fn(), destroy: vi.fn() };
    const { scene, I } = seedGridScene({ transitionMarkers: fake });
    gridCall(scene, 'disposeWorldPanels');
    expect(fake.destroy).toHaveBeenCalledTimes(1);
    expect(I.transitionMarkers).toBeNull();
  });

  it('syncSettingsPresentation refreshes marker fonts live and never retains stale markers', () => {
    const fake = { update: vi.fn(), refreshFonts: vi.fn(), destroy: vi.fn() };
    const { scene } = seedGridScene({ transitionMarkers: fake });
    gridCall(scene, 'syncSettingsPresentation'); // HUD not built: inner relayouts early-return
    expect(fake.refreshFonts).toHaveBeenCalledTimes(1);
    gridCall(scene, 'destroyTransitionMarkers');
    expect(() => gridCall(scene, 'syncSettingsPresentation')).not.toThrow();
    expect(fake.refreshFonts).toHaveBeenCalledTimes(1); // the destroyed marker is not touched again
  });
});
