/**
 * Round 09 shared world loading: the manifest-driven load plus the optional
 * content assembly that used to live privately inside GridScene.
 *
 * Extracted so the main menu and the gameplay scene consume the *same*
 * pipeline — the menu needs the character templates for creation and the
 * same degraded-error behaviour, and duplicating the assembly would drift.
 * Every convention carries over unchanged: the map (manifest/schemas) is
 * required and fatal; NPC/dialogue/progression/battle/item/shop/quest
 * content is optional and degrades per smallest unit with warnings (see
 * docs/ARCHITECTURE.md §2). No world content lives here — ids and text come
 * from `data/` only.
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
  type DialogueData,
  indexConversations,
  parseDialogueSet,
  validateConversation,
} from '../engine/dialogue-graph';
import { assembleDialogueReferences } from '../engine/dialogue-runtime';
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
export const MAP_RESOURCE_ID = 'map.round-01-grid';
const NPC_RESOURCE_ID = 'npc.round-03-set';
const DIALOGUE_RESOURCE_ID = 'dialogue.round-03-set';
const CHARACTER_PROFILE_RESOURCE_ID = 'character-profile.round-04-set';
const FACTION_RESOURCE_ID = 'faction.round-04-set';
const MARTIAL_ART_RESOURCE_ID = 'martial-art.round-04-set';
const ENCOUNTER_RESOURCE_ID = 'encounter.round-05-set';
const ITEM_RESOURCE_ID = 'item.round-06-set';
const SHOP_RESOURCE_ID = 'shop.round-06-set';
const QUEST_RESOURCE_ID = 'quest.round-07-set';

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
  map: GridMap;
  mapResourceId: string;
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

    const mapResource = result.resources.get(MAP_RESOURCE_ID);
    if (mapResource === undefined) {
      return {
        ok: false,
        title: '地图资源缺失',
        lines: [
          `清单中没有 id 为 "${MAP_RESOURCE_ID}" 的资源，请检查 data/base/manifest.json。`,
        ],
      };
    }

    const parsed = parseGridMap(mapResource.value);
    if (!parsed.ok) {
      return { ok: false, title: '地图数据结构不合规', lines: parsed.errors };
    }

    const assembly = assembleOptionalContent(result.resources, parsed.map);
    return {
      ok: true,
      world: {
        map: parsed.map,
        mapResourceId: MAP_RESOURCE_ID,
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
 * Assembles optional NPC/dialogue content. Every failure disables the
 * smallest possible unit — one conversation or one NPC — and becomes a
 * warning instead of killing the scene. Missing (unregistered) resources
 * are legitimate: the world then has no optional interactions or quests.
 */
function assembleOptionalContent(
  resources: ReadonlyMap<string, LoadedResource>,
  map: GridMap,
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

  const placement = assembleNpcPlacements({
    npcSet,
    knownResourceIds: new Set(resources.keys()),
    maps: new Map([[MAP_RESOURCE_ID, map]]),
    currentMapResourceId: MAP_RESOURCE_ID,
    dialogueIds: new Set(dialogues.keys()),
  });
  for (const message of placement.warnings) {
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
    placedNpcIds: new Set(placement.npcs.map((npc) => npc.record.id)),
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
  for (const npc of placement.npcs) {
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
  const encounterPlacement = assembleBattleEncounters({
    encounterSet,
    knownResourceIds: new Set(resources.keys()),
    maps: new Map([[MAP_RESOURCE_ID, map]]),
    currentMapResourceId: MAP_RESOURCE_ID,
    npcCells: new Set(placement.npcs.map((npc) => `${npc.col},${npc.row}`)),
    profiles: progressionAssembled.assembly.profiles,
    martialArts: progressionAssembled.assembly.martialArts,
  });
  for (const message of encounterPlacement.warnings) {
    warnings.push({
      resource: ENCOUNTER_RESOURCE_ID,
      origin: 'encounter-assembly',
      severity: 'warning',
      message,
      details: [],
    });
  }
  encounters = encounterPlacement.encounters;

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
      placement.npcs.filter((npc) => npc.record.questGiver).map((npc) => npc.record.id),
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

  // Round 08: resolve condition/effect references now that quests, items
  // and placed NPCs are all known. A dangling reference drops exactly its
  // option; the conversation (and its referencing NPC) stays playable.
  const placedNpcIds = new Set(placement.npcs.map((npc) => npc.record.id));
  const dialogueReferences = assembleDialogueReferences({
    conversations: dialogues,
    quests: questAssembly.quests,
    items: itemAssembly.items,
    placedNpcIds,
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
    npcs: placement.npcs,
    dialogues: dialogueReferences.conversations,
    progression: progressionAssembled.assembly,
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
