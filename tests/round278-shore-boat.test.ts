/**
 * Round 278 — 付费同图驿舟（渡口西岸船埠 ⇄ 雾岬北岸）回归。
 *
 * 真实世界图/地图/对白资料 + 真实引擎：通用关口 fare/travelMinutes 预检与
 * 确认协议原样复用（R123 芦桥短渡同图先例）；两条驿舟门的坐标、地形、
 * 占用与 E 键优先冲突逐一实证；免费步行旧路与水尺见闻保留；银不足/取消
 * 原子拒绝；落点后仍须走到北口按 E 过铁嶂，绝不直达云岭。作者源幂等/
 * 漂移拒绝/沙盒重放；R275 指南链式不回退。合成引擎烟测，非真实玩家 QA。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({
  default: {
    Scene: class {}, Input: { Keyboard: { KeyCodes: {} } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
  },
}));
import { GridScene } from '../src/game/grid-scene';
import { GameClock, parseGameCalendar } from '../src/engine/game-calendar';
import { parseWorldMap, selectAdjacentTransition, type RegionTransitionData } from '../src/engine/world-map';
import { parseGridMap } from '../src/engine/grid-map';
import { quoteTransitionCost } from '../src/engine/transition-cost';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import {
  FERRY_ADVICE_AFTER, FERRY_ADVICE_BEFORE, R278_SHORE_BOAT_EXPECTATION, SHORE_BOAT_TRANSITIONS,
  repairDialoguesRaw, repairRegionGuideSourceRaw, repairWorldMapRaw,
} from '../scripts/lib/round278-shore-boat.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readRaw = (path: string): string => readFileSync(join(root, path), 'utf8');
const worldDoc = JSON.parse(readRaw('data/base/world/world-map.json'));
const mapParse = parseGridMap(JSON.parse(readRaw('data/base/maps/round-10-mist-ferry.json')));
if (!mapParse.ok) throw new Error('map fixture rejected');
const ferryMap = mapParse.map;

describe('Round278 驿舟数据形状与地形占用（真实资料实证）', () => {
  const parse = parseWorldMap(worldDoc);
  it('世界图解析通过，两条同图驿舟门复用 R123 通用协议形状', () => {
    expect(parse.ok).toBe(true);
    const gates = worldDoc.transitions.filter((gate: { id: string }) => R278_SHORE_BOAT_EXPECTATION.transitionIds.includes(gate.id));
    expect(gates).toHaveLength(2);
    for (const gate of gates) {
      expect(gate.fare).toBe(8);
      expect(gate.travelMinutes).toBe(20);
      expect(gate.from.mapResourceId).toBe('map.round-10-mist-ferry');
      expect(gate.to.mapResourceId).toBe(gate.from.mapResourceId);
      expect(typeof gate.name).toBe('string');
    }
    expect(gates.map((gate: { id: string }) => gate.id)).toEqual(R278_SHORE_BOAT_EXPECTATION.transitionIds);
  });

  it('source/landing 四点全部可走，不占用既有事件/地标/关口/挑战/NPC 格', () => {
    for (const point of [R278_SHORE_BOAT_EXPECTATION.source, R278_SHORE_BOAT_EXPECTATION.landing,
      R278_SHORE_BOAT_EXPECTATION.returnSource, R278_SHORE_BOAT_EXPECTATION.returnLanding]) {
      expect(ferryMap.canEnter(point.col, point.row), `${point.col},${point.row}`).toBe(true);
    }
    const occupied = (col: number, row: number) => {
      const hits: string[] = [];
      for (const event of worldDoc.events) {
        if (event.mapResourceId === 'map.round-10-mist-ferry' && event.col === col && event.row === row) hits.push('event:' + event.id);
      }
      for (const landmark of worldDoc.landmarks) {
        if (landmark.mapResourceId === 'map.round-10-mist-ferry' && landmark.col === col && landmark.row === row) hits.push('landmark:' + landmark.id);
      }
      for (const gate of worldDoc.transitions) {
        for (const [role, point] of [['from', gate.from], ['to', gate.to]] as const) {
          if (point.mapResourceId === 'map.round-10-mist-ferry' && point.col === col && point.row === row &&
              !R278_SHORE_BOAT_EXPECTATION.transitionIds.includes(gate.id)) hits.push(`gate-${role}:${gate.id}`);
        }
      }
      return hits;
    };
    for (const point of [R278_SHORE_BOAT_EXPECTATION.source, R278_SHORE_BOAT_EXPECTATION.landing,
      R278_SHORE_BOAT_EXPECTATION.returnSource, R278_SHORE_BOAT_EXPECTATION.returnLanding]) {
      expect(occupied(point.col, point.row), `${point.col},${point.row}`).toEqual([]);
    }
    // landing 不在水尺格上：乘舟本身不触发水尺见闻，想去仍要自己走一步。
    expect(R278_SHORE_BOAT_EXPECTATION.landing).not.toEqual({ col: 86, row: 15 });
    const gauge = worldDoc.events.find((event: { id: string }) => event.id === 'event.r56-north-water-gauge');
    expect(gauge.col === R278_SHORE_BOAT_EXPECTATION.landing.col && gauge.row === R278_SHORE_BOAT_EXPECTATION.landing.row).toBe(false);
  });

  it('source 邻格无 NPC（基础与日程位），E 键不会被相邻人物吃掉', () => {
    const npcCells = new Set<string>();
    for (const file of ['round-03-npcs', 'round-74-cloud-ridge-npcs', 'round-79-isles-npcs', 'round-82-east-coast-npcs', 'round-83-east-coast-npcs', 'round-84-windward-isle-npcs', 'round-85-tide-isle-npcs', 'round-86-tide-isle-npcs', 'round-87-southwest-isles-npcs', 'round-89-southwest-isles-npcs', 'round-91-cloud-north-terrace-npcs', 'round-92-north-pass-npcs', 'round-93-snow-pine-valley-npcs', 'round-94-frontiers-npcs', 'round-95-east-woodland-npcs', 'round-96-south-reef-npcs', 'round-97-lanxin-reef-npcs']) {
      const doc = JSON.parse(readRaw(`data/base/characters/${file}.json`)) as {
        npcs: { mapResourceId: string; position: { col: number; row: number }; schedule?: { position: { col: number; row: number } }[] }[];
      };
      for (const npc of doc.npcs) {
        if (npc.mapResourceId !== 'map.round-10-mist-ferry') continue;
        npcCells.add(`${npc.position.col},${npc.position.row}`);
        for (const entry of npc.schedule ?? []) npcCells.add(`${entry.position.col},${entry.position.row}`);
      }
    }
    for (const source of [R278_SHORE_BOAT_EXPECTATION.source, R278_SHORE_BOAT_EXPECTATION.returnSource]) {
      for (const [col, row] of [[source.col - 1, source.row], [source.col + 1, source.row], [source.col, source.row - 1], [source.col, source.row + 1]] as const) {
        if (!ferryMap.canEnter(col,row)) continue;
        expect(npcCells.has(`${col},${row}`), 'approach cell must be empty').toBe(false);
        for (const cell of npcCells) {
          const [npcCol,npcRow]=cell.split(',').map(Number);
          expect(Math.abs(npcCol!-col)+Math.abs(npcRow!-row), 'E approach must not neighbor an NPC').not.toBe(1);
        }
        expect(selectAdjacentTransition(worldDoc.transitions, 'map.round-10-mist-ferry', {col,row})?.id)
          .toBe(source === R278_SHORE_BOAT_EXPECTATION.source ? R278_SHORE_BOAT_EXPECTATION.transitionIds[0] : R278_SHORE_BOAT_EXPECTATION.transitionIds[1]);
      }
    }
    // The player approach must not be adjacent to Bai or another gate.
    expect(Math.abs(4 - R278_SHORE_BOAT_EXPECTATION.source.col) + Math.abs(4 - R278_SHORE_BOAT_EXPECTATION.source.row)).toBeGreaterThan(2);
  });

  it('免费步行旧路保留：R275 起点/北口/回程关原样，BFS 实测 94 步远贵于驿舟', () => {
    const ids = worldDoc.transitions.map((gate: { id: string }) => gate.id);
    expect(ids).toContain('gate.ferry-north-to-iron-ridge');
    expect(ids).toContain('gate.iron-ridge-to-ferry-north');
    const bfs = (from: { col: number; row: number }, to: { col: number; row: number }): number => {
      const key = (c: number, r: number) => `${c},${r}`;
      const seen = new Map([[key(from.col, from.row), 0]]);
      const queue: [number, number][] = [[from.col, from.row]];
      for (let index = 0; index < queue.length; index += 1) {
        const [col, row] = queue[index]!;
        const distance = seen.get(key(col, row))!;
        if (col === to.col && row === to.row) return distance;
        for (const [nextCol, nextRow] of [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]] as const) {
          const nextKey = key(nextCol, nextRow);
          if (seen.has(nextKey) || !ferryMap.inBounds(nextCol, nextRow) || ferryMap.isSolid(nextCol, nextRow)) continue;
          seen.set(nextKey, distance + 1);
          queue.push([nextCol, nextRow]);
        }
      }
      return -1;
    };
    // R275 免费路起点 (5,4)（含 (4,3) 挑战起点）到北口邻格 (88,15)。
    expect(bfs({ col: 5, row: 4 }, { col: 88, row: 15 })).toBe(94);
    expect(bfs({ col: 4, row: 3 }, { col: 88, row: 15 })).toBe(96);
    // 驿舟机械路程：落点 (87,15) 距北口邻格与水尺各 1 步（两关仍要自己过）。
    expect(bfs(R278_SHORE_BOAT_EXPECTATION.landing, { col: 88, row: 15 })).toBe(1);
    expect(bfs(R278_SHORE_BOAT_EXPECTATION.landing, { col: 86, row: 15 })).toBe(1);
  });

  it('通用报价：两条驿舟门 8 银/20 分钟，银不足给出缺口且不动账', () => {
    for (const gate of SHORE_BOAT_TRANSITIONS) {
      const quote = quoteTransitionCost(gate, 0, 10);
      expect(quote).toEqual({ minutes: 20, fare: 8, affordable: true, missingCurrency: 0 });
      const poor = quoteTransitionCost(gate, 0, 7);
      expect(poor.affordable).toBe(false);
      expect(poor.missingCurrency).toBe(1);
    }
  });

  it('真实场景事务：足银同图换乘扣8银/进20分钟/落在(87,15)；银不足零扣零时', () => {
    const calendar = parseGameCalendar(JSON.parse(readRaw('data/base/worldview/calendar.json')));
    if (!calendar.ok) throw new Error('calendar fixture rejected');
    const host = (currency: number) => {
      const gate: RegionTransitionData = structuredClone(SHORE_BOAT_TRANSITIONS[0]!) as unknown as RegionTransitionData;
      const clock = new GameClock(calendar.calendar, 0);
      const inventory = { currency };
      const destination = { canEnter: () => true };
      const scene = new GridScene();
      const notice = vi.fn();
      // arriveAtMap 属既有同图换乘渲染路径（R123 短渡线上在用）；在事务
      // 边界截断，预检/报价/扣费/时钟/占格拒绝全部走真实代码。
      const arrive = vi.fn();
      Object.assign(scene, {
        currentMapResourceId: 'map.round-10-mist-ferry', playerCol: 1, playerRow: 3,
        inventory, clock,
        world: {
          calendar: calendar.calendar,
          maps: new Map([['map.round-10-mist-ferry', destination]]),
          worldMap: { transitions: [gate] },
          assembly: { npcsByPeriod: new Map(), npcs: [], encounters: [] },
        },
        showRegionNotice: notice,
        arriveAtMap: arrive,
      });
      const travel = () => (scene as unknown as { switchRegion: (gate: RegionTransitionData) => void }).switchRegion(gate);
      return { scene, clock, inventory, notice, travel, arrive, gate };
    };
    const paid = host(10);
    paid.travel();
    // 只有一次全新验证通过的乘行才扣费：8 银在事务内落账，并以同图
    // arriveAtMap(87,15, 20分钟) 收尾（时钟由 arriveAtMap→advanceTime 统一
    // 推进，属 R123 同图短渡既有线上路径；其后仍须步行到北口按 E 过铁嶂）。
    expect(paid.inventory.currency).toBe(2);
    expect(paid.arrive).toHaveBeenCalledTimes(1);
    expect(paid.arrive).toHaveBeenCalledWith(
      'map.round-10-mist-ferry',
      R278_SHORE_BOAT_EXPECTATION.landing.col,
      R278_SHORE_BOAT_EXPECTATION.landing.row,
      20,
      expect.any(String),
      R278_SHORE_BOAT_EXPECTATION.transitionIds[0],
    );
    const broke = host(7);
    broke.travel();
    expect(broke.notice).toHaveBeenCalled();
    expect(broke.arrive).not.toHaveBeenCalled();
    expect(broke.inventory.currency).toBe(7);
    expect(broke.clock.elapsedMinutes).toBe(0);
    // 落点被 NPC 占住时同样整笔拒绝（通用占格预检）。
    const blockedNpc = host(10);
    (blockedNpc.scene as unknown as { world: { assembly: { npcsByPeriod: Map<string, unknown[]>; npcs: unknown[] } } })
      .world.assembly.npcsByPeriod.set('period.morning', [{
        record: { id: 'char.blocker', mapResourceId: 'map.round-10-mist-ferry' },
        col: R278_SHORE_BOAT_EXPECTATION.landing.col,
        row: R278_SHORE_BOAT_EXPECTATION.landing.row,
      }]);
    // 让到达时段命中被占时段：直接把 arrival 计算所用 clock 前置无必要——
    // npcsByPeriod 缺失时回退 npcs；两条都放同一个占位 NPC。
    (blockedNpc.scene as unknown as { world: { assembly: { npcs: unknown[] } } })
      .world.assembly.npcs.push({
        record: { id: 'char.blocker', mapResourceId: 'map.round-10-mist-ferry' },
        col: R278_SHORE_BOAT_EXPECTATION.landing.col,
        row: R278_SHORE_BOAT_EXPECTATION.landing.row,
      });
    blockedNpc.travel();
    expect(blockedNpc.notice).toHaveBeenCalledWith(expect.stringContaining('暂被挡住'));
    expect(blockedNpc.inventory.currency).toBe(10);
    expect(blockedNpc.clock.elapsedMinutes).toBe(0);
  });

  it('对白提示为纯信息：无条件入口、无效果、含票价/后程/步行/见闻取舍', () => {
    const parsed = parseDialogueSet(JSON.parse(readRaw('data/base/dialogues/round-30-conversations.json')));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const conversation = parsed.set.conversations.find((entry) => entry.id === 'dlg.bai-luzhou-ferry-master')!;
    const greet = conversation.nodes.find((node) => node.id === conversation.startNodeId)!;
    const option = greet.options!.find((entry) => entry.nextNodeId === R278_SHORE_BOAT_EXPECTATION.dialogueNodeId);
    expect(option).toBeDefined();
    expect(option!.conditions).toBeUndefined();
    expect(option!.effects).toBeUndefined();
    const node = conversation.nodes.find((entry) => entry.id === R278_SHORE_BOAT_EXPECTATION.dialogueNodeId)!;
    expect(node.options).toBeUndefined();
    expect(node.text).toContain('八银');
    expect(node.text).toContain('二十分钟');
    expect(node.text).toContain('铁嶂两关');
    expect(node.text).toContain('不要钱');
    expect(node.text).toContain('略过');
  });

  it('行旅指南等长改写且与 round106 canonical 源逐字同步', () => {
    const advice = (worldDoc.regionGuides as { mapResourceId: string; advice: string }[])
      .find((entry) => entry.mapResourceId === 'map.round-10-mist-ferry')!.advice;
    expect(advice).toBe(FERRY_ADVICE_AFTER);
    expect([...advice].length).toBeLessThanOrEqual(240);
    expect(advice).toContain(R278_SHORE_BOAT_EXPECTATION.adviceFragment);
    // 既有测试锚定的片段全部保留。
    for (const fragment of ['清点苍崖根×3', '生肌散另耗寒珠草×2、根×1和18银', '铁砂×3', '韧皮×2（56银）', '渡口无料铺', '西陲苦井', '没有直达传送']) {
      expect(advice).toContain(fragment);
    }
    expect(readRaw('scripts/lib/round106-region-content.mjs')).toContain(advice);
  });
});

describe('Round278 作者源：幂等/漂移拒绝/沙盒重放', () => {
  const safeRemove = (workspace: string) => {
    if (!workspace.startsWith(resolve(tmpdir()) + sep)) throw new Error('bad temp');
    rmSync(workspace, { recursive: true, force: true });
  };
  it('对当前数据二次修复零差异；漂移（改票价/改指南）拒绝', () => {
    const worldRaw = readRaw('data/base/world/world-map.json');
    expect(repairWorldMapRaw(worldRaw)).toBe(worldRaw);
    const driftedGate = JSON.parse(worldRaw);
    driftedGate.transitions.find((gate: { id: string }) => gate.id === R278_SHORE_BOAT_EXPECTATION.transitionIds[0]).fare = 5;
    expect(() => repairWorldMapRaw(JSON.stringify(driftedGate, null, 2) + '\n')).toThrow('请人工复核');
    const driftedAdvice = JSON.parse(worldRaw);
    driftedAdvice.regionGuides.find((guide: { mapResourceId: string }) => guide.mapResourceId === 'map.round-10-mist-ferry').advice = '被篡改的指南';
    expect(() => repairWorldMapRaw(JSON.stringify(driftedAdvice, null, 2) + '\n')).toThrow('请人工复核');
    const dialogueRaw = readRaw('data/base/dialogues/round-30-conversations.json');
    expect(repairDialoguesRaw(dialogueRaw)).toBe(dialogueRaw);
    const guideSourceRaw = readRaw('scripts/lib/round106-region-content.mjs');
    expect(repairRegionGuideSourceRaw(guideSourceRaw)).toBe(guideSourceRaw);
    expect(() => repairRegionGuideSourceRaw(guideSourceRaw.replace(FERRY_ADVICE_AFTER, '漂移'))).toThrow('请人工复核');
  });

  it('pristine 重建：去掉 r278 门并还原 R275 指南后，修复恰得当前数据', async () => {
    const pristine = JSON.parse(readRaw('data/base/world/world-map.json'));
    pristine.transitions = pristine.transitions.filter((gate: { id: string }) =>
      !R278_SHORE_BOAT_EXPECTATION.transitionIds.includes(gate.id));
    // 用 R275 作者的定稿串精确还原（见 round275-cloud-arrival.mjs guidePatches）。
    const { guidePatches } = await import('../scripts/lib/round275-cloud-arrival.mjs');
    const guide = pristine.regionGuides.find((entry: { mapResourceId: string }) => entry.mapResourceId === 'map.round-10-mist-ferry');
    guide.advice = guidePatches[0]!.after;
    const rebuilt = repairWorldMapRaw(JSON.stringify(pristine, null, 2) + '\n');
    expect(JSON.parse(rebuilt)).toEqual(JSON.parse(readRaw('data/base/world/world-map.json')));
  });

  it('apply-round278 CLI 沙盒：预检通过才写、二次零差异、篡改拒绝不落盘', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'wuxia-r278-cli-'));
    try {
      mkdirSync(join(workspace, 'scripts/lib'), { recursive: true });
      mkdirSync(join(workspace, 'data/base/world'), { recursive: true });
      mkdirSync(join(workspace, 'data/base/dialogues'), { recursive: true });
      for (const file of ['apply-round278.mjs', 'lib/round278-shore-boat.mjs']) {
        cpSync(resolve(root, 'scripts', file), join(workspace, 'scripts', file));
      }
      cpSync(resolve(root, 'data/base/world/world-map.json'), join(workspace, 'data/base/world/world-map.json'));
      cpSync(resolve(root, 'data/base/dialogues/round-30-conversations.json'), join(workspace, 'data/base/dialogues/round-30-conversations.json'));
      cpSync(resolve(root, 'scripts/lib/round106-region-content.mjs'), join(workspace, 'scripts/lib/round106-region-content.mjs'));
      // pristine：反向去掉 r278。
      const pristine = JSON.parse(readFileSync(join(workspace, 'data/base/world/world-map.json'), 'utf8'));
      pristine.transitions = pristine.transitions.filter((gate: { id: string }) =>
        !R278_SHORE_BOAT_EXPECTATION.transitionIds.includes(gate.id));
      const r275Guide = pristine.regionGuides.find((guide: { mapResourceId: string }) => guide.mapResourceId === 'map.round-10-mist-ferry');
      r275Guide.advice = FERRY_ADVICE_BEFORE;
      writeFileSync(join(workspace, 'data/base/world/world-map.json'), JSON.stringify(pristine, null, 2) + '\n');
      const dialogueDoc = JSON.parse(readFileSync(join(workspace, 'data/base/dialogues/round-30-conversations.json'), 'utf8'));
      const conversation = dialogueDoc.conversations.find((entry: { id: string }) => entry.id === 'dlg.bai-luzhou-ferry-master');
      const greet = conversation.nodes.find((node: { id: string }) => node.id === conversation.startNodeId);
      const infoText = '渡口的驿舟怎么算？我想省一段北岸的路。';
      greet.options = greet.options.filter((option: { text: string }) => option.text !== infoText);
      conversation.nodes = conversation.nodes.filter((node: { id: string }) => node.id !== R278_SHORE_BOAT_EXPECTATION.dialogueNodeId);
      writeFileSync(join(workspace, 'data/base/dialogues/round-30-conversations.json'), JSON.stringify(dialogueDoc, null, 2));
      const run = () => execFileSync(process.execPath, [join(workspace, 'scripts/apply-round278.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
      expect(() => run()).not.toThrow();
      expect(readFileSync(join(workspace, 'data/base/world/world-map.json'), 'utf8')).toBe(readRaw('data/base/world/world-map.json'));
      const saved = readFileSync(join(workspace, 'data/base/dialogues/round-30-conversations.json'), 'utf8');
      run();
      expect(readFileSync(join(workspace, 'data/base/dialogues/round-30-conversations.json'), 'utf8')).toBe(saved);
      const tamperedPath = join(workspace, 'data/base/world/world-map.json');
      const before = readFileSync(tamperedPath, 'utf8');
      const tampered = JSON.parse(before);
      tampered.transitions.find((gate: { id: string }) => gate.id === R278_SHORE_BOAT_EXPECTATION.transitionIds[1]).name = '被篡改';
      writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2) + '\n');
      expect(() => run()).toThrow();
      expect(readFileSync(tamperedPath, 'utf8')).toBe(JSON.stringify(tampered, null, 2) + '\n');
    } finally {
      safeRemove(workspace);
    }
  });

  it('R275 作者链式兼容：对含 r278 指南的世界重放不再拒绝也不回退', async () => {
    const { guidePatches, repairWorldRaw } = await import('../scripts/lib/round275-cloud-arrival.mjs');
    const current = readRaw('data/base/world/world-map.json');
    const replayed = repairWorldRaw(current);
    expect(JSON.parse(replayed).regionGuides.find((guide: { mapResourceId: string }) => guide.mapResourceId === 'map.round-10-mist-ferry').advice)
      .toBe(FERRY_ADVICE_AFTER);
    // 链式声明的 later 串与数据一致。
    expect((guidePatches[0] as {later?:string[]}).later!).toContain(FERRY_ADVICE_AFTER);
  });
});

describe('Round278 primary author boundaries',()=>{
  it('rejects duplicate guide tokens in both canonical author chains', async()=>{
    const source=readRaw('scripts/lib/round106-region-content.mjs');
    expect(()=>repairRegionGuideSourceRaw(source+'\n'+JSON.stringify(FERRY_ADVICE_AFTER))).toThrow();
    const {repairRegionSourceRaw}=await import('../scripts/lib/round275-cloud-arrival.mjs');
    expect(()=>repairRegionSourceRaw(source+'\n'+String.fromCharCode(39)+FERRY_ADVICE_AFTER+String.fromCharCode(39))).toThrow('重复');
  });
  it('preserves CRLF while applying a pristine world patch',()=>{
    const doc=structuredClone(worldDoc);
    doc.transitions=doc.transitions.filter((g:{id:string})=>!R278_SHORE_BOAT_EXPECTATION.transitionIds.includes(g.id));
    doc.regionGuides.find((g:{mapResourceId:string})=>g.mapResourceId===R278_SHORE_BOAT_EXPECTATION.mapResourceId).advice=FERRY_ADVICE_BEFORE;
    const raw=(JSON.stringify(doc,null,2)+'\n').replace(/\n/g,'\r\n');
    const result=repairWorldMapRaw(raw);
    expect(result.replace(/\r\n/g,'')).not.toContain('\n');
    expect(repairWorldMapRaw(result)).toBe(result);
  });
});

it('Round278 retains every prior transition byte value and changes only the paid pair',()=>{
  const baseline=JSON.parse(execFileSync('git',['show','270ad8d:data/base/world/world-map.json'],{encoding:'utf8',maxBuffer:32*1024*1024}));
  const current=worldDoc.transitions.filter((g:{id:string})=>!R278_SHORE_BOAT_EXPECTATION.transitionIds.includes(g.id));
  expect(current).toEqual(baseline.transitions);
  expect(worldDoc.transitions.filter((g:{id:string})=>g.id.startsWith('gate.r278-'))).toEqual(SHORE_BOAT_TRANSITIONS);
});

it('Round278 rejects mixed exact and drifted duplicate information nodes',()=>{
  const doc=JSON.parse(readRaw('data/base/dialogues/round-30-conversations.json'));
  const conversation=doc.conversations.find((c:{id:string})=>c.id==='dlg.bai-luzhou-ferry-master');
  const node=conversation.nodes.find((n:{id:string})=>n.id===R278_SHORE_BOAT_EXPECTATION.dialogueNodeId);
  conversation.nodes.push({...node,text:'drifted duplicate'});
  expect(()=>repairDialoguesRaw(JSON.stringify(doc))).toThrow('变化');
});
it('Round278 revalidates external endpoint clashes even after an applied patch',()=>{
  const doc=structuredClone(worldDoc);
  const own=SHORE_BOAT_TRANSITIONS[0]!;
  doc.transitions.push({...own,id:'gate.external-clash'});
  expect(()=>repairWorldMapRaw(JSON.stringify(doc))).toThrow('其他关口');
});
