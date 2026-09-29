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
  type ResourceSource,
  loadGameData,
} from '../engine/data-loader';
import { EventBus } from '../engine/event-bus';
import { collectModDiagnostics } from '../engine/mod-diagnostics';
import { GridMap, parseGridMap } from '../engine/grid-map';
import {
  assembleKnowledgeGraph,
  parseKnowledgeEdgeSet,
  parseKnowledgeNodeSet,
  type KnowledgeGraph,
  type KnowledgeNodeData,
  type KnowledgeNodeSetData,
  type KnowledgeEdgeSetData,
} from '../engine/knowledge-graph';
import {
  assembleWorldMap,
  parseWorldMap,
  type RegionEventData,
  type RegionTransitionData,
  type WorldMapAssembly,
} from '../engine/world-map';
import {
  type DialogueData,
  indexConversations,
  parseDialogueSet,
  validateConversation,
} from '../engine/dialogue-graph';
import { assembleDialogueReferences } from '../engine/dialogue-runtime';
import { assembleCompanions, parseCompanionSet, type CompanionData, type CompanionSetData } from '../engine/companion-system';
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
  assembleArenas,
  parseArenaSet,
  type ArenaSetData,
  type AssembledArena,
} from '../engine/arena-challenge';
import {
  assembleFactionWars,
  parseFactionWarSet,
  type AssembledFactionWar,
  type FactionWarSetData,
} from '../engine/faction-war';
import {
  parseMartialArtForgeComponents,
  type MartialArtForgeComponentSet,
} from '../engine/martial-art-forge';
import {
  parseMeridianSet,
  resolveMeridianItemReferences,
  type MeridianSetData,
} from '../engine/meridian-system';
import {
  assembleEquipmentForges,
  parseEquipmentForgeSet,
  type AssembledEquipmentForgeStation,
  type EquipmentForgeSetData,
} from '../engine/equipment-forge';
import {
  assembleAlchemyStations,
  parseAlchemySet,
  type AlchemySetData,
  type AssembledAlchemyStation,
} from '../engine/alchemy-system';
import {
  assembleEndingSet,
  parseEndingSet,
  type AssembledEndingSet,
  type EndingSetData,
} from '../engine/ending-system';
import {
  assembleAchievementSet,
  parseAchievementSet,
  type AchievementSetData,
} from '../engine/achievement-system';
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
const CHARACTER_PROFILE_RESOURCE_ID = 'character-profile.round-04-set';
const FACTION_RESOURCE_ID = 'faction.round-04-set';
const MARTIAL_ART_RESOURCE_ID = 'martial-art.round-04-set';
const ARENA_RESOURCE_ID = 'arena.round-20-set';
const FACTION_WAR_RESOURCE_ID = 'faction-war.round-21-set';
const MARTIAL_ART_COMPONENT_RESOURCE_ID = 'martial-art-components.round-22-set';
const MERIDIAN_RESOURCE_ID = 'meridian.round-23-set';
const EQUIPMENT_FORGE_RESOURCE_ID = 'equipment-forge.round-24-set';
const ALCHEMY_RESOURCE_ID = 'alchemy.round-25-set';
const ENDING_RESOURCE_ID = 'ending.round-27-set';
const ACHIEVEMENT_RESOURCE_ID = 'achievement.round-28-set';
const COMPANION_RESOURCE_ID = 'companion.round-19-set';
const KNOWLEDGE_NODE_RESOURCE_ID = 'knowledge.round-11-nodes';
const KNOWLEDGE_EDGE_RESOURCE_ID = 'knowledge.round-11-edges';

/**
 * Optional-content schema families: every manifest resource whose schema is
 * listed here is content the world can lose without dying, no matter how many
 * resources of that family the manifest declares (dialogue-set files may be
 * split across rounds like grid maps).
 */
const OPTIONAL_CONTENT_SCHEMAS = new Set([
  'npc-set',
  'dialogue-set',
  'character-profiles',
  'faction-set',
  'martial-arts-set',
  'battle-encounters',
  'arena-set',
  'faction-war-set',
  'martial-art-components',
  'meridian-set',
  'equipment-forge-set',
  'alchemy-set',
  'ending-set',
  'achievement-set',
  'items-set',
  'shops-set',
  'quest-set',
  'companion-set',
  'knowledge-nodes',
  'knowledge-edges',
]);

/** Optional-content schemas; schema-level failures carry no resource id, so match by origin. */
const OPTIONAL_SCHEMA_ORIGINS = new Set(
  [...OPTIONAL_CONTENT_SCHEMAS].map((schema) => `schema:${schema}`),
);

function isOptionalContentDiagnostic(
  diagnostic: Diagnostic,
  schemaByResourceId: ReadonlyMap<string, string>,
): boolean {
  return (
    OPTIONAL_SCHEMA_ORIGINS.has(diagnostic.origin) ||
    (diagnostic.resource !== undefined &&
      OPTIONAL_CONTENT_SCHEMAS.has(schemaByResourceId.get(diagnostic.resource) ?? ''))
  );
}

/** Flattens loader diagnostics into readable panel lines, one block each. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    const scope =
      diagnostic.resource === undefined
        ? diagnostic.origin
        : `${diagnostic.origin}（资源 ${diagnostic.resource}）`;
    const path = diagnostic.path === undefined ? '' : `\n文件：${diagnostic.path}`;
    const details = diagnostic.details.length > 0 ? `\n${diagnostic.details.join('\n')}` : '';
    const hint = diagnostic.hint === undefined ? '' : `\n建议：${diagnostic.hint}`;
    return `${scope}：${diagnostic.message}${path}${details}${hint}`;
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
  arenas: AssembledArena[];
  factionWars: AssembledFactionWar[];
  /** Optional data-authored parts; null cleanly disables the Round 22 forge. */
  martialArtForgeComponents: MartialArtForgeComponentSet | null;
  /** Optional meridian network/rules; null leaves other progression intact. */
  meridianSet: MeridianSetData | null;
  /** Optional map-placed item-forging stations; invalid data only disables forging. */
  equipmentForges: readonly AssembledEquipmentForgeStation[];
  /** Optional data-authored medicine stations and discovered recipes. */
  alchemyStations: readonly AssembledAlchemyStation[];
  /** Optional data-authored ending conditions and their map gate. */
  endings: AssembledEndingSet | null;
  /** Optional data-authored achievement conditions, progress and rewards. */
  achievements: AchievementSetData | null;
  items: ReadonlyMap<string, ItemRecordData>;
  shops: ReadonlyMap<string, AssembledShop>;
  quests: ReadonlyMap<string, QuestData>;
  companions: ReadonlyMap<string, CompanionData>;
  warnings: Diagnostic[];
}

/**
 * One successfully loaded resource with the physical copy that won. Kept
 * beside the assembled world so the F2 MOD panel and reports can explain
 * precedence without re-reading the raw loader result.
 */
export interface LoadedResourceSource {
  id: string;
  /** Manifest-declared path under `data/base/`; MOD overrides mirror it. */
  path: string;
  /** Schema family from the manifest. */
  schema: string;
  /** Which layer provided the final valid value (`base` or `mod:<id>`). */
  source: ResourceSource;
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
  /** `enabledMods` exactly as declared (later entries override earlier ones). */
  enabledMods: readonly string[];
  /** Final source of every successfully loaded resource, in manifest order. */
  resourceSources: readonly LoadedResourceSource[];
  /** MOD-layer diagnostics (rejected overrides etc.) with paths and hints. */
  modDiagnostics: readonly Diagnostic[];
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
        'arena-set': (value) => {
          const parsed = parseArenaSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'faction-war-set': (value) => {
          const parsed = parseFactionWarSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'martial-art-components': (value) => {
          const parsed = parseMartialArtForgeComponents(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'meridian-set': (value) => {
          const parsed = parseMeridianSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'equipment-forge-set': (value) => {
          const parsed = parseEquipmentForgeSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'alchemy-set': (value) => {
          const parsed = parseAlchemySet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'ending-set': (value) => {
          const parsed = parseEndingSet(value);
          return parsed.ok ? [] : parsed.errors;
        },
        'achievement-set': (value) => {
          const parsed = parseAchievementSet(value);
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
    // (manifest, schemas, the required map) stays fatal like Round 02. The
    // manifest maps every resource id to its schema family, so any number of
    // optional-family resources (e.g. per-round dialogue files) degrade the
    // same way without enumerating ids here.
    const schemaByResourceId = new Map(
      (result.manifest?.resources ?? []).map((resource) => [resource.id, resource.schema]),
    );
    const blocking = result.diagnostics.filter(
      (diagnostic) =>
        (diagnostic.severity ?? 'error') === 'error' &&
        !isOptionalContentDiagnostic(diagnostic, schemaByResourceId),
    );
    if (blocking.length > 0) {
      return { ok: false, title: '资料加载诊断', lines: formatDiagnostics(blocking) };
    }
    const modWarnings = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'warning',
    );
    const optionalWarnings = result.diagnostics.filter(
      (diagnostic) =>
        (diagnostic.severity ?? 'error') === 'error' &&
        isOptionalContentDiagnostic(diagnostic, schemaByResourceId),
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
    const knowledgeResult = assembleKnowledgeGraphContent(result.resources);
    const npcIds = new Set<string>();
    for (const resource of result.resources.values()) {
      if (resource.schema !== 'npc-set') continue;
      const parsed = parseNpcSet(resource.value);
      if (parsed.ok) {
        for (const npc of parsed.set.npcs) npcIds.add(npc.id);
      }
    }
    const worldMapResult = assembleWorldMap(parsedWorldMap.data, maps, {
      knowledgeNodeIds: new Set(knowledgeResult.graph.nodes.keys()),
      periodIds: new Set(parsedCalendar.calendar.periods.map((period) => period.id)),
      weatherIds: new Set(parsedClimate.climate.weathers.map((weather) => weather.id)),
      npcIds,
    });
    if ('ok' in worldMapResult && !worldMapResult.ok) {
      return { ok: false, title: '世界地图引用无效', lines: worldMapResult.errors };
    }
    const worldMap = worldMapResult as WorldMapAssembly;
    const startingMapResourceId = parsedWorldMap.data.startingMapResourceId;
    const startingMap = maps.get(startingMapResourceId);
    if (startingMap === undefined) {
      return { ok: false, title: '起始地图不可用', lines: [`地图资源 "${startingMapResourceId}" 未能加载。`] };
    }

    const calendarPeriodIds = new Set(parsedCalendar.calendar.periods.map((period) => period.id));
    const assembly = assembleOptionalContent(
      result.resources,
      maps,
      worldMap.transitions,
      worldMap.events,
      new Set(knowledgeResult.graph.nodes.keys()),
      knowledgeResult.graph.nodes,
      calendarPeriodIds,
      parsedCalendar.calendar.periods,
    );
    assembly.warnings.push(...knowledgeResult.warnings);
    const overlapWarnings: string[] = [];
    const overlapsWorldOccupant = (mapResourceId: string, col: number, row: number): boolean =>
      assembly.npcs.some((npc) => npc.record.mapResourceId === mapResourceId && npc.col === col && npc.row === row) ||
      assembly.encounters.some((encounter) => encounter.record.mapResourceId === mapResourceId &&
        encounter.col === col && encounter.row === row) ||
      assembly.factionWars.some((war) => war.record.mapResourceId === mapResourceId &&
        war.record.position.col === col && war.record.position.row === row);
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
    const modDiagnostics = collectModDiagnostics(result.resources, result.diagnostics, [
      ...optionalWarnings,
      ...assembly.warnings,
    ]);
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
        enabledMods: result.manifest?.enabledMods ?? [],
        resourceSources: [...result.resources.values()].map(
          ({ id, path, schema, source }) => ({ id, path, schema, source }),
        ),
        modDiagnostics,
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
 * Assembles optional world content. Every failure disables the
 * smallest possible unit — one conversation or one NPC — and becomes a
 * warning instead of killing the scene. Missing (unregistered) resources
 * are legitimate: the world then has no optional interactions or quests.
 */
function assembleOptionalContent(
  resources: ReadonlyMap<string, LoadedResource>,
  maps: ReadonlyMap<string, GridMap>,
  regionTransitions: readonly RegionTransitionData[],
  regionEvents: readonly RegionEventData[],
  knowledgeNodeIds: ReadonlySet<string>,
  knowledgeNodes: ReadonlyMap<string, KnowledgeNodeData>,
  timeOfDayPeriodIds: ReadonlySet<string>,
  calendarPeriods: GameCalendarData['periods'],
): WorldAssembly {
  const warnings: Diagnostic[] = [];
  const knowledgeCharacterNodeIds = new Set(
    [...knowledgeNodes.values()]
      .filter((node) => node.kind === 'character')
      .map((node) => node.id),
  );

  let martialArtForgeComponents: MartialArtForgeComponentSet | null = null;
  const forgeResource = resources.get(MARTIAL_ART_COMPONENT_RESOURCE_ID);
  if (forgeResource !== undefined) {
    const parsed = parseMartialArtForgeComponents(forgeResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: MARTIAL_ART_COMPONENT_RESOURCE_ID,
        origin: 'martial-art-forge',
        severity: 'warning',
        message: '自创武学组件资料无效，已关闭创制入口',
        details: parsed.errors,
      });
    } else {
      martialArtForgeComponents = parsed.set;
    }
  }

  // Conversations first: NPC validation resolves against the valid set. Like
  // grid maps, every manifest resource whose schema is `dialogue-set`
  // contributes conversations; duplicate ids across resources keep the first
  // declaration in manifest order and failures disable one resource's talks
  // (or one conversation), never the whole family.
  let dialogues = new Map<string, DialogueData>();
  const conversationOwners = new Map<string, string>();
  const allConversations: DialogueData[] = [];
  for (const resource of resources.values()) {
    if (resource.schema !== 'dialogue-set') continue;
    const parsed = parseDialogueSet(resource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: resource.id,
        origin: 'dialogue-assembly',
        severity: 'warning',
        message: `对话资料结构不合规，已禁用资源 "${resource.id}" 的全部对话`,
        details: parsed.errors,
      });
      continue;
    }
    for (const warning of parsed.warnings) {
      warnings.push({
        resource: resource.id,
        origin: 'dialogue-assembly',
        severity: 'warning',
        message: warning,
        details: [],
      });
    }
    for (const conversation of parsed.set.conversations) {
      if (!conversationOwners.has(conversation.id)) {
        conversationOwners.set(conversation.id, resource.id);
      }
      allConversations.push(conversation);
    }
  }
  const dialogueIndex = indexConversations({ conversations: allConversations });
  for (const id of dialogueIndex.duplicateIds) {
    warnings.push({
      resource: conversationOwners.get(id),
      origin: 'dialogue-assembly',
      severity: 'warning',
      message: `对话 id "${id}" 重复，保留先声明者`,
      details: [],
    });
  }
  for (const [id, conversation] of dialogueIndex.byId) {
    const problems = validateConversation(conversation);
    if (problems.length > 0) {
      warnings.push({
        resource: conversationOwners.get(id),
        origin: 'dialogue-assembly',
        severity: 'warning',
        message: `对话 "${id}" 已禁用：${problems.join('；')}`,
        details: [],
      });
    } else {
      dialogues.set(id, conversation);
    }
  }

  const npcResources = [...resources.values()].filter((resource) => resource.schema === 'npc-set');
  let npcSet: NpcSetData | null = npcResources.length === 0 ? null : { npcs: [] };
  for (const npcResource of npcResources) {
    const parsed = parseNpcSet(npcResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: npcResource.id,
        origin: 'npc-assembly',
        severity: 'warning',
        message: `NPC 资料结构不合规，已禁用资源 "${npcResource.id}" 中的人物`,
        details: parsed.errors,
      });
    } else {
      npcSet!.npcs.push(...parsed.set.npcs);
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
  // Each optional schema family can be split across manifest resources; one
  // malformed extension must not disable the other valid resource files.
  const itemAssembly = assembleItemContent(resources);
  warnings.push(...itemAssembly.warnings);

  let meridianSet: MeridianSetData | null = null;
  const meridianResource = resources.get(MERIDIAN_RESOURCE_ID);
  if (meridianResource !== undefined) {
    const parsed = parseMeridianSet(meridianResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: MERIDIAN_RESOURCE_ID,
        origin: 'meridian-assembly',
        severity: 'warning',
        message: '经脉资料无效，已关闭内修入口',
        details: parsed.errors,
      });
    } else {
      const resolved = resolveMeridianItemReferences(parsed.set, new Set(itemAssembly.items.keys()));
      meridianSet = resolved.set;
      for (const message of resolved.warnings) {
        warnings.push({
          resource: MERIDIAN_RESOURCE_ID,
          origin: 'meridian-assembly',
          severity: 'warning',
          message,
          details: [],
        });
      }
    }
  }

  const shopAssembly = assembleShops({
    shopSet: itemAssembly.shopSet,
    placedNpcIds: new Set(allNpcs.map((npc) => npc.record.id)),
    items: itemAssembly.items,
  });
  for (const message of shopAssembly.warnings) {
    warnings.push({
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
        origin: 'shop-assembly',
        severity: 'warning',
        message: `NPC "${npc.record.id}"（${npc.record.name}）引用的商店 "${npc.record.shopId}" 不存在或已因校验失败被禁用，交互回落到对话`,
        details: [],
      });
    }
  }

  // Encounters resolve against the map, placed NPCs, profiles and arts.
  let encounters: PlacedEncounter[] = [];
  const encounterResources = [...resources.values()].filter((resource) => resource.schema === 'battle-encounters');
  let encounterSet: BattleEncounterSetData | null = encounterResources.length === 0 ? null : { encounters: [] };
  for (const encounterResource of encounterResources) {
    const parsed = parseBattleEncounterSet(encounterResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: encounterResource.id,
        origin: 'encounter-assembly',
        severity: 'warning',
        message: `遭遇资料结构不合规，已禁用资源 "${encounterResource.id}" 中的遭遇`,
        details: parsed.errors,
      });
    } else {
      encounterSet!.encounters.push(...parsed.set.encounters);
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
      knowledgeCharacterNodeIds,
    }),
  );
  const globallySeenEncounterIds = new Set<string>();
  encounters = [];
  for (const placement of encounterPlacements) {
    for (const encounter of placement.encounters) {
      if (globallySeenEncounterIds.has(encounter.record.id)) {
        warnings.push({
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
      origin: 'encounter-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  let arenaSet: ArenaSetData | null = null;
  const arenaResource = resources.get(ARENA_RESOURCE_ID);
  if (arenaResource !== undefined) {
    const parsed = parseArenaSet(arenaResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: ARENA_RESOURCE_ID,
        origin: 'arena-assembly',
        severity: 'warning',
        message: '擂台资料结构不合规，本轮禁用全部擂台',
        details: parsed.errors,
      });
    } else {
      arenaSet = parsed.set;
      for (const issue of parsed.errors) warnings.push({
        resource: ARENA_RESOURCE_ID,
        origin: 'arena-assembly',
        severity: 'warning',
        message: issue,
        details: [],
      });
    }
  }
  const arenaAssembly = assembleArenas({
    set: arenaSet,
    knownResourceIds: new Set(resources.keys()),
    maps,
    spawns: new Map([...maps].map(([id, map]) => [id, map.data.playerStart])),
    npcCells: new Map([...maps.keys()].map((id) => [
      id,
      new Set(allNpcs.filter((npc) => npc.record.mapResourceId === id).map((npc) => npc.col + ',' + npc.row)),
    ])),
    encounterCells: new Map([...maps.keys()].map((id) => [
      id,
      new Set(encounters.filter((encounter) => encounter.record.mapResourceId === id).map((encounter) => encounter.col + ',' + encounter.row)),
    ])),
    profileIds: new Set(progressionAssembled.assembly.profiles.keys()),
    martialArts: progressionAssembled.assembly.martialArts,
    itemIds: new Set(itemAssembly.items.keys()),
  });
  for (const message of arenaAssembly.warnings) warnings.push({
    resource: ARENA_RESOURCE_ID,
    origin: 'arena-assembly',
    severity: 'warning',
    message,
    details: [],
  });

  let factionWarSet: FactionWarSetData | null = null;
  const factionWarResource = resources.get(FACTION_WAR_RESOURCE_ID);
  if (factionWarResource !== undefined) {
    const parsed = parseFactionWarSet(factionWarResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: FACTION_WAR_RESOURCE_ID,
        origin: 'faction-war-assembly',
        severity: 'warning',
        message: '门派战资料结构不合规，本轮禁用全部门派战',
        details: parsed.errors,
      });
    } else {
      factionWarSet = parsed.set;
      for (const issue of parsed.errors) warnings.push({
        resource: FACTION_WAR_RESOURCE_ID,
        origin: 'faction-war-assembly',
        severity: 'warning',
        message: issue,
        details: [],
      });
    }
  }
  const factionWarBlockedCells = new Map<string, Set<string>>();
  const blockFactionWarCell = (mapId: string, cell: string): void => {
    const cells = factionWarBlockedCells.get(mapId) ?? new Set<string>();
    cells.add(cell);
    factionWarBlockedCells.set(mapId, cells);
  };
  for (const [mapId, map] of maps) blockFactionWarCell(mapId, map.data.playerStart.col + ',' + map.data.playerStart.row);
  for (const npc of allNpcs) blockFactionWarCell(npc.record.mapResourceId, npc.col + ',' + npc.row);
  for (const encounter of encounters) blockFactionWarCell(encounter.record.mapResourceId, encounter.col + ',' + encounter.row);
  for (const arena of arenaAssembly.arenas) blockFactionWarCell(arena.record.mapResourceId, arena.record.position.col + ',' + arena.record.position.row);
  const factionWarAssembly = assembleFactionWars({
    set: factionWarSet,
    knownResourceIds: new Set(resources.keys()),
    maps,
    blockedCells: factionWarBlockedCells,
    factions: new Set(progressionAssembled.assembly.factions.keys()),
    martialArts: progressionAssembled.assembly.martialArts,
    knowledgeNodeIds,
  });
  for (const message of factionWarAssembly.warnings) warnings.push({
    resource: FACTION_WAR_RESOURCE_ID,
    origin: 'faction-war-assembly',
    severity: 'warning',
    message,
    details: [],
  });

  let equipmentForgeSet: EquipmentForgeSetData | null = null;
  const equipmentForgeResource = resources.get(EQUIPMENT_FORGE_RESOURCE_ID);
  if (equipmentForgeResource !== undefined) {
    const parsed = parseEquipmentForgeSet(equipmentForgeResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: EQUIPMENT_FORGE_RESOURCE_ID,
        origin: 'equipment-forge-assembly',
        severity: 'warning',
        message: '装备锻造资料结构不合规，本轮禁用全部锻造工位',
        details: parsed.errors,
      });
    } else {
      equipmentForgeSet = parsed.set;
    }
  }
  const equipmentForgeBlockedCells = new Map<string, Set<string>>();
  const blockEquipmentForgeCell = (mapId: string, cell: string): void => {
    const blocked = equipmentForgeBlockedCells.get(mapId) ?? new Set<string>();
    blocked.add(cell);
    equipmentForgeBlockedCells.set(mapId, blocked);
  };
  for (const [mapId, map] of maps) blockEquipmentForgeCell(mapId, `${map.data.playerStart.col},${map.data.playerStart.row}`);
  for (const npc of allNpcs) blockEquipmentForgeCell(npc.record.mapResourceId, `${npc.col},${npc.row}`);
  for (const encounter of encounters) blockEquipmentForgeCell(encounter.record.mapResourceId, `${encounter.col},${encounter.row}`);
  for (const arena of arenaAssembly.arenas) {
    blockEquipmentForgeCell(arena.record.mapResourceId, `${arena.record.position.col},${arena.record.position.row}`);
  }
  for (const war of factionWarAssembly.wars) {
    blockEquipmentForgeCell(war.record.mapResourceId, `${war.record.position.col},${war.record.position.row}`);
  }
  const equipmentForgeAssembly = assembleEquipmentForges({
    set: equipmentForgeSet,
    knownResourceIds: new Set(resources.keys()),
    maps,
    spawns: new Map([...maps].map(([id, map]) => [id, map.data.playerStart])),
    blockedCells: equipmentForgeBlockedCells,
    items: itemAssembly.items,
  });
  for (const message of equipmentForgeAssembly.warnings) warnings.push({
    resource: EQUIPMENT_FORGE_RESOURCE_ID,
    origin: 'equipment-forge-assembly',
    severity: 'warning',
    message,
    details: [],
  });

  let alchemySet: AlchemySetData | null = null;
  const alchemyResource = resources.get(ALCHEMY_RESOURCE_ID);
  if (alchemyResource !== undefined) {
    const parsed = parseAlchemySet(alchemyResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: ALCHEMY_RESOURCE_ID,
        origin: 'alchemy-assembly',
        severity: 'warning',
        message: '炼药资料结构不合规，本轮禁用全部炼药工位',
        details: parsed.errors,
      });
    } else {
      for (const message of parsed.warnings) warnings.push({
        resource: ALCHEMY_RESOURCE_ID,
        origin: 'alchemy-assembly',
        severity: 'warning',
        message,
        details: [],
      });
      alchemySet = parsed.set;
    }
  }
  const alchemyBlockedCells = new Map<string, Set<string>>();
  const blockAlchemyCell = (mapId: string, cell: string): void => {
    const blocked = alchemyBlockedCells.get(mapId) ?? new Set<string>();
    blocked.add(cell);
    alchemyBlockedCells.set(mapId, blocked);
  };
  for (const [mapId, map] of maps) blockAlchemyCell(mapId, `${map.data.playerStart.col},${map.data.playerStart.row}`);
  for (const npc of allNpcs) blockAlchemyCell(npc.record.mapResourceId, `${npc.col},${npc.row}`);
  for (const transition of regionTransitions) {
    blockAlchemyCell(transition.from.mapResourceId, `${transition.from.col},${transition.from.row}`);
    blockAlchemyCell(transition.to.mapResourceId, `${transition.to.col},${transition.to.row}`);
  }
  for (const event of regionEvents) blockAlchemyCell(event.mapResourceId, `${event.col},${event.row}`);
  for (const encounter of encounters) blockAlchemyCell(encounter.record.mapResourceId, `${encounter.col},${encounter.row}`);
  for (const arena of arenaAssembly.arenas) blockAlchemyCell(arena.record.mapResourceId, `${arena.record.position.col},${arena.record.position.row}`);
  for (const war of factionWarAssembly.wars) blockAlchemyCell(war.record.mapResourceId, `${war.record.position.col},${war.record.position.row}`);
  for (const station of equipmentForgeAssembly.stations) {
    blockAlchemyCell(station.record.mapResourceId, `${station.record.position.col},${station.record.position.row}`);
  }
  const alchemyAssembly = assembleAlchemyStations({
    set: alchemySet,
    knownResourceIds: new Set(resources.keys()),
    maps,
    spawns: new Map([...maps].map(([id, map]) => [id, map.data.playerStart])),
    blockedCells: alchemyBlockedCells,
    items: itemAssembly.items,
    knowledgeNodeIds,
  });
  for (const message of alchemyAssembly.warnings) warnings.push({
    resource: ALCHEMY_RESOURCE_ID,
    origin: 'alchemy-assembly',
    severity: 'warning',
    message,
    details: [],
  });

  let endingSetData: EndingSetData | null = null;
  const endingResource = resources.get(ENDING_RESOURCE_ID);
  if (endingResource !== undefined) {
    const parsed = parseEndingSet(endingResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: ENDING_RESOURCE_ID,
        origin: 'ending-assembly',
        severity: 'warning',
        message: '结局资料结构无效，已关闭结局入口',
        details: parsed.errors,
      });
    } else {
      endingSetData = parsed.set;
      for (const message of parsed.warnings) warnings.push({
        resource: ENDING_RESOURCE_ID,
        origin: 'ending-assembly',
        severity: 'warning',
        message,
        details: [],
      });
    }
  }
  // This snapshot excludes the gate itself and is used for its collision
  // check. Adding the gate to NPC schedule blockers prevents a later
  // time-based NPC from occupying the ending interaction point.
  const occupiedWorldCells = new Map<string, Set<string>>();
  for (const [mapId, cells] of alchemyBlockedCells) {
    occupiedWorldCells.set(mapId, new Set(cells));
  }
  for (const station of alchemyAssembly.stations) {
    const cells = occupiedWorldCells.get(station.record.mapResourceId) ?? new Set<string>();
    cells.add(station.record.position.col + ',' + station.record.position.row);
    occupiedWorldCells.set(station.record.mapResourceId, cells);
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
  // Arena entrances are fixed world markers too; keep scheduled NPCs from
  // standing on the interaction point in a later time period.
  for (const arena of arenaAssembly.arenas) {
    const blocked = encounterBlocksByMap.get(arena.record.mapResourceId) ?? new Set<string>();
    blocked.add(String(arena.record.position.col) + ',' + String(arena.record.position.row));
    encounterBlocksByMap.set(arena.record.mapResourceId, blocked);
  }
  for (const war of factionWarAssembly.wars) {
    const blocked = encounterBlocksByMap.get(war.record.mapResourceId) ?? new Set<string>();
    blocked.add(String(war.record.position.col) + ',' + String(war.record.position.row));
    encounterBlocksByMap.set(war.record.mapResourceId, blocked);
  }
  // Crafting workstations are fixed world markers too; keep time-based NPCs clear.
  for (const station of equipmentForgeAssembly.stations) {
    const blocked = encounterBlocksByMap.get(station.record.mapResourceId) ?? new Set<string>();
    blocked.add(`${station.record.position.col},${station.record.position.row}`);
    encounterBlocksByMap.set(station.record.mapResourceId, blocked);
  }
  for (const station of alchemyAssembly.stations) {
    const blocked = encounterBlocksByMap.get(station.record.mapResourceId) ?? new Set<string>();
    blocked.add(`${station.record.position.col},${station.record.position.row}`);
    encounterBlocksByMap.set(station.record.mapResourceId, blocked);
  }
  if (endingSetData !== null) {
    const gate = endingSetData.gate;
    const blocked = encounterBlocksByMap.get(gate.mapResourceId) ?? new Set<string>();
    blocked.add(gate.position.col + ',' + gate.position.row);
    encounterBlocksByMap.set(gate.mapResourceId, blocked);
  }
  const npcSchedules = compileNpcSchedules({
    npcs: allNpcs,
    periods: calendarPeriods,
    maps,
    blockedCellsByMap: encounterBlocksByMap,
  });
  for (const message of npcSchedules.warnings) {
    warnings.push({
      origin: 'npc-schedule',
      severity: 'warning',
      message,
      details: [],
    });
  }

  const questResources = [...resources.values()].filter((resource) => resource.schema === 'quest-set');
  let questSet: QuestSetData | null = questResources.length === 0 ? null : { quests: [] };
  for (const questResource of questResources) {
    const parsed = parseQuestSet(questResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: questResource.id,
        origin: 'quest-assembly',
        severity: 'warning',
        message: '任务资料结构不合规，已禁用此资源中的任务',
        details: parsed.errors,
      });
    } else {
      questSet!.quests.push(...parsed.set.quests);
    }
  }
  const questAssembly = assembleQuests({
    questSet,
    questGiverNpcIds: new Set(
      allNpcs.filter((npc) => npc.record.questGiver).map((npc) => npc.record.id),
    ),
    npcIds: new Set(allNpcs.map((npc) => npc.record.id)),
    itemIds: new Set(itemAssembly.items.keys()),
    encounterIds: new Set(encounters.map((encounter) => encounter.record.id)),
    factionIds: new Set(progressionAssembled.assembly.factions.keys()),
    knowledgeNodeIds,
  });
  for (const message of questAssembly.warnings) {
    warnings.push({
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
  let companionSet: CompanionSetData | null = null;
  const companionResource = resources.get(COMPANION_RESOURCE_ID);
  if (companionResource !== undefined) {
    const parsed = parseCompanionSet(companionResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: COMPANION_RESOURCE_ID,
        origin: 'companion-assembly',
        severity: 'warning',
        message: '伙伴资料结构不合规，本轮禁用全部伙伴',
        details: parsed.errors,
      });
    } else {
      companionSet = parsed.set;
    }
  }
  const companionAssembly = assembleCompanions(companionSet, placedNpcIds);
  for (const message of companionAssembly.warnings) {
    warnings.push({
      resource: COMPANION_RESOURCE_ID,
      origin: 'companion-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }
  const dialogueReferences = assembleDialogueReferences({
    conversations: dialogues,
    quests: questAssembly.quests,
    items: itemAssembly.items,
    placedNpcIds,
    companionIds: new Set(companionAssembly.companions.keys()),
    knowledgeNodeIds,
    factionIds: new Set(progression.factions.keys()),
    martialArtIds: new Set(progression.martialArts.keys()),
    timeOfDayPeriodIds,
  });
  for (const message of dialogueReferences.warnings) {
    // The message names the offending conversation id already, and talks may
    // come from any number of dialogue-set resources, so no resource label.
    warnings.push({
      origin: 'dialogue-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }

  const endingAssembly = assembleEndingSet({
    set: endingSetData,
    maps,
    blockedCells: occupiedWorldCells,
    knowledgeNodes,
    questIds: new Set(questAssembly.quests.keys()),
    npcIds: placedNpcIds,
    factionIds: new Set(progression.factions.keys()),
  });
  for (const message of endingAssembly.warnings) warnings.push({
    resource: ENDING_RESOURCE_ID,
    origin: 'ending-assembly',
    severity: 'warning',
    message,
    details: [],
  });

  let achievementSet: AchievementSetData | null = null;
  const achievementResource = resources.get(ACHIEVEMENT_RESOURCE_ID);
  if (achievementResource !== undefined) {
    const parsed = parseAchievementSet(achievementResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: ACHIEVEMENT_RESOURCE_ID,
        origin: 'achievement-assembly',
        severity: 'warning',
        message: '成就资料结构无效，已关闭成就系统',
        details: parsed.errors,
      });
    } else {
      achievementSet = parsed.set;
      for (const message of parsed.warnings) warnings.push({
        resource: ACHIEVEMENT_RESOURCE_ID,
        origin: 'achievement-assembly',
        severity: 'warning',
        message,
        details: [],
      });
    }
  }
  const achievementAssembly = assembleAchievementSet({
    set: achievementSet,
    npcIds: placedNpcIds,
    factionIds: new Set(progression.factions.keys()),
    knowledgeNodeIds,
  });
  for (const message of achievementAssembly.warnings) warnings.push({
    resource: ACHIEVEMENT_RESOURCE_ID,
    origin: 'achievement-assembly',
    severity: 'warning',
    message,
    details: [],
  });

  return {
    npcs: allNpcs,
    npcsByPeriod: npcSchedules.placementsByPeriod,
    dialogues: dialogueReferences.conversations,
    progression,
    encounters,
    arenas: arenaAssembly.arenas,
    factionWars: factionWarAssembly.wars,
    martialArtForgeComponents,
    meridianSet,
    equipmentForges: equipmentForgeAssembly.stations,
    alchemyStations: alchemyAssembly.stations,
    endings: endingAssembly.endingSet,
    achievements: achievementAssembly.set,
    items: itemAssembly.items,
    shops: shopAssembly.shops,
    quests: questAssembly.quests,
    companions: companionAssembly.companions,
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
 * Assembles item and shop datasets from every manifest resource of their
 * schema. Structural failures disable only their own resource; duplicate
 * item ids keep the first declaration across manifest order. Missing
 * resources are legitimate — the world then simply has no items or shops.
 * Nothing here can block the map. Shop cross-references run in
 * {@link assembleOptionalContent} once NPC placement is known.
 */
function assembleItemContent(
  resources: ReadonlyMap<string, LoadedResource>,
): { items: ReadonlyMap<string, ItemRecordData>; shopSet: ShopSetData | null; warnings: Diagnostic[] } {
  const warnings: Diagnostic[] = [];

  const itemResources = [...resources.values()].filter((resource) => resource.schema === 'items-set');
  const itemRecords: ItemRecordData[] = [];
  for (const itemResource of itemResources) {
    const parsed = parseItemSet(itemResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: itemResource.id,
        origin: 'item-assembly',
        severity: 'warning',
        message: `物品资料结构不合规，已禁用资源 "${itemResource.id}" 中的物品`,
        details: parsed.errors,
      });
    } else {
      itemRecords.push(...parsed.set.items);
    }
  }
  const itemIndex = indexItems({ items: itemRecords });
  for (const id of itemIndex.duplicateIds) {
    warnings.push({
      origin: 'item-assembly',
      severity: 'warning',
      message: `物品 id "${id}" 在多个条目中重复，保留 manifest 顺序中的首条`,
      details: [],
    });
  }

  const shopResources = [...resources.values()].filter((resource) => resource.schema === 'shops-set');
  let shopSet: ShopSetData | null = shopResources.length === 0 ? null : { shops: [] };
  for (const shopResource of shopResources) {
    const parsed = parseShopSet(shopResource.value);
    if (!parsed.ok) {
      warnings.push({
        resource: shopResource.id,
        origin: 'shop-assembly',
        severity: 'warning',
        message: `商店资料结构不合规，已禁用资源 "${shopResource.id}" 中的商店`,
        details: parsed.errors,
      });
    } else {
      shopSet!.shops.push(...parsed.set.shops);
    }
  }

  return { items: itemIndex.byId, shopSet, warnings };
}
