/**
 * Round 118: 四岛入场事件（风回/潮生/澜心/引航）覆盖全部实际入站关口。
 *
 * 复用 R116 的 arrivalTransitionIds 协议：事件在声明的任一关口过关时触
 * 发，旧步进格、id、once 与发现见闻保持不变；入场正文不再虚称单一入口
 * 的来向或时辰。以下用真实 world-map.json 走正式 parse/装配层断言：每
 * 个入站关口的落点可走且触发该岛入场事件、旧格仍触发、一次性完成、
 * 启动/等待/无关关口/错图不触发；潮生屿首差的接取见闻回填按真实任务
 * 文件核验；修复 helper 幂等、不动其它内容、拒绝失配引用；三个生成器
 * 源与运行时数据保持一致。不克隆展开巨型舆图。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { parseGridMap } from '../src/engine/grid-map';
import { parseWorldMap, selectTriggeredRegionEvents, type RegionEventContext, type WorldMapData } from '../src/engine/world-map';
import { acceptQuest, createQuestJournal, parseQuestSet } from '../src/engine/quest-system';
import { repairIsleArrivals } from '../scripts/lib/round118-isle-arrivals.mjs';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const authored = read('data/base/world/world-map.json') as Pick<WorldMapData, 'events' | 'transitions'> & { atlasArt: unknown };
const parsed = parseWorldMap(authored);
if (!parsed.ok) throw Error(parsed.errors.join('\n'));
const world = parsed.data;
const context: RegionEventContext = { knownKnowledgeNodeIds: new Set(), periodId: null, weatherId: null };

const ISLES = [
  { eventId: 'event.r84-arrival', mapResourceId: 'map.round-84-windward-isle', mapFile: 'data/base/maps/round-84-windward-isle.json', knowledgeId: 'place.r84-windward-isle', cell: { col: 2, row: 50 } },
  { eventId: 'event.r85-arrival', mapResourceId: 'map.round-85-tide-isle', mapFile: 'data/base/maps/round-85-tide-isle.json', knowledgeId: 'place.r85-tide-isle', cell: { col: 2, row: 50 } },
  { eventId: 'event.r97-lanxin-arrival', mapResourceId: 'map.round-97-lanxin-isle', mapFile: 'data/base/maps/round-97-lanxin-isle.json', knowledgeId: 'place.r97-lanxin-isle', cell: { col: 7, row: 40 } },
  { eventId: 'event.r97-pilot-arrival', mapResourceId: 'map.round-97-pilot-reef', mapFile: 'data/base/maps/round-97-pilot-reef.json', knowledgeId: 'place.r97-pilot-reef', cell: { col: 50, row: 92 } },
] as const;

/** The authored reality: every transition that actually lands on this isle. */
const inboundGates = (mapResourceId: string) =>
  world.transitions.filter(gate => gate.to.mapResourceId === mapResourceId).map(gate => gate.id);

describe('Round118 isle arrivals fire from every real inbound gate', () => {
  it('the authored file still passes the world schema after the repair', () => {
    const schema = new Ajv({ allErrors: true }).compile(read('data/schema/world-map.schema.json') as object);
    expect(schema(authored)).toBe(true);
  });

  for (const isle of ISLES) {
    it(`${isle.eventId}: declares exactly all inbound gates, each landing walkable and triggering`, () => {
      const event = world.events.find(row => row.id === isle.eventId)!;
      expect(event).toBeDefined();
      const gates = inboundGates(isle.mapResourceId);
      expect(gates.length).toBeGreaterThanOrEqual(2); // A multi-gate isle, by design.
      expect([...event.arrivalTransitionIds!].sort()).toEqual([...gates].sort());
      expect(event.once).toBe(true);
      expect(event.discoverKnowledgeNodeId).toBe(isle.knowledgeId);
      expect([event.col, event.row]).toEqual([isle.cell.col, isle.cell.row]);
      const map = parseGridMap(read(isle.mapFile));
      if (!map.ok) throw Error(map.errors.join('\n'));
      for (const gateId of gates) {
        const landing = world.transitions.find(gate => gate.id === gateId)!.to;
        expect(landing.mapResourceId).toBe(isle.mapResourceId);
        expect(map.map.canEnter(landing.col, landing.row)).toBe(true); // A real standing cell, not decorative water.
        expect(selectTriggeredRegionEvents(world.events, landing, new Set(), context, gateId).map(row => row.id)).toContain(isle.eventId);
      }
    });

    it(`${isle.eventId}: keeps the old step cell and never fires on startup, waits, wrong maps or unrelated gates`, () => {
      const event = world.events.find(row => row.id === isle.eventId)!;
      const gate = world.transitions.find(row => row.to.mapResourceId === isle.mapResourceId)!;
      // Historical step point still triggers on foot — including for a gate
      // whose landing IS that cell (the original east landing).
      expect(selectTriggeredRegionEvents(world.events, { mapResourceId: isle.mapResourceId, ...isle.cell }, new Set(), context).map(row => row.id)).toContain(isle.eventId);
      // Standing one cell beside it — startup, roaming or an unrelated gate
      // cause — never fires the event; a wrong map blocks a real gate id too.
      const beside = { mapResourceId: isle.mapResourceId, col: isle.cell.col + 1, row: isle.cell.row };
      expect(selectTriggeredRegionEvents(world.events, beside, new Set(), context).map(row => row.id)).not.toContain(isle.eventId);
      expect(selectTriggeredRegionEvents(world.events, beside, new Set(), context, 'gate.unrelated').map(row => row.id)).not.toContain(isle.eventId);
      expect(selectTriggeredRegionEvents(world.events, { ...beside, mapResourceId: 'map.other' }, new Set(), context, inboundGates(isle.mapResourceId)[0]!).map(row => row.id)).not.toContain(isle.eventId);
      // One-shot completion persists across every later arrival route.
      expect(selectTriggeredRegionEvents(world.events, gate.to, new Set([isle.eventId]), context, inboundGates(isle.mapResourceId)[0]!).map(row => row.id)).not.toContain(isle.eventId);
      expect(event.interaction).toBeUndefined();
    });

    it(`${isle.eventId}: arrival text no longer claims one landing's direction or time of day`, () => {
      const event = world.events.find(row => row.id === isle.eventId)!;
      const retired = ['午后', '正午', '渡船', '踏过最后一段', '自浪处露出', '自潮水中浮现', '西滩在', '靠上'];
      for (const claim of retired) expect(event.text).not.toContain(claim);
      // The isle's own durable facts stay readable from any landing.
      expect(event.text.length).toBeGreaterThan(20);
    });
  }

  it('backfills the tide-isle entry knowledge on later quest acceptance (real task file)', () => {
    const questParse = parseQuestSet(read('data/base/quests/round-85-tide-isle-quests.json'));
    if (!questParse.ok) throw Error(questParse.errors.join('\n'));
    const quest = questParse.set.quests.find(row => row.id === 'quest.r85-low-tide-channel')!;
    const quests = new Map([[quest.id, quest]]);
    const journal = createQuestJournal(quests);
    // The player arrived through a real gate earlier: knowledge already held.
    const accepted = acceptQuest(quests, journal, quest.id, new Map(), { knownKnowledgeNodeIds: new Set(['place.r85-tide-isle']) });
    expect(accepted.ok).toBe(true);
    const state = journal.states.get(quest.id)!;
    expect(quest.objectives.map(objective => state.objectiveCounts.get(objective.id))).toEqual([1, 0, 0]);
    expect(state.status).toBe('active'); // The reef survey and the report remain real work.
  });

  it('repairs the four rows idempotently without mutating input or unrelated world content', () => {
    const before = structuredClone(authored);
    const stripped = structuredClone(authored);
    for (const isle of ISLES) {
      const event = stripped.events.find(row => row.id === isle.eventId)!;
      delete event.arrivalTransitionIds;
      event.text = '旧文';
    }
    const repaired = repairIsleArrivals(stripped);
    expect(repaired).toEqual(before);
    expect(repairIsleArrivals(repaired)).toEqual(repaired);
    expect(stripped.events.find(row => row.id === ISLES[0]!.eventId)!.arrivalTransitionIds).toBeUndefined();
    expect(repaired.transitions).toEqual(stripped.transitions);
    expect(repaired.atlasArt).toEqual(stripped.atlasArt);
    const others = (data: typeof authored) => data.events.filter(row => !ISLES.some(isle => isle.eventId === row.id));
    expect(others(repaired)).toEqual(others(stripped));
  });

  it('refuses missing, duplicated or mismatched authoring references', () => {
    for (const cause of ['missing-event', 'duplicate-event', 'missing-gate', 'duplicate-replaces-gate', 'extra-inbound', 'wrong-map', 'interaction'] as const) {
      const bad = structuredClone(authored);
      const isle = ISLES[0]!;
      if (cause === 'missing-event') bad.events = bad.events.filter(row => row.id !== isle.eventId);
      if (cause === 'duplicate-event') bad.events.push(structuredClone(bad.events.find(row => row.id === isle.eventId)!));
      if (cause === 'missing-gate') bad.transitions = bad.transitions.filter(row => row.id !== 'gate.r84-east-coast-to-windward-isle');
      if (cause === 'duplicate-replaces-gate') { bad.transitions = bad.transitions.filter(row => row.id !== 'gate.r97-lanxin-to-windward'); bad.transitions.push(structuredClone(bad.transitions.find(row => row.id === 'gate.r84-east-coast-to-windward-isle')!)); }
      if (cause === 'extra-inbound') bad.transitions.push({ ...structuredClone(bad.transitions.find(row => row.id === 'gate.r84-east-coast-to-windward-isle')!), id: 'gate.extra' });
      if (cause === 'wrong-map') bad.transitions.find(row => row.id === 'gate.r84-east-coast-to-windward-isle')!.to.mapResourceId = 'map.other';
      if (cause === 'interaction') bad.events.find(row => row.id === isle.eventId)!.interaction = { prompt: 'changed' };
      expect(() => repairIsleArrivals(bad), cause).toThrow();
    }
  });

  it('keeps the R84/R85/R97 generation sources aligned with the repaired world', () => {
    const r84 = readFileSync('scripts/generate-round84-windward-isle.mjs', 'utf8');
    expect(r84).toContain("'风回岛在潮光里铺开：细沙滩脊一路向东坡收拢，坡上隐约立着一座白石灯标。'");
    expect(r84).toContain("arrivalTransitionIds: ['gate.r84-east-coast-to-windward-isle', 'gate.r85-tide-isle-to-windward-isle', 'gate.r97-lanxin-to-windward']");
    const r85 = readFileSync('scripts/generate-round85-tide-isle.mjs', 'utf8');
    expect(r85).toContain("'潮生屿在潮光里显出层层叠叠的礁脊，松林深处升起一缕炊烟，滩上水线层层退去又涨回。'");
    expect(r85).toContain("arrivalTransitionIds: ['gate.r85-windward-isle-to-tide-isle', 'gate.r94-south-to-tide', 'gate.r97-lanxin-to-tide']");
    const r97 = readFileSync('scripts/generate-round97-lanxin-isle.mjs', 'utf8');
    expect(r97).toContain("'澜心洲在潮线间铺开，三道岔脊一路向岛心收拢。湾里泊着候潮的旧船，桅灯未点，缆绳却都收得利落。'");
    expect(r97).toContain("arrivalTransitionIds: ['gate.r97-windward-to-lanxin', 'gate.r97-tide-to-lanxin', 'gate.r97-pilot-to-lanxin']");
    expect(r97).toContain("'引航礁在眼前铺开，黑礁连成一线，栈道自南向北直贯礁心。风里有一缕灯油味，航标就在礁脊某处亮着。'");
    expect(r97).toContain("arrivalTransitionIds: ['gate.r97-lanxin-to-pilot', 'gate.r97-east-to-pilot']");
  });
});
