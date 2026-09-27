import Phaser from 'phaser';

import type { Diagnostic } from '../engine/data-loader';
import { GridMap } from '../engine/grid-map';
import { cellCenterOffset, renderGridMap } from '../engine/grid-map-renderer';
import {
  selectAdjacentTransition,
  selectNewRegionEventKnowledgeIds,
  selectTriggeredRegionEvents,
  type RegionTransitionData,
} from '../engine/world-map';
import {
  createKnowledgeState,
  discoverObservedKnowledge,
  mergeNpcKnowledge,
  type KnowledgeObservations,
} from '../engine/knowledge-graph';
import {
  createCompanionState,
  resolveCompanionFollowCell,
  type CompanionState,
} from '../engine/companion-system';
import { createFactionMembershipState, type FactionMembershipState } from '../engine/faction-system';
import {
  type DialogueData,
  type DialogueSession,
} from '../engine/dialogue-graph';
import {
  type DialogueRuntimeContext,
  applyDialogueEffects,
  getVisibleOptions,
} from '../engine/dialogue-runtime';
import { GameClock } from '../engine/game-calendar';
import { selectAdjacentEndingGate, type EndingEvaluationContext } from '../engine/ending-system';
import {
  createAchievementRunState,
  recordAchievementCounter,
  unlockReadyAchievements,
  type AchievementEvaluationContext,
  type AchievementRunState,
} from '../engine/achievement-system';
import { resolveNpcPlacementsForPlayer } from '../engine/npc-schedule';
import {
  ClimateRuntime,
  DEFAULT_WORLD_SEED,
  generateWorldSeed,
  type ClimateSeasonData,
  type ClimateWeatherData,
} from '../engine/climate-system';
import { type SocialState, applySocialChange, createSocialState } from '../engine/social-state';
import {
  NpcOccupancyIndex,
  type PlacedNpc,
  selectInteractionTarget,
} from '../engine/npc-placement';
import {
  type CharacterProfileData,
  type CharacterState,
  type MartialArtData,
  createCharacterState,
  grantExperience,
  resolveStartingMartialArts,
} from '../engine/character-progression';
import {
  CombatSession,
  type PlacedEncounter,
  selectEncounterTarget,
} from '../engine/turn-based-combat';
import {
  arenaOpponentAsEncounter,
  createArenaRecord,
  selectArenaTarget,
  type ArenaRecord,
  type AssembledArena,
} from '../engine/arena-challenge';
import {
  createFactionWarRecord,
  factionWarStageAsEncounter,
  resolveFactionWarOutcome,
  selectFactionWarTarget,
  type AssembledFactionWar,
  type FactionWarRecord,
} from '../engine/faction-war';
import { craftAndRegisterCustomMartialArt, type MartialArtRecipe } from '../engine/martial-art-forge';
import {
  craftEquipment,
  selectEquipmentForgeStation,
} from '../engine/equipment-forge';
import { craftAlchemy, selectAlchemyStation } from '../engine/alchemy-system';
import {
  aggregateMeridianEffects,
  applyMeridianEffects,
  awardCultivationPoints,
  unlockMeridianNode,
  type MeridianSetData,
} from '../engine/meridian-system';
import {
  type AssembledShop,
  type InventoryState,
  type ItemRecordData,
  type ShopStockRuntime,
  createInventoryState,
  createShopStockRuntime,
  countItem,
  additionalCapacityFor,
  grantItems,
  resolveStartingItems,
} from '../engine/item-system';
import {
  type QuestData,
  type QuestJournal,
  type QuestUpdateResult,
  applyQuestSignal,
  createQuestJournal,
} from '../engine/quest-system';
import {
  type SaveSlotId,
  type SaveSnapshotV1,
  type SaveStorage,
  captureSaveSnapshot,
  createBrowserSaveStorage,
  planSnapshotRestore,
  readSaveSlot,
  type RestoredRunState,
  restoreRunState,
  writeSaveSlot,
} from '../engine/save-system';
import {
  type DialogueConfirmOutcome,
  DialoguePanel,
} from './dialogue-ui';
import { BattlePanel } from './combat-ui';
import { InventoryPanel } from './inventory-ui';
import { ShopPanel } from './shop-ui';
import { QuestPanel } from './quest-ui';
import { WorldMapPanel } from './world-map-ui';
import { EncyclopediaPanel } from './encyclopedia-ui';
import { CollectionPanel } from './collection-ui';
import { PauseMenuPanel } from './pause-menu';
import { ControlsPanel } from './controls-ui';
import { FactionPanel } from './faction-ui';
import { CompanionPanel } from './companion-ui';
import { ArenaPanel } from './arena-ui';
import { FactionWarPanel } from './faction-war-ui';
import { MartialArtForgePanel } from './martial-art-forge-ui';
import { EquipmentForgePanel } from './equipment-forge-ui';
import { AlchemyPanel } from './alchemy-ui';
import { EndingPanel } from './ending-ui';
import { AchievementPanel } from './achievement-ui';
import { MeridianPanel } from './meridian-ui';
import { type GameSettings, applyGameSettings, loadGameSettings, uiFontSize } from './settings';
import { createPixelPerson, UI_FONT_FAMILY } from './ui-theme';
import { type GridStartupData } from './menu-scene';
import {
  type LoadedWorld,
  type ProgressionAssembly,
  loadWorldData,
} from './world-loader';

/**
 * Round 03 grid scene, extended with the Round 04 progression datasets,
 * the Round 05 battle slice, Round 06 item/trade slice, Round 07 quests,
 * the Round 08 dialogue condition/effect runtime, the Round 09
 * menu/save/settings flow, Round 14 data-driven in-game clock and Round 15
 * seasonal daily climate and period-driven NPC schedules:
 * successful moves, region travels and the explicit V-key wait advance the
 * calendar (blocked or refused actions cost nothing), the HUD shows the
 * current date/time/period and a depth-sorted daylight wash tints the world
 * layers per period light level; weather adds a deterministic daily tint and
 * procedural rain/snow, and can add time to successful grid steps. NPCs
 * move to their compiled same-map destinations when the calendar period
 * changes. Every overlay stays legible.
 *
 * Since Round 09 the scene starts from {@link GridStartupData} handed over
 * by the menu scene: either a fresh character (`kind:'new'` with the chosen
 * template id and display name) or a save slot to restore (`kind:'load'`).
 * World data loads through the shared `world-loader` (same manifest/schema/
 * optional-content pipeline as before — manifest/schema/map failures stay
 * fatal, every optional dataset degrades per smallest unit). A save load
 * runs the full parse → world preflight → restore pipeline *before* any
 * scene field changes, so a refused save (corrupt, wrong version, dangling
 * profile, unloadable position) shows a readable panel and leaves nothing
 * half-applied; the player returns to the menu with Escape.
 *
 * Escape opens the Round 09 pause menu while exploring (movement locks like
 * every other overlay): continue, save to one of the three slots (explicit
 * success/failure feedback), settings (volume + text scale, applied live)
 * and returning to the main menu behind an explicit confirm. Saving
 * captures the complete Round 06–08 run state through the Phaser-free save
 * engine; the scene keeps zero save-format knowledge of its own.
 *
 * Everything else is unchanged from Round 08: NPCs block cells and talk
 * four-way adjacent (E), quest givers keep the E board while F talks
 * directly, encounters block their cells until beaten (one-shots stay
 * dormant *for the run*, now including across save/load), and B/Q open the
 * backpack/journal. All names and lines come from `data/` — never code.
 */

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

/** Vertical space reserved for controls, run state, climate, and warning lines. */
const HUD_HEIGHT = 72;

const MOVE_DURATION_MS = 110;

/** Presentation-only NPC palette, cycled by placement order (content stays in data). */
const NPC_PALETTE = [0x7ec8a9, 0xc89fd4, 0x8fb7e8, 0xe89f8f] as const;

/** Presentation-only enemy-marker styling (content stays in data). */
const ENCOUNTER_FILL = 0xc96a5a;
const ENCOUNTER_BORDER = 0x30120e;
const ENCOUNTER_SIZE_RATIO = 0.66;

/** Daylight wash: cold night tint layered above the world, below the UI. */
const DAYLIGHT_TINT_COLOR = 0x0a1024;
/** Deepest tint the darkest configured light level can reach. */
const DAYLIGHT_MAX_ALPHA = 0.55;
/** Depth band: world 0 < daylight 50 < HUD text 60 < overlay panels 1000+. */
const DAYLIGHT_DEPTH = 50;
/** Weather washes/particles layer above daylight and below HUD and panels. */
const WEATHER_TINT_DEPTH = 51;
const WEATHER_PARTICLE_DEPTH = 52;
const HUD_TEXT_DEPTH = 60;
/** Duration of the alpha cross-fade when the day period changes. */
const DAYLIGHT_FADE_MS = 600;

const UI = {
  background: '#0b0e14',
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  fontFamily: UI_FONT_FAMILY,
} as const;

export class GridScene extends Phaser.Scene {
  private map: GridMap | null = null;
  private world: LoadedWorld | null = null;
  private currentMapResourceId = '';
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private mapLayer: Phaser.GameObjects.Container | null = null;
  private npcLayer: Phaser.GameObjects.Container | null = null;
  private encounterLayer: Phaser.GameObjects.Container | null = null;
  private marker: Phaser.GameObjects.Container | null = null;
  private playerCol = 0;
  private playerRow = 0;

  /** Round 09 startup payload from the menu scene (null = defensive default new game). */
  private startup: GridStartupData | null = null;

  /** Player-chosen display name (kept for HUD and save snapshots). */
  private playerDisplayName = '';

  /** Movement lock: while a tween is in flight every input is ignored. */
  private moving = false;

  /** NPCs placed on the current map and their occupied cells. */
  private placedNpcs: PlacedNpc[] = [];
  private occupancy = new NpcOccupancyIndex();
  /** Calendar period used by the current NPC placement and visual layer. */
  private lastNpcSchedulePeriodId: string | null = null;
  private readonly npcVisuals = new Map<string, {
    marker: Phaser.GameObjects.Container;
    label: Phaser.GameObjects.Text;
  }>();
  private dialogues: ReadonlyMap<string, DialogueData> = new Map();
  private companions: LoadedWorld['assembly']['companions'] = new Map();
  private companionState: CompanionState = createCompanionState();
  private readonly customMartialArts = new Map<string, MartialArtData>();
  private readonly arenaRecords = new Map<string, ArenaRecord>();
  private activeArenaRun: { arena: AssembledArena; roundIndex: number; wins: number } | null = null;
  private readonly factionWarRecords = new Map<string, FactionWarRecord>();
  private activeFactionWarRun: {
    war: AssembledFactionWar;
    roundIndex: number;
    contribution: number;
    alliedFactionId: string;
    opposingFactionId: string;
  } | null = null;
  private companionFollower: { marker: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } | null = null;

  /** Validated progression datasets (assembled by the shared world loader). */
  private progression: ProgressionAssembly = {
    profiles: new Map(),
    factions: new Map(),
    martialArts: new Map(),
  };
  /** Optional data-authored cultivation network; progression otherwise remains available. */
  private meridianSet: MeridianSetData | null = null;

  /** Placed battle encounters and their per-run completion state (Round 05). */
  private encounters: PlacedEncounter[] = [];
  private readonly completedEncounters = new Set<string>();
  private readonly completedRegionalEvents = new Set<string>();
  private encounterCells = new Map<string, PlacedEncounter>();
  /** Marker graphics per encounter id, removed when a foe is defeated. */
  private encounterMarkers = new Map<string, Phaser.GameObjects.GameObject[]>();

  /** Player runtime state; created from the chosen character profile
   * (Round 06: independent of encounters, so the backpack works even when
   * battle data is missing or invalid; Round 09: or restored from a save). */
  private playerProfile: CharacterProfileData | null = null;
  private playerState: CharacterState | null = null;

  /** Validated item/shop datasets and per-run trade state (Round 06). */
  private items: ReadonlyMap<string, ItemRecordData> = new Map();
  private shops: ReadonlyMap<string, AssembledShop> = new Map();
  private readonly shopStocks = new Map<string, ShopStockRuntime>();
  private inventory: InventoryState | null = null;

  /** Valid quest catalog and per-run journal (persisted since Round 09). */
  private quests: ReadonlyMap<string, QuestData> = new Map();
  private questJournal: QuestJournal = { states: new Map(), trackedQuestId: null };

  /** Player social values plus NPC-specific memories (Rounds 08 and 26). */
  private social: SocialState = createSocialState();
  /** Current student→master relationship, persisted independently of lore. */
  private factionState: FactionMembershipState = createFactionMembershipState();
  /** Discovered encyclopedia entries are run state and participate in saves. */
  private knownKnowledgeNodeIds = new Set<string>();
  /** Historical achievements and durable activity counters belong to this save slot. */
  private achievementState: AchievementRunState = createAchievementRunState();

  /** Round 14 in-game clock; null only before the world finished loading. */
  private clock: GameClock | null = null;
  /** Day-period id the daylight wash was last tuned to (change detection). */
  private lastDaylightPeriodId: string | null = null;
  /** Full-screen tint rectangle between the world layers and the HUD. */
  private daylightLayer: Phaser.GameObjects.Rectangle | null = null;
  /** Deterministic seasons/weather derived from the loaded climate and clock. */
  private climateRuntime: ClimateRuntime | null = null;
  /** Persisted per-run weather seed; generated once for new games. */
  private worldSeed = DEFAULT_WORLD_SEED;
  /** Last climate ids used to avoid rebuilding effects on every minute. */
  private lastClimateSeasonId: string | null = null;
  private lastClimateWeatherId: string | null = null;
  private weatherTintLayer: Phaser.GameObjects.Rectangle | null = null;
  private weatherEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly weatherTextureKeys = {
    rain: 'wuxia-weather-rain-drop',
    snow: 'wuxia-weather-snow-flake',
  } as const;

  private dialoguePanel: DialoguePanel | null = null;
  private battlePanel: BattlePanel | null = null;
  private inventoryPanel: InventoryPanel | null = null;
  private shopPanel: ShopPanel | null = null;
  private questPanel: QuestPanel | null = null;
  private pauseMenu: PauseMenuPanel | null = null;
  private controlsPanel: ControlsPanel | null = null;
  private factionPanel: FactionPanel | null = null;
  private worldMapPanel: WorldMapPanel | null = null;
  private encyclopediaPanel: EncyclopediaPanel | null = null;
  private collectionPanel: CollectionPanel | null = null;
  private companionPanel: CompanionPanel | null = null;
  private arenaPanel: ArenaPanel | null = null;
  private factionWarPanel: FactionWarPanel | null = null;
  private martialArtForgePanel: MartialArtForgePanel | null = null;
  private equipmentForgePanel: EquipmentForgePanel | null = null;
  private alchemyPanel: AlchemyPanel | null = null;
  private endingPanel: EndingPanel | null = null;
  private achievementPanel: AchievementPanel | null = null;
  private meridianPanel: MeridianPanel | null = null;
  private activeSession: CombatSession | null = null;
  private activeEncounter: PlacedEncounter | null = null;

  /** Round 09 storage/settings plumbing (storage null = browser disallows it). */
  private storage: SaveStorage | null = null;
  private settings: GameSettings = { volume: 8, textScaleIndex: 1 };
  /**
   * Timestamp of the most recent overlay close. Escape closes whichever
   * overlay owns it AND fires this scene's Escape key in the same DOM
   * event, so the pause toggle ignores Escape for a short window after any
   * overlay closed — closing a dialogue must not pop the pause menu.
   */
  private lastOverlayCloseAt = -Infinity;

  private coordsText: Phaser.GameObjects.Text | null = null;
  private timeText: Phaser.GameObjects.Text | null = null;
  private climateText: Phaser.GameObjects.Text | null = null;
  private interactText: Phaser.GameObjects.Text | null = null;
  private questTrackerText: Phaser.GameObjects.Text | null = null;
  private questNotice: string | null = null;
  private questNoticeTimer: Phaser.Time.TimerEvent | null = null;
  private regionNotice: string | null = null;
  private regionNoticeTimer: Phaser.Time.TimerEvent | null = null;
  private mapNameText: Phaser.GameObjects.Text | null = null;
  private readonly scaledTextTargets: { text: Phaser.GameObjects.Text; base: number }[] = [];

  constructor() {
    super('grid');
  }

  /** Receives the menu scene's startup payload before create() runs. */
  init(data: object): void {
    const payload = data as Partial<GridStartupData>;
    if (payload.kind === 'new' || payload.kind === 'load') {
      this.startup = {
        kind: payload.kind,
        profileId: typeof payload.profileId === 'string' ? payload.profileId : undefined,
        displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
        slotId: payload.slotId,
      };
    }
  }

  create(): void {
    this.storage = createBrowserSaveStorage();
    this.settings = loadGameSettings(this.storage ?? unavailableStorage());
    applyGameSettings(this.game, this.settings);

    this.bindMovementKeys();
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, '正在加载地图数据…', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: UI.textMuted,
      })
      .setOrigin(0.5);
    void this.loadWorld();
  }

  private async loadWorld(): Promise<void> {
    const outcome = await loadWorldData();
    if (!outcome.ok) {
      this.showErrorState(outcome.title, outcome.lines, true);
      return;
    }
    this.setupWorld(outcome.world);
  }

  /**
   * Adopts the loaded world and initializes the run state: either restored
   * from the requested save slot (parse → world preflight → restore, all
   * *before* any field changes) or freshly created from the chosen/first
   * valid character template.
   */
  private setupWorld(world: LoadedWorld): void {
    const { map, assembly } = world;
    // ---- Run-state resolution first: a refused save must leave this scene
    // untouched (the error panel below then offers Escape back to the menu).
    const playerWarnings: string[] = [];
    let restoredRun:
      | (RestoredRunState & {
          profileId: string;
          displayName: string;
          mapResourceId: string;
          playerPosition: { col: number; row: number };
          /** In-game minutes restored from the save (0 for old v1 saves). */
          elapsedGameMinutes: number;
          /** Daily weather seed restored from the save (fixed default for old v1 saves). */
          worldSeed: number;
        })
      | null = null;

    if (this.startup?.kind === 'load' && this.startup.slotId !== undefined) {
      const restoration = this.restoreFromSlot(world, this.startup.slotId);
      if (restoration === null) {
        return; // The readable failure panel is already on screen.
      }
      restoredRun = restoration.run;
      playerWarnings.push(...restoration.warnings);
    }

    this.children.removeAll(true); // Drop the transient loading hint.
    this.scaledTextTargets.length = 0;
    this.world = world;
    this.achievementState = restoredRun?.achievementState ?? createAchievementRunState();
    this.arenaRecords.clear();
    for (const record of restoredRun?.arenaRecords ?? []) {
      this.arenaRecords.set(record.arenaId, { ...record });
    }
    this.activeArenaRun = null;
    this.factionWarRecords.clear();
    for (const record of restoredRun?.factionWarRecords ?? []) {
      this.factionWarRecords.set(record.warId, { ...record });
    }
    this.activeFactionWarRun = null;
    this.customMartialArts.clear();
    for (const art of restoredRun?.customMartialArts ?? []) {
      this.customMartialArts.set(art.id, art);
    }
    // Round 14 clock: elapsed minutes come from the save when one was
    // restored (older v1 snapshots lack the field and restart at 0), which
    // the calendar start then re-dates using the *current* month table.
    this.clock = new GameClock(world.calendar, restoredRun?.elapsedGameMinutes ?? 0);
    this.lastNpcSchedulePeriodId = null;
    this.npcVisuals.clear();
    this.companionFollower = null;
    this.climateRuntime = new ClimateRuntime(world.climate, world.calendar);
    this.worldSeed = restoredRun?.worldSeed ?? generateWorldSeed();
    this.daylightLayer = null;
    this.lastDaylightPeriodId = null;
    this.lastClimateSeasonId = null;
    this.lastClimateWeatherId = null;
    this.weatherTintLayer = null;
    this.weatherEmitter = null;
    this.knownKnowledgeNodeIds = createKnowledgeState(
      world.knowledgeGraph,
      restoredRun?.knownKnowledgeNodeIds ?? [],
    );
    this.factionState = createFactionMembershipState(restoredRun?.factionMembership ?? null);
    this.currentMapResourceId = restoredRun?.mapResourceId ?? world.mapResourceId;
    const activeMap = world.maps.get(this.currentMapResourceId) ?? map;
    this.map = activeMap;
    this.placedNpcs = assembly.npcs.filter(
      (npc) => npc.record.mapResourceId === this.currentMapResourceId,
    );
    this.dialogues = assembly.dialogues;
    this.companions = assembly.companions;
    this.companionState = createCompanionState(restoredRun?.activeCompanionId ?? null);
    this.progression = assembly.progression;
    this.meridianSet = assembly.meridianSet;
    this.occupancy = new NpcOccupancyIndex(this.placedNpcs);
    this.encounters = assembly.encounters.filter(
      (encounter) => encounter.record.mapResourceId === this.currentMapResourceId,
    );
    this.encounterCells = new Map(
      this.activeEncounters().map((encounter) => [
        `${encounter.col},${encounter.row}`,
        encounter,
      ]),
    );
    this.items = assembly.items;
    this.shops = assembly.shops;
    this.quests = assembly.quests;
    this.encounterMarkers.clear();
    this.completedEncounters.clear();
    this.completedRegionalEvents.clear();

    if (restoredRun !== null) {
      // ---- Save path: adopt the fully restored objects atomically.
      this.playerProfile = assembly.progression.profiles.get(restoredRun.profileId) ?? null;
      this.playerState = restoredRun.character;
      this.inventory = restoredRun.inventory;
      this.questJournal = restoredRun.journal;
      this.social = restoredRun.social;
      this.playerDisplayName = restoredRun.displayName;
      this.shopStocks.clear();
      for (const [shopId, stock] of restoredRun.shopStocks) {
        this.shopStocks.set(shopId, stock);
      }
      for (const encounterId of restoredRun.completedEncounters) {
        this.completedEncounters.add(encounterId);
        const encounter = assembly.encounters.find(
          (candidate) => candidate.record.id === encounterId &&
            candidate.record.mapResourceId === this.currentMapResourceId,
        );
        if (encounter !== undefined) {
          this.encounterCells.delete(`${encounter.col},${encounter.row}`);
        }
      }
      for (const eventId of restoredRun.completedRegionalEvents) {
        this.completedRegionalEvents.add(eventId);
      }
      this.playerCol = restoredRun.playerPosition.col;
      this.playerRow = restoredRun.playerPosition.row;
    } else {
      // ---- New-game path: the run starts from the chosen template (the
      // menu validated it against the same loaded datasets) or, defensively,
      // from the first valid profile. Starting martial arts and items are
      // validated per reference — broken ones drop with a warning.
      // Encounters declaring a different profile are reported so authors
      // can fix the data.
      this.playerProfile = null;
      this.playerState = null;
      this.inventory = null;
      this.playerDisplayName = '';
      this.questJournal = createQuestJournal(this.quests);
      this.social = createSocialState();
      this.factionState = createFactionMembershipState();
      this.shopStocks.clear();
      for (const shop of this.shops.values()) {
        this.shopStocks.set(shop.record.id, createShopStockRuntime(shop));
      }

      const requestedId = this.startup?.kind === 'new' ? this.startup.profileId : undefined;
      const profile =
        (requestedId !== undefined ? assembly.progression.profiles.get(requestedId) : undefined) ??
        assembly.progression.profiles.values().next().value ??
        null;
      if (profile !== null) {
        this.playerProfile = profile;
        this.playerState = createCharacterState(profile, assembly.meridianSet?.resource.initialPoints ?? 0);
        const startingArts = resolveStartingMartialArts(
          profile,
          assembly.progression.martialArts,
        );
        this.playerState.martialArtIds = [...startingArts.ids];
        playerWarnings.push(...startingArts.warnings);
        const startingItems = resolveStartingItems(profile, assembly.items);
        this.inventory = createInventoryState(profile, startingItems.stacks);
        playerWarnings.push(...startingItems.warnings);
        const requestedName =
          this.startup?.kind === 'new' ? (this.startup.displayName ?? '') : '';
        this.playerDisplayName =
          requestedName.trim().length > 0 ? requestedName.trim() : profile.name;
        for (const encounter of assembly.encounters) {
          if (encounter.profile.id !== profile.id) {
            playerWarnings.push(
              `遭遇 "${encounter.record.id}" 声明的角色模板 "${encounter.profile.id}" 与创建玩家所用模板 "${profile.id}" 不同，仍沿用后者`,
            );
          }
        }
      }
      this.playerCol = map.playerStart.col;
      this.playerRow = map.playerStart.row;
    }
    this.social.npcKnowledge = mergeNpcKnowledge(world.knowledgeGraph, this.social.npcKnowledge);
    this.syncKnowledgeFromRunFacts();
    if (this.playerProfile !== null && this.playerState !== null) {
      applyMeridianEffects(
        this.playerProfile,
        this.playerState,
        aggregateMeridianEffects(this.meridianSet, this.playerState.unlockedMeridianNodeIds),
      );
    }
    this.lastNpcSchedulePeriodId = this.clock.currentPeriod().id;
    this.placedNpcs = this.resolveNpcPlacements(this.lastNpcSchedulePeriodId);
    this.occupancy = new NpcOccupancyIndex(this.placedNpcs);
    for (const message of playerWarnings) {
      console.warn(`[optional] ${message}`);
    }

    // Progression datasets surface their loaded counts in the console so
    // authors can confirm their JSON actually landed.
    console.info(
      '[progression] 已加载角色模板 %d 个、门派 %d 个、武学 %d 种、战斗遭遇 %d 处、物品 %d 种、商店 %d 家、任务 %d 项',
      this.progression.profiles.size,
      this.progression.factions.size,
      this.progression.martialArts.size,
      this.encounters.length,
      this.items.size,
      this.shops.size,
      this.quests.size,
    );

    this.mapOrigin.set(
      (VIEW_WIDTH - map.pixelWidth) / 2,
      HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT - map.pixelHeight) / 2,
    );
    this.mapLayer = renderGridMap(this, activeMap, this.mapOrigin.x, this.mapOrigin.y);

    const startOffset = cellCenterOffset(activeMap, this.playerCol, this.playerRow);
    this.marker = createPixelPerson(
      this,
      this.mapOrigin.x + startOffset.x,
      this.mapOrigin.y + startOffset.y,
      map.tileSize,
      0xe8b04b,
      0x3a2c12,
    );

    this.renderNpcs(activeMap);
    this.renderEncounterMarkers(activeMap);
    this.renderArenaMarkers(activeMap);
    this.renderFactionWarMarkers(activeMap);
    this.renderEquipmentForgeMarkers(activeMap);
    this.renderAlchemyMarkers(activeMap);
    this.renderEndingGateMarker(activeMap);
    this.ensureDaylightLayer();
    this.buildHud(activeMap, world.optionalWarnings, world.modWarnings);
    this.updateCoordsHud();
    this.updateTimeHud();
    this.updateClimatePresentation(false);

    this.dialoguePanel = new DialoguePanel(this, {
      onClose: () => this.noteOverlayClosed(), // Also refreshes the hint.
    });
    this.battlePanel = new BattlePanel(this, {
      onClose: () => this.settleBattleClose(),
    });
    this.inventoryPanel = new InventoryPanel(this, {
      onClose: () => this.noteOverlayClosed(),
      onChange: () => this.refreshQuestCollectObjectives(),
    });
    this.shopPanel = new ShopPanel(this, {
      onClose: () => this.noteOverlayClosed(),
      onChange: () => this.refreshQuestCollectObjectives(),
    });
    this.questPanel = new QuestPanel(this, {
      onClose: () => this.noteOverlayClosed(),
      onUpdate: (update) => this.applyQuestUpdate(update),
    });
    this.pauseMenu = new PauseMenuPanel(this, {
      storage: this.storage,
      save: (slotId) => this.saveToSlot(slotId),
      returnToMenu: () => this.returnToMenu(),
      onClose: () => {
        this.settings = this.pauseMenu?.currentSettings() ?? this.settings;
        this.noteOverlayClosed();
      },
    });
    this.controlsPanel = new ControlsPanel(this);
    this.factionPanel = new FactionPanel(this, () => this.noteOverlayClosed());
    this.companionPanel = new CompanionPanel(this, () => this.noteOverlayClosed());
    this.arenaPanel = new ArenaPanel(this, () => this.noteOverlayClosed());
    this.factionWarPanel = new FactionWarPanel(this, () => this.noteOverlayClosed());
    this.martialArtForgePanel = new MartialArtForgePanel(this, () => this.noteOverlayClosed());
    this.equipmentForgePanel = new EquipmentForgePanel(this, () => this.noteOverlayClosed());
    this.alchemyPanel = new AlchemyPanel(this, () => this.noteOverlayClosed());
    this.endingPanel = new EndingPanel(this, () => this.noteOverlayClosed());
    this.achievementPanel = new AchievementPanel(this, () => this.noteOverlayClosed());
    this.meridianPanel = new MeridianPanel(this, () => this.noteOverlayClosed());
    this.worldMapPanel = new WorldMapPanel(this, () => this.noteOverlayClosed());
    this.encyclopediaPanel = new EncyclopediaPanel(this, { onClose: () => this.noteOverlayClosed() });
    this.collectionPanel = new CollectionPanel(this, { onClose: () => this.noteOverlayClosed() });
    this.updateQuestTrackerHud();
    this.updateInteractHint();
    this.triggerRegionEvents();
  }

  // -------------------------------------------------------------------------
  // Round 09 save/restore plumbing
  // -------------------------------------------------------------------------

  /**
   * Reads, parses, preflights and restores the requested slot against the
   * loaded world. Returns null (with the readable failure panel on screen
   * and Escape bound back to the menu) on any refusal — this scene's live
   * fields are guaranteed untouched because nothing is assigned before the
   * whole pipeline succeeded.
   */
  private restoreFromSlot(
    world: LoadedWorld,
    slotId: SaveSlotId,
  ): {
    run: RestoredRunState & {
      profileId: string;
      displayName: string;
      mapResourceId: string;
      playerPosition: { col: number; row: number };
      elapsedGameMinutes: number;
      worldSeed: number;
    };
    warnings: string[];
  } | null {
    if (this.storage === null) {
      this.showErrorState('读档失败', ['浏览器本地存储不可用，无法读取存档。'], true);
      return null;
    }
    const read = readSaveSlot(this.storage, slotId);
    if (!read.ok) {
      this.showErrorState(
        read.reason === 'empty' ? '读档失败：槽位为空' : '读档失败：存档无法使用',
        [read.message, ...read.errors, '', '按 Esc 返回主菜单。'],
        true,
      );
      return null;
    }

    const plan = planSnapshotRestore(
      read.snapshot,
      this.saveWorldReferences(world, read.snapshot),
    );
    if (!plan.ok) {
      this.showErrorState('读档失败：存档与当前资料不兼容', [...plan.errors, '', '按 Esc 返回主菜单。'], true);
      return null;
    }
    for (const warning of plan.warnings) {
      console.warn(`[save] ${warning}`);
    }

    const profile = world.assembly.progression.profiles.get(read.snapshot.profileId);
    if (profile === undefined) {
      // Defensive: the preflight above already guarantees this exists.
      this.showErrorState('读档失败', [`存档引用的角色模板 "${read.snapshot.profileId}" 不可用。`], true);
      return null;
    }
    const restored = restoreRunState({
      profile,
      items: world.assembly.items,
      quests: world.assembly.quests,
      shops: world.assembly.shops,
      snapshot: plan.snapshot,
    });
    console.info(
      '[save] 已从 %s 读档：%s Lv.%d（位置 %d,%d，银两 %d）',
      slotId,
      read.snapshot.displayName,
      restored.character.level,
      read.snapshot.playerPosition.col,
      read.snapshot.playerPosition.row,
      restored.inventory.currency,
    );
    return {
      run: {
        ...restored,
        profileId: read.snapshot.profileId,
        displayName: read.snapshot.displayName,
        mapResourceId: read.snapshot.mapResourceId,
        playerPosition: { ...read.snapshot.playerPosition },
        elapsedGameMinutes: read.snapshot.elapsedGameMinutes,
        worldSeed: read.snapshot.worldSeed,
      },
      warnings: plan.warnings,
    };
  }

  /** Assembles the world id/geometry index a save preflight checks against. */
  private saveWorldReferences(world: LoadedWorld, snapshot: SaveSnapshotV1) {
    const map = world.map;
    const completedEncounters = new Set(snapshot.completedEncounters);
    const activeCompanionNpcId = snapshot.activeCompanionId === null
      ? null
      : world.assembly.companions.get(snapshot.activeCompanionId)?.npcId ?? null;
    const periodId = new GameClock(world.calendar, snapshot.elapsedGameMinutes).currentPeriod().id;
    const periodNpcs = world.assembly.npcsByPeriod.get(periodId) ?? world.assembly.npcs;
    const maps = new Map([...world.maps.entries()].map(([mapId, regionMap]) => {
      const baseNpcs = world.assembly.npcs.filter((npc) =>
        npc.record.mapResourceId === mapId && npc.record.id !== activeCompanionNpcId,
      );
      const scheduledNpcs = periodNpcs.filter((npc) =>
        npc.record.mapResourceId === mapId && npc.record.id !== activeCompanionNpcId,
      );
      const activeEncounters = world.assembly.encounters.filter((encounter) =>
        encounter.record.mapResourceId === mapId &&
        (encounter.record.repeatable || !completedEncounters.has(encounter.record.id)),
      );
      const npcPlayerPosition = snapshot.mapResourceId === mapId
        ? snapshot.playerPosition
        : null;
      const resolvedNpcs = resolveNpcPlacementsForPlayer({
        baseNpcs,
        periodNpcs: scheduledNpcs,
        mapResourceId: mapId,
        map: regionMap,
        playerPosition: npcPlayerPosition,
        blockedCells: new Set(activeEncounters.map((encounter) => `${encounter.col},${encounter.row}`)),
      });
      const occupiedCells = new Set(
        resolvedNpcs.map((npc) => `${npc.col},${npc.row}`),
      );
      for (const encounter of activeEncounters) {
        occupiedCells.add(`${encounter.col},${encounter.row}`);
      }
      return [mapId, {
        isWalkableCell: (col: number, row: number) => regionMap.canEnter(col, row),
        isCellOccupied: (col: number, row: number) => occupiedCells.has(`${col},${row}`),
      }];
    }));
    const questObjectives = new Map<string, ReadonlySet<string>>();
    for (const quest of world.assembly.quests.values()) {
      questObjectives.set(quest.id, new Set(quest.objectives.map((objective) => objective.id)));
    }
    return {
      profileIds: new Set(world.assembly.progression.profiles.keys()),
      profileRecords: world.assembly.progression.profiles,
      mapResourceId: world.mapResourceId,
      isWalkableCell: (col: number, row: number) => map.canEnter(col, row),
      isCellOccupied: (col: number, row: number) => maps.get(world.mapResourceId)?.isCellOccupied(col, row) ?? false,
      maps,
      itemIds: new Set(world.assembly.items.keys()),
      itemRecords: world.assembly.items,
      martialArtIds: new Set(world.assembly.progression.martialArts.keys()),
      questIds: new Set(world.assembly.quests.keys()),
      questObjectiveIds: questObjectives,
      encounterIds: new Set(
        world.assembly.encounters.map((encounter) => encounter.record.id),
      ),
      shopIds: new Set(world.assembly.shops.keys()),
      shopRecords: world.assembly.shops,
      questRecords: world.assembly.quests,
      npcIds: new Set(world.assembly.npcs.map((npc) => npc.record.id)),
      regionalEventIds: new Set(world.worldMap.events.map((event) => event.id)),
      knowledgeNodeIds: new Set(world.knowledgeGraph.nodes.keys()),
      defaultKnowledgeNodeIds: new Set(
        [...world.knowledgeGraph.nodes.values()]
          .filter((node) => node.knownByDefault)
          .map((node) => node.id),
      ),
      factionIds: new Set(world.assembly.progression.factions.keys()),
      factionMentorNpcIds: new Map(
        [...world.assembly.progression.factions.entries()].map(([factionId, faction]) => [
          factionId,
          new Set(faction.mentorNpcIds),
        ]),
      ),
      companionIds: new Set(world.assembly.companions.keys()),
      factionWarIds: new Set(world.assembly.factionWars.map((war) => war.record.id)),
      meridianNodeIds: new Set(world.assembly.meridianSet?.nodes.map((node) => node.id) ?? []),
    };
  }

  /** Captures the live run into one slot; readable feedback for the pause menu. */
  private saveToSlot(slotId: SaveSlotId): { ok: boolean; message: string } {
    if (this.storage === null || this.playerState === null || this.inventory === null) {
      return { ok: false, message: '浏览器本地存储不可用或当前无可保存的进度' };
    }
    this.syncKnowledgeFromRunFacts();
    const snapshot = captureSaveSnapshot({
      displayName: this.playerDisplayName,
      mapResourceId: this.currentMapResourceId,
      playerCol: this.playerCol,
      playerRow: this.playerRow,
      character: this.playerState,
      inventory: this.inventory,
      shopStocks: this.shopStocks,
      journal: this.questJournal,
      social: this.social,
      completedEncounters: this.completedEncounters,
      completedRegionalEvents: this.completedRegionalEvents,
      knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
      elapsedGameMinutes: this.clock?.elapsedMinutes ?? 0,
      worldSeed: this.worldSeed,
      factionMembership: this.factionState.membership,
      activeCompanionId: this.companionState.activeCompanionId,
      arenaRecords: this.arenaRecords,
      factionWarRecords: this.factionWarRecords,
      customMartialArts: this.customMartialArts,
      achievementState: this.achievementState,
    });
    const result = writeSaveSlot(this.storage, slotId, snapshot);
    if (result.ok) {
      console.info('[save] 已保存到 %s（%s）', slotId, result.savedAt);
      return { ok: true, message: `保存成功（${snapshot.displayName} Lv.${snapshot.player.level}）` };
    }
    console.warn('[save] 保存失败：', result.message);
    return { ok: false, message: result.message };
  }

  /** Leaves the run and hands control back to the main menu scene. */
  private returnToMenu(): void {
    this.scene.start('menu');
  }

  /**
   * Overlay-close hook: refresh the hint line (movement keys off `isOpen`)
   * and arm the short window during which the scene-level Escape ignores
   * keypresses, so closing a dialogue with Escape never opens the pause
   * menu in the same keypress.
   */
  private noteOverlayClosed(): void {
    this.lastOverlayCloseAt = this.time.now;
    this.refreshScaledTextTargets();
    this.updateInteractHint();
  }

  /** Escape while exploring: toggle the pause menu (never over another overlay). */
  private togglePauseMenu(): void {
    if (this.factionPanel?.isOpen) {
      this.factionPanel.close();
      this.noteOverlayClosed();
      return;
    }
    if (this.controlsPanel?.isOpen) {
      this.controlsPanel.close();
      this.noteOverlayClosed();
      return;
    }
    const panel = this.pauseMenu;
    if (panel === null) {
      return;
    }
    if (panel.isOpen) {
      panel.close();
      this.noteOverlayClosed();
      return;
    }
    if (this.anyOverlayOpen()) {
      return; // Another overlay owns the keyboard right now.
    }
    // An overlay closed by this same Escape press must not count as "free".
    if (this.time.now - this.lastOverlayCloseAt < 150) {
      return;
    }
    panel.open(this.settings);
    this.settings = panel.currentSettings();
    this.updateInteractHint();
  }

  /** Draws each still-active encounter marker and its data-driven name. */
  private renderEncounterMarkers(map: GridMap): void {
    this.encounterLayer = this.add.container();
    for (const encounter of this.activeEncounters()) {
      const center = cellCenterOffset(map, encounter.col, encounter.row);
      const size = map.tileSize * ENCOUNTER_SIZE_RATIO;
      const body = this.add.rectangle(
        this.mapOrigin.x + center.x,
        this.mapOrigin.y + center.y,
        size,
        size,
        ENCOUNTER_FILL,
      );
      body.setStrokeStyle(3, ENCOUNTER_BORDER);
      body.setAngle(45); // Diamond silhouette separates foes from NPC squares.

      const label = this.registerScaledText(this.add
        .text(
          this.mapOrigin.x + center.x,
          this.mapOrigin.y + center.y - size / 2 - 4,
          encounter.record.enemy.name,
          {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(10),
            color: UI.textPrimary,
          },
        )
        .setOrigin(0.5, 1), 10);

      this.encounterLayer.add([body, label]);
      this.encounterMarkers.set(encounter.record.id, [body, label]);
    }
  }

  /** Small gold tile distinguishes non-blocking tournament entrances from foes. */
  private renderArenaMarkers(map: GridMap): void {
    const arenas = this.world?.assembly.arenas.filter((arena) =>
      arena.record.mapResourceId === this.currentMapResourceId,
    ) ?? [];
    for (const arena of arenas) {
      const center = cellCenterOffset(map, arena.record.position.col, arena.record.position.row);
      const x = this.mapOrigin.x + center.x;
      const y = this.mapOrigin.y + center.y;
      const badge = this.add.rectangle(x, y, Math.max(18, map.tileSize * 0.42), Math.max(18, map.tileSize * 0.42), 0x80602e)
        .setStrokeStyle(2, 0xe8c66a).setDepth(4);
      const label = this.registerScaledText(this.add.text(x, y, '擂', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: '#fff1c4',
      }).setOrigin(0.5).setDepth(5), 12);
      this.encounterLayer?.add([badge, label]);
    }
  }

  /** Green knot marks a non-blocking faction-war rally point. */
  private renderFactionWarMarkers(map: GridMap): void {
    const wars = this.world?.assembly.factionWars.filter((war) =>
      war.record.mapResourceId === this.currentMapResourceId,
    ) ?? [];
    for (const war of wars) {
      const center = cellCenterOffset(map, war.record.position.col, war.record.position.row);
      const x = this.mapOrigin.x + center.x;
      const y = this.mapOrigin.y + center.y;
      const badge = this.add.rectangle(x, y, Math.max(20, map.tileSize * 0.48), Math.max(20, map.tileSize * 0.48), 0x315c48)
        .setStrokeStyle(2, 0x88cda0).setDepth(4);
      const label = this.registerScaledText(this.add.text(x, y, '盟', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: '#d8f4d6',
      }).setOrigin(0.5).setDepth(5), 12);
      this.encounterLayer?.add([badge, label]);
    }
  }

  /** Amber anvil mark denotes a fixed item-forging station from world data. */
  private renderEquipmentForgeMarkers(map: GridMap): void {
    const stations = this.world?.assembly.equipmentForges.filter((station) =>
      station.record.mapResourceId === this.currentMapResourceId,
    ) ?? [];
    for (const station of stations) {
      const center = cellCenterOffset(map, station.record.position.col, station.record.position.row);
      const x = this.mapOrigin.x + center.x;
      const y = this.mapOrigin.y + center.y;
      const badge = this.add.rectangle(x, y, Math.max(20, map.tileSize * 0.48), Math.max(20, map.tileSize * 0.48), 0x74502a)
        .setStrokeStyle(2, 0xf0b85a).setDepth(4);
      const label = this.registerScaledText(this.add.text(x, y, '锻', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: '#fff0c8',
      }).setOrigin(0.5).setDepth(5), 12);
      this.encounterLayer?.add([badge, label]);
    }
  }

  /** Jade cauldron badge denotes a fixed data-authored medicine station. */
  private renderAlchemyMarkers(map: GridMap): void {
    const stations = this.world?.assembly.alchemyStations.filter((station) =>
      station.record.mapResourceId === this.currentMapResourceId,
    ) ?? [];
    for (const station of stations) {
      const center = cellCenterOffset(map, station.record.position.col, station.record.position.row);
      const x = this.mapOrigin.x + center.x;
      const y = this.mapOrigin.y + center.y;
      const badge = this.add.rectangle(x, y, Math.max(20, map.tileSize * 0.48), Math.max(20, map.tileSize * 0.48), 0x285a50)
        .setStrokeStyle(2, 0x83d5ae).setDepth(4);
      const label = this.registerScaledText(this.add.text(x, y, '药', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: '#e3fff1',
      }).setOrigin(0.5).setDepth(5), 12);
      this.encounterLayer?.add([badge, label]);
    }
  }

  /** A gold mirror badge marks the data-authored location where the journey can conclude. */
  private renderEndingGateMarker(map: GridMap): void {
    const gate = this.world?.assembly.endings?.gate;
    if (gate === undefined || gate.mapResourceId !== this.currentMapResourceId) return;
    const center = cellCenterOffset(map, gate.position.col, gate.position.row);
    const x = this.mapOrigin.x + center.x;
    const y = this.mapOrigin.y + center.y;
    const badge = this.add.rectangle(x, y, Math.max(22, map.tileSize * 0.52), Math.max(22, map.tileSize * 0.52), 0x55472b)
      .setStrokeStyle(2, 0xe8cb7c).setDepth(4);
    const label = this.registerScaledText(this.add.text(x, y, '终', {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(12),
      color: '#fff4c9',
    }).setOrigin(0.5).setDepth(5), 12);
    this.encounterLayer?.add([badge, label]);
  }

  /**
   * Encounters still standing this run: repeatable ones always, one-shot
   * ones only until their first victory. One-shot completion persists in
   * versioned save snapshots.
   */
  private activeEncounters(): PlacedEncounter[] {
    return this.encounters.filter(
      (encounter) =>
        encounter.record.repeatable || !this.completedEncounters.has(encounter.record.id),
    );
  }

  /** Opens the data-authored signup card; item capacity is reserved up front. */
  private openArenaSignup(arena: AssembledArena): void {
    const panel = this.arenaPanel;
    if (panel === null) return;
    const record = this.arenaRecords.get(arena.record.id) ?? createArenaRecord(arena.record.id);
    this.arenaRecords.set(record.arenaId, record);
    const blocked = this.arenaRegistrationBlock(arena);
    const rewardLines = [
      arena.record.reward.currency + ' 文钱',
      ...arena.record.reward.items.map((entry) =>
        (this.items.get(entry.itemId)?.name ?? entry.itemId) + ' ×' + entry.quantity,
      ),
    ];
    panel.open({
      arena,
      record,
      rewardLines,
      registrationBlockedReason: blocked,
      onRegister: () => {
        record.attempts += 1;
        this.activeArenaRun = { arena, roundIndex: 0, wins: 0 };
        this.startArenaRound();
        this.updateInteractHint();
      },
    });
    this.updateInteractHint();
  }

  /** Guarantees the one-time clear reward can be committed as a whole. */
  private arenaRegistrationBlock(arena: AssembledArena): string | null {
    if (this.playerProfile === null || this.playerState === null || this.inventory === null) {
      return '当前角色状态不可用，暂时不能报名。';
    }
    if (this.playerProfile.id !== arena.record.profileId) {
      return '当前角色不符合这座擂台的报名模板。';
    }
    if (this.inventory.currency + arena.record.reward.currency > 999_999_999) {
      return '钱袋已满，先花用一些文钱再来报名。';
    }
    const trial = {
      ...this.inventory,
      stacks: this.inventory.stacks.map((stack) => ({ ...stack })),
      equipped: { ...this.inventory.equipped },
    };
    for (const entry of arena.record.reward.items) {
      const item = this.items.get(entry.itemId);
      if (item === undefined || additionalCapacityFor(trial, item) < entry.quantity) {
        return '背包空位不足以收下全部夺魁彩头，请先整理背包。';
      }
      grantItems(trial, item, entry.quantity);
    }
    return null;
  }

  /** Starts one independent combat session for the current tournament round. */
  private startArenaRound(): void {
    const run = this.activeArenaRun;
    const battlePanel = this.battlePanel;
    const player = this.playerState;
    const profile = this.playerProfile;
    if (run === null || battlePanel === null || player === null || profile === null) return;
    const opponent = run.arena.record.opponents[run.roundIndex];
    if (opponent === undefined) return;
    const encounterRecord = arenaOpponentAsEncounter(run.arena.record, opponent, profile.id);
    const placed: PlacedEncounter = {
      record: encounterRecord,
      col: run.arena.record.position.col,
      row: run.arena.record.position.row,
      profile,
      enemyArts: [...(run.arena.enemyArts.get(opponent.id) ?? [])],
    };
    const activeCompanion = this.companions.get(this.companionState.activeCompanionId ?? '');
    const companionNpc = activeCompanion === undefined
      ? undefined
      : this.world?.assembly.npcs.find((npc) => npc.record.id === activeCompanion.npcId);
    const session = new CombatSession({
      encounter: placed.record,
      profile,
      player,
      martialArts: this.combatMartialArts(),
      ...(this.meridianSet !== null ? { meridianResourceRules: this.meridianSet.resource } : {}),
      ...(activeCompanion !== undefined && companionNpc !== undefined
        ? { companion: { name: companionNpc.record.name, support: activeCompanion.combatSupport } }
        : {}),
    });
    this.activeSession = session;
    this.activeEncounter = null; // Arena victories are not overworld quest encounters.
    battlePanel.open(session);
  }

  /** Closes an attempt, stores the streak and pays only a full-clear reward. */
  private finishArenaAttempt(champion: boolean): void {
    const run = this.activeArenaRun;
    if (run === null) return;
    const record = this.arenaRecords.get(run.arena.record.id) ?? createArenaRecord(run.arena.record.id);
    record.bestWins = Math.max(record.bestWins, run.wins);
    record.lastWins = run.wins;
    if (champion && this.inventory !== null) {
      record.championships += 1;
      this.inventory.currency += run.arena.record.reward.currency;
      for (const reward of run.arena.record.reward.items) {
        const item = this.items.get(reward.itemId);
        if (item !== undefined) grantItems(this.inventory, item, reward.quantity);
      }
      this.syncKnowledgeFromRunFacts();
      const prizes = [
        run.arena.record.reward.currency + ' 文钱',
        ...run.arena.record.reward.items.map((reward) =>
          (this.items.get(reward.itemId)?.name ?? reward.itemId) + ' ×' + reward.quantity,
        ),
      ].join('、');
      this.showRegionNotice(run.arena.record.texts.champion + ' 彩头：' + prizes + '。');
    } else {
      this.showRegionNotice(run.arena.record.texts.retreat + ' 本次胜场：' + run.wins + '。');
    }
    this.arenaRecords.set(record.arenaId, record);
    console.info(
      '[arena] 擂台 "%s" 结束：胜场 %d/%d，%s',
      run.arena.record.id,
      run.wins,
      run.arena.record.opponents.length,
      champion ? '夺魁' : '未夺魁',
    );
  }

  /** Opens the faction-side eligibility check, authored campaign card and record book. */
  private openFactionWarSignup(war: AssembledFactionWar): void {
    const panel = this.factionWarPanel;
    if (panel === null) return;
    const record = this.factionWarRecords.get(war.record.id) ?? createFactionWarRecord(war.record.id);
    const membership = this.factionState.membership;
    let blocked: string | null = null;
    if (this.playerProfile === null || this.playerState === null) blocked = '当前角色状态不可用，暂时不能报名。';
    else if (membership === null ||
      (membership.factionId !== war.record.firstFactionId && membership.factionId !== war.record.secondFactionId)) {
      blocked = '只有参战门派的在籍弟子可以报名。';
    }
    panel.open({
      war,
      factions: this.progression.factions,
      membership,
      record,
      registrationBlockedReason: blocked,
      onRegister: () => {
        if (membership === null) return;
        record.attempts += 1;
        this.factionWarRecords.set(record.warId, record);
        const opposingFactionId = membership.factionId === war.record.firstFactionId
          ? war.record.secondFactionId : war.record.firstFactionId;
        this.activeFactionWarRun = {
          war, roundIndex: 0, contribution: 0,
          alliedFactionId: membership.factionId,
          opposingFactionId,
        };
        this.startFactionWarStage();
        this.updateInteractHint();
      },
    });
    this.updateInteractHint();
  }

  /** Starts a war round without registering it as a normal quest encounter. */
  private startFactionWarStage(): void {
    const run = this.activeFactionWarRun;
    const battlePanel = this.battlePanel;
    const player = this.playerState;
    const profile = this.playerProfile;
    if (run === null || battlePanel === null || player === null || profile === null) return;
    const stage = run.war.record.stages[run.roundIndex];
    if (stage === undefined) return;
    const encounter = factionWarStageAsEncounter(run.war.record, stage, profile.id, run.opposingFactionId);
    const activeCompanion = this.companions.get(this.companionState.activeCompanionId ?? '');
    const companionNpc = activeCompanion === undefined
      ? undefined
      : this.world?.assembly.npcs.find((npc) => npc.record.id === activeCompanion.npcId);
    this.activeSession = new CombatSession({
      encounter,
      profile,
      player,
      martialArts: this.combatMartialArts(),
      ...(this.meridianSet !== null ? { meridianResourceRules: this.meridianSet.resource } : {}),
      ...(activeCompanion !== undefined && companionNpc !== undefined
        ? { companion: { name: companionNpc.record.name, support: activeCompanion.combatSupport } }
        : {}),
    });
    this.activeEncounter = null;
    battlePanel.open(this.activeSession);
  }

  /** Commits one result exactly once and makes its social/lore consequences visible. */
  private finishFactionWarAttempt(
    run: NonNullable<GridScene['activeFactionWarRun']>,
    outcomeId: 'victory' | 'stalemate' | 'defeat',
  ): void {
    const record = this.factionWarRecords.get(run.war.record.id) ?? createFactionWarRecord(run.war.record.id);
    const outcome = run.war.record.outcomes[outcomeId];
    record.bestContribution = Math.max(record.bestContribution, run.contribution);
    record.lastContribution = run.contribution;
    record.lastOutcome = outcomeId;
    if (outcomeId === 'victory') record.victories += 1;
    else if (outcomeId === 'stalemate') record.stalemates += 1;
    else record.defeats += 1;
    this.factionWarRecords.set(record.warId, record);
    applySocialChange(this.social, { kind: 'renown', delta: outcome.personalRenownDelta });
    applySocialChange(this.social, { kind: 'factionRenown', factionId: run.alliedFactionId, delta: outcome.alliedFactionRenownDelta });
    applySocialChange(this.social, { kind: 'factionRenown', factionId: run.opposingFactionId, delta: outcome.opposingFactionRenownDelta });
    const node = this.world?.knowledgeGraph.nodes.get(outcome.knowledgeNodeId);
    const discovery = node !== undefined && !this.knownKnowledgeNodeIds.has(node.id)
      ? (this.knownKnowledgeNodeIds.add(node.id), `新见闻「${node.title}」已记入江湖百闻。`)
      : '';
    this.showRegionNotice(outcome.text + (discovery.length > 0 ? ' ' + discovery : ''));
    console.info('[faction-war] 会盟「%s」结束：贡献 %d/%d，结果 %s',
      run.war.record.id, run.contribution, run.war.record.contributionThreshold, outcomeId);
  }

  /**
   * Battle-overlay close hook: the session has already settled everything
   * (experience, defeat recovery) inside the engine; the scene only records
   * one-shot completion, drops panel references and refreshes the HUD.
   */
  private settleBattleClose(): void {
    const session = this.activeSession;
    if (session?.finalResult?.outcome === 'victory') {
      this.achievementState = recordAchievementCounter(this.achievementState, 'battleVictories');
    }
    const encounter = this.activeEncounter;
    const factionWarRun = this.activeFactionWarRun;
    const arenaRun = this.activeArenaRun;
    if (session !== null && factionWarRun !== null) {
      const result = session.finalResult;
      if (result?.outcome === 'victory') {
        const stage = factionWarRun.war.record.stages[factionWarRun.roundIndex];
        if (stage !== undefined) factionWarRun.contribution += stage.contribution;
      }
      this.activeSession = null;
      this.activeEncounter = null;
      const reachedThreshold = factionWarRun.contribution >= factionWarRun.war.record.contributionThreshold;
      const endedEarly = result === null || result.outcome === 'fled';
      const exhaustedStages = factionWarRun.roundIndex + 1 >= factionWarRun.war.record.stages.length;
      if (!reachedThreshold && !endedEarly && !exhaustedStages) {
        factionWarRun.roundIndex += 1;
        this.startFactionWarStage();
      } else {
        const outcome = resolveFactionWarOutcome(factionWarRun.contribution, factionWarRun.war.record.contributionThreshold);
        this.activeFactionWarRun = null;
        this.finishFactionWarAttempt(factionWarRun, outcome);
      }
      this.noteOverlayClosed();
      return;
    }
    if (session !== null && arenaRun !== null) {
      const result = session.finalResult;
      if (result?.outcome === 'victory') arenaRun.wins += 1;
      this.activeSession = null;
      this.activeEncounter = null;
      if (
        result?.outcome === 'victory' &&
        arenaRun.roundIndex + 1 < arenaRun.arena.record.opponents.length
      ) {
        arenaRun.roundIndex += 1;
        this.startArenaRound();
      } else {
        this.finishArenaAttempt(
          result?.outcome === 'victory' && arenaRun.wins === arenaRun.arena.record.opponents.length,
        );
        this.activeArenaRun = null;
      }
      this.noteOverlayClosed();
      return;
    }
    if (session !== null && encounter !== null) {
      const result = session.finalResult;
      if (result?.outcome === 'victory') {
        this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, {
          type: 'encounter-victory',
          encounterId: encounter.record.id,
        }));
      } else if (result?.outcome === 'defeat') {
        this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, {
          type: 'encounter-defeat',
          encounterId: encounter.record.id,
        }));
      }
      if (result?.outcome === 'victory' && !encounter.record.repeatable) {
        this.completedEncounters.add(encounter.record.id);
        this.encounterCells.delete(`${encounter.col},${encounter.row}`);
        for (const marker of this.encounterMarkers.get(encounter.record.id) ?? []) {
          marker.destroy();
        }
        this.encounterMarkers.delete(encounter.record.id);
      }
      if (result !== null) {
        console.info(
          '[battle] 遭遇 "%s" 结束：%s（经验 +%d，升级 %d 次）',
          encounter.record.id,
          result.outcome,
          result.experienceGained,
          result.levelsGained,
        );
      }
    }
    this.activeSession = null;
    this.activeEncounter = null;
    this.noteOverlayClosed();
  }

  /** Draws every placed NPC and its data-driven name label. */
  private renderNpcs(map: GridMap): void {
    this.npcLayer = this.add.container();
    this.npcVisuals.clear();
    (this.world?.assembly.npcs ?? [])
      .filter((npc) => npc.record.mapResourceId === this.currentMapResourceId)
      .forEach((npc) => this.createNpcVisual(npc, map));
    this.syncNpcVisuals(false);
    this.refreshCompanionFollower(null);
  }

  private createNpcVisual(npc: PlacedNpc, map: GridMap): void {
    const center = cellCenterOffset(map, npc.col, npc.row);
    const colorIndex = Math.max(
      0,
      this.world?.assembly.npcs.findIndex((candidate) => candidate.record.id === npc.record.id) ?? 0,
    );
    const marker = createPixelPerson(
      this,
      this.mapOrigin.x + center.x,
      this.mapOrigin.y + center.y,
      map.tileSize,
      NPC_PALETTE[colorIndex % NPC_PALETTE.length] ?? NPC_PALETTE[0],
    );
    const label = this.registerScaledText(this.add
      .text(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y - map.tileSize * 0.42 - 4, npc.record.name, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textPrimary,
      })
      .setOrigin(0.5, 1), 10);
    this.npcLayer?.add([marker, label]);
    this.npcVisuals.set(npc.record.id, { marker, label });
  }

  /** Resolves a compiled period layout against the player's live location. */
  private resolveNpcPlacements(periodId: string): PlacedNpc[] {
    const world = this.world;
    const map = this.map;
    if (world === null || map === null) return [];

    const activeNpcId = this.activeCompanionNpc()?.record.id ?? null;
    const withoutFollower = (npcs: readonly PlacedNpc[]): PlacedNpc[] =>
      activeNpcId === null ? [...npcs] : npcs.filter((npc) => npc.record.id !== activeNpcId);
    const compiled = withoutFollower(world.assembly.npcsByPeriod.get(periodId) ?? world.assembly.npcs);
    return resolveNpcPlacementsForPlayer({
      baseNpcs: withoutFollower(world.assembly.npcs),
      periodNpcs: compiled,
      mapResourceId: this.currentMapResourceId,
      map,
      playerPosition: { col: this.playerCol, row: this.playerRow },
      blockedCells: new Set(this.encounterCells.keys()),
    });
  }

  /** Repositions NPCs and rebuilds logical occupancy only when the period changes. */
  private syncNpcSchedule(animate: boolean): void {
    const clock = this.clock;
    const map = this.map;
    if (clock === null || map === null) return;
    const periodId = clock.currentPeriod().id;
    if (this.lastNpcSchedulePeriodId === periodId) return;
    this.lastNpcSchedulePeriodId = periodId;

    const nextNpcs = this.resolveNpcPlacements(periodId);
    this.placedNpcs = nextNpcs;
    this.occupancy = new NpcOccupancyIndex(nextNpcs);
    this.syncNpcVisuals(animate);
    this.refreshCompanionFollower(null);
    this.updateInteractHint();
  }

  /** Reapplies the current schedule after a partner joins or leaves. */
  private refreshNpcPlacements(): void {
    const periodId = this.clock?.currentPeriod().id;
    if (periodId === undefined) return;
    this.lastNpcSchedulePeriodId = periodId;
    this.placedNpcs = this.resolveNpcPlacements(periodId);
    this.occupancy = new NpcOccupancyIndex(this.placedNpcs);
    this.syncNpcVisuals(false);
    this.refreshCompanionFollower(null);
    this.updateInteractHint();
  }

  private syncNpcVisuals(animate: boolean): void {
    const map = this.map;
    if (map === null) return;
    const nextNpcs = this.placedNpcs;
    const nextById = new Map(nextNpcs.map((npc) => [npc.record.id, npc]));
    for (const [npcId, visual] of this.npcVisuals) {
      const npc = nextById.get(npcId);
      if (npc === undefined) {
        this.tweens.killTweensOf(visual.marker);
        this.tweens.killTweensOf(visual.label);
        visual.marker.setVisible(false);
        visual.label.setVisible(false);
        continue;
      }
      visual.marker.setVisible(true);
      visual.label.setVisible(true);
      const center = cellCenterOffset(map, npc.col, npc.row);
      const x = this.mapOrigin.x + center.x;
      const y = this.mapOrigin.y + center.y;
      if (animate) {
        this.tweens.add({ targets: visual.marker, x, y, duration: 420 });
        this.tweens.add({ targets: visual.label, x, y: y - map.tileSize * 0.42 - 4, duration: 420 });
      } else {
        visual.marker.setPosition(x, y);
        visual.label.setPosition(x, y - map.tileSize * 0.42 - 4);
      }
    }
  }

  private activeCompanionNpc(): PlacedNpc | undefined {
    const id = this.companions.get(this.companionState.activeCompanionId ?? '')?.npcId;
    return id === undefined ? undefined : this.world?.assembly.npcs.find((npc) => npc.record.id === id);
  }

  /** Places a non-blocking companion marker on a safe orthogonal trail cell. */
  private refreshCompanionFollower(preferred: { col: number; row: number } | null): void {
    const map = this.map;
    const companion = this.companions.get(this.companionState.activeCompanionId ?? '');
    const npc = companion === undefined
      ? undefined
      : this.world?.assembly.npcs.find((candidate) => candidate.record.id === companion.npcId);
    if (map === null || companion === undefined || npc === undefined) {
      this.companionFollower?.marker.setVisible(false);
      this.companionFollower?.label.setVisible(false);
      return;
    }
    if (this.companionFollower === null) {
      const center = cellCenterOffset(map, this.playerCol, this.playerRow);
      const marker = createPixelPerson(this, this.mapOrigin.x + center.x, this.mapOrigin.y + center.y, map.tileSize, 0x48c8a3, 0x173a32);
      const label = this.registerScaledText(this.add.text(
        this.mapOrigin.x + center.x,
        this.mapOrigin.y + center.y - map.tileSize * 0.42 - 4,
        npc.record.name,
        { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(10), color: UI.textPrimary },
      ).setOrigin(0.5, 1), 10);
      this.npcLayer?.add([marker, label]);
      this.companionFollower = { marker, label };
    }
    const blocked = new Set([
      ...this.placedNpcs.map((entry) => `${entry.col},${entry.row}`),
      ...this.encounterCells.keys(),
      ...(this.world?.assembly.arenas
        .filter((arena) => arena.record.mapResourceId === this.currentMapResourceId)
        .map((arena) => String(arena.record.position.col) + ',' + String(arena.record.position.row)) ?? []),
    ]);
    const cell = resolveCompanionFollowCell(
      map,
      { col: this.playerCol, row: this.playerRow },
      preferred,
      blocked,
    );
    const visual = this.companionFollower;
    if (cell === null || visual === null) {
      visual?.marker.setVisible(false);
      visual?.label.setVisible(false);
      return;
    }
    const center = cellCenterOffset(map, cell.col, cell.row);
    const x = this.mapOrigin.x + center.x;
    const y = this.mapOrigin.y + center.y;
    visual.label.setText(npc.record.name);
    visual.marker.setPosition(x, y).setVisible(true);
    visual.label.setPosition(x, y - map.tileSize * 0.42 - 4).setVisible(true);
  }

  private buildHud(
    map: GridMap,
    optionalWarnings: readonly Diagnostic[],
    modWarnings: readonly Diagnostic[],
  ): void {
    // HUD text lives above the daylight wash (depth 50) so every period's
    // tint keeps the interface fully legible.
    this.registerScaledText(this.add
      .text(16, 12, '方向键 / WASD 移动 · E 交互 · P 伙伴 · H 帮助', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textMuted,
      })
      .setOrigin(0, 0)
      .setDepth(HUD_TEXT_DEPTH), 13);

    this.questTrackerText = this.registerScaledText(this.add
      .text(16, 34, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(11),
        color: UI.textMuted,
        wordWrap: { width: 360 },
      })
      .setOrigin(0, 0)
      .setDepth(HUD_TEXT_DEPTH), 11);

    this.mapNameText = this.registerScaledText(this.add
      .text(VIEW_WIDTH / 2, 14, map.data.name, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: UI.textPrimary,
      })
      .setOrigin(0.5, 0)
      .setDepth(HUD_TEXT_DEPTH), 14);

    const lines: { text: string; shown: boolean }[] = [
      {
        text: '部分可选资料（NPC/伙伴/对话/成长/战斗/物品/商店/任务）无效，已禁用相应内容（详情见控制台）',
        shown: optionalWarnings.length > 0,
      },
      {
        text: '部分 MOD 覆盖无效，已回退到上一有效数据（详情见控制台）',
        shown: modWarnings.length > 0,
      },
    ];
    lines.forEach((line, index) => {
      if (!line.shown) {
        return;
      }
      this.registerScaledText(this.add
        .text(VIEW_WIDTH / 2, 33 + index * 15, line.text, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(11),
          color: UI.textWarn,
        })
        .setOrigin(0.5, 0)
        .setDepth(HUD_TEXT_DEPTH), 11);
    });
    for (const diagnostic of optionalWarnings) {
      console.warn(`[optional] ${diagnostic.message}`, diagnostic.details);
    }

    this.coordsText = this.registerScaledText(this.add
      .text(VIEW_WIDTH - 16, 14, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textPrimary,
      })
      .setOrigin(1, 0)
      .setDepth(HUD_TEXT_DEPTH), 13);

    this.timeText = this.registerScaledText(this.add
      .text(VIEW_WIDTH - 16, 34, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textPrimary,
      })
      .setOrigin(1, 0)
      .setDepth(HUD_TEXT_DEPTH), 13);

    this.climateText = this.registerScaledText(this.add
      .text(VIEW_WIDTH - 16, 51, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textMuted,
      })
      .setOrigin(1, 0)
      .setDepth(HUD_TEXT_DEPTH), 10);

    // Interaction status line under the map: adjacent-NPC prompt or the
    // explicit empty-state hint required when no NPC is interactable.
    this.interactText = this.registerScaledText(this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT - 14, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.textWarn,
      })
      .setOrigin(0.5, 1)
      .setDepth(HUD_TEXT_DEPTH), 12);
  }

  private registerScaledText(text: Phaser.GameObjects.Text, base: number): Phaser.GameObjects.Text {
    this.scaledTextTargets.push({ text, base });
    return text;
  }

  /** Refreshes already-rendered exploration labels after the live setting changes. */
  private refreshScaledTextTargets(): void {
    const survivors: typeof this.scaledTextTargets = [];
    for (const target of this.scaledTextTargets) {
      if (!target.text.active) continue;
      target.text.setFontSize(uiFontSize(target.base));
      survivors.push(target);
    }
    this.scaledTextTargets.splice(0, this.scaledTextTargets.length, ...survivors);
  }

  private updateCoordsHud(): void {
    const name = this.playerDisplayName.length > 0 ? `${this.playerDisplayName} · ` : '';
    this.coordsText?.setText(`${name}位置 (${this.playerCol}, ${this.playerRow})`);
  }

  // -------------------------------------------------------------------------
  // Round 14 in-game time: advancement, waiting, HUD and daylight
  // -------------------------------------------------------------------------

  /**
   * Advances the clock by the given action cost and refreshes the time HUD
   * and daylight wash. Called only after an action actually completed —
   * blocked moves, refused transitions and open overlays never reach here,
   * and a zero/non-finite cost (e.g. stepMinutes 0) is a no-op.
   */
  private advanceTime(minutes: number): void {
    const clock = this.clock;
    if (clock === null || !clock.advance(minutes)) {
      return;
    }
    this.updateTimeHud();
    this.updateDaylight(true);
    this.updateClimatePresentation(true);
    this.syncNpcSchedule(true);
  }

  /** V key: wait in place. Blocked by any open overlay or in-flight move. */
  private handleWait(): void {
    const clock = this.clock;
    if (clock === null || this.moving || this.anyOverlayOpen()) {
      return;
    }
    const minutes = clock.calendar.actionCosts.waitMinutes;
    this.advanceTime(minutes);
    const period = clock.currentPeriod();
    this.triggerRegionEvents(`静候片刻（${minutes} 分钟），此刻已是「${period.name}」。`);
  }

  /** Refreshes the calendar HUD line from the clock's derived snapshot. */
  private updateTimeHud(): void {
    const clock = this.clock;
    if (clock === null || this.timeText === null) {
      return;
    }
    const stamp = clock.snapshot();
    const month = clock.calendar.months[stamp.monthIndex];
    const hour = String(Math.floor(stamp.minuteOfDay / 60)).padStart(2, '0');
    const minute = String(stamp.minuteOfDay % 60).padStart(2, '0');
    const monthName = month === undefined ? '?' : month.name;
    this.timeText.setText(
      `第${stamp.year}年 ${monthName}${stamp.day}日 ${hour}:${minute} · ${clock.currentPeriod().name}`,
    );
  }

  /**
   * Recreates the daylight wash after the world layers changed. The fixed
   * depth band keeps it above every world object (including layers rebuilt
   * on region switches) and below the HUD text and overlay panels, so the
   * UI stays legible at any light level.
   */
  private ensureDaylightLayer(): void {
    if (this.daylightLayer !== null && this.daylightLayer.active) {
      return;
    }
    this.daylightLayer = this.add
      .rectangle(
        VIEW_WIDTH / 2,
        HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT) / 2,
        VIEW_WIDTH,
        VIEW_HEIGHT - HUD_HEIGHT,
        DAYLIGHT_TINT_COLOR,
        0,
      )
      .setDepth(DAYLIGHT_DEPTH);
    this.updateDaylight(false);
  }

  /**
   * Tunes the daylight wash to the current period's light level. The tint
   * alpha is (1 − lightLevel) × maximum, so full daylight stays untinted and
   * the darkest period never exceeds the legibility cap; an actual period
   * change cross-fades instead of snapping.
   */
  private updateDaylight(animate: boolean): void {
    const layer = this.daylightLayer;
    const clock = this.clock;
    if (layer === null || clock === null) {
      return;
    }
    const period = clock.currentPeriod();
    if (this.lastDaylightPeriodId === period.id) {
      return;
    }
    this.lastDaylightPeriodId = period.id;
    const targetAlpha = Math.max(0, Math.min(1, 1 - period.lightLevel)) * DAYLIGHT_MAX_ALPHA;
    this.tweens.killTweensOf(layer);
    if (animate) {
      this.tweens.add({ targets: layer, alpha: targetAlpha, duration: DAYLIGHT_FADE_MS });
    } else {
      layer.setAlpha(targetAlpha);
    }
  }

  /** Current data-driven season and weather for the in-game calendar date. */
  private currentClimate(): { season: ClimateSeasonData; weather: ClimateWeatherData } | null {
    const clock = this.clock;
    const climate = this.climateRuntime;
    if (clock === null || climate === null) {
      return null;
    }
    const stamp = clock.snapshot();
    return {
      season: climate.seasonForStamp(stamp),
      weather: climate.weatherForDay(this.worldSeed, stamp),
    };
  }

  /** Updates climate tint and generated precipitation only when the daily reading changes. */
  private updateClimatePresentation(animate: boolean): void {
    const reading = this.currentClimate();
    if (reading === null) {
      return;
    }
    const { season, weather } = reading;
    const movementNote = weather.stepMinutes > 0 ? ` · 行走 +${weather.stepMinutes} 分/格` : '';
    this.climateText?.setText(`${season.name} · ${weather.name}${movementNote}`);
    if (
      this.lastClimateSeasonId === season.id &&
      this.lastClimateWeatherId === weather.id
    ) {
      return;
    }
    this.lastClimateSeasonId = season.id;
    this.lastClimateWeatherId = weather.id;

    let layer = this.weatherTintLayer;
    if (layer === null || !layer.active) {
      layer = this.add.rectangle(
        VIEW_WIDTH / 2,
        HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT) / 2,
        VIEW_WIDTH,
        VIEW_HEIGHT - HUD_HEIGHT,
        weather.tintColor,
        1,
      ).setDepth(WEATHER_TINT_DEPTH);
      this.weatherTintLayer = layer;
    }
    this.tweens.killTweensOf(layer);
    layer.setFillStyle(weather.tintColor, 1);
    if (animate && weather.tintAlpha > 0) {
      layer.setAlpha(0);
      this.tweens.add({
        targets: layer,
        alpha: weather.tintAlpha,
        duration: DAYLIGHT_FADE_MS,
      });
    } else {
      layer.setAlpha(weather.tintAlpha);
    }
    this.replaceWeatherEmitter(weather);
  }

  /** Replaces the previous day's particles with a bounded procedural effect. */
  private replaceWeatherEmitter(weather: ClimateWeatherData): void {
    this.weatherEmitter?.destroy();
    this.weatherEmitter = null;
    const precipitation = weather.precipitation;
    if (precipitation === null || precipitation.density <= 0) {
      return;
    }

    const textureKey = this.weatherTextureKeys[precipitation.kind];
    if (!this.textures.exists(textureKey)) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0xffffff, 1);
      if (precipitation.kind === 'rain') {
        graphics.fillRect(1, 0, 2, 9);
        graphics.generateTexture(textureKey, 4, 10);
      } else {
        graphics.fillCircle(3, 3, 2.5);
        graphics.generateTexture(textureKey, 6, 6);
      }
      graphics.destroy();
    }

    const isRain = precipitation.kind === 'rain';
    const emitter = this.add.particles(0, 0, textureKey, {
      x: { min: 0, max: VIEW_WIDTH },
      y: { min: HUD_HEIGHT, max: VIEW_HEIGHT },
      lifespan: isRain ? { min: 1400, max: 2200 } : { min: 3200, max: 5200 },
      speedX: isRain ? { min: -18, max: 18 } : { min: -26, max: 26 },
      speedY: isRain ? { min: 200, max: 310 } : { min: 24, max: 68 },
      frequency: Math.max(35, Math.round(260 - precipitation.density * 220)),
      quantity: 1,
      tint: isRain ? 0xcbd9ed : 0xf4f8ff,
      alpha: { start: 0.86, end: 0.16 },
      scale: isRain ? 0.82 : 0.8,
    });
    this.weatherEmitter = emitter.setDepth(WEATHER_PARTICLE_DEPTH);
  }

  /** Refreshes the bottom status line from the current adjacency state. */
  private updateInteractHint(): void {
    this.refreshAchievementUnlocks();
    if (this.interactText === null) {
      return;
    }
    if (this.controlsPanel?.isOpen) {
      this.interactText.setText('按 H 或 Esc 收起操作手册');
      return;
    }
    if (this.anyOverlayOpen()) {
      this.interactText.setText('');
      return;
    }
    if (this.regionNotice !== null) {
      this.interactText.setText(this.regionNotice);
      return;
    }

    // Adjacent NPCs win the prompt; otherwise an adjacent encounter shows
    // its data-driven approach line.
    const npcTarget =
      this.map === null
        ? null
        : selectInteractionTarget(this.placedNpcs, {
            col: this.playerCol,
            row: this.playerRow,
          });
    if (npcTarget !== null) {
      const keepsShop =
        npcTarget.record.shopId !== null && this.shops.has(npcTarget.record.shopId);
      const keepsQuests =
        npcTarget.record.questGiver &&
        [...this.quests.values()].some((quest) => quest.giverNpcId === npcTarget.record.id);
      const prompt = keepsShop
        ? `按 E 与「${npcTarget.record.name}」交易 · F 交谈`
        : keepsQuests
          ? `按 E 向「${npcTarget.record.name}」查看差事 · F 交谈`
          : `按 E 与「${npcTarget.record.name}」交谈`;
      this.interactText.setText(prompt);
      return;
    }
    const encounterTarget = selectEncounterTarget(this.activeEncounters(), {
      col: this.playerCol,
      row: this.playerRow,
    });
    if (encounterTarget !== null) {
      this.interactText.setText(encounterTarget.record.texts.approach);
      return;
    }
    const arenaTarget = this.world === null ? null : selectArenaTarget(
      this.world.assembly.arenas,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (arenaTarget !== null) {
      this.interactText.setText(arenaTarget.record.texts.approach);
      return;
    }
    const factionWarTarget = this.world === null ? null : selectFactionWarTarget(
      this.world.assembly.factionWars,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (factionWarTarget !== null) {
      this.interactText.setText(factionWarTarget.record.texts.approach);
      return;
    }
    const forgeTarget = this.world === null ? null : selectEquipmentForgeStation(
      this.world.assembly.equipmentForges,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (forgeTarget !== null) {
      this.interactText.setText(`按 E 在「${forgeTarget.record.name}」锻造装备 · ${forgeTarget.recipes.length} 种配方`);
      return;
    }
    const alchemyTarget = this.world === null ? null : selectAlchemyStation(
      this.world.assembly.alchemyStations,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (alchemyTarget !== null) {
      const known = alchemyTarget.recipes.filter((recipe) => this.knownKnowledgeNodeIds.has(recipe.discoveryNodeId)).length;
      this.interactText.setText(`按 E 在「${alchemyTarget.record.name}」炼药 · 已识药方 ${known}/${alchemyTarget.recipes.length}`);
      return;
    }
    const gate = this.world === null
      ? null
      : selectAdjacentTransition(this.world.worldMap.transitions, this.currentMapResourceId, {
          col: this.playerCol,
          row: this.playerRow,
        });
    if (gate !== null) {
      this.interactText.setText(`按 E 通过「${gate.name}」前往另一处地界`);
      return;
    }
    const endingGate = this.world === null ? null : selectAdjacentEndingGate(
      this.world.assembly.endings,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (endingGate !== null) {
      this.interactText.setText(endingGate.gate.approachText);
      return;
    }
    if (this.placedNpcs.length === 0 && this.activeEncounters().length === 0) {
      this.interactText.setText(this.companionState.activeCompanionId === null
        ? '暂无可交互人物'
        : 'P 同行伙伴 · 暂无可交互人物');
      return;
    }
    this.interactText.setText('N 经脉 · C 自创武学 · L 图鉴 · G 成就 · H 操作帮助 · Esc 暂停');
  }

  /** True while any keyboard overlay owns the input (dialogue/battle/backpack/shop/quest/pause). */
  private anyOverlayOpen(): boolean {
    return (
      (this.dialoguePanel !== null && this.dialoguePanel.isOpen) ||
      (this.battlePanel !== null && this.battlePanel.isOpen) ||
      (this.inventoryPanel !== null && this.inventoryPanel.isOpen) ||
      (this.shopPanel !== null && this.shopPanel.isOpen) ||
      (this.questPanel !== null && this.questPanel.isOpen) ||
      (this.pauseMenu !== null && this.pauseMenu.isOpen) ||
      (this.worldMapPanel !== null && this.worldMapPanel.isOpen) ||
      (this.encyclopediaPanel !== null && this.encyclopediaPanel.isOpen) ||
      (this.collectionPanel !== null && this.collectionPanel.isOpen) ||
      (this.factionPanel !== null && this.factionPanel.isOpen) ||
      (this.companionPanel !== null && this.companionPanel.isOpen) ||
      (this.arenaPanel !== null && this.arenaPanel.isOpen) ||
      (this.factionWarPanel !== null && this.factionWarPanel.isOpen) ||
      (this.martialArtForgePanel !== null && this.martialArtForgePanel.isOpen) ||
      (this.equipmentForgePanel !== null && this.equipmentForgePanel.isOpen) ||
      (this.alchemyPanel !== null && this.alchemyPanel.isOpen) ||
      (this.endingPanel !== null && this.endingPanel.isOpen) ||
      (this.achievementPanel !== null && this.achievementPanel.isOpen) ||
      (this.meridianPanel !== null && this.meridianPanel.isOpen) ||
      (this.controlsPanel !== null && this.controlsPanel.isOpen)
    );
  }

  /** J key: inspect all faction rules and the current recorded lineage. */
  private toggleFactionPanel(): void {
    const panel = this.factionPanel;
    if (panel === null) return;
    if (panel.isOpen) {
      panel.close();
      this.noteOverlayClosed();
      return;
    }
    if (this.anyOverlayOpen()) return;
    panel.open({
      factions: this.progression.factions,
      membership: this.factionState.membership,
      social: this.social,
      npcNames: new Map((this.world?.assembly.npcs ?? []).map((npc) => [npc.record.id, npc.record.name])),
      quests: this.quests,
    });
    this.updateInteractHint();
  }

  /** C key: create a balanced player martial art from loaded data components. */
  private toggleMartialArtForge(): void {
    const panel = this.martialArtForgePanel;
    const components = this.world?.assembly.martialArtForgeComponents ?? null;
    const inventory = this.inventory;
    const player = this.playerState;
    if (panel === null) return;
    if (panel.isOpen || this.anyOverlayOpen()) return;
    if (components === null || inventory === null || player === null) {
      this.showRegionNotice(components === null
        ? '自创武学组件资料暂不可用，创制入口已关闭。'
        : '当前角色或背包状态不可用，暂时不能创制。');
      return;
    }
    panel.open({
      components,
      existingArts: [...this.customMartialArts.values()],
      occupiedIds: new Set([...this.progression.martialArts.keys(), ...this.customMartialArts.keys()]),
      currency: inventory.currency,
      onCraft: (recipe: MartialArtRecipe, name: string) => {
        const result = craftAndRegisterCustomMartialArt({
          components, recipe, name,
          existingArts: [...this.customMartialArts.values()],
          occupiedIds: new Set([...this.progression.martialArts.keys(), ...this.customMartialArts.keys()]),
          inventory,
          learnedArtIds: player.martialArtIds,
          customArts: this.customMartialArts,
        });
        if (!result.ok) return { ok: false, message: result.reason };
        this.showRegionNotice(`自创武学「${result.art.name}」已成，内力 ${result.art.combat.qiCost}，银两 -${result.silverCost}。`);
        return { ok: true, message: '创制成功' };
      },
    });
    this.updateInteractHint();
  }

  /** N key: study an available data-authored meridian node outside combat. */
  private toggleMeridianPanel(): void {
    const panel = this.meridianPanel;
    if (panel === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    const set = this.meridianSet;
    const character = this.playerState;
    const inventory = this.inventory;
    const profile = this.playerProfile;
    if (set === null || set.nodes.length === 0) {
      this.showRegionNotice('经脉资料暂不可用，内修入口已关闭。');
      return;
    }
    if (character === null || inventory === null || profile === null) {
      this.showRegionNotice('当前角色或背包状态不可用，暂时不能内修。');
      return;
    }
    panel.open({
      set,
      character,
      inventory,
      items: this.items,
      onUnlock: (nodeId) => {
        const result = unlockMeridianNode({ set, nodeId, character, inventory, items: this.items });
        if (!result.ok) return { ok: false, message: result.reason };
        applyMeridianEffects(profile, character, aggregateMeridianEffects(set, character.unlockedMeridianNodeIds));
        const effectNames: string[] = [];
        if (result.node.effects.health > 0) effectNames.push(`气血 +${result.node.effects.health}`);
        if (result.node.effects.qi > 0) effectNames.push(`内力 +${result.node.effects.qi}`);
        for (const [id, amount] of Object.entries(result.node.effects.attributes)) {
          if (amount > 0) effectNames.push(`${id} +${amount}`);
        }
        this.showRegionNotice(`打通「${result.node.name}」：${effectNames.join('、')}。`);
        return { ok: true, message: `已打通「${result.node.name}」，剩余修为 ${result.remainingPoints}。` };
      },
    });
    this.updateInteractHint();
  }

  /** P key: inspect the party and let the current companion temporarily leave. */
  private toggleCompanionPanel(): void {
    const panel = this.companionPanel;
    if (panel === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    panel.open({
      companions: this.companions,
      activeCompanionId: this.companionState.activeCompanionId,
      npcNames: new Map((this.world?.assembly.npcs ?? []).map((npc) => [npc.record.id, npc.record.name])),
      social: this.social,
      onDismiss: () => {
        this.companionState.activeCompanionId = null;
        this.refreshNpcPlacements();
      },
    });
    this.updateInteractHint();
  }

  /** Player combat sees data-authored arts plus this run's bounded creations. */
  private combatMartialArts(): ReadonlyMap<string, MartialArtData> {
    return new Map([...this.progression.martialArts, ...this.customMartialArts]);
  }

  /** H key: show the keyboard reference without allowing world input through. */
  private toggleControlsPanel(): void {
    const panel = this.controlsPanel;
    if (panel === null) return;
    if (panel.isOpen) {
      panel.close();
      this.noteOverlayClosed();
      return;
    }
    if (this.anyOverlayOpen()) return;
    panel.open();
    this.updateInteractHint();
  }

  /** Q key: open the journal anywhere, or close it while it owns input. */
  private toggleQuestJournal(): void {
    const panel = this.questPanel;
    if (panel === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen() || this.quests.size === 0 || this.inventory === null) return;
    panel.open({
      quests: this.quests,
      journal: this.questJournal,
      itemCounts: this.questItemCounts(),
    });
    this.updateInteractHint();
  }

  /** M key: show the read-only region atlas while locking exploration input. */
  private toggleWorldMap(): void {
    const panel = this.worldMapPanel;
    const world = this.world;
    if (panel === null || world === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    panel.open(world.worldMap, this.currentMapResourceId);
    this.updateInteractHint();
  }

  /** K key: browse known graph entries without exposing undiscovered details. */
  private toggleEncyclopedia(): void {
    const panel = this.encyclopediaPanel;
    const world = this.world;
    if (panel === null || world === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    panel.open({ graph: world.knowledgeGraph, knownNodeIds: this.knownKnowledgeNodeIds });
    this.updateInteractHint();
  }

  /** L key: inspect collection progress derived from the shared knowledge graph. */
  private toggleCollection(): void {
    const panel = this.collectionPanel;
    const world = this.world;
    if (panel === null || world === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    this.syncKnowledgeFromRunFacts();
    panel.open({ graph: world.knowledgeGraph, knownNodeIds: this.knownKnowledgeNodeIds });
    this.updateInteractHint();
  }

  /** Reconciles concrete runtime facts against same-id graph entries only. */
  private recordKnowledgeObservations(observations: KnowledgeObservations): void {
    const graph = this.world?.knowledgeGraph;
    if (graph === undefined) return;
    discoverObservedKnowledge(graph, this.knownKnowledgeNodeIds, observations);
  }

  /** Items, learned arts and the current map are observed at stable run boundaries. */
  private syncKnowledgeFromRunFacts(): void {
    this.recordKnowledgeObservations({
      placeIds: this.currentMapResourceId.length > 0 ? [this.currentMapResourceId] : [],
      itemIds: (this.inventory?.stacks ?? [])
        .filter((stack) => stack.quantity > 0)
        .map((stack) => stack.itemId),
      martialArtIds: this.playerState?.martialArtIds ?? [],
    });
  }

  /** G key: inspect data-authored achievements and current journey progress. */
  private toggleAchievements(): void {
    const panel = this.achievementPanel;
    const set = this.world?.assembly.achievements ?? null;
    if (panel === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    if (set === null || set.achievements.length === 0) {
      this.showRegionNotice('当前世界没有可用的成就资料。');
      return;
    }
    this.refreshAchievementUnlocks();
    const context = this.achievementEvaluationContext();
    if (context === null) return;
    panel.open({ set, state: this.achievementState, context });
    this.updateInteractHint();
  }

  private achievementEvaluationContext(): AchievementEvaluationContext | null {
    const character = this.playerState;
    if (character === null) return null;
    return {
      character,
      customMartialArtCount: this.customMartialArts.size,
      questStatuses: new Map([...this.questJournal.states].map(([id, state]) => [id, state.status])),
      knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
      social: this.social,
      factionMembership: this.factionState.membership,
      relationships: this.social.relationships,
      arenaRecords: this.arenaRecords,
      state: this.achievementState,
    };
  }

  /** Latches eligible achievements and awards each authored reward once per save. */
  private refreshAchievementUnlocks(): void {
    const set = this.world?.assembly.achievements ?? null;
    const profile = this.playerProfile;
    const character = this.playerState;
    const inventory = this.inventory;
    if (set === null || profile === null || character === null || inventory === null) return;
    const notices: string[] = [];
    for (let pass = 0; pass <= set.achievements.length; pass += 1) {
      const context = this.achievementEvaluationContext();
      if (context === null) return;
      const result = unlockReadyAchievements(set, this.achievementState, context);
      if (result.newlyUnlocked.length === 0) break;
      this.achievementState = result.state;
      for (const achievement of result.newlyUnlocked) {
        const currency = achievement.reward.currency ?? 0;
        inventory.currency = Math.min(999_999_999, inventory.currency + currency);
        const experience = grantExperience(profile, character, achievement.reward.experience ?? 0);
        if (this.meridianSet !== null) {
          awardCultivationPoints(character, experience.levelsGained, this.meridianSet.resource);
        }
        notices.push(achievement.title);
        console.info('[achievement] 已解锁 "%s"：经验 +%d，银两 +%d',
          achievement.id, achievement.reward.experience ?? 0, currency);
      }
    }
    if (notices.length > 0) this.showRegionNotice('成就达成：' + notices.join('、'));
  }

  private questItemCounts(): ReadonlyMap<string, number> {
    const counts = new Map<string, number>();
    if (this.inventory === null) return counts;
    for (const quest of this.quests.values()) {
      for (const objective of quest.objectives) {
        if (objective.kind === 'collectItem') {
          counts.set(objective.targetId, countItem(this.inventory, objective.targetId));
        }
      }
    }
    return counts;
  }

  /** Reconciles collect goals after any successful use or shop transaction. */
  private refreshQuestCollectObjectives(): void {
    this.syncKnowledgeFromRunFacts();
    if (this.inventory === null) return;
    const completed: QuestUpdateResult['completed'][number][] = [];
    const failedQuestIds: string[] = [];
    let changed = false;
    for (const [itemId, quantity] of this.questItemCounts()) {
      const update = applyQuestSignal(this.quests, this.questJournal, {
        type: 'item-count', itemId, quantity,
      });
      changed ||= update.changed;
      completed.push(...update.completed);
      failedQuestIds.push(...update.failedQuestIds);
    }
    this.applyQuestUpdate({ changed, completed, failedQuestIds });
  }

  /** Applies one state transition's rewards and refreshes the visible tracker. */
  private applyQuestUpdate(update: QuestUpdateResult): void {
    if (update.completed.length > 0 || update.failedQuestIds.length > 0) {
      this.questNoticeTimer?.remove(false);
      this.questNoticeTimer = null;
    }
    if (this.playerProfile !== null && this.playerState !== null && this.inventory !== null) {
      for (const reward of update.completed) {
        const quest = this.quests.get(reward.questId);
        const experience = grantExperience(this.playerProfile, this.playerState, reward.experience);
        const cultivation = this.meridianSet === null
          ? 0
          : awardCultivationPoints(this.playerState, experience.levelsGained, this.meridianSet.resource);
        const paidExperience = reward.experience - experience.discardedExperience;
        this.inventory.currency += reward.currency;
        const cultivationText = cultivation > 0 ? ` · 修为 +${cultivation}` : '';
        this.questNotice = quest === undefined
          ? `差事完成：经验 +${paidExperience} · 银两 +${reward.currency}${cultivationText}`
          : `完成「${quest.name}」：经验 +${paidExperience} · 银两 +${reward.currency}${cultivationText}`;
        console.info('[quest] 任务 "%s" 完成：经验 +%d，银两 +%d', reward.questId, paidExperience, reward.currency);
      }
    }
    if (update.failedQuestIds.length > 0) {
      const failed = this.quests.get(update.failedQuestIds[update.failedQuestIds.length - 1] ?? '');
      this.questNotice = failed === undefined ? '有一项差事已失败' : `差事「${failed.name}」已失败`;
      for (const id of update.failedQuestIds) console.info('[quest] 任务 "%s" 已失败', id);
    }
    this.updateQuestTrackerHud();
    this.updateInteractHint();
  }

  private updateQuestTrackerHud(): void {
    const text = this.questTrackerText;
    if (text === null) return;
    if (this.questNotice !== null) {
      text.setText(this.questNotice).setColor(UI.textWarn);
      if (this.questNoticeTimer === null) {
        this.questNoticeTimer = this.time.delayedCall(5000, () => {
          this.questNotice = null;
          this.questNoticeTimer = null;
          this.updateQuestTrackerHud();
        });
      }
      return;
    }
    const trackedId = this.questJournal.trackedQuestId;
    const quest = trackedId === null ? undefined : this.quests.get(trackedId);
    const state = trackedId === null ? undefined : this.questJournal.states.get(trackedId);
    if (quest === undefined || state?.status !== 'active') {
      text.setText('');
      return;
    }
    const progress = quest.objectives.map((objective) =>
      `${objective.text} ${state.objectiveCounts.get(objective.id) ?? 0}/${objective.requiredCount}`,
    ).join(' · ');
    text.setText(`跟踪：${quest.name}　${progress}`).setColor(UI.textMuted);
  }

  /** B key: open the backpack while free, close it while it is open. */
  private toggleBackpack(): void {
    const panel = this.inventoryPanel;
    if (panel === null) {
      return;
    }
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) {
      return; // Another overlay owns the keyboard right now.
    }
    if (this.playerProfile === null || this.playerState === null || this.inventory === null) {
      return; // No playable profile this run: no backpack.
    }
    this.syncKnowledgeFromRunFacts();
    panel.open({
      profile: this.playerProfile,
      character: this.playerState,
      inventory: this.inventory,
      items: this.items,
    });
    this.updateInteractHint();
  }

  private bindMovementKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      return;
    }

    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    const bindings = [
      { code: KeyCodes.UP, dCol: 0, dRow: -1 },
      { code: KeyCodes.W, dCol: 0, dRow: -1 },
      { code: KeyCodes.DOWN, dCol: 0, dRow: 1 },
      { code: KeyCodes.S, dCol: 0, dRow: 1 },
      { code: KeyCodes.LEFT, dCol: -1, dRow: 0 },
      { code: KeyCodes.A, dCol: -1, dRow: 0 },
      { code: KeyCodes.RIGHT, dCol: 1, dRow: 0 },
      { code: KeyCodes.D, dCol: 1, dRow: 0 },
    ] as const;

    keyboard.addCapture(bindings.map(({ code }) => code));
    const listeners = bindings.map(({ code, dCol, dRow }) => {
      const key = keyboard.addKey(code);
      const onDown = (): void => this.tryMove(dCol, dRow);
      key.on('down', onDown);
      return { key, onDown };
    });

    const interactKey = keyboard.addKey(KeyCodes.E);
    const onInteract = (): void => this.handleInteraction();
    interactKey.on('down', onInteract);

    const backpackKey = keyboard.addKey(KeyCodes.B);
    const onBackpack = (): void => this.toggleBackpack();
    backpackKey.on('down', onBackpack);

    const questKey = keyboard.addKey(KeyCodes.Q);
    const onQuestJournal = (): void => this.toggleQuestJournal();
    questKey.on('down', onQuestJournal);

    const talkKey = keyboard.addKey(KeyCodes.F);
    const onTalk = (): void => this.tryTalk();
    talkKey.on('down', onTalk);

    const pauseKey = keyboard.addKey(KeyCodes.ESC);
    const onPause = (): void => this.togglePauseMenu();
    pauseKey.on('down', onPause);

    const worldMapKey = keyboard.addKey(KeyCodes.M);
    const onWorldMap = (): void => this.toggleWorldMap();
    worldMapKey.on('down', onWorldMap);

    const encyclopediaKey = keyboard.addKey(KeyCodes.K);
    const onEncyclopedia = (): void => this.toggleEncyclopedia();
    encyclopediaKey.on('down', onEncyclopedia);

    const collectionKey = keyboard.addKey(KeyCodes.L);
    const onCollection = (): void => this.toggleCollection();
    collectionKey.on('down', onCollection);

    const factionKey = keyboard.addKey(KeyCodes.J);
    const onFaction = (): void => this.toggleFactionPanel();
    factionKey.on('down', onFaction);

    const martialArtForgeKey = keyboard.addKey(KeyCodes.C);
    const onMartialArtForge = (): void => {
      if (!this.anyOverlayOpen()) this.toggleMartialArtForge();
    };
    martialArtForgeKey.on('down', onMartialArtForge);

    const controlsKey = keyboard.addKey(KeyCodes.H);
    const onControls = (): void => this.toggleControlsPanel();
    controlsKey.on('down', onControls);

    const meridianKey = keyboard.addKey(KeyCodes.N);
    const onMeridian = (): void => this.toggleMeridianPanel();
    meridianKey.on('down', onMeridian);

    const companionKey = keyboard.addKey(KeyCodes.P);
    const onCompanions = (): void => this.toggleCompanionPanel();
    companionKey.on('down', onCompanions);

    const waitKey = keyboard.addKey(KeyCodes.V);
    const onWait = (): void => this.handleWait();
    waitKey.on('down', onWait);

    const achievementKey = keyboard.addKey(KeyCodes.G);
    const onAchievements = (): void => this.toggleAchievements();
    achievementKey.on('down', onAchievements);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const { key, onDown } of listeners) {
        key.off('down', onDown);
      }
      interactKey.off('down', onInteract);
      backpackKey.off('down', onBackpack);
      questKey.off('down', onQuestJournal);
      talkKey.off('down', onTalk);
      pauseKey.off('down', onPause);
      worldMapKey.off('down', onWorldMap);
      encyclopediaKey.off('down', onEncyclopedia);
      collectionKey.off('down', onCollection);
      factionKey.off('down', onFaction);
      martialArtForgeKey.off('down', onMartialArtForge);
      controlsKey.off('down', onControls);
      meridianKey.off('down', onMeridian);
      companionKey.off('down', onCompanions);
      waitKey.off('down', onWait);
      achievementKey.off('down', onAchievements);
      this.dialoguePanel?.destroy();
      this.dialoguePanel = null;
      this.battlePanel?.destroy();
      this.battlePanel = null;
      this.inventoryPanel?.destroy();
      this.inventoryPanel = null;
      this.shopPanel?.destroy();
      this.shopPanel = null;
      this.questPanel?.destroy();
      this.questPanel = null;
      this.pauseMenu?.destroy();
      this.pauseMenu = null;
      this.worldMapPanel?.destroy();
      this.worldMapPanel = null;
      this.encyclopediaPanel?.destroy();
      this.encyclopediaPanel = null;
      this.collectionPanel?.destroy();
      this.collectionPanel = null;
      this.factionPanel?.destroy();
      this.factionPanel = null;
      this.companionPanel?.destroy();
      this.companionPanel = null;
      this.arenaPanel?.destroy();
      this.arenaPanel = null;
      this.factionWarPanel?.destroy();
      this.factionWarPanel = null;
      this.martialArtForgePanel?.destroy();
      this.martialArtForgePanel = null;
      this.equipmentForgePanel?.destroy();
      this.equipmentForgePanel = null;
      this.alchemyPanel?.destroy();
      this.alchemyPanel = null;
      this.endingPanel?.destroy();
      this.endingPanel = null;
      this.achievementPanel?.destroy();
      this.achievementPanel = null;
      this.meridianPanel?.destroy();
      this.meridianPanel = null;
      this.controlsPanel?.destroy();
      this.controlsPanel = null;
      this.activeSession = null;
      this.activeEncounter = null;
      this.activeArenaRun = null;
      this.activeFactionWarRun = null;
    });
  }

  /**
   * E key: the four-way adjacent NPC opens its shop when it keeps a valid
   * one (nearest, id tie-break), then opens a quest board, and otherwise
   * talks; next comes a four-way adjacent encounter, then a data-driven gate.
   */
  private handleInteraction(): void {
    if (this.anyOverlayOpen()) {
      return; // Whichever overlay is open owns the keyboard.
    }
    const target = selectInteractionTarget(this.placedNpcs, {
      col: this.playerCol,
      row: this.playerRow,
    });
    if (target !== null) {
      this.recordKnowledgeObservations({ characterIds: [target.record.id] });
      const shop =
        target.record.shopId === null ? undefined : this.shops.get(target.record.shopId);
      const stock = shop === undefined ? undefined : this.shopStocks.get(shop.record.id);
      if (shop !== undefined && stock !== undefined && this.inventory !== null) {
        this.shopPanel?.open({
          shop,
          stock,
          inventory: this.inventory,
          items: this.items,
        });
        this.updateInteractHint();
        return;
      }
      const hasQuests = [...this.quests.values()].some(
        (quest) => quest.giverNpcId === target.record.id,
      );
      if (
        target.record.questGiver && hasQuests && this.inventory !== null &&
        this.questPanel !== null
      ) {
        this.questPanel.open({
          quests: this.quests,
          journal: this.questJournal,
          giverNpcId: target.record.id,
          giverName: target.record.name,
          itemCounts: this.questItemCounts(),
        });
        this.updateInteractHint();
        return;
      }
      this.openDialogueWith(target);
      return;
    }
    if (this.tryStartBattle()) return;
    const arena = this.world === null ? null : selectArenaTarget(
      this.world.assembly.arenas,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (arena !== null) {
      this.openArenaSignup(arena);
      return;
    }
    const factionWar = this.world === null ? null : selectFactionWarTarget(
      this.world.assembly.factionWars,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (factionWar !== null) {
      this.openFactionWarSignup(factionWar);
      return;
    }
    const forge = this.world === null ? null : selectEquipmentForgeStation(
      this.world.assembly.equipmentForges,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (forge !== null && this.inventory !== null && this.equipmentForgePanel !== null) {
      const inventory = this.inventory;
      this.equipmentForgePanel.open({
        station: forge,
        inventory,
        items: this.items,
        attributeLabels: this.playerProfile?.attributeLabels ?? {},
        onCraft: (recipeId) => {
          const outcome = craftEquipment({ station: forge, recipeId, inventory, items: this.items });
          if (outcome.ok) {
            this.achievementState = recordAchievementCounter(this.achievementState, 'equipmentCrafts');
            this.refreshQuestCollectObjectives();
          }
          return outcome.ok
            ? { ok: true, message: `已锻成「${outcome.result.name}」，剩余银两 ${outcome.remainingCurrency}。` }
            : { ok: false, message: outcome.reason };
        },
      });
      this.updateInteractHint();
      return;
    }
    const alchemy = this.world === null ? null : selectAlchemyStation(
      this.world.assembly.alchemyStations,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (alchemy !== null && this.inventory !== null && this.playerState !== null && this.alchemyPanel !== null) {
      const inventory = this.inventory;
      const character = this.playerState;
      this.alchemyPanel.open({
        station: alchemy,
        inventory,
        items: this.items,
        knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
        insight: character.attributes.insight,
        onCraft: (recipeId) => {
          const outcome = craftAlchemy({
            station: alchemy,
            recipeId,
            character,
            knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
            inventory,
            items: this.items,
          });
          if (!outcome.ok) return { ok: false, message: outcome.reason };
          this.achievementState = recordAchievementCounter(this.achievementState, 'alchemyCrafts');
          this.refreshQuestCollectObjectives();
          if (this.world?.knowledgeGraph.nodes.has(outcome.result.id)) this.knownKnowledgeNodeIds.add(outcome.result.id);
          return { ok: true, message: `已炼成「${outcome.result.name}」，剩余银两 ${outcome.remainingCurrency}。` };
        },
      });
      this.updateInteractHint();
      return;
    }
    const gate = this.world === null
      ? null
      : selectAdjacentTransition(this.world.worldMap.transitions, this.currentMapResourceId, {
          col: this.playerCol,
          row: this.playerRow,
        });
    if (gate !== null) {
      this.switchRegion(gate);
      return;
    }
    const endingGate = this.world === null ? null : selectAdjacentEndingGate(
      this.world.assembly.endings,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (endingGate !== null) this.openEndingGate();
  }

  /** Opens the conclusion panel with a read-only snapshot of current journey state. */
  private openEndingGate(): void {
    const world = this.world;
    const panel = this.endingPanel;
    const endingSet = world?.assembly.endings;
    if (world === null || panel === null || endingSet === null || endingSet === undefined) return;
    const context: EndingEvaluationContext = {
      questStatuses: new Map(
        [...this.questJournal.states].map(([questId, state]) => [questId, state.status]),
      ),
      social: this.social,
      factionMembership: this.factionState.membership,
      knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
    };
    panel.open({
      endingSet,
      context,
      onFinish: () => {
        this.returnToMenu();
      },
    });
    this.updateInteractHint();
  }

  /**
   * F key: talk to the four-way adjacent NPC directly. E keeps opening the
   * quest board for quest givers (and the shop for shopkeepers), so both
   * entry points stay reachable at the same time (Round 08).
   */
  private tryTalk(): void {
    if (this.anyOverlayOpen()) {
      return; // Whichever overlay is open owns the keyboard.
    }
    if (this.map === null) {
      return;
    }
    const target = selectInteractionTarget(this.placedNpcs, {
      col: this.playerCol,
      row: this.playerRow,
    });
    if (target === null) {
      return;
    }
    this.openDialogueWith(target);
  }

  /** Opens the dialogue panel for `target` with the runtime controller. */
  private openDialogueWith(target: PlacedNpc): void {
    const panel = this.dialoguePanel;
    const conversation = this.dialogues.get(target.record.dialogueId);
    if (panel === null || conversation === undefined) {
      return; // Defensive: placement already guarantees resolution.
    }
    this.recordKnowledgeObservations({ characterIds: [target.record.id] });
    // A real conversation is its own quest signal: talkToNpc objectives only
    // advance here (F key talk, or E on NPCs without board/shop). Opening a
    // quest board with E never counts as talking.
    this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, {
      type: 'npc-talk',
      npcId: target.record.id,
    }));
    panel.open(conversation, target.record.name, {
      visibleOptions: (node) =>
        getVisibleOptions(node, this.dialogueContextFor(target.record.id)),
      confirmOption: (session, visibleIndex) =>
        this.confirmDialogueOption(target.record.id, session, visibleIndex),
    });
    this.updateInteractHint();
  }

  /** Assembles the runtime context one conversation runs against. */
  private dialogueContextFor(speakerNpcId: string): DialogueRuntimeContext {
    return {
      quests: this.quests,
      journal: this.questJournal,
      items: this.items,
      inventory: this.inventory,
      social: this.social,
      speakerNpcId,
      knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
      knowledgeNodes: this.world?.knowledgeGraph.nodes ?? new Map(),
      knowledgeEdges: this.world?.knowledgeGraph.edges ?? [],
      npcNames: new Map((this.world?.assembly.npcs ?? []).map((npc) => [npc.record.id, npc.record.name])),
      character: this.playerState,
      factions: this.progression.factions,
      martialArts: this.progression.martialArts,
      factionState: this.factionState,
      timeOfDayPeriodId: this.clock?.currentPeriod().id ?? '',
      companions: this.companions,
      companionState: this.companionState,
    };
  }

  /**
   * Controller confirm hook: validates the option's effects against the
   * context, executes them atomically and advances the session only when
   * everything committed. Quest transitions settle through the shared HUD
   * path (experience, currency, notices); feedback lines surface in the
   * dialogue panel. A refused effect leaves node, inventory, quests and
   * social state untouched.
   */
  private confirmDialogueOption(
    speakerNpcId: string,
    session: DialogueSession,
    visibleIndex: number,
  ): DialogueConfirmOutcome {
    const context = this.dialogueContextFor(speakerNpcId);
    const visible = getVisibleOptions(session.currentNode, context);
    const choice = visible[visibleIndex];
    if (choice === undefined) {
      return { advanced: false, feedback: null };
    }
    const effects = choice.option.effects ?? [];
    if (effects.length > 0) {
      const companionBefore = this.companionState.activeCompanionId;
      const result = applyDialogueEffects(effects, context);
      if (!result.ok) {
        console.info('[dialogue] 效果被拒绝：%s', result.reason);
        return { advanced: false, feedback: result.reason };
      }
      if (result.summary.questUpdate.changed) {
        this.applyQuestUpdate(result.summary.questUpdate);
      }
      if (this.companionState.activeCompanionId !== companionBefore) {
        this.refreshNpcPlacements();
      }
      this.syncKnowledgeFromRunFacts();
      // Dialogue effects can alter morality, relationships, faction, knowledge,
      // or learned arts without changing a quest. Re-evaluate while this
      // conversation is still active so those achievements unlock immediately.
      this.refreshAchievementUnlocks();
      const feedback =
        result.summary.lines.length > 0 ? result.summary.lines.join(' · ') : null;
      session.choose(choice.index);
      return { advanced: true, feedback };
    }
    session.choose(choice.index);
    return { advanced: true, feedback: null };
  }

  /** Opens the battle overlay for the four-way adjacent encounter, if any. */
  private tryStartBattle(): boolean {
    const battlePanel = this.battlePanel;
    if (battlePanel === null || battlePanel.isOpen) {
      return false;
    }
    const encounter = selectEncounterTarget(this.activeEncounters(), {
      col: this.playerCol,
      row: this.playerRow,
    });
    if (encounter === null || this.playerProfile === null || this.playerState === null) {
      return encounter !== null; // A foe keeps priority over a gate even without a profile.
    }
    if (encounter.record.knowledgeNodeId !== undefined) {
      this.recordKnowledgeObservations({ characterIds: [encounter.record.knowledgeNodeId] });
    }
    const activeCompanion = this.companions.get(this.companionState.activeCompanionId ?? '');
    const companionNpc = activeCompanion === undefined
      ? undefined
      : this.world?.assembly.npcs.find((npc) => npc.record.id === activeCompanion.npcId);
    const session = new CombatSession({
      encounter: encounter.record,
      profile: this.playerProfile,
      player: this.playerState,
      martialArts: this.combatMartialArts(),
      ...(this.meridianSet !== null ? { meridianResourceRules: this.meridianSet.resource } : {}),
      ...(activeCompanion !== undefined && companionNpc !== undefined
        ? { companion: { name: companionNpc.record.name, support: activeCompanion.combatSupport } }
        : {}),
    });
    this.activeSession = session;
    this.activeEncounter = encounter;
    battlePanel.open(session);
    this.updateInteractHint();
    return true;
  }

  private tryMove(dCol: number, dRow: number): void {
    const map = this.map;
    const marker = this.marker;
    if (map === null || marker === null || this.moving || this.anyOverlayOpen()) {
      return; // Also locked while a dialogue, battle, backpack or shop panel is open.
    }

    const previousCell = { col: this.playerCol, row: this.playerRow };
    const targetCol = this.playerCol + dCol;
    const targetRow = this.playerRow + dRow;
    if (!map.canEnter(targetCol, targetRow)) {
      return; // Solid tile or outside the grid: the move silently does nothing.
    }
    if (this.occupancy.isOccupied(targetCol, targetRow)) {
      return; // An NPC stands there: occupied cells are not enterable.
    }
    if (this.encounterCells.has(`${targetCol},${targetRow}`)) {
      return; // A still-active encounter foe blocks its cell.
    }

    this.playerCol = targetCol;
    this.playerRow = targetRow;
    this.updateCoordsHud();
    this.updateInteractHint();
    const baseStepMinutes = this.clock?.calendar.actionCosts.stepMinutes ?? 0;
    const weatherStepMinutes = this.currentClimate()?.weather.stepMinutes ?? 0;
    this.advanceTime(baseStepMinutes + weatherStepMinutes);

    const target = cellCenterOffset(map, targetCol, targetRow);
    this.moving = true;
    this.tweens.add({
      targets: marker,
      x: this.mapOrigin.x + target.x,
      y: this.mapOrigin.y + target.y,
      duration: MOVE_DURATION_MS,
      onComplete: () => {
        this.moving = false;
        this.refreshCompanionFollower(previousCell);
        this.triggerRegionEvents();
      },
    });
  }

  /** Travels through one validated world-map endpoint after a fresh occupancy check. */
  private switchRegion(transition: RegionTransitionData): void {
    const world = this.world;
    const destinationMap = world?.maps.get(transition.to.mapResourceId);
    if (world === null || destinationMap === undefined) {
      this.showRegionNotice(`关口「${transition.name}」通向的地图当前不可用。`);
      return;
    }
    if (!destinationMap.canEnter(transition.to.col, transition.to.row)) {
      this.showRegionNotice(`关口「${transition.name}」的落点不可通行。`);
      return;
    }
    const travelMinutes = this.clock?.calendar.actionCosts.travelMinutes ?? 0;
    const arrivalClock = new GameClock(world.calendar, this.clock?.elapsedMinutes ?? 0);
    arrivalClock.advance(travelMinutes);
    const arrivalPeriodId = arrivalClock.currentPeriod().id;
    const arrivalNpcs = world.assembly.npcsByPeriod.get(arrivalPeriodId) ?? world.assembly.npcs;
    const activeCompanionNpcId = this.activeCompanionNpc()?.record.id ?? null;
    const occupiedByNpc = arrivalNpcs.some((npc) =>
      npc.record.mapResourceId === transition.to.mapResourceId &&
      npc.record.id !== activeCompanionNpcId &&
      npc.col === transition.to.col && npc.row === transition.to.row,
    );
    const occupiedByEncounter = world.assembly.encounters.some((encounter) =>
      encounter.record.mapResourceId === transition.to.mapResourceId &&
      encounter.col === transition.to.col && encounter.row === transition.to.row &&
      (encounter.record.repeatable || !this.completedEncounters.has(encounter.record.id)),
    );
    if (occupiedByNpc || occupiedByEncounter) {
      this.showRegionNotice(`关口「${transition.name}」的另一端暂被挡住。`);
      return;
    }

    this.mapLayer?.destroy();
    this.npcLayer?.destroy();
    this.encounterLayer?.destroy();
    this.mapLayer = null;
    this.npcLayer = null;
    this.encounterLayer = null;
    this.npcVisuals.clear();
    this.companionFollower = null;
    this.encounterMarkers.clear();

    this.currentMapResourceId = transition.to.mapResourceId;
    this.recordKnowledgeObservations({ placeIds: [this.currentMapResourceId] });
    this.map = destinationMap;
    this.playerCol = transition.to.col;
    this.playerRow = transition.to.row;
    this.encounters = world.assembly.encounters.filter(
      (encounter) => encounter.record.mapResourceId === this.currentMapResourceId,
    );
    this.encounterCells = new Map(
      this.activeEncounters().map((encounter) => [
        `${encounter.col},${encounter.row}`,
        encounter,
      ]),
    );
    this.lastNpcSchedulePeriodId = arrivalPeriodId;
    this.placedNpcs = this.resolveNpcPlacements(arrivalPeriodId);
    this.occupancy = new NpcOccupancyIndex(this.placedNpcs);
    this.mapOrigin.set(
      (VIEW_WIDTH - destinationMap.pixelWidth) / 2,
      HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT - destinationMap.pixelHeight) / 2,
    );
    this.mapLayer = renderGridMap(this, destinationMap, this.mapOrigin.x, this.mapOrigin.y);
    const center = cellCenterOffset(destinationMap, this.playerCol, this.playerRow);
    this.marker?.setPosition(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y);
    this.renderNpcs(destinationMap);
    this.renderEncounterMarkers(destinationMap);
    this.renderArenaMarkers(destinationMap);
    this.renderFactionWarMarkers(destinationMap);
    this.renderEquipmentForgeMarkers(destinationMap);
    this.renderAlchemyMarkers(destinationMap);
    this.renderEndingGateMarker(destinationMap);
    this.ensureDaylightLayer(); // The rebuilt world layers must sit below the wash again.
    this.mapNameText?.setText(destinationMap.data.name);
    this.updateCoordsHud();
    this.advanceTime(travelMinutes);
    this.refreshCompanionFollower(null);
    this.showRegionNotice(`已抵达「${destinationMap.data.name}」。`);
    this.triggerRegionEvents();
  }

  /** Fires ready events authored for the exact current cell. */
  private triggerRegionEvents(prefix = ''): void {
    const world = this.world;
    if (world === null) {
      if (prefix.length > 0) this.showRegionNotice(prefix);
      return;
    }
    const events = selectTriggeredRegionEvents(
      world.worldMap.events,
      { mapResourceId: this.currentMapResourceId, col: this.playerCol, row: this.playerRow },
      this.completedRegionalEvents,
      {
        knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
        periodId: this.clock?.currentPeriod().id ?? null,
        weatherId: this.currentClimate()?.weather.id ?? null,
      },
    );
    const notices = prefix.length > 0 ? [prefix] : [];
    for (const event of events) {
      if (event.once) this.completedRegionalEvents.add(event.id);
      notices.push(event.text);
    }
    const newlyDiscoveredTitles = new Set<string>();
    for (const nodeId of selectNewRegionEventKnowledgeIds(events, this.knownKnowledgeNodeIds)) {
      const node = world.knowledgeGraph.nodes.get(nodeId);
      if (node === undefined) continue;
      this.knownKnowledgeNodeIds.add(nodeId);
      newlyDiscoveredTitles.add(node.title);
    }
    for (const title of newlyDiscoveredTitles) notices.push(`新见闻「${title}」已记入江湖百闻。`);
    if (notices.length > 0) this.showRegionNotice(notices.join(' '));
  }

  private showRegionNotice(text: string): void {
    this.regionNotice = text;
    this.regionNoticeTimer?.remove(false);
    this.regionNoticeTimer = this.time.delayedCall(5200, () => {
      this.regionNotice = null;
      this.regionNoticeTimer = null;
      this.updateInteractHint();
    });
    this.updateInteractHint();
  }

  /**
   * Replaces the canvas with a readable failure panel. `escToMenu` binds
   * Escape back to the menu scene (Round 09 load failures); data failures
   * keep the classic refresh advice.
   */
  private showErrorState(title: string, details: string[], escToMenu = false): void {
    this.children.removeAll(true); // Destroy leftover objects (frees Text canvas textures).
    this.moving = false;
    this.dialoguePanel = null;

    const panelWidth = VIEW_WIDTH - 96;
    const panelHeight = 320;
    this.add
      .rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, panelWidth, panelHeight, UI.panelFill)
      .setStrokeStyle(2, UI.panelStroke);

    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - panelHeight / 2 + 36, title, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(20),
        color: UI.textWarn,
      })
      .setOrigin(0.5);

    const tail = escToMenu
      ? ['', '按 Esc 返回主菜单。']
      : ['', '请检查 data/ 下的清单、schema 与地图 JSON，或 mods/ 中的覆盖文件，然后刷新页面。'];
    const body = [...details, ...tail].join('\n');
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 8, body, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textMuted,
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: panelWidth - 48 },
      })
      .setOrigin(0.5);

    if (escToMenu) {
      const keyboard = this.input.keyboard;
      if (keyboard !== null) {
        const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
        keyboard.addCapture(KeyCodes.ESC);
        const key = keyboard.addKey(KeyCodes.ESC);
        key.once('down', () => {
          this.scene.start('menu');
        });
      }
    }
  }
}

/**
 * Fallback storage used when the browser disallows localStorage: reads miss
 * and writes are refused, so settings stay session-only and never crash.
 */
function unavailableStorage(): SaveStorage {
  return {
    read: () => null,
    write: () => {
      throw new Error('浏览器本地存储不可用');
    },
    remove: () => {
      throw new Error('浏览器本地存储不可用');
    },
  };
}
