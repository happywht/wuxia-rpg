/**
 * Round 09 shared world loading: the manifest-driven load plus the optional
 * content assembly that used to live privately inside GridScene.
 *
 * Extracted so the main menu and the gameplay scene consume the *same*
 * pipeline — the menu needs the character templates for creation and the
 * same degraded-error behaviour, and duplicating the assembly would drift.
 * Every convention carries over unchanged: the map (manifest/schemas) and,
 * since Round 14, the game calendar, and since Round 15 the climate are
 * required and fatal; NPC/dialogue/progression/battle/item/shop/quest
 * content is optional and degrades per smallest unit with warnings (see
 * docs/ARCHITECTURE.md §2). No world content lives here — ids and text
 * come from `data/` only.
 */

import {
  type Diagnostic,
  type DataLoaderEventMap,
  type LoadedResource,
  loadGameData,
} from '../engine/data-loader';
import { EventBus } from '../engine/event-bus';
import { GridMap, parseGridMap } from '../engine/grid-map';
import {
  assembleKnowledgeGraph,
  parseKnowledgeEdgeSet,
  parseKnowledgeNodeSet,
  type KnowledgeGraph,
  type KnowledgeNodeSetData,
  type KnowledgeEdgeSetData,
} from '../engine/knowledge-graph';
import {
  assembleWorldMap,
  parseWorldMap,
  type WorldMapAssembly,
} from '../engine/world-map';
import {
  type DialogueData,
  indexConversations,
  parseDialogueSet,
  validateConversation,
} from '../engine/dialogue-graph';
import { assembleDialogueReferences } from '../engine/dialogue-runtime';
import { type GameCalendarData, parseGameCalendar } from '../engine/game-calendar';
import { type ClimateData, parseClimate } from '../engine/climate-system';
import {
  type CharacterProfileData,
  type FactionData,
  indexFactions,
  indexMartialArts,
  indexProfiles,
  type MartialArtData,
  parseCharacterProfileSet,
  parseFactionSet,
  parseMartialArtSet,
} from '../engine/character-progression';
import {
  assembleNpcPlacements,
  type NpcSetData,
  parseNpcSet,
  type PlacedNpc,
} from '../engine/npc-placement';
import { compileNpcSchedules } from '../engine/npc-schedule';
import {
  assembleBattleEncounters,
  type BattleEncounterSetData,
  parseBattleEncounterSet,
  type PlacedEncounter,
} from '../engine/turn-based-combat';
import {
  type AssembledShop,
  type ItemRecordData,
  type ShopSetData,
  assembleShops,
  indexItems,
  parseItemSet,
  parseShopSet,
} from '../engine/item-system';
import {
  type QuestData,
  type QuestSetData,
  assembleQuests,
  parseQuestSet,
} from '../engine/quest-system';

/** Stable resource ids from data/base/manifest.json — never hard-coded URLs. */
export const WORLD_MAP_RESOURCE_ID = 'world.atlas';
const CALENDAR_RESOURCE_ID = 'calendar.base';
const CLIMATE_RESOURCE_ID = 'climate.base';
const NPC_RESOURCE_ID = 'npc.round-03-set';
const DIALOGUE_RESOURCE_ID = 'dialogue.round-03-set';
const CHARACTER_PROFILE_RESOURCE_ID = 'character-profile.round-04-set';
const FACTION_RESOURCE_ID = 'faction.round-04-set';
const MARTIAL_ART_RESOURCE_ID = 'martial-art.round-04-set';
const ENCOUNTER_RESOURCE_ID = 'encounter.round-05-set';
const ITEM_RESOURCE_ID = 'item.round-06-set';
const SHOP_RESOURCE_ID = 'shop.round-06-set';
const QUEST_RESOURCE_ID = 'quest.round-07-set';
const KNOWLEDGE_NODE_RESOURCE_ID = 'knowledge.round-11-nodes';
const KNOWLEDGE_EDGE_RESOURCE_ID = 'knowledge.round-11-edges';

/** Optional resources (NPC/dialogue/progression/battle/trade content) the world can lose without dying. */
const OPTIONAL_RESOURCE_IDS = new Set([
  NPC_RESOURCE_ID,
  DIALOGUE_RESOURCE_ID,
  CHARACTER_PROFILE_RESOURCE_ID,
  FACTION_RESOURCE_ID,
  MARTIAL_ART_RESOURCE_ID,
  ENCOUNTER_RESOURCE_ID,
  ITEM_RESOURCE_ID,
  SHOP_RESOURCE_ID,
  QUEST_RESOURCE_ID,
  KNOWLEDGE_NODE_RESOURCE_ID,
  KNOWLEDGE_EDGE_RESOURCE_ID,
]);

/** Optional-content schemas; schema-level failures carry no resource id, so match by origin. */
const OPTIONAL_SCHEMA_ORIGINS = new Set([
  'schema:npc-set',
  'schema:dialogue-set',
  'schema:character-profiles',
  'schema:faction-set',
  'schema:martial-arts-set',
  'schema:battle-encounters',
  'schema:items-set',
  'schema:shops-set',
  'schema:quest-set',
  'schema:knowledge-nodes',
  'schema:knowledge-edges',
]);

function isOptionalContentDiagnostic(diagnostic: Diagnostic): boolean {
  return (
    (diagnostic.resource !== undefined && OPTIONAL_RESOURCE_IDS.has(diagnostic.resource)) ||
    OPTIONAL_SCHEMA_ORIGINS.has(diagnostic.origin)
  );
}

/** Flattens loader diagnostics into readable panel lines, one block each. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    const scope =
      diagnostic.resource === undefined
        ? diagnostic.origin
        : `${diagnostic.origin}（资源 ${diagnostic.resource}）`;
    const details = diagnostic.details.length > 0 ? `\n${diagnostic.details.join('\n')}` : '';
    return `${scope}：${diagnostic.message}${details}`;
  });
}

/** Validated Round 04 progression datasets. */
export interface ProgressionAssembly {
  profiles: ReadonlyMap<string, CharacterProfileData>;
  factions: ReadonlyMap<string, FactionData>;
  martialArts: ReadonlyMap<string, MartialArtData>;
}

/** Everything the playable world needs after optional-content assembly. */
export interface WorldAssembly {
  npcs: PlacedNpc[];
  /** Time-of-day NPC placements compiled against the loaded calendar. */
  npcsByPeriod: ReadonlyMap<string, readonly PlacedNpc[]>;
  dialogues: ReadonlyMap<string, DialogueData>;
  progression: ProgressionAssembly;
  encounters: PlacedEncounter[];
  items: ReadonlyMap<string, ItemRecordData>;
  shops: ReadonlyMap<string, AssembledShop>;
  quests: ReadonlyMap<string, QuestData>;
  warnings: Diagnostic[];
}

/** Successful load: the required map plus the assembled optional content. */
export interface LoadedWorld {
  /** Default starting map retained for menu/template compatibility. */
  map: GridMap;
  mapResourceId: string;
  maps: ReadonlyMap<string, GridMap>;
  worldMap: WorldMapAssembly;
  /** Validated game calendar (required resource; time rules derive from it). */
  calendar: GameCalendarData;
  /** Validated climate (required resource; season/weather rules derive from it). */
  climate: ClimateData;
  knowledgeGraph: KnowledgeGraph;
  assembly: WorldAssembly;
  optionalWarnings: readonly Diagnostic[];
  modWarnings: readonly Diagnostic[];
}

/** Failed load: readable title/lines for the error panels both scenes show. */
export interface WorldLoadFailure {
  title: string;
  lines: string[];
}

export type WorldLoadOutcome = { ok: true; world: LoadedWorld } | ({ ok: false } & WorldLoadFailure);

/**
 * Runs the full manifest load and optional-content assembly exactly as the
 * gameplay scene has done since Round 02. Resolves with the loaded world or
 * a readable failure (never throws); diagnostics mirror to the console the
 * same way as before.
 */
export async function loadWorldData(): Promise<WorldLoadOutcome> {
  // Data events mirror the structured diagnostics in the devtools console;
  // the readable error panel is what players actually see.
  const bus = new EventBus<DataLoaderEventMap>();
  const offLoaded = bus.on('data:resource-loaded', (event) => {
    const origin = event.source.kind === 'base' ? 'base' : `mod:${event.source.modId}`;
    console.info(`[data] 资源 ${event.id} 加载自 ${origin}`);
  });
  const offError = bus.on('data:resource-error', (event) => {
    console.warn(`[data] ${event.origin}: ${event.message}`, event.details);
  });

  try {
    const result = await loadGameData({
      baseUrl: import.meta.env.BASE_URL,
      bus,
      semanticValidators: {
        'grid-map': (value) => {
          const parsed = parseGridMap(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'world-map': (value) => {
          const parsed = parseWorldMap(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'game-calendar': (value) => {
          const parsed = parseGameCalendar(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'climate': (value) => {
          // Intra-document semantics only (unique ids, weight resolution);
          // the calendar partition check runs below with both resources.
          const parsed = parseClimate(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'character-profiles': (value) => {
          const parsed = parseCharacterProfileSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'faction-set': (value) => {
          const parsed = parseFactionSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'martial-arts-set': (value) => {
          const parsed = parseMartialArtSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'battle-encounters': (value) => {
          const parsed = parseBattleEncounterSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'items-set': (value) => {
          const parsed = parseItemSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'shops-set': (value) => {
          const parsed = parseShopSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'quest-set': (value) => {
          const parsed = parseQuestSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
      },
    });

    // Optional NPC/dialogue problems degrade to warnings; everything else
    // (manifest, schemas, the required map) stays fatal like Round 02.
    const blocking = result.diagnostics.filter(
      (diagnostic) =>
        (diagnostic.severity ?? 'error') === 'error' && !isOptionalContentDiagnostic(diagnostic),
    );
    if (blocking.length > 0) {
      return { ok: false, title: '资料加载诊断', lines: formatDiagnostics(blocking) };
    }
    const modWarnings = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'warning',
    );
    const optionalWarnings = result.diagnostics.filter(
      (diagnostic) =>
        (diagnostic.severity ?? 'error') === 'error' && isOptionalContentDiagnostic(diagnostic),
    );

    const worldResource = result.resources.get(WORLD_MAP_RESOURCE_ID);
    if (worldResource === undefined) {
      return {
        ok: false,
        title: '世界地图资料缺失',
        lines: [`清单中没有 id 为 "${WORLD_MAP_RESOURCE_ID}" 的资源，请检查 data/base/manifest.json。`],
      };
    }

    // The calendar is required world data like the map: a missing resource
    // or an invalid document refuses the load with readable lines instead of
    // silently falling back to a hard-coded calendar that data cannot see.
    const calendarResource = result.resources.get(CALENDAR_RESOURCE_ID);
    if (calendarResource === undefined) {
      return {
        ok: false,
        title: '游戏历法资料缺失',
        lines: [`清单中没有 id 为 "${CALENDAR_RESOURCE_ID}" 的资源，请检查 data/base/manifest.json。`],
      };
    }
    const parsedCalendar = parseGameCalendar(calendarResource.value);
    if (!parsedCalendar.ok) {
      return {
        ok: false,
        title: `历法资源 "${CALENDAR_RESOURCE_ID}" 语义校验未通过`,
        lines: parsedCalendar.errors,
      };
    }

    // The climate is required world data like the calendar: a missing
    // resource or an invalid document refuses the load with readable lines.
    // The parse hands over the calendar so the season↔month partition is
    // verified across resources — no silent fallback climate exists.
    const climateResource = result.resources.get(CLIMATE_RESOURCE_ID);
    if (climateResource === undefined) {
      return {
        ok: false,
        title: '江湖气候资料缺失',
        lines: [`清单中没有 id 为 "${CLIMATE_RESOURCE_ID}" 的资源，请检查 data/base/manifest.json。`],
      };
    }
    const parsedClimate = parseClimate(climateResource.value, parsedCalendar.calendar);
    if (!parsedClimate.ok) {
      return {
        ok: false,
        title: `气候资源 "${CLIMATE_RESOURCE_ID}" 语义校验未通过`,
        lines: parsedClimate.errors,
      };
    }

    const parsedWorldMap = parseWorldMap(worldResource.value);
    if (!parsedWorldMap.ok) {
      return { ok: false, title: '世界地图数据结构不合规', lines: parsedWorldMap.errors };
    }

    const maps = new Map<string, GridMap>();
    for (const resource of result.resources.values()) {
      if (resource.schema !== 'grid-map') continue;
      const parsedMap = parseGridMap(resource.value);
      if (!parsedMap.ok) {
        return {
          ok: false,
          title: `地图资源 "${resource.id}" 数据结构不合规`,
          lines: parsedMap.errors,
        };
      }
      if (parsedMap.map.data.id !== resource.id) {
        return {
          ok: false,
          title: `地图资源 "${resource.id}" 标识不匹配`,
          lines: [`文件内 id 为 "${parsedMap.map.data.id}"，必须与 manifest 资源 id 相同。`],
        };
      }
      maps.set(resource.id, parsedMap.map);
    }
    const worldMapResult = assembleWorldMap(parsedWorldMap.data, maps);
    if ('ok' in worldMapResult && !worldMapResult.ok) {
      return { ok: false, title: '世界地图引用无效', lines: worldMapResult.errors };
    }
    const worldMap = worldMapResult as WorldMapAssembly;
    const startingMapResourceId = parsedWorldMap.data.startingMapResourceId;
    const startingMap = maps.get(startingMapResourceId);
    if (startingMap === undefined) {
      return { ok: false, title: '起始地图不可用', lines: [`地图资源 "${startingMapResourceId}" 未能加载。`] };
    }

    const knowledgeResult = assembleKnowledgeGraphContent(result.resources);
    const calendarPeriodIds = new Set(parsedCalendar.calendar.periods.map((period) => period.id));
    const assembly = assembleOptionalContent(
      result.resources,
      maps,
      new Set(knowledgeResult.graph.nodes.keys()),
      calendarPeriodIds,
      parsedCalendar.calendar.periods,
    );
    assembly.warnings.push(...knowledgeResult.warnings);
    const overlapWarnings: string[] = [];
    const overlapsWorldOccupant = (mapResourceId: string, col: number, row: number): boolean =>
      assembly.npcs.some((npc) => npc.record.mapResourceId === mapResourceId && npc.col === col && npc.row === row) ||
      assembly.encounters.some((encounter) => encounter.record.mapResourceId === mapResourceId &&
        encounter.col === col && encounter.row === row);
    const transitions = worldMap.transitions.filter((transition) => {
      const endpoints = [transition.from, transition.to];
      if (endpoints.some((endpoint) => overlapsWorldOccupant(
        endpoint.mapResourceId, endpoint.col, endpoint.row,
      ))) {
        overlapWarnings.push(`关口 "${transition.id}" 与 NPC 或战斗遭遇占格冲突，已禁用`);
        return false;
      }
      return true;
    });
    const events = worldMap.events.filter((event) => {
      if (overlapsWorldOccupant(event.mapResourceId, event.col, event.row)) {
        overlapWarnings.push(`区域事件 "${event.id}" 与 NPC 或战斗遭遇占格冲突，已禁用`);
        return false;
      }
      return true;
    });
    const resolvedWorldMap: WorldMapAssembly = {
      ...worldMap,
      transitions,
      events,
      warnings: [...worldMap.warnings, ...overlapWarnings],
    };
    for (const warning of resolvedWorldMap.warnings) {
      assembly.warnings.push({
        resource: WORLD_MAP_RESOURCE_ID,
        origin: 'world-map-assembly',
        severity: 'warning',
        message: warning,
        details: [],
      });
    }
    return {
      ok: true,
      world: {
        map: startingMap,
        mapResourceId: startingMapResourceId,
        maps,
        worldMap: resolvedWorldMap,
        calendar: parsedCalendar.calendar,
        climate: parsedClimate.climate,
        knowledgeGraph: knowledgeResult.graph,
        assembly,
        optionalWarnings: [...optionalWarnings, ...assembly.warnings],
        modWarnings,
      },
    };
  } catch (error) {
    // loadGameData converts its own failures to diagnostics; this guard
    // only catches the truly unexpected (e.g. a programming error).
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, title: '地图数据加载失败', lines: [reason] };
  } finally {
    offLoaded();
    offError();
  }
}

/**
 * Loads graph resources as optional content. A missing/invalid half leaves
 * the surviving nodes or edges available where meaningful; invalid graph
 * rows are isolated by the Phaser-free parser/assembler.
 */
function assembleKnowledgeGraphContent(
  resources: ReadonlyMap<string, LoadedResource>,
): { graph: KnowledgeGraph; warnings: Diagnostic[] } {
  const warnings: Diagnostic[] = [];
  let nodeSet: KnowledgeNodeSetData = { nodes: [] };
  let edgeSet: KnowledgeEdgeSetData = { edges: [] };
  const nodeResource = resources.get(KNOWLEDGE_NODE_RESOURCE_ID);
  if (nodeResource !== undefined) {
    const parsed = parseKnowledgeNodeSet(nodeResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: KNOWLEDGE_NODE_RESOURCE_ID,
        origin: 'knowledge-assembly',
        severity: 'warning',
        message: '知识节点资料结构不合规，本轮禁用节点集',
        details: parsed.errors,
      });
    } else {
      nodeSet = parsed.data;
      for (const message of parsed.warnings) warnings.push({
        resource: KNOWLEDGE_NODE_RESOURCE_ID,
        origin: 'knowledge-assembly',
        severity: 'warning',
        message,
        details: [],
      });
    }
  }
  const edgeResource = resources.get(KNOWLEDGE_EDGE_RESOURCE_ID);
  if (edgeResource !== undefined) {
    const parsed = parseKnowledgeEdgeSet(edgeResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: KNOWLEDGE_EDGE_RESOURCE_ID,
        origin: 'knowledge-assembly',
        severity: 'warning',
        message: '知识关系资料结构不合规，本轮禁用关系集',
        details: parsed.errors,
      });
    } else {
      edgeSet = parsed.data;
      for (const message of parsed.warnings) warnings.push({
        resource: KNOWLEDGE_EDGE_RESOURCE_ID,
        origin: 'knowledge-assembly',
        severity: 'warning',
        message,
        details: [],
      });
    }
  }
  const graph = assembleKnowledgeGraph(nodeSet, edgeSet);
  for (const message of graph.warnings) warnings.push({
    resource: KNOWLEDGE_EDGE_RESOURCE_ID,
    origin: 'knowledge-assembly',
    severity: 'warning',
    message,
    details: [],
  });
  return { graph, warnings };
}

/**
 * Assembles optional NPC/dialogue content. Every failure disables the
 * smallest possible unit — one conversation or one NPC — and becomes a
 * warning instead of killing the scene. Missing (unregistered) resources
 * are legitimate: the world then has no optional interactions or quests.
 */
function assembleOptionalContent(
  resources: ReadonlyMap<string, LoadedResource>,
  maps: ReadonlyMap<string, GridMap>,
  knowledgeNodeIds: ReadonlySet<string>,
  timeOfDayPeriodIds: ReadonlySet<string>,
  calendarPeriods: GameCalendarData['periods'],
): WorldAssembly {
  const warnings: Diagnostic[] = [];

  // Conversations first: NPC validation resolves against the valid set.
  let dialogues = new Map<string, DialogueData>();
  const dialogueResource = resources.get(DIALOGUE_RESOURCE_ID);
  if (dialogueResource !== undefined) {
    const parsed = parseDialogueSet(dialogueResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: DIALOGUE_RESOURCE_ID,
        origin: 'dialogue-assembly',
        severity: 'warning',
        message: '对话资料结构不合规，本轮禁用全部对话',
        details: parsed.errors,
      });
    } else {
      for (const warning of parsed.warnings) {
        warnings.push({
          resource: DIALOGUE_RESOURCE_ID,
          origin: 'dialogue-assembly',
          severity: 'warning',
          message: warning,
          details: [],
        });
      }
      const index = indexConversations(parsed.set);
      for (const id of index.duplicateIds) {
        warnings.push({
          resource: DIALOGUE_RESOURCE_ID,
          origin: 'dialogue-assembly',
          severity: 'warning',
          message: `对话 id "${id}" 重复，保留先声明者`,
          details: [],
        });
      }
      for (const [id, conversation] of index.byId) {
        const problems = validateConversation(conversation);
        if (problems.length > 0) {
          warnings.push({
            resource: DIALOGUE_RESOURCE_ID,
            origin: 'dialogue-assembly',
            severity: 'warning',
            message: `对话 "${id}" 已禁用：${problems.join('；')}`,
            details: [],
          });
        } else {
          dialogues.set(id, conversation);
        }
      }
    }
  }

  let npcSet: NpcSetData | null = null;
  const npcResource = resources.get(NPC_RESOURCE_ID);
  if (npcResource !== undefined) {
    const parsed = parseNpcSet(npcResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: NPC_RESOURCE_ID,
        origin: 'npc-assembly',
        severity: 'warning',
        message: 'NPC 资料结构不合规，本轮禁用全部人物',
        details: parsed.errors,
      });
    } else {
      npcSet = parsed.set;
    }
  }

  const placements = [...maps.keys()].map((currentMapResourceId) =>
    assembleNpcPlacements({
      npcSet,
      knownResourceIds: new Set(resources.keys()),
      maps,
      currentMapResourceId,
      dialogueIds: new Set(dialogues.keys()),
    }),
  );
  const allNpcs: PlacedNpc[] = [];
  const globallySeenNpcIds = new Set<string>();
  for (const placement of placements) {
    for (const npc of placement.npcs) {
      if (globallySeenNpcIds.has(npc.record.id)) {
        warnings.push({
          resource: NPC_RESOURCE_ID,
          origin: 'npc-assembly',
          severity: 'warning',
          message: `NPC "${npc.record.id}" 在多张地图重复登记，保留世界图首条记录`,
          details: [],
        });
      } else {
        globallySeenNpcIds.add(npc.record.id);
        allNpcs.push(npc);
      }
    }
  }
  for (const message of new Set(placements.flatMap((placement) => placement.warnings))) {
    warnings.push({
      resource: NPC_RESOURCE_ID,
      origin: 'npc-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  const progressionAssembled = assembleProgressionContent(resources);
  warnings.push(...progressionAssembled.warnings);

  // Items first, then shops: shop stock references resolve against the
  // indexed items, and NPC shop references resolve against assembled shops.
  const itemAssembly = assembleItemContent(resources);
  warnings.push(...itemAssembly.warnings);

  const shopAssembly = assembleShops({
    shopSet: itemAssembly.shopSet,
    placedNpcIds: new Set(allNpcs.map((npc) => npc.record.id)),
    items: itemAssembly.items,
  });
  for (const message of shopAssembly.warnings) {
    warnings.push({
      resource: SHOP_RESOURCE_ID,
      origin: 'shop-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  // A shopkeeper NPC whose shopId fails to resolve falls back to its
  // dialogue — worth a warning so authors can fix the reference.
  for (const npc of allNpcs) {
    if (npc.record.shopId !== null && !shopAssembly.shops.has(npc.record.shopId)) {
      warnings.push({
        resource: NPC_RESOURCE_ID,
        origin: 'shop-assembly',
        severity: 'warning',
        message: `NPC "${npc.record.id}"（${npc.record.name}）引用的商店 "${npc.record.shopId}" 不存在或已因校验失败被禁用，交互回落到对话`,
        details: [],
      });
    }
  }

  // Encounters resolve against the map, placed NPCs, profiles and arts.
  let encounters: PlacedEncounter[] = [];
  let encounterSet: BattleEncounterSetData | null = null;
  const encounterResource = resources.get(ENCOUNTER_RESOURCE_ID);
  if (encounterResource !== undefined) {
    const parsed = parseBattleEncounterSet(encounterResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: ENCOUNTER_RESOURCE_ID,
        origin: 'encounter-assembly',
        severity: 'warning',
        message: '遭遇资料结构不合规，本轮禁用全部战斗遭遇',
        details: parsed.errors,
      });
    } else {
      encounterSet = parsed.set;
    }
  }
  const encounterPlacements = [...maps.keys()].map((currentMapResourceId) =>
    assembleBattleEncounters({
      encounterSet,
      knownResourceIds: new Set(resources.keys()),
      maps,
      currentMapResourceId,
      npcCells: new Set(
        allNpcs
          .filter((npc) => npc.record.mapResourceId === currentMapResourceId)
          .map((npc) => `${npc.col},${npc.row}`),
      ),
      profiles: progressionAssembled.assembly.profiles,
      martialArts: progressionAssembled.assembly.martialArts,
    }),
  );
  const globallySeenEncounterIds = new Set<string>();
  encounters = [];
  for (const placement of encounterPlacements) {
    for (const encounter of placement.encounters) {
      if (globallySeenEncounterIds.has(encounter.record.id)) {
        warnings.push({
          resource: ENCOUNTER_RESOURCE_ID,
          origin: 'encounter-assembly',
          severity: 'warning',
          message: `遭遇 "${encounter.record.id}" 在多张地图重复登记，保留世界图首条记录`,
          details: [],
        });
      } else {
        globallySeenEncounterIds.add(encounter.record.id);
        encounters.push(encounter);
      }
    }
  }
  for (const message of new Set(encounterPlacements.flatMap((placement) => placement.warnings))) {
    warnings.push({
      resource: ENCOUNTER_RESOURCE_ID,
      origin: 'encounter-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  // Compile one safe NPC layout per declared calendar period. The base
  // placements remain the stable cast registry for quests/factions; runtime
  // scenes choose the current period's layout from the clock.
  const encounterBlocksByMap = new Map<string, Set<string>>();
  for (const encounter of encounters) {
    const blocked = encounterBlocksByMap.get(encounter.record.mapResourceId) ?? new Set<string>();
    blocked.add(`${encounter.col},${encounter.row}`);
    encounterBlocksByMap.set(encounter.record.mapResourceId, blocked);
  }
  const npcSchedules = compileNpcSchedules({
    npcs: allNpcs,
    periods: calendarPeriods,
    maps,
    blockedCellsByMap: encounterBlocksByMap,
  });
  for (const message of npcSchedules.warnings) {
    warnings.push({
      resource: NPC_RESOURCE_ID,
      origin: 'npc-schedule',
      severity: 'warning',
      message,
      details: [],
    });
  }

  let questSet: QuestSetData | null = null;
  const questResource = resources.get(QUEST_RESOURCE_ID);
  if (questResource !== undefined) {
    const parsed = parseQuestSet(questResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: QUEST_RESOURCE_ID,
        origin: 'quest-assembly',
        severity: 'warning',
        message: '任务资料结构不合规，本轮禁用全部任务',
        details: parsed.errors,
      });
    } else {
      questSet = parsed.set;
    }
  }
  const questAssembly = assembleQuests({
    questSet,
    questGiverNpcIds: new Set(
      allNpcs.filter((npc) => npc.record.questGiver).map((npc) => npc.record.id),
    ),
    itemIds: new Set(itemAssembly.items.keys()),
    encounterIds: new Set(encounters.map((encounter) => encounter.record.id)),
  });
  for (const message of questAssembly.warnings) {
    warnings.push({
      resource: QUEST_RESOURCE_ID,
      origin: 'quest-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  const resolvedFactions = new Map<string, FactionData>();
  for (const [factionId, faction] of progressionAssembled.assembly.factions) {
    const mentorNpcIds = faction.mentorNpcIds.filter((npcId) => {
      if (allNpcs.some((npc) => npc.record.id === npcId)) return true;
      warnings.push({
        resource: FACTION_RESOURCE_ID,
        origin: 'faction-assembly',
        severity: 'warning',
        message: `门派 "${factionId}" 登记的导师 "${npcId}" 不存在或未通过地图校验，已移除该导师资格`,
        details: [],
      });
      return false;
    });
    for (const questId of faction.admission.requiredQuestIds) {
      if (!questAssembly.quests.has(questId)) {
        warnings.push({
          resource: FACTION_RESOURCE_ID,
          origin: 'faction-assembly',
          severity: 'warning',
          message: `门派 "${factionId}" 的入门前置差事 "${questId}" 不存在或无效，拜师将保持锁定`,
          details: [],
        });
      }
    }
    resolvedFactions.set(factionId, { ...faction, mentorNpcIds });
  }
  const progression: ProgressionAssembly = {
    ...progressionAssembled.assembly,
    factions: resolvedFactions,
  };

  // Resolve condition/effect references now that quests, items, mentors and
  // placed NPCs are all known. A dangling reference drops exactly its
  // option; the conversation (and its referencing NPC) stays playable.
  const placedNpcIds = new Set(allNpcs.map((npc) => npc.record.id));
  const dialogueReferences = assembleDialogueReferences({
    conversations: dialogues,
    quests: questAssembly.quests,
    items: itemAssembly.items,
    placedNpcIds,
    knowledgeNodeIds,
    factionIds: new Set(progression.factions.keys()),
    martialArtIds: new Set(progression.martialArts.keys()),
    timeOfDayPeriodIds,
  });
  for (const message of dialogueReferences.warnings) {
    warnings.push({
      resource: DIALOGUE_RESOURCE_ID,
      origin: 'dialogue-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  return {
    npcs: allNpcs,
    npcsByPeriod: npcSchedules.placementsByPeriod,
    dialogues: dialogueReferences.conversations,
    progression,
    encounters,
    items: itemAssembly.items,
    shops: shopAssembly.shops,
    quests: questAssembly.quests,
    warnings,
  };
}

/**
 * Assembles the optional Round 04 character/faction/martial-art datasets.
 * Structural failures disable the whole resource with a warning; duplicate
 * ids keep the first declaration; a martial art referencing a missing or
 * disabled faction drops out alone. Missing (unregistered) resources are
 * legitimate — later rounds then simply have no progression data. Nothing
 * here can block the map.
 */
function assembleProgressionContent(
  resources: ReadonlyMap<string, LoadedResource>,
): { assembly: ProgressionAssembly; warnings: Diagnostic[] } {
  const warnings: Diagnostic[] = [];

  let profiles = new Map<string, CharacterProfileData>();
  const profileResource = resources.get(CHARACTER_PROFILE_RESOURCE_ID);
  if (profileResource !== undefined) {
    const parsed = parseCharacterProfileSet(profileResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: CHARACTER_PROFILE_RESOURCE_ID,
        origin: 'progression-assembly',
        severity: 'warning',
        message: '角色模板资料结构不合规，本轮禁用全部角色模板',
        details: parsed.errors,
      });
    } else {
      const index = indexProfiles(parsed.set);
      for (const id of index.duplicateIds) {
        warnings.push({
          resource: CHARACTER_PROFILE_RESOURCE_ID,
          origin: 'progression-assembly',
          severity: 'warning',
          message: `角色模板 id "${id}" 重复，保留先声明者`,
          details: [],
        });
      }
      profiles = index.byId;
    }
  }

  let factions = new Map<string, FactionData>();
  const factionResource = resources.get(FACTION_RESOURCE_ID);
  if (factionResource !== undefined) {
    const parsed = parseFactionSet(factionResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: FACTION_RESOURCE_ID,
        origin: 'progression-assembly',
        severity: 'warning',
        message: '门派资料结构不合规，本轮禁用全部门派',
        details: parsed.errors,
      });
    } else {
      const index = indexFactions(parsed.set);
      for (const id of index.duplicateIds) {
        warnings.push({
          resource: FACTION_RESOURCE_ID,
          origin: 'progression-assembly',
          severity: 'warning',
          message: `门派 id "${id}" 重复，保留先声明者`,
          details: [],
        });
      }
      factions = index.byId;
    }
  }

  let martialArts = new Map<string, MartialArtData>();
  const martialArtResource = resources.get(MARTIAL_ART_RESOURCE_ID);
  if (martialArtResource !== undefined) {
    const parsed = parseMartialArtSet(martialArtResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: MARTIAL_ART_RESOURCE_ID,
        origin: 'progression-assembly',
        severity: 'warning',
        message: '武学资料结构不合规，本轮禁用全部武学',
        details: parsed.errors,
      });
    } else {
      const index = indexMartialArts({
        set: parsed.set,
        factionIds: new Set(factions.keys()),
      });
      for (const id of index.duplicateIds) {
        warnings.push({
          resource: MARTIAL_ART_RESOURCE_ID,
          origin: 'progression-assembly',
          severity: 'warning',
          message: `武学 id "${id}" 重复，保留先声明者`,
          details: [],
        });
      }
      for (const message of index.warnings) {
        warnings.push({
          resource: MARTIAL_ART_RESOURCE_ID,
          origin: 'progression-assembly',
          severity: 'warning',
          message,
          details: [],
        });
      }
      martialArts = index.byId;
    }
  }

  return { assembly: { profiles, factions, martialArts }, warnings };
}

/**
 * Assembles the optional Round 06 item dataset and parses the shop set.
 * Structural failures disable the whole resource with a warning; duplicate
 * item ids keep the first declaration. A missing (unregistered) resource
 * is legitimate — the world then simply has no items or shops. Nothing
 * here can block the map. Shop cross-references run in
 * {@link assembleOptionalContent} once NPC placement is known.
 */
function assembleItemContent(
  resources: ReadonlyMap<string, LoadedResource>,
): { items: ReadonlyMap<string, ItemRecordData>; shopSet: ShopSetData | null; warnings: Diagnostic[] } {
  const warnings: Diagnostic[] = [];

  let items = new Map<string, ItemRecordData>();
  const itemResource = resources.get(ITEM_RESOURCE_ID);
  if (itemResource !== undefined) {
    const parsed = parseItemSet(itemResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: ITEM_RESOURCE_ID,
        origin: 'item-assembly',
        severity: 'warning',
        message: '物品资料结构不合规，本轮禁用全部物品与交易',
        details: parsed.errors,
      });
    } else {
      const index = indexItems(parsed.set);
      for (const id of index.duplicateIds) {
        warnings.push({
          resource: ITEM_RESOURCE_ID,
          origin: 'item-assembly',
          severity: 'warning',
          message: `物品 id "${id}" 重复，保留先声明者`,
          details: [],
        });
      }
      items = index.byId;
    }
  }

  let shopSet: ShopSetData | null = null;
  const shopResource = resources.get(SHOP_RESOURCE_ID);
  if (shopResource !== undefined) {
    const parsed = parseShopSet(shopResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: SHOP_RESOURCE_ID,
        origin: 'shop-assembly',
        severity: 'warning',
        message: '商店资料结构不合规，本轮禁用全部商店',
        details: parsed.errors,
      });
    } else {
      shopSet = parsed.set;
    }
  }

  return { items, shopSet, warnings };
}
