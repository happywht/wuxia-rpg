import { describeOralPrerequisites } from './dialogue-prerequisites';
import { isDialogueLandingOccupied, type DialogueTeleportReadiness } from '../engine/dialogue-teleport-request';
import {RegionalGuidePanel} from './regional-guide-ui';
import { MartialArtsPanel } from './martial-arts-ui';
import {buildRegionalGuideEntries,resolveRegionalGuideDestination,REGION_GUIDE_PREFIX,REGION_ROLE_LABELS,type RegionalGuideInput,type RegionGuideEntry} from '../engine/regional-guide';
import {buildQuestGuideEntries} from '../engine/quest-guide';
import { projectQuestTrackerLine } from './quest-presentation';
import { estimateNavigationWalkingBudget, navigationWalkingBudgetHint } from '../engine/navigation-walking-budget';
import { paddedWorldCameraBounds } from './world-camera-bounds';
import Phaser from 'phaser';

import type { Diagnostic } from '../engine/data-loader';
import { onceDialogueBattleDispatch } from '../engine/dialogue-battle-request';
import {
  GridMap,
  directionBetweenCells,
  oppositeGridMapActorDirection,
  selectGridMapPlayerFrame,
  type GridMapActorDirection,
} from '../engine/grid-map';
import {
  cellCenterOffset,
  gridMapActorDepth,
  createGridMapDepthRows,
  createGridMapActor,
  adoptGridMapWorldActor,
  detachGridMapWorldActor,
  loadGridMapArtAssets,
  renderGridMap,
  setGridMapActorFrame,
} from '../engine/grid-map-renderer';
import {
  selectAdjacentTransition,
  selectInteractableRegionEvent,
  selectNewRegionEventKnowledgeIds,
  selectRegionEventApproachClue,
  selectTriggeredRandomRegionEvent,
  selectTriggeredRegionEvents,
  type RegionEventContext,
  type RegionEventData,
  type RegionEventInteractionSelection,
  type RandomRegionEventData,
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
  resolveCompanionStance,
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
  dialogueChoiceForConfirmation,
  getVisibleOptionsForDisplay,
} from '../engine/dialogue-runtime';
import type { DialogueVariableValue } from '../engine/dialogue-variables';
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
import { shouldPreferRegionalEventInteraction } from '../engine/interaction-priority';
import {
  ClimateRuntime,
  DEFAULT_WORLD_SEED,
  generateWorldSeed,
  type ClimateSeasonData,
  type ClimateTidePhaseData,
  type ClimateWeatherData,
} from '../engine/climate-system';
import { type SocialState, applySocialChange, createSocialState } from '../engine/social-state';
import {
  applyQuestRewardConsequences,
  questKnowledgeNodeIdsToBackfill,
} from '../engine/quest-consequences';
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
  encounterMatchesTide,
  type PlacedEncounter,
  selectEncounterTarget,
} from '../engine/turn-based-combat';
import {
  arenaOpponentAsEncounter,
  createArenaRecord,
  resolveArenaAttemptPayout,
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
import { craftingReceipt } from './crafting-panel-layout';
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
  reconcileKnownKnowledgeObjectives,
  reconcileQuestFacts,
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
import { TravelConfirmationPanel } from './travel-confirmation';
import { quoteTransitionCost } from '../engine/transition-cost';
import { transitionAccessReason } from '../engine/transition-access';
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
import {
  DEFAULT_GAME_SETTINGS,
  type GameSettings,
  applyGameSettings,
  currentGamepadEnabled,
  currentMovementHelpText,
  currentMovementLayout,
  currentReducedMotion,
  loadGameSettings,
  uiFontSize,
} from './settings';
import {
  GamepadEdgeTracker,
  type MovementKeyName,
  isMovementKeyEnabled,
  sampleStandardPad,
} from './input-settings';
import { ModStatusPanel } from './mod-status-ui';
import { UI_FONT_FAMILY } from './ui-theme';
import { wrapDialogueText } from './dialogue-layout';
import {
  TRANSITION_MARKER_DEPTH,
  createTransitionGateMarkers,
  type TransitionMarkerRenderer,
} from './transition-markers';
import { summarizePathRunPrefix } from '../engine/grid-path';
import {
  QUEST_NAVIGATION_ID_PREFIX,
  type QuestNavigationNoTargetReason,
  type QuestNavigationResult,
  type QuestNavigationTarget,
  resolveQuestNavigationTarget,
} from '../engine/quest-navigation';
import { deriveNpcRegionNames, LANDMARK_DESTINATION_PREFIX } from '../engine/world-navigation';
import type { NavigationEventContext } from '../engine/region-event-navigation';
import {
  arrivalActionHint,
  resolveCellNavigationGuide,
  resolveWorldNavigationGuide,
  type WorldNavigationGuide,
} from '../engine/world-navigation-guidance';
import { type GridStartupData } from './menu-scene';
import { subscribeDataChanges, type DataChangeBatch, type UnsubscribeDataChanges } from './data-hot-reload';
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

/** Measured-width cap for the HUD's right-hand fact column (coords/date). */
const HUD_RIGHT_COLUMN_WIDTH = 344;

/** Vertical space reserved for controls, run state, climate, and warning lines. */
const HUD_HEIGHT = 72;

const MOVE_DURATION_MS = 110;

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

type WorldActorMarker = Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

const UI = {
  background: '#0b0e14',
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  fontFamily: UI_FONT_FAMILY,
} as const;

/**
 * Overlay panel fields torn down together by {@link GridScene}'s single
 * disposal pass: every listed panel owns key bindings (and the martial-art
 * forge additionally owns an offscreen DOM input), none of which Phaser's
 * children teardown would release.
 */
const WORLD_OVERLAY_PANEL_FIELDS = [
  'dialoguePanel', 'battlePanel', 'inventoryPanel', 'shopPanel', 'questPanel',
  'pauseMenu', 'travelConfirmation', 'controlsPanel', 'factionPanel', 'worldMapPanel', 'encyclopediaPanel',
  'modStatusPanel', 'collectionPanel', 'companionPanel', 'regionalGuidePanel',
  'arenaPanel', 'factionWarPanel', 'martialArtsPanel', 'martialArtForgePanel', 'equipmentForgePanel',
  'alchemyPanel', 'endingPanel', 'achievementPanel', 'meridianPanel',
] as const;

export class GridScene extends Phaser.Scene {
  private map: GridMap | null = null;
  private world: LoadedWorld | null = null;
  private currentMapResourceId = '';
  /**
   * Stable destination selector for this live run (`landmark:<id>` or a
   * runtime `quest:<questId>` projection); guidance paths are
   * recomputed and never persisted to saves.
   */
  private navigationDestinationId: string | null = null;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private mapLayer: Phaser.GameObjects.Container | null = null;
  private npcLayer: Phaser.GameObjects.Container | null = null;
  private encounterLayer: Phaser.GameObjects.Container | null = null;
  private marker: WorldActorMarker | null = null;
  private playerFacing: GridMapActorDirection = 'down';
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
    marker: WorldActorMarker;
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
  private companionFollower: { marker: WorldActorMarker; label: Phaser.GameObjects.Text } | null = null;

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
  /** Tide phase used when encounter markers and occupied cells were last synchronized. */
  private lastEncounterTideId: string | null | undefined;

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
  /**
   * Run-wide dialogue decision variables (Round 147): written only through
   * the atomic `setVariable` dialogue effect, restored from and captured
   * into every save slot.
   */
  private readonly dialogueVariables: Map<string, DialogueVariableValue> = new Map();

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
    fog: 'wuxia-weather-fog-bank',
  } as const;

  private dialoguePanel: DialoguePanel | null = null;
  private battlePanel: BattlePanel | null = null;
  private inventoryPanel: InventoryPanel | null = null;
  private shopPanel: ShopPanel | null = null;
  private questPanel: QuestPanel | null = null;
  private pauseMenu: PauseMenuPanel | null = null;
  private travelConfirmation: TravelConfirmationPanel | null = null;
  private controlsPanel: ControlsPanel | null = null;
  private factionPanel: FactionPanel | null = null;
  private worldMapPanel: WorldMapPanel | null = null;
  private encyclopediaPanel: EncyclopediaPanel | null = null;
  private modStatusPanel: ModStatusPanel | null = null;
  private collectionPanel: CollectionPanel | null = null;
  private companionPanel: CompanionPanel | null = null;
  private regionalGuidePanel: RegionalGuidePanel | null = null;
  private arenaPanel: ArenaPanel | null = null;
  private factionWarPanel: FactionWarPanel | null = null;
  private martialArtsPanel: MartialArtsPanel | null = null;
  private martialArtForgePanel: MartialArtForgePanel | null = null;
  private equipmentForgePanel: EquipmentForgePanel | null = null;
  private alchemyPanel: AlchemyPanel | null = null;
  private endingPanel: EndingPanel | null = null;
  private achievementPanel: AchievementPanel | null = null;
  private meridianPanel: MeridianPanel | null = null;
  private activeSession: CombatSession | null = null;
  private activeEncounter: PlacedEncounter | null = null;
  private dialogueBattlePending = false;
  private dialogueBattleGeneration = 0;

  /** Round 09 storage/settings plumbing (storage null = browser disallows it). */
  private storage: SaveStorage | null = null;
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  /**
   * Round 41 gamepad state: turns held pads/sticks into press edges so a
   * held direction moves one cell per deflection, never per frame.
   */
  private readonly gamepadEdges = new GamepadEdgeTracker();
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
  private navigationHintText: Phaser.GameObjects.Text | null = null;
  private questNotice: string | null = null;
  private questNoticeTimer: Phaser.Time.TimerEvent | null = null;
  private regionNotice: string | null = null;
  private regionNoticeTimer: Phaser.Time.TimerEvent | null = null;
  private mapNameText: Phaser.GameObjects.Text | null = null;
  /** First HUD line; its movement segment follows the live layout setting. */
  private movementHintText: Phaser.GameObjects.Text | null = null;
  private readonly scaledTextTargets: { text: Phaser.GameObjects.Text; base: number }[] = [];
  /**
   * Round 109 measured HUD plumbing. `hudLines` keeps the UNWRAPPED raw copy
   * of every HUD line (wrapping/ellipsising happens only inside
   * {@link relayoutHud}, so a later re-layout at another text scale always
   * starts from the full text); `hudMeasureText` is an offscreen probe whose
   * canvas context performs every width measurement at the exact live font
   * size; the two rectangles are resized to the measured stack instead of a
   * fixed slab so all header text stays on a visible background without the
   * opaque band growing more than the text actually needs.
   */
  private hudLines = {
    title: '',
    time: '',
    climate: '',
    help: '',
    quest: '',
    nav: '',
    interact: '',
  };
  private hudMeasureText: Phaser.GameObjects.Text | null = null;
  private hudMeasureFontSize = '';
  private hudTopRect: Phaser.GameObjects.Rectangle | null = null;
  private hudBottomRect: Phaser.GameObjects.Rectangle | null = null;
  private hudWarningTexts: Phaser.GameObjects.Text[] = [];
  private hudWarningRawLines: string[] = [];
  /** Round 109 scene markers for the current map's outgoing region gates. */
  private transitionMarkers: TransitionMarkerRenderer | null = null;

  /**
   * Round 36 dev data hot reload. `pendingDataReload` latches a change that
   * arrived mid-move/mid-battle/behind an overlay until a safe boundary
   * (move tween completion or overlay close) retries it; `dataReloading`
   * locks exploration input while the new world is being assembled;
   * `dataReloadToken` drops results of superseded reloads or of a reload
   * whose scene shut down mid-await; `hotReloadSnapshot` carries the
   * pre-checked run snapshot into the next setupWorld (consumed once).
   */
  private dataReloadToken = 0;
  private pendingDataReload = false;
  private dataReloading = false;
  private hotReloadSnapshot: SaveSnapshotV1 | null = null;
  private unsubscribeDataChanges: UnsubscribeDataChanges | null = null;
  /**
   * Round 109 world replacement guard: true while the overlay panels are
   * being torn down. Panel destroy() may fire its onClose callback; that is
   * a disposal, not a user close boundary, and must not re-enter
   * noteOverlayClosed/runPendingDataReload mid-teardown.
   */
  private disposingWorldPanels = false;

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
    const pinScreenObject = (gameObject: Phaser.GameObjects.GameObject): void => {
      (gameObject as Phaser.GameObjects.GameObject & { setScrollFactor(x: number, y?: number): unknown })
        .setScrollFactor(0);
    };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, pinScreenObject);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, pinScreenObject);
    });
    this.storage = createBrowserSaveStorage();
    this.settings = loadGameSettings(this.storage ?? unavailableStorage());
    applyGameSettings(this.game, this.settings);

    this.bindMovementKeys();
    this.subscribeDataHotReload();
    // Round 109: the SHUTDOWN event fires before Phaser tears the children
    // list down, so panel destroy() still sees live containers — and it
    // releases what Phaser never would (key bindings, forge DOM input).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.disposeWorldPanels();
    });
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
    try {
      await loadGridMapArtAssets(
        this,
        outcome.world.maps.values(),
        outcome.world.worldMap.data.atlasArt?.tilesets,
      );
    } catch (error) {
      this.showErrorState('地图像素素材无法加载', [error instanceof Error ? error.message : String(error)], true);
      return;
    }
    this.setupWorld(outcome.world);
    void this.runPendingDataReload(); // A JSON edit may arrive during the initial load.
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

    if (this.hotReloadSnapshot !== null) {
      // Round 36 data hot reload: restore from the in-memory snapshot the
      // reload preflight already sanitized against this exact world. The
      // branch runs before the slot path because a hot reload replaces the
      // startup semantics for this setupWorld call only (consumed once).
      const planned = this.hotReloadSnapshot;
      this.hotReloadSnapshot = null;
      const restoration = this.restorePlannedSnapshot(world, planned);
      if (restoration === null) {
        return; // Defensive: the preflight already refused incompatible data.
      }
      restoredRun = restoration.run;
      playerWarnings.push(...restoration.warnings);
    } else if (this.startup?.kind === 'load' && this.startup.slotId !== undefined) {
      const restoration = this.restoreFromSlot(world, this.startup.slotId);
      if (restoration === null) {
        return; // The readable failure panel is already on screen.
      }
      restoredRun = restoration.run;
      playerWarnings.push(...restoration.warnings);
    }

    // Round 109 world replacement: tear the OLD overlay panel objects down
    // first — Phaser only destroys game objects here, while the panels keep
    // key bindings and the forge's offscreen DOM input alive. A refused
    // preflight above returned early, so the previous run is untouched until
    // this point by design.
    this.disposeWorldPanels();
    this.children.removeAll(true); // Drop the transient loading hint.
    this.scaledTextTargets.length = 0;
    this.world = world;
    this.navigationDestinationId = null;
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
    // Older saves predate the explicit discovery counter. Backfill from the
    // persisted run facts while excluding public entries known at game start.
    this.achievementState.discoveredKnowledge = Math.max(
      this.achievementState.discoveredKnowledge,
      [...this.knownKnowledgeNodeIds].filter((id) => !world.knowledgeGraph.nodes.get(id)?.knownByDefault).length,
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
    this.dialogueVariables.clear();

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
      for (const [key, value] of restoredRun.dialogueVariables) {
        this.dialogueVariables.set(key, value);
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
    // Old saves can contain accepted/completed tasks from before their
    // dialogue added an explicit knowledge-discovery effect. Recover only
    // the matching, data-authored quest graph nodes; never reveal offered or
    // locked tasks merely because they exist in the world catalog.
    for (const questId of questKnowledgeNodeIdsToBackfill(
      this.questJournal,
      world.knowledgeGraph,
      this.knownKnowledgeNodeIds,
    )) {
      this.markKnowledgeDiscovered(questId);
    }
    this.social.npcKnowledge = mergeNpcKnowledge(world.knowledgeGraph, this.social.npcKnowledge);
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

    this.setMapOrigin(activeMap);
    this.mapLayer = renderGridMap(this, activeMap, this.mapOrigin.x, this.mapOrigin.y);
    this.mapLayer.setScrollFactor(1);

    const startOffset = cellCenterOffset(activeMap, this.playerCol, this.playerRow);
    this.marker = createGridMapActor(
      this, activeMap, this.mapOrigin.x + startOffset.x, this.mapOrigin.y + startOffset.y,
      activeMap.data.art?.actors.playerFrame,
    ) ?? this.add.circle(
      this.mapOrigin.x + startOffset.x, this.mapOrigin.y + startOffset.y,
      map.tileSize * 0.28, 0xe8b04b,
    ).setScrollFactor(1).setDepth(10);
    if (this.marker === null) {
      this.showErrorState('地图缺少玩家像素精灵', ['当前地图 art.actors 未提供可用人物图集。'], true);
      return;
    }
    this.setWorldActorDepth(this.marker);
    this.configureMapCamera(activeMap, this.marker);

    this.renderNpcs(activeMap);
    this.renderEncounterMarkers(activeMap);
    this.renderArenaMarkers(activeMap);
    this.renderFactionWarMarkers(activeMap);
    this.renderEquipmentForgeMarkers(activeMap);
    this.renderAlchemyMarkers(activeMap);
    this.renderEndingGateMarker(activeMap);
    this.ensureDaylightLayer();
    // Round 109 gate markers: created once the map origin and the initial
    // player cell are both final, so the first projection is already correct.
    this.rebuildTransitionMarkers();
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
      onAction: (signal) => this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, signal)),
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
      onQuestAccepted: (questId) => {
        if (this.world?.knowledgeGraph.nodes.get(questId)?.kind === 'quest') {
          this.markKnowledgeDiscovered(questId);
        }
      },
      onNavigateQuest: (questId) => this.navigateQuestObjective(questId),
    });
    this.pauseMenu = new PauseMenuPanel(this, {
      storage: this.storage,
      save: (slotId) => this.saveToSlot(slotId),
      returnToMenu: () => this.returnToMenu(),
      onSettingsChanged: (settings) => {
        this.settings = { ...settings };
        this.syncSettingsPresentation();
      },
      onClose: () => {
        this.settings = this.pauseMenu?.currentSettings() ?? this.settings;
        this.noteOverlayClosed();
      },
    });
    this.controlsPanel = new ControlsPanel(this);
    this.travelConfirmation = new TravelConfirmationPanel(this, () => this.noteOverlayClosed());
    this.factionPanel = new FactionPanel(this, () => this.noteOverlayClosed());
    this.companionPanel = new CompanionPanel(this, () => this.noteOverlayClosed());
    this.regionalGuidePanel = new RegionalGuidePanel(this, () => this.noteOverlayClosed());
    this.arenaPanel = new ArenaPanel(this, () => this.noteOverlayClosed());
    this.factionWarPanel = new FactionWarPanel(this, () => this.noteOverlayClosed());
    this.martialArtsPanel = new MartialArtsPanel(this, () => this.noteOverlayClosed());
    this.martialArtForgePanel = new MartialArtForgePanel(this, () => this.noteOverlayClosed());
    this.equipmentForgePanel = new EquipmentForgePanel(this, () => this.noteOverlayClosed());
    this.alchemyPanel = new AlchemyPanel(this, () => this.noteOverlayClosed());
    this.endingPanel = new EndingPanel(this, () => this.noteOverlayClosed());
    this.achievementPanel = new AchievementPanel(this, () => this.noteOverlayClosed());
    this.meridianPanel = new MeridianPanel(this, () => this.noteOverlayClosed());
    this.worldMapPanel = new WorldMapPanel(
      this,
      () => this.noteOverlayClosed(),
      (destinationId) => {
        this.navigationDestinationId = destinationId;
        this.refreshNavigationGuide();
      },
    );
    this.encyclopediaPanel = new EncyclopediaPanel(this, { onClose: () => this.noteOverlayClosed() });
    this.modStatusPanel = new ModStatusPanel(this, { onClose: () => this.noteOverlayClosed() });
    this.collectionPanel = new CollectionPanel(this, { onClose: () => this.noteOverlayClosed() });
    this.syncKnowledgeFromRunFacts();
    if (restoredRun !== null) {
      this.applyQuestUpdate(reconcileKnownKnowledgeObjectives(
        this.quests,
        this.questJournal,
        this.knownKnowledgeNodeIds,
      ));
    }
    this.updateQuestTrackerHud();
    this.refreshNavigationGuide();
    this.updateInteractHint();
    this.triggerRegionEvents();
  }

  /**
   * Round 109 single disposal pass for every overlay panel this scene owns;
   * both world REPLACEMENT (setupWorld after a hot-reload preflight) and
   * scene SHUTDOWN route here. destroy() releases each panel's key bindings
   * and owned DOM elements and clears the field, so a later rebuild (or the
   * next scene entry) never stacks a second generation of panels. Overlay
   * close callbacks fired inside destroy() are neutralized through
   * {@link disposingWorldPanels} so teardown cannot re-enter the reload
   * pipeline; the stale HUD text refs (destroyed with the children list)
   * are dropped so nothing dereferences them before buildHud recreates them.
   */
  private disposeWorldPanels(): void {
    if (this.disposingWorldPanels) return;
    this.dialogueBattleGeneration += 1;
    this.dialogueBattlePending = false;
    this.disposingWorldPanels = true;
    try {
      for (const field of WORLD_OVERLAY_PANEL_FIELDS) {
        const panel = this[field];
        panel?.destroy();
        this[field] = null;
      }
      this.destroyTransitionMarkers();
      this.coordsText = null;
      this.timeText = null;
      this.climateText = null;
      this.interactText = null;
      this.questTrackerText = null;
      this.navigationHintText = null;
      this.mapNameText = null;
      this.movementHintText = null;
      this.hudMeasureText = null;
      this.hudMeasureFontSize = '';
      this.hudTopRect = null;
      this.hudBottomRect = null;
      this.hudWarningTexts = [];
      this.hudWarningRawLines = [];
    } finally {
      this.disposingWorldPanels = false;
    }
  }

  // -------------------------------------------------------------------------
  // Round 109 transition gate markers (world-space, presentation only)
  // -------------------------------------------------------------------------

  /** Destroys the current gate marker renderer; idempotent and field-clearing. */
  private destroyTransitionMarkers(): void {
    this.transitionMarkers?.destroy();
    this.transitionMarkers = null;
  }

  /**
   * Rebuilds the gate markers for the CURRENT map from the world map's own
   * authored transitions and region records. Any previous renderer is
   * destroyed first (world replacement and map switches route here only
   * after every refusal has returned), the container scrolls with the world
   * despite the scene's add-hook pinning overlays, and the depth keeps the
   * badges above the world layers but below the daylight wash and the HUD.
   */
  private rebuildTransitionMarkers(): void {
    this.destroyTransitionMarkers();
    const world = this.world;
    const map = this.map;
    if (world === null || map === null) return;
    this.transitionMarkers = createTransitionGateMarkers(this, {
      mapResourceId: this.currentMapResourceId,
      transitions: world.worldMap.transitions,
      regions: world.worldMap.regions,
      tileSize: map.tileSize,
      mapOrigin: { x: this.mapOrigin.x, y: this.mapOrigin.y },
      playerCell: { col: this.playerCol, row: this.playerRow },
      depth: TRANSITION_MARKER_DEPTH,
    });
  }

  /** Proximity refresh after a successful step; a no-op without markers. */
  private updateTransitionMarkerProximity(): void {
    this.transitionMarkers?.update({ col: this.playerCol, row: this.playerRow });
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

    const restoration = this.restorePlannedSnapshot(world, plan.snapshot);
    if (restoration === null) {
      return null; // The readable failure panel is already on screen.
    }
    console.info(
      '[save] 已从 %s 读档：%s Lv.%d（位置 %d,%d，银两 %d）',
      slotId,
      read.snapshot.displayName,
      restoration.run.character.level,
      read.snapshot.playerPosition.col,
      read.snapshot.playerPosition.row,
      restoration.run.inventory.currency,
    );
    return { run: restoration.run, warnings: plan.warnings };
  }

  /**
   * Restores an already-sanitized snapshot against the given world. Shared
   * by the slot-load path (read → preflight → restore) and the Round 36 dev
   * hot reload (capture → preflight against the freshly loaded world →
   * rebuild), so both rebuild run state through exactly one code path.
   */
  private restorePlannedSnapshot(
    world: LoadedWorld,
    planned: SaveSnapshotV1,
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
    const profile = world.assembly.progression.profiles.get(planned.profileId);
    if (profile === undefined) {
      // Defensive: preflight callers already guarantee this exists.
      this.showErrorState('读档失败', [`存档引用的角色模板 "${planned.profileId}" 不可用。`], true);
      return null;
    }
    const restored = restoreRunState({
      profile,
      items: world.assembly.items,
      quests: world.assembly.quests,
      shops: world.assembly.shops,
      snapshot: planned,
    });
    return {
      run: {
        ...restored,
        profileId: planned.profileId,
        displayName: planned.displayName,
        mapResourceId: planned.mapResourceId,
        playerPosition: { ...planned.playerPosition },
        elapsedGameMinutes: planned.elapsedGameMinutes,
        worldSeed: planned.worldSeed,
      },
      warnings: [],
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
      regionalEventIds: new Set([
        ...world.worldMap.events.map((event) => event.id),
        ...world.worldMap.randomEvents.map((event) => event.id),
      ]),
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
    const snapshot = this.buildRunSnapshot();
    if (this.storage === null || snapshot === null) {
      return { ok: false, message: '浏览器本地存储不可用或当前无可保存的进度' };
    }
    const result = writeSaveSlot(this.storage, slotId, snapshot);
    if (result.ok) {
      console.info('[save] 已保存到 %s（%s）', slotId, result.savedAt);
      return { ok: true, message: `保存成功（${snapshot.displayName} Lv.${snapshot.player.level}）` };
    }
    console.warn('[save] 保存失败：', result.message);
    return { ok: false, message: result.message };
  }

  /**
   * Captures the complete run state as a v1 snapshot (null while no profile
   * is playable). Shared by saving and the Round 36 hot reload, so both see
   * the exact same serialization of progress.
   */
  private buildRunSnapshot(): SaveSnapshotV1 | null {
    if (this.playerState === null || this.inventory === null) {
      return null;
    }
    this.syncKnowledgeFromRunFacts();
    return captureSaveSnapshot({
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
      dialogueVariables: this.dialogueVariables,
    });
  }

  // -------------------------------------------------------------------------
  // Round 36 dev data hot reload
  // -------------------------------------------------------------------------

  /**
   * Dev-only subscription, mirroring the menu scene: the static DEV guard
   * folds to `null` in production builds (tree-shaking the bridge module),
   * and SHUTDOWN detaches the listener while expiring any in-flight reload.
   */
  private subscribeDataHotReload(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.dataReloadToken += 1; // Expire any reload awaiting loadWorldData.
      this.dataReloading = false;
      this.input.enabled = true;
      this.unsubscribeDataChanges?.();
      this.unsubscribeDataChanges = null;
    });
    this.unsubscribeDataChanges = import.meta.env.DEV
      ? subscribeDataChanges((batch) => this.onWorldDataChanged(batch))
      : null;
  }

  /** Latches a merged data change batch; runs the reload at a safe boundary. */
  private onWorldDataChanged(batch: DataChangeBatch): void {
    console.info(
      '[data-hmr] 世界资料变更（%s），等待安全边界后热重载…',
      batch.map((notice) => `${notice.layer}/${notice.relative}:${notice.changeType}`).join('、'),
    );
    this.pendingDataReload = true;
    if (this.world === null || this.dataReloading) {
      return; // Retry after initial loading or the in-flight reload finishes.
    }
    void this.runPendingDataReload();
  }

  /** True when no move tween, battle session or overlay holds the run state. */
  private canReloadWorldNow(): boolean {
    return !this.moving && this.activeSession === null && !this.anyOverlayOpen();
  }

  /**
   * Applies a latched data change at the next safe boundary: captures the
   * run snapshot, reloads the world through the shared loader, preflights
   * the snapshot against the new data and rebuilds the scene around it in
   * one atomic setupWorld. Any failure keeps the complete old run — the
   * world fields are only replaced after the whole pipeline succeeded, and
   * the visible failure notice names the reason (details in the console).
   */
  private async runPendingDataReload(): Promise<void> {
    if (!this.pendingDataReload || this.dataReloading || this.world === null) {
      return;
    }
    if (!this.canReloadWorldNow()) {
      return; // Retried from move completion / overlay close hooks.
    }
    this.pendingDataReload = false;
    const snapshot = this.buildRunSnapshot();
    const token = ++this.dataReloadToken;
    this.dataReloading = true;
    this.input.enabled = false; // Lock every scene input while the atomic refresh runs.
    const outcome = await loadWorldData();
    if (token !== this.dataReloadToken) {
      return; // Superseded by a newer reload, or the scene shut down.
    }
    this.dataReloading = false;
    this.input.enabled = true;
    if (this.pendingDataReload) {
      // A second edit landed while the loader was awaiting fetches; skip this
      // now-stale assembly and immediately load the newest filesystem state.
      void this.runPendingDataReload();
      return;
    }
    if (!outcome.ok) {
      this.reportDataReloadFailure(outcome.title, outcome.lines);
      return;
    }
    try {
      await loadGridMapArtAssets(
        this,
        outcome.world.maps.values(),
        outcome.world.worldMap.data.atlasArt?.tilesets,
      );
    } catch (error) {
      this.reportDataReloadFailure('地图像素素材无法加载', [error instanceof Error ? error.message : String(error)]);
      return;
    }
    let restoreSnapshot: SaveSnapshotV1 | null = null;
    if (snapshot !== null) {
      const plan = planSnapshotRestore(
        snapshot,
        this.saveWorldReferences(outcome.world, snapshot),
      );
      if (!plan.ok) {
        this.reportDataReloadFailure(
          '当前进度与新资料不兼容（角色模板、地图或站位无法恢复）',
          plan.errors,
        );
        return;
      }
      for (const warning of plan.warnings) {
        console.warn(`[data-hmr] ${warning}`);
      }
      restoreSnapshot = plan.snapshot;
    }
    this.hotReloadSnapshot = restoreSnapshot;
    this.setupWorld(outcome.world);
    this.showRegionNotice(restoreSnapshot === null
      ? '世界资料已重新装配。'
      : `世界资料已热重载（${restoreSnapshot.displayName} Lv.${restoreSnapshot.player.level}，位置与进度已保留）。`);
  }

  /** Readable hot-reload failure: old run stays live, reason reaches the HUD. */
  private reportDataReloadFailure(title: string, details: readonly string[]): void {
    console.warn(`[data-hmr] 资料热重载未应用：${title}`, details);
    this.showRegionNotice(`资料热重载未应用：${title}。旧世界与进度已保留，详情见控制台。`);
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
    // Disposing panels fire onClose callbacks; teardown is not a user close
    // boundary and must not re-enter the reload pipeline mid-disposal.
    if (this.disposingWorldPanels) return;
    this.lastOverlayCloseAt = this.time.now;
    this.syncSettingsPresentation();
    this.gamepadEdges.reset(); // A confirm press that closed a panel must not leak through.
    this.updateInteractHint();
    void this.runPendingDataReload(); // Safe boundary for a latched data change.
  }

  /** Applies live settings to already-rendered exploration presentation. */
  private syncSettingsPresentation(): void {
    // The pause/settings pages may have just changed the movement layout,
    // text scale, or reduced-motion preference — reflect them immediately.
    this.hudLines.help = `${currentMovementHelpText()} · E 交互 · R 行旅 · H 帮助`;
    // Font sizes first, then the measured reflow: relayoutHud re-measures
    // every line at the new size, and the gate markers re-wrap their labels
    // through their own refreshFonts (a no-op once destroyed, so a stale
    // marker reference can never survive here).
    this.refreshScaledTextTargets();
    this.relayoutHud();
    this.layoutInteractHint();
    this.transitionMarkers?.refreshFonts();
    this.syncReducedMotionPresentation();
  }

  /**
   * Round 41 reduced motion: live sync after the setting may have changed.
   * Precipitation particles are the only always-animated presentation, so a
   * freshly enabled preference tears the emitter down; fades and moves read
   * the flag at their next occurrence through {@link currentReducedMotion}.
   */
  private syncReducedMotionPresentation(): void {
    const reading = this.currentClimate();
    if (currentReducedMotion()) {
      const daylight = this.daylightLayer;
      const clock = this.clock;
      if (daylight !== null && clock !== null) {
        const period = clock.currentPeriod();
        const alpha = Math.max(0, Math.min(1, 1 - period.lightLevel)) * DAYLIGHT_MAX_ALPHA;
        this.tweens.killTweensOf(daylight);
        daylight.setAlpha(alpha);
      }
      if (this.weatherTintLayer !== null && reading !== null) {
        this.tweens.killTweensOf(this.weatherTintLayer);
        this.weatherTintLayer.setFillStyle(reading.weather.tintColor, 1);
        this.weatherTintLayer.setAlpha(reading.weather.tintAlpha);
      }
      this.weatherEmitter?.destroy();
      this.weatherEmitter = null;
    } else if (this.weatherEmitter === null && reading !== null) {
      // Turning reduced motion off restores the current precipitation without
      // waiting for the next in-game day/weather transition.
      this.replaceWeatherEmitter(reading.weather);
    }
  }

  /**
   * Round 41 gamepad polling: samples the first connected standard pad once
   * per frame and converts held state into press edges. Everything is gated
   * on the persisted gamepad setting; without a device (or with the setting
   * off) this is a cheap early return and keyboard play is untouched. While
   * the pause menu owns the screen its actions route there instead of the
   * world, mirroring the keyboard Escape ownership rules.
   */
  private pollGamepad(): void {
    if (!currentGamepadEnabled() || this.dataReloading) {
      return;
    }
    const pad = this.input.gamepad?.pad1;
    if (pad === undefined || pad === null) {
      this.gamepadEdges.reset();
      return;
    }
    const edges = this.gamepadEdges.update(sampleStandardPad({
      dpad: { up: pad.up, down: pad.down, left: pad.left, right: pad.right },
      leftStick: { x: pad.leftStick.x, y: pad.leftStick.y },
      A: pad.A,
      B: pad.B,
    }));
    if (this.travelConfirmation?.isOpen) {
      if (edges.confirm) this.travelConfirmation.accept();
      else if (edges.back) this.travelConfirmation.close();
      return;
    }
    if (this.pauseMenu?.isOpen) {
      this.pauseMenu.handleGamepadEdges(edges);
      return;
    }
    if (edges.direction === 'up') this.tryMove(0, -1);
    else if (edges.direction === 'down') this.tryMove(0, 1);
    else if (edges.direction === 'left') this.tryMove(-1, 0);
    else if (edges.direction === 'right') this.tryMove(1, 0);
    if (edges.confirm) this.handleInteraction();
    if (edges.back) this.togglePauseMenu();
  }

  update(): void {
    this.pollGamepad();
  }

  /** Escape while exploring: toggle the pause menu (never over another overlay). */
  private togglePauseMenu(): void {
    if (this.dataReloading) {
      return; // The world is being rebuilt around a hot reload right now.
    }
    if (this.martialArtsPanel?.isOpen) {
      this.martialArtsPanel.close();
      return;
    }
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
      // The pause panel owns Escape while open (for example, its settings
      // page returns to the pause menu). Letting this scene toggle it too
      // makes one Escape close both layers of navigation.
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
  private addWorldObjects(
    layer: Phaser.GameObjects.Container | null,
    objects: Phaser.GameObjects.GameObject[],
  ): void {
    if (layer === null) return;
    for (const object of objects) {
      (object as Phaser.GameObjects.GameObject & { setScrollFactor(x: number, y?: number): unknown })
        .setScrollFactor(1);
    }
    layer.add(objects);
  }

  private renderEncounterMarkers(map: GridMap): void {
    this.encounterLayer = this.add.container().setScrollFactor(1);
    this.lastEncounterTideId = this.currentClimate()?.tide?.id ?? null;
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

      this.addWorldObjects(this.encounterLayer, [body, label]);
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
      this.addWorldObjects(this.encounterLayer, [badge, label]);
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
      this.addWorldObjects(this.encounterLayer, [badge, label]);
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
      this.addWorldObjects(this.encounterLayer, [badge, label]);
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
      this.addWorldObjects(this.encounterLayer, [badge, label]);
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
    this.addWorldObjects(this.encounterLayer, [badge, label]);
  }

  /**
   * Encounters still standing this run: repeatable ones always, one-shot
   * ones only until their first victory. One-shot completion persists in
   * versioned save snapshots.
   */
  private activeEncounters(): PlacedEncounter[] {
    const tideId = this.currentClimate()?.tide?.id ?? null;
    return this.encounters.filter(
      (encounter) =>
        encounterMatchesTide(encounter.record, tideId) &&
        (encounter.record.repeatable || !this.completedEncounters.has(encounter.record.id)),
    );
  }

  /** Updates tide-gated encounter markers and occupied cells after the clock changes phase. */
  private syncTideGatedEncounters(): void {
    const tideId = this.currentClimate()?.tide?.id ?? null;
    if (tideId === this.lastEncounterTideId || this.map === null) return;
    this.lastEncounterTideId = tideId;
    const active = this.activeEncounters();
    const activeIds = new Set(active.map((encounter) => encounter.record.id));
    for (const [id, markers] of this.encounterMarkers) {
      if (activeIds.has(id)) continue;
      for (const marker of markers) marker.destroy();
      this.encounterMarkers.delete(id);
    }
    this.encounterCells = new Map(active.map((encounter) => [
      `${encounter.col},${encounter.row}`,
      encounter,
    ]));
    for (const encounter of active) {
      if (this.encounterMarkers.has(encounter.record.id)) continue;
      this.addTideGatedEncounterMarker(this.map, encounter);
    }
    this.updateInteractHint();
  }

  private addTideGatedEncounterMarker(map: GridMap, encounter: PlacedEncounter): void {
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
    body.setAngle(45);
    const label = this.registerScaledText(this.add.text(
      this.mapOrigin.x + center.x,
      this.mapOrigin.y + center.y - size / 2 - 4,
      encounter.record.enemy.name,
      { fontFamily: UI.fontFamily, fontSize: uiFontSize(10), color: UI.textPrimary },
    ).setOrigin(0.5, 1), 10);
    this.addWorldObjects(this.encounterLayer, [body, label]);
    this.encounterMarkers.set(encounter.record.id, [body, label]);
  }

  /** Opens the data-authored signup card; item capacity is reserved up front. */
  private openArenaSignup(arena: AssembledArena): void {
    const panel = this.arenaPanel;
    if (panel === null) return;
    const record = this.arenaRecords.get(arena.record.id) ?? createArenaRecord(arena.record.id);
    this.arenaRecords.set(record.arenaId, record);
    const blocked = this.arenaRegistrationBlock(arena);
    const firstPayout = resolveArenaAttemptPayout(arena.record, record.championships, true);
    const rewardLines = firstPayout.firstChampionship ? [
      firstPayout.currency + ' 文钱',
      ...firstPayout.items.map((entry) =>
        (this.items.get(entry.itemId)?.name ?? entry.itemId) + ' ×' + entry.quantity,
      ),
    ] : ['首夺银两与物品彩头已领取', '重赛仍按胜场获得经验'];
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
    const payout = resolveArenaAttemptPayout(arena.record, this.arenaRecords.get(arena.record.id)?.championships ?? 0, true);
    if (!payout.firstChampionship) return null;
    if (this.inventory.currency + payout.currency > 999_999_999) {
      return '钱袋已满，先花用一些文钱再来报名。';
    }
    const trial = {
      ...this.inventory,
      stacks: this.inventory.stacks.map((stack) => ({ ...stack })),
      equipped: { ...this.inventory.equipped },
    };
    for (const entry of payout.items) {
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
        ? { companion: { name: companionNpc.record.name, support: resolveCompanionStance(activeCompanion, { mapResourceId: this.currentMapResourceId, sharedKnowledgeNodeIds: this.social.npcKnowledge.get(activeCompanion.npcId) ?? new Set() }).combatSupport } }
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
    if (champion && this.inventory !== null && this.playerProfile !== null && this.playerState !== null) {
      const payout = resolveArenaAttemptPayout(run.arena.record, record.championships, true);
      record.championships += 1;
      if (payout.firstChampionship) {
        this.inventory.currency += payout.currency;
        for (const reward of payout.items) {
          const item = this.items.get(reward.itemId);
          if (item !== undefined) grantItems(this.inventory, item, reward.quantity);
        }
        this.syncKnowledgeFromRunFacts();
        const prizes = [
          payout.currency + ' 文钱',
          ...payout.items.map((reward) =>
            (this.items.get(reward.itemId)?.name ?? reward.itemId) + ' ×' + reward.quantity,
          ),
        ].join('、');
        this.showRegionNotice(run.arena.record.texts.champion + ' 首夺彩头：' + prizes + '。');
      } else {
        this.showRegionNotice(run.arena.record.texts.champion + ' 首夺彩头已领，本次按胜场获取经验并更新战绩。');
      }
      this.refreshAchievementUnlocks();
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
        ? { companion: { name: companionNpc.record.name, support: resolveCompanionStance(activeCompanion, { mapResourceId: this.currentMapResourceId, sharedKnowledgeNodeIds: this.social.npcKnowledge.get(activeCompanion.npcId) ?? new Set() }).combatSupport } }
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
    const newlyDiscovered = node !== undefined && this.markKnowledgeDiscovered(node.id);
    const discovery = newlyDiscovered ? `新见闻「${node!.title}」已记入江湖百闻。` : '';
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
          equippedItemIds: Object.values(this.inventory?.equipped ?? {}),
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
    this.npcLayer = this.add.container().setScrollFactor(1);
    // Round 111: adopt (never a bare add) — a transition-detached marker was
    // re-queued through the display list, where the scene HUD pin zeroed its
    // scroll factor. Adoption restores the world plane before re-parenting.
    if (this.marker !== null) adoptGridMapWorldActor(this.npcLayer, this.marker);
    this.npcLayer.add(createGridMapDepthRows(this, map, this.mapOrigin.x, this.mapOrigin.y));
    this.npcVisuals.clear();
    (this.world?.assembly.npcs ?? [])
      .filter((npc) => npc.record.mapResourceId === this.currentMapResourceId)
      .forEach((npc) => this.createNpcVisual(npc, map));
    this.syncNpcVisuals(false);
    this.refreshCompanionFollower(null);
    this.sortWorldActorLayer();
  }

  private setMapOrigin(map: GridMap): void {
    if (map.pixelWidth > VIEW_WIDTH || map.pixelHeight > VIEW_HEIGHT) {
      this.mapOrigin.set(0, 0);
      return;
    }
    this.mapOrigin.set(
      (VIEW_WIDTH - map.pixelWidth) / 2,
      HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT - map.pixelHeight) / 2,
    );
  }

  private configureMapCamera(map: GridMap, target: Phaser.GameObjects.GameObject | null): void {
    const camera = this.cameras.main;
    camera.stopFollow();
    camera.setRoundPixels(true);
    if (map.pixelWidth > VIEW_WIDTH || map.pixelHeight > VIEW_HEIGHT) {
      const bounds = paddedWorldCameraBounds(map.pixelWidth, map.pixelHeight, VIEW_WIDTH, VIEW_HEIGHT,
        this.hudTopRect?.height ?? HUD_HEIGHT, this.hudBottomRect?.height ?? 32);
      camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
      if (target !== null) camera.startFollow(target, true, 1, 1);
      return;
    }
    camera.setBounds(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    camera.setScroll(0, 0);
  }

  /** Permit edge cells to remain outside the measured HUD without moving them. */
  private refreshWorldCameraBounds(): void {
    const map = this.map;
    if (map === null || (map.pixelWidth <= VIEW_WIDTH && map.pixelHeight <= VIEW_HEIGHT)) return;
    const bounds = paddedWorldCameraBounds(map.pixelWidth, map.pixelHeight, VIEW_WIDTH, VIEW_HEIGHT,
      this.hudTopRect?.height ?? HUD_HEIGHT, this.hudBottomRect?.height ?? 32);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private createNpcVisual(npc: PlacedNpc, map: GridMap): void {
    const center = cellCenterOffset(map, npc.col, npc.row);
    const x = this.mapOrigin.x + center.x;
    const y = this.mapOrigin.y + center.y;
    const marker = createGridMapActor(this, map, x, y, npc.record.spriteFrame ?? npc.record.spriteFrames?.down) ??
      this.add.circle(x, y, map.tileSize * 0.25, 0x7ec8a9).setDepth(10);
    const label = this.registerScaledText(this.add
      .text(x, y - map.tileSize * 0.42 - 4, npc.record.name, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textPrimary,
      })
      .setOrigin(0.5, 1), 10);
    this.setWorldActorDepth(marker, label, map.tileSize);
    this.addWorldObjects(this.npcLayer, [marker, label]);
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
    // Round 117: the guide hint quotes the nearest giver's live cell, so a
    // period change must re-project the tracker line too, not just the
    // adjacent-interaction prompt.
    this.updateQuestTrackerHud();
    // A period change may have moved a navigation target NPC: re-resolve.
    this.refreshNavigationGuide();
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
    // Round 117: a reshuffled roster changes the nearest guide as well.
    this.updateQuestTrackerHud();
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
      if (animate && !currentReducedMotion()) {
        this.tweens.add({
          targets: visual.marker,
          x,
          y,
          duration: 420,
          onUpdate: () => this.setWorldActorDepth(visual.marker, visual.label, map.tileSize),
        });
        this.tweens.add({ targets: visual.label, x, y: y - map.tileSize * 0.42 - 4, duration: 420 });
      } else {
        // Includes reduced motion: schedule changes reposition NPCs directly.
        visual.marker.setPosition(x, y);
        visual.label.setPosition(x, y - map.tileSize * 0.42 - 4);
        this.setWorldActorDepth(visual.marker, visual.label, map.tileSize);
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
      const marker = createGridMapActor(
        this, map, this.mapOrigin.x + center.x, this.mapOrigin.y + center.y,
        npc.record.spriteFrame ?? npc.record.spriteFrames?.down,
      ) ?? this.add.circle(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y, map.tileSize * 0.25, 0x48c8a3);
      const label = this.registerScaledText(this.add.text(
        this.mapOrigin.x + center.x,
        this.mapOrigin.y + center.y - map.tileSize * 0.42 - 4,
        npc.record.name,
        { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(10), color: UI.textPrimary },
      ).setOrigin(0.5, 1), 10);
      this.addWorldObjects(this.npcLayer, [marker, label]);
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
    const facing = directionBetweenCells(cell, { col: this.playerCol, row: this.playerRow });
    if (visual.marker instanceof Phaser.GameObjects.Image && npc.record.spriteFrames !== undefined) {
      setGridMapActorFrame(this, map, visual.marker, npc.record.spriteFrames[facing]);
    }
    this.setWorldActorDepth(visual.marker, visual.label, map.tileSize);
  }

  private setWorldActorDepth(
    marker: WorldActorMarker,
    label?: Phaser.GameObjects.Text,
    tileSize = this.map?.tileSize ?? 0,
  ): void {
    const footDepth = gridMapActorDepth(marker.y, tileSize);
    marker.setDepth(footDepth);
    label?.setDepth(footDepth + 0.005);
    this.sortWorldActorLayer();
  }

  private sortWorldActorLayer(): void {
    this.npcLayer?.sort('depth');
  }

  /** Turns the player toward an adjacent NPC and, when available, the NPC back. */
  private faceInteractionTarget(target: PlacedNpc): void {
    const towardNpc = directionBetweenCells(
      { col: this.playerCol, row: this.playerRow },
      { col: target.col, row: target.row },
    );
    this.playerFacing = towardNpc;
    this.updatePlayerActorFrame(false);
    const towardPlayer = oppositeGridMapActorDirection(towardNpc);
    const visual = this.npcVisuals.get(target.record.id);
    const frame = target.record.spriteFrames?.[towardPlayer];
    if (visual?.marker instanceof Phaser.GameObjects.Image && frame !== undefined && this.map !== null) {
      setGridMapActorFrame(this, this.map, visual.marker, frame);
    }
  }

  /** Turns toward a data-authored cell interaction without requiring an actor there. */
  private faceInteractionCell(target: { col: number; row: number }): void {
    this.playerFacing = directionBetweenCells(
      { col: this.playerCol, row: this.playerRow },
      target,
    );
    this.updatePlayerActorFrame(false);
  }

  private buildHud(
    map: GridMap,
    optionalWarnings: readonly Diagnostic[],
    modWarnings: readonly Diagnostic[],
  ): void {
    // HUD text lives above the daylight wash (depth 50) so every period's
    // tint keeps the interface fully legible. Round 109: every line below is
    // positioned by relayoutHud() from MEASURED grapheme-wrapped text (never
    // Phaser's space-only native wordWrap, which lets CJK runs run past the
    // configured width), and both backing rectangles are resized to the
    // measured stack so the whole header stays on a visible background at
    // any text scale without a fixed slab hiding more world than needed.
    this.hudTopRect = this.add.rectangle(VIEW_WIDTH / 2, 46, VIEW_WIDTH, 92, 0x10141d, 0.94)
      .setScrollFactor(0).setDepth(HUD_TEXT_DEPTH - 1);
    this.hudBottomRect = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT - 16, VIEW_WIDTH, 32, 0x10141d, 0.94)
      .setScrollFactor(0).setDepth(HUD_TEXT_DEPTH - 1);
    // Offscreen measuring probe: kept out of the scaled targets because each
    // measurement sets its font size explicitly before reading the context.
    this.hudMeasureText = this.add
      .text(-256, -256, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.textMuted,
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setDepth(HUD_TEXT_DEPTH);

    this.movementHintText = this.registerScaledText(this.add
      .text(16, 12, '', {
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
      })
      .setOrigin(0, 0)
      .setDepth(HUD_TEXT_DEPTH), 11);

    this.navigationHintText = this.registerScaledText(this.add
      .text(16, 65, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textWarn,
      })
      .setOrigin(0, 0)
      .setDepth(HUD_TEXT_DEPTH), 13);

    this.mapNameText = this.registerScaledText(this.add
      .text(VIEW_WIDTH / 2, 14, '', {
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
        text: '部分 MOD 覆盖无效，已回退到上一有效数据（按 F2 查看原因与修复建议）',
        shown: modWarnings.length > 0,
      },
    ];
    this.hudWarningRawLines = lines.filter((line) => line.shown).map((line) => line.text);
    this.hudWarningTexts = this.hudWarningRawLines.map(() => this.registerScaledText(this.add
      .text(VIEW_WIDTH / 2, 0, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(11),
        color: UI.textWarn,
      })
      .setOrigin(0.5, 0)
      .setDepth(HUD_TEXT_DEPTH), 11));
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

    this.hudLines = {
      title: map.data.name,
      time: '',
      climate: '',
      help: `${currentMovementHelpText()} · E 交互 · R 行旅 · H 帮助`,
      quest: '',
      nav: '',
      interact: '',
    };
    this.relayoutHud();
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
    this.relayoutHud();
  }

  /** Width of `value` at the live font size for the given base size. */
  private measureHudText(value: string, base: number): number {
    const probe = this.hudMeasureText;
    if (probe === null) return value.length * base; // HUD not built: coarse fallback
    const fontSize = uiFontSize(base);
    if (fontSize !== this.hudMeasureFontSize) {
      probe.setFontSize(fontSize);
      this.hudMeasureFontSize = fontSize;
    }
    return probe.context.measureText(value).width;
  }

  /** Uniform HUD line rhythm at the live font scale (pure arithmetic). */
  private hudLineHeight(base: number): number {
    return Math.ceil(Number.parseInt(uiFontSize(base), 10) * 1.4);
  }

  /** Grapheme-truncates with an ellipsis until the text fits `width`. */
  private ellipsizeHudText(value: string, width: number, base: number): string {
    if (value.length === 0 || this.measureHudText(value, base) <= width) return value;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let kept = '';
    for (const { segment } of segmenter.segment(value)) {
      if (this.measureHudText(`${kept}${segment}…`, base) > width) break;
      kept += segment;
    }
    return `${kept}…`;
  }

  /**
   * Last shown line of a capped block: always carries an ellipsis marker,
   * even when the wrapped line itself already fits the width.
   */
  private cappedHudLine(line: string, width: number, base: number): string {
    const marked = `${line}…`;
    return this.measureHudText(marked, base) <= width
      ? marked
      : this.ellipsizeHudText(marked, width, base);
  }

  /**
   * Coordinates line with the player name fitted first: the position fact is
   * never dropped, only a very long (MOD) display name ellipsizes.
   */
  private composedCoordsLine(): string {
    const base = 13;
    const suffix = `位置 (${this.playerCol}, ${this.playerRow})`;
    const name = this.playerDisplayName.trim();
    if (name.length === 0) return suffix;
    const full = `${name} · ${suffix}`;
    const cap = HUD_RIGHT_COLUMN_WIDTH;
    if (this.measureHudText(full, base) <= cap) return full;
    const budget = cap - this.measureHudText(`… · ${suffix}`, base);
    return `${this.ellipsizeHudText(name, budget, base)} · ${suffix}`;
  }

  /**
   * Round 109 measured HUD reflow — the single place every HUD line gets its
   * wrapped copy, origin and position, and both backing rectangles their
   * size. Reserved bands and columns make overlaps impossible by construction
   * at any text scale:
   *
   *   row 1  |      centred map title       | right: coordinates |
   *   row 2  | left: movement help   | right: date/time               |
   *   row 3  | left: tracked quest   | right: season/weather           |
   *   row 4  | left: navigation line (full width)                       |
   *   row 5+ | centred optional/MOD warning lines (rare, data-broken)  |
   *
   * Each left-column line wraps against the measured width of the right
   * column entry sharing its row, the title ellipsizes inside the free zone
   * left of the coordinates (its full name stays in the guide/panels), and
   * quest/navigation lines keep their actionable copy: they only wrap, or
   * cap at a bounded line count with an ellipsis on the last shown line.
   */
  private relayoutHud(): void {
    const help = this.movementHintText;
    const quest = this.questTrackerText;
    const nav = this.navigationHintText;
    const title = this.mapNameText;
    const coords = this.coordsText;
    const time = this.timeText;
    const climate = this.climateText;
    if (
      help === null || quest === null || nav === null || title === null ||
      coords === null || time === null || climate === null
    ) {
      return; // HUD not built yet (or torn down).
    }

    const pad = 8;
    const gap = 4;
    const leftX = 16;
    const rightX = VIEW_WIDTH - 16;
    const columnGap = 14;

    // ---- Right column: three single-line facts, top-aligned, width-fitted.
    const rightEntries = [
      { text: coords, raw: this.composedCoordsLine(), base: 13 },
      { text: time, raw: this.hudLines.time, base: 13 },
      { text: climate, raw: this.hudLines.climate, base: 10 },
    ].map((entry) => {
      const shown = this.ellipsizeHudText(entry.raw, HUD_RIGHT_COLUMN_WIDTH, entry.base);
      entry.text.setText(shown).setOrigin(1, 0);
      return { text: entry.text, base: entry.base, width: this.measureHudText(shown, entry.base) };
    });
    let rightBottom = pad;
    for (const entry of rightEntries) {
      entry.text.setPosition(rightX, rightBottom);
      rightBottom += this.hudLineHeight(entry.base) + gap;
    }
    rightBottom -= gap;

    // ---- Title: centred on screen, clamped inside the free zone left of the
    // coordinates; long (MOD) names ellipsize with the full name still
    // available in the regional guide and world map panels.
    const titleBase = 14;
    const coordsLeftEdge = rightX - rightEntries[0]!.width;
    const titleCap = Math.max(160, coordsLeftEdge - columnGap - leftX);
    const titleShown = this.ellipsizeHudText(this.hudLines.title, titleCap, titleBase);
    const titleWidth = this.measureHudText(titleShown, titleBase);
    const titleCenter = Math.min(
      VIEW_WIDTH / 2,
      Math.max(leftX + titleWidth / 2, coordsLeftEdge - columnGap - titleWidth / 2),
    );
    title.setText(titleShown).setOrigin(0.5, 0).setPosition(titleCenter, pad);
    const rowOneBottom = Math.max(
      pad + this.hudLineHeight(titleBase),
      pad + this.hudLineHeight(13),
    );

    // ---- Left column rows; each wraps against its own row's right entry.
    const wrapLeftColumn = (
      text: Phaser.GameObjects.Text,
      raw: string,
      base: number,
      wrapWidth: number,
      maxLines: number,
    ): number => {
      const lines = wrapDialogueText(raw, Math.max(1, wrapWidth), (s) => this.measureHudText(s, base));
      const shown = lines.length <= maxLines
        ? lines
        : [...lines.slice(0, maxLines - 1), this.cappedHudLine(lines[maxLines - 1]!, wrapWidth, base)];
      text.setText(shown.join('\n'));
      return shown.length;
    };
    const leftColumnWidth = (rightIndex: number): number =>
      rightX - rightEntries[rightIndex]!.width - columnGap - leftX;

    const helpBase = 13;
    const helpTop = rowOneBottom + gap;
    const helpLineCount = wrapLeftColumn(help, this.hudLines.help, helpBase, leftColumnWidth(1), 2);
    help.setOrigin(0, 0).setPosition(leftX, helpTop);
    const helpBottom = helpTop + Math.max(1, helpLineCount) * this.hudLineHeight(helpBase);

    const questBase = 11;
    const questTop = helpBottom + gap;
    const questLineCount = wrapLeftColumn(quest, this.hudLines.quest, questBase, leftColumnWidth(2), 2);
    quest.setOrigin(0, 0).setPosition(leftX, questTop);
    const questBottom = questTop + Math.max(1, questLineCount) * this.hudLineHeight(questBase);

    // ---- Navigation gets its own full-width band below BOTH columns; it
    // keeps the actionable route copy (up to three measured lines).
    const navBase = 13;
    nav.setFontSize(uiFontSize(navBase));
    const navTop = Math.max(questBottom, rightBottom) + gap;
    const navLineCount = wrapLeftColumn(nav, this.hudLines.nav, navBase, rightX - leftX, 3);
    nav.setOrigin(0, 0).setPosition(leftX, navTop);
    let hudBottom = navTop + Math.max(1, navLineCount) * this.hudLineHeight(navBase);

    // ---- Warning lines: rare full-width centred lines below everything.
    this.hudWarningTexts.forEach((text, index) => {
      const raw = this.hudWarningRawLines[index] ?? '';
      const lines = wrapDialogueText(raw, rightX - leftX, (s) => this.measureHudText(s, 11));
      text.setText(lines.join('\n')).setOrigin(0.5, 0).setPosition(VIEW_WIDTH / 2, hudBottom + gap);
      hudBottom += gap + lines.length * this.hudLineHeight(11);
    });

    // ---- Backing rectangle sized to the measured stack (never a fixed slab).
    this.hudTopRect?.setSize(VIEW_WIDTH, hudBottom + pad).setPosition(VIEW_WIDTH / 2, (hudBottom + pad) / 2);
    this.refreshWorldCameraBounds();
  }

  /** Rebuilds the selected destination's local route and compact HUD instruction. */
  private refreshNavigationGuide(): void {
    const destinationId = this.navigationDestinationId;
    const map = this.map;
    const world = this.world;
    const text = this.navigationHintText;
    if (text === null) return;
    if (destinationId === null || map === null || world === null) {
      this.hudLines.nav = '';
      this.relayoutHud();
      return;
    }

    const guide = this.resolveNavigationGuide(destinationId);
    if (guide === null) return; // A readable status was already shown.
    if (guide.status === 'target-lost') {
      this.navigationDestinationId = null;
      this.hudLines.nav = '行路目标已失效；可在 M 舆图重新选择。';
      this.relayoutHud();
      return;
    }
    if (guide.status === 'route-blocked') {
      // Keep the selector: NPC schedules and battle outcomes can reopen this
      // route, and the next world refresh will rebuild its local path.
      this.hudLines.nav = `行路「${this.ellipsizeHudText(guide.destinationName, VIEW_WIDTH / 3, 13)}」暂被人物或遭遇堵住，通路变化后将自动重算。`;
      this.relayoutHud();
      return;
    }
    if (guide.status === 'route-broken') {
      this.navigationDestinationId = null;
      this.hudLines.nav = `行路「${this.ellipsizeHudText(guide.destinationName, VIEW_WIDTH / 3, 13)}」当前无可行路线；可在 M 舆图重新规划。`;
      this.relayoutHud();
      return;
    }

    // Compact only labels; reserve room for the actual route/action suffix.
    const destinationName = this.ellipsizeHudText(guide.destinationName, VIEW_WIDTH / 3, 13);
    const transitionName = guide.nextTransitionName === null ? null
      : this.ellipsizeHudText(guide.nextTransitionName, VIEW_WIDTH / 3, 13);
    const directionNames = { north: '北', east: '东', south: '南', west: '西' } as const;
    const routePrefix = summarizePathRunPrefix(guide.path, 3);
    const runs = routePrefix.runs
      .map((run) => `${directionNames[run.direction]}${run.steps}`);
    const direction = runs.length > 0 ? `${runs.join('→')}${routePrefix.hasMore ? '→…' : ''} · ` : '';
    const steps = Math.max(0, guide.path.length - 1);
    if (guide.status === 'at-gate') {
      this.hudLines.nav = `行路「${destinationName}」· 已到「${transitionName ?? '关口'}」旁，按 E 通过。`;
    } else if (guide.status === 'arrived') {
      // Quest targets name the existing control that acts on arrival; plain
      // landmark stops keep their original copy. Arrival is only proximity,
      // so the hint stays a suggestion and never reports an interaction.
      const action = guide.inspectionHint !== undefined ? `，${guide.inspectionHint}` : guide.arrivalAction === undefined
        ? ''
        : `，${arrivalActionHint(guide.arrivalAction)}`;
      this.hudLines.nav = `行路「${destinationName}」· 已抵达附近${action}。`;
      // A landmark is complete when reached; an NPC/encounter still needs its
      // interaction, so keep that quest pin selected until the objective moves.
      if (guide.inspectionHint === undefined && this.navigationDestinationId?.startsWith(QUEST_NAVIGATION_ID_PREFIX) !== true) {
        this.navigationDestinationId = null;
      }
    } else if (guide.nextTransitionName !== null) {
      this.hudLines.nav = `行路「${destinationName}」· ${direction}${steps}格至「${transitionName}」旁。`;
    } else {
      this.hudLines.nav = `行路「${destinationName}」· ${direction}${steps}格。`;
    }
    const budget = estimateNavigationWalkingBudget(guide, this.clock?.calendar.actionCosts,
      this.currentClimate()?.weather.stepMinutes ?? 0, this.clock?.snapshot().minuteOfDay);
    if (budget !== null) this.hudLines.nav += `\n${navigationWalkingBudgetHint(budget)}`;
    this.relayoutHud();
  }

  /**
   * Dispatches one destination selector to the matching guide resolver: a
   * stable `landmark:` id keeps the discovery gate, while a runtime `quest:`
   * projection re-resolves the objective against the current clock period,
   * live NPC placements and quest progress on every refresh.
   */
  private resolveNavigationGuide(destinationId: string): WorldNavigationGuide | null {
    const world = this.world;
    const map = this.map;
    const text = this.navigationHintText;
    if (world === null || map === null || text === null) return null;
    const blockedCells = this.navigationBlockedCells();

    if (destinationId.startsWith(LANDMARK_DESTINATION_PREFIX)) {
      return resolveWorldNavigationGuide(
        world.worldMap,
        this.currentMapResourceId,
        destinationId.slice(LANDMARK_DESTINATION_PREFIX.length),
        this.knownKnowledgeNodeIds,
        map,
        { col: this.playerCol, row: this.playerRow },
        blockedCells,
        this.navigationEventContext(),
      );
    }
    if (destinationId.startsWith(REGION_GUIDE_PREFIX)) {
      const input = this.regionalGuideInput();
      const destination = input === null ? null : resolveRegionalGuideDestination(input, destinationId);
      return destination === null ? { status: 'target-lost' } : resolveCellNavigationGuide(world.worldMap, this.currentMapResourceId, destination, map,
        { col: this.playerCol, row: this.playerRow }, blockedCells, this.navigationEventContext());
    }
    if (!destinationId.startsWith(QUEST_NAVIGATION_ID_PREFIX)) return { status: 'target-lost' };

    const questId = destinationId.slice(QUEST_NAVIGATION_ID_PREFIX.length);
    const resolution = this.resolveQuestNavigation(questId);
    if (resolution.status === 'no-target') {
      this.navigationDestinationId = null;
      this.hudLines.nav = '差事目标已变化，行路提示到此为止；可在 Q 日志重新导航。';
      this.relayoutHud();
      return null;
    }
    // One stable quest selector can follow a multi-stage objective chain and
    // stays selected when the journal is reopened after the next target moves.
    this.navigationDestinationId = resolution.target.id;
    return resolveCellNavigationGuide(
      world.worldMap,
      this.currentMapResourceId,
      resolution.target,
      map,
      { col: this.playerCol, row: this.playerRow },
      blockedCells,
      this.navigationEventContext(),
    );
  }

  private navigationEventContext(): NavigationEventContext {
    const reading = this.currentClimate();
    const localWeights = this.clock && this.climateRuntime ? this.climateRuntime.weatherWeightsForStamp(this.clock.snapshot(), this.currentMapResourceId) : undefined;
    return { ...this.regionEventContext(), completedEventIds: this.completedRegionalEvents, ...(reading && localWeights ? { possibleWeatherIds: new Set(localWeights.filter(entry => entry.weight > 0).map(entry => entry.weatherId)) } : {}), conditionLabel: (kind, id) => {
      const records = kind === 'period' ? this.world?.calendar.periods
        : kind === 'weather' ? this.world?.climate.weathers : this.world?.climate.tideCycle?.phases;
      return records?.find(record => record.id === id)?.name;
    } };
  }

  /** Current live NPC and encounter cells; rebuilt with every guide refresh. */
  private navigationBlockedCells(): ReadonlySet<string> {
    return new Set([
      ...this.placedNpcs.map((npc) => `${npc.col},${npc.row}`),
      ...this.activeEncounters().map((encounter) => `${encounter.col},${encounter.row}`),
    ]);
  }

  /**
   * Resolves one quest's next unfinished spatial objective from live state:
   * current-map runtime NPC placements win, then the compiled period set,
   * then the stable base records.
   */
  private resolveQuestNavigation(questId: string): QuestNavigationResult {
    const world = this.world;
    if (world === null) return { status: 'no-target', reason: 'unknown-quest' };
    const periodId = this.clock?.currentPeriod().id;
    const follower=this.regionalGuideInput()?.follower;
    return resolveQuestNavigationTarget({
      quests: this.quests,
      journal: this.questJournal,
      questId,
      worldMap: world.worldMap,
      baseNpcs: world.assembly.npcs,
      periodNpcs: periodId === undefined
        ? world.assembly.npcs
        : world.assembly.npcsByPeriod.get(periodId) ?? world.assembly.npcs,
      currentMapNpcs: this.placedNpcs,
      ...(follower===undefined?{}:{currentFollower:{...follower.npc,col:follower.col,row:follower.row,record:{...follower.npc.record,mapResourceId:follower.mapResourceId}}}),
      encounters: world.assembly.encounters,
      craftingStations: [...world.assembly.equipmentForges, ...world.assembly.alchemyStations],
      knowledgeNodeTitles: new Map([...world.knowledgeGraph.nodes]
        .map(([id, node]) => [id, node.title])),
      shops: world.assembly.shops,
      shopStocks: this.shopStocks,
      currentMapResourceId: this.currentMapResourceId,
    });
  }

  /**
   * Round 60 Q-journal N key: tracks the quest, projects its next unfinished
   * spatial objective as the run's destination, closes the journal and opens
   * the world map with that pin selected. Answers a readable message either
   * way; collect-only or data-missing quests never fabricate coordinates.
   */
  private navigateQuestObjective(questId: string): { ok: boolean; message: string } {
    const resolution = this.resolveQuestNavigation(questId);
    if (resolution.status === 'no-target') {
      const messages: Record<QuestNavigationNoTargetReason, string> = {
        'unknown-quest': '这项差事当前无法导航。',
        'not-active': '只有进行中的差事可以导航。',
        'no-spatial-objective': '此阶段无需地图导航：按 I 打开背包，按目标文字使用或装备产物；用药须有可恢复的生命/内力损耗。',
        'unresolved-target': '地图资料暂时无法解析这项目标的位置，暂时无法导航。',
        'collect-item-not-stocked': '尚无在营商铺上架这项目标所需的物品，无法导航到卖家。',
        'collect-stock-insufficient': '在营商铺的现存数量不够补齐这项目标，暂时无法导航到卖家。',
      };
      return { ok: false, message: messages[resolution.reason] };
    }

    const target = resolution.target;
    this.questJournal.trackedQuestId = questId;
    this.navigationDestinationId = target.id;
    this.updateQuestTrackerHud();
    this.refreshNavigationGuide();
    this.questPanel?.close();
    this.toggleWorldMap();
    return { ok: true, message: `正在导航至「${target.name}」。` };
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
    this.syncTideGatedEncounters();
    this.syncNpcSchedule(true);
  }

  /** V key: wait in place. Blocked by any open overlay or in-flight move. */
  private handleWait(): void {
    const clock = this.clock;
    if (clock === null || this.moving || this.anyOverlayOpen() || this.dataReloading) {
      return;
    }
    const minutes = clock.calendar.actionCosts.waitMinutes;
    this.advanceTime(minutes);
    // Waiting can change a midnight estimate even within the same NPC period.
    this.refreshNavigationGuide();
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
    this.hudLines.time =
      `第${stamp.year}年 ${monthName}${stamp.day}日 ${hour}:${minute} · ${clock.currentPeriod().name}`;
    this.relayoutHud();
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
    if (animate && !currentReducedMotion()) {
      this.tweens.add({ targets: layer, alpha: targetAlpha, duration: DAYLIGHT_FADE_MS });
    } else {
      layer.setAlpha(targetAlpha);
    }
  }

  /** Current data-driven season and weather for the in-game calendar date. */
  private currentClimate(): {
    season: ClimateSeasonData;
    weather: ClimateWeatherData;
    tide: ClimateTidePhaseData | null;
    regionalClimateName?: string;
  } | null {
    const clock = this.clock;
    const climate = this.climateRuntime;
    if (clock === null || climate === null) {
      return null;
    }
    const stamp = clock.snapshot();
    return {
      season: climate.seasonForStamp(stamp),
      weather: climate.weatherForDay(this.worldSeed, stamp, this.currentMapResourceId),
      tide: climate.tideForStamp(stamp),
      regionalClimateName: climate.regionalProfileForMap(this.currentMapResourceId)?.name,
    };
  }

  /** Updates climate tint and generated precipitation only when the daily reading changes. */
  private updateClimatePresentation(animate: boolean): void {
    const reading = this.currentClimate();
    if (reading === null) {
      return;
    }
    const { season, weather, tide } = reading;
    const movementNote = weather.stepMinutes > 0 ? ` · 行走 +${weather.stepMinutes} 分/格` : '';
    const tideNote = tide === null ? '' : ` · 潮位：${tide.name}`;
    const regionalNote = reading.regionalClimateName ? ` · ${reading.regionalClimateName}` : '';
    this.hudLines.climate = `${season.name}${regionalNote} · ${weather.name}${tideNote}${movementNote}`;
    this.relayoutHud();
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
    if (animate && weather.tintAlpha > 0 && !currentReducedMotion()) {
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
    // Reduced motion keeps the weather tint but skips the endless particle
    // drift — the strongest persistent animation the presentation has.
    if (currentReducedMotion()) {
      return;
    }
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
      } else if (precipitation.kind === 'snow') {
        graphics.fillCircle(3, 3, 2.5);
        graphics.generateTexture(textureKey, 6, 6);
      } else {
        // Soft overlapping ellipses form a CC0-free procedural fog bank.
        // Low texture alpha plus the emitter fade keeps actors legible.
        graphics.fillStyle(0xe1e9e9, 0.34);
        graphics.fillEllipse(21, 19, 38, 22);
        graphics.fillEllipse(44, 15, 47, 25);
        graphics.fillEllipse(67, 20, 42, 20);
        graphics.fillEllipse(47, 24, 79, 15);
        graphics.generateTexture(textureKey, 90, 38);
      }
      graphics.destroy();
    }

    const isRain = precipitation.kind === 'rain';
    const isFog = precipitation.kind === 'fog';
    const emitter = this.add.particles(0, 0, textureKey, {
      x: { min: 0, max: VIEW_WIDTH },
      y: { min: HUD_HEIGHT, max: VIEW_HEIGHT },
      lifespan: isFog
        ? { min: 9000, max: 15000 }
        : isRain ? { min: 1400, max: 2200 } : { min: 3200, max: 5200 },
      speedX: isFog
        ? { min: -10, max: 10 }
        : isRain ? { min: -18, max: 18 } : { min: -26, max: 26 },
      speedY: isFog
        ? { min: -1, max: 2 }
        : isRain ? { min: 200, max: 310 } : { min: 24, max: 68 },
      frequency: Math.max(isFog ? 180 : 35, Math.round((isFog ? 760 : 260) - precipitation.density * (isFog ? 560 : 220))),
      quantity: 1,
      tint: isFog ? 0xc7d7da : isRain ? 0xcbd9ed : 0xf4f8ff,
      alpha: isFog ? { start: 0.34, end: 0.04 } : { start: 0.86, end: 0.16 },
      scale: isFog ? { start: 1.25, end: 2.15 } : isRain ? 0.82 : 0.8,
    });
    this.weatherEmitter = emitter.setDepth(WEATHER_PARTICLE_DEPTH);
  }

  /** Refreshes the bottom status line from the current adjacency state. */
  private updateInteractHint(): void {
    this.refreshAchievementUnlocks();
    if (this.interactText === null) {
      return;
    }
    this.refreshInteractHintRaw();
    this.layoutInteractHint();
  }

  /** Resolves the raw interaction prompt; never touches geometry. */
  private refreshInteractHintRaw(): void {
    if (this.controlsPanel?.isOpen) {
      this.hudLines.interact = '按 H 或 Esc 收起操作手册';
      return;
    }
    if (this.anyOverlayOpen()) {
      this.hudLines.interact = '';
      return;
    }
    if (this.regionNotice !== null) {
      this.hudLines.interact = this.regionNotice;
      return;
    }

    // Match handleInteraction: ready map events take E from talk-only NPCs,
    // while dedicated shops and quest boards retain their direct action.
    const mapEventTarget = this.interactableRegionEventTarget();
    const npcTarget =
      this.map === null
        ? null
        : selectInteractionTarget(this.placedNpcs, {
            col: this.playerCol,
            row: this.playerRow,
          });
    const npcShop = npcTarget?.record.shopId === null || npcTarget === null
      ? undefined
      : this.shops.get(npcTarget.record.shopId);
    const npcStock = npcShop === undefined ? undefined : this.shopStocks.get(npcShop.record.id);
    const npcHasQuests = npcTarget !== null && [...this.quests.values()].some(
      (quest) => quest.giverNpcId === npcTarget.record.id,
    );
    const npcHasDedicatedInteraction = npcTarget !== null && (
      (npcShop !== undefined && npcStock !== undefined && this.inventory !== null) ||
      (npcTarget.record.questGiver && npcHasQuests && this.inventory !== null && this.questPanel !== null)
    );
    if (shouldPreferRegionalEventInteraction(mapEventTarget !== null, npcHasDedicatedInteraction)) {
      this.hudLines.interact = `按 E · ${mapEventTarget!.prompt}`;
      return;
    }
    if (npcTarget !== null) {
      const prompt = npcShop !== undefined && npcStock !== undefined && this.inventory !== null
        ? `按 E 与「${npcTarget.record.name}」交易 · F 交谈`
        : npcTarget.record.questGiver && npcHasQuests && this.inventory !== null && this.questPanel !== null
          ? `按 E 向「${npcTarget.record.name}」查看差事 · F 交谈`
          : `按 E 与「${npcTarget.record.name}」交谈`;
      this.hudLines.interact = prompt;
      return;
    }
    const encounterTarget = selectEncounterTarget(this.activeEncounters(), {
      col: this.playerCol,
      row: this.playerRow,
    });
    if (encounterTarget !== null) {
      this.hudLines.interact = encounterTarget.record.texts.approach;
      return;
    }
    const arenaTarget = this.world === null ? null : selectArenaTarget(
      this.world.assembly.arenas,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (arenaTarget !== null) {
      this.hudLines.interact = arenaTarget.record.texts.approach;
      return;
    }
    const factionWarTarget = this.world === null ? null : selectFactionWarTarget(
      this.world.assembly.factionWars,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (factionWarTarget !== null) {
      this.hudLines.interact = factionWarTarget.record.texts.approach;
      return;
    }
    const forgeTarget = this.world === null ? null : selectEquipmentForgeStation(
      this.world.assembly.equipmentForges,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (forgeTarget !== null) {
      this.hudLines.interact = `按 E 在「${forgeTarget.record.name}」锻造装备 · ${forgeTarget.recipes.length} 种配方`;
      return;
    }
    const alchemyTarget = this.world === null ? null : selectAlchemyStation(
      this.world.assembly.alchemyStations,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (alchemyTarget !== null) {
      const known = alchemyTarget.recipes.filter((recipe) => this.knownKnowledgeNodeIds.has(recipe.discoveryNodeId)).length;
      this.hudLines.interact = `按 E 在「${alchemyTarget.record.name}」炼药 · 已识药方 ${known}/${alchemyTarget.recipes.length}`;
      return;
    }
    if (mapEventTarget !== null) {
      this.hudLines.interact = `按 E · ${mapEventTarget.prompt}`;
      return;
    }
    const gate = this.world === null
      ? null
      : selectAdjacentTransition(this.world.worldMap.transitions, this.currentMapResourceId, {
          col: this.playerCol,
          row: this.playerRow,
        });
    if (gate !== null) {
      const accessReason = transitionAccessReason(gate, this.knownKnowledgeNodeIds);
      if (accessReason !== null) { this.hudLines.interact = `按 E 查看「${gate.name}」开通条件`; return; }
      this.hudLines.interact = (gate.fare ?? 0) > 0
        ? `按 E 查看「${gate.name}」· ${gate.fare} 银两 / ${gate.travelMinutes ?? this.clock?.calendar.actionCosts.travelMinutes ?? 0} 分钟`
        : `按 E 通过「${gate.name}」前往另一处地界`;
      return;
    }
    const endingGate = this.world === null ? null : selectAdjacentEndingGate(
      this.world.assembly.endings,
      this.currentMapResourceId,
      { col: this.playerCol, row: this.playerRow },
    );
    if (endingGate !== null) {
      this.hudLines.interact = endingGate.gate.approachText;
      return;
    }
    // Lowest-priority contextual hint: with no actionable target around, a
    // nearby undiscovered event may still surface its ambient approach clue.
    // It never replaces a control prompt — only the idle fallback lines.
    const approachClue = this.world === null ? null : selectRegionEventApproachClue(
      this.world.worldMap.events,
      { mapResourceId: this.currentMapResourceId, col: this.playerCol, row: this.playerRow },
      this.completedRegionalEvents,
      this.regionEventContext(),
    );
    if (approachClue !== null) {
      this.hudLines.interact = approachClue;
      return;
    }
    if (this.placedNpcs.length === 0 && this.activeEncounters().length === 0) {
      this.hudLines.interact = this.companionState.activeCompanionId === null
        ? '暂无可交互人物'
        : 'P 同行伙伴 · 暂无可交互人物';
      return;
    }
    this.hudLines.interact = 'U 武学 · N 经脉 · C 自创武学 · L 图鉴 · G 成就 · H 帮助 · Esc 暂停';
  }

  /**
   * Measured bottom band: the interaction line wraps through grapheme
   * segmentation (Phaser's native wrap cannot break CJK runs) and the bar
   * grows to cover the shown lines, so even long data-authored approach
   * texts and stacked region notices always sit on the visible background.
   */
  private layoutInteractHint(): void {
    const text = this.interactText;
    const bar = this.hudBottomRect;
    if (text === null || bar === null) return;
    const base = 12;
    const width = VIEW_WIDTH - 32;
    const lines = wrapDialogueText(this.hudLines.interact, width, (s) => this.measureHudText(s, base));
    const shown = lines.length <= 3
      ? lines
      : [...lines.slice(0, 2), this.cappedHudLine(lines[2]!, width, base)];
    text.setText(shown.join('\n'));
    const barHeight = shown.length * this.hudLineHeight(base) + 12;
    bar.setSize(VIEW_WIDTH, barHeight).setPosition(VIEW_WIDTH / 2, VIEW_HEIGHT - barHeight / 2);
    text.setOrigin(0.5, 1).setPosition(VIEW_WIDTH / 2, VIEW_HEIGHT - 6);
    this.refreshWorldCameraBounds();
  }

  /** True while any keyboard overlay owns the input (dialogue/battle/backpack/shop/quest/pause). */
  private anyOverlayOpen(): boolean {
    return (
      this.dialogueBattlePending ||
      (this.dialoguePanel !== null && this.dialoguePanel.isOpen) ||
      (this.battlePanel !== null && this.battlePanel.isOpen) ||
      (this.inventoryPanel !== null && this.inventoryPanel.isOpen) ||
      (this.shopPanel !== null && this.shopPanel.isOpen) ||
      (this.questPanel !== null && this.questPanel.isOpen) ||
      (this.pauseMenu !== null && this.pauseMenu.isOpen) ||
      (this.travelConfirmation !== null && this.travelConfirmation.isOpen) ||
      (this.worldMapPanel !== null && this.worldMapPanel.isOpen) ||
      (this.encyclopediaPanel !== null && this.encyclopediaPanel.isOpen) ||
      (this.modStatusPanel !== null && this.modStatusPanel.isOpen) ||
      (this.collectionPanel !== null && this.collectionPanel.isOpen) ||
      (this.factionPanel !== null && this.factionPanel.isOpen) ||
      (this.companionPanel !== null && this.companionPanel.isOpen) ||
      (this.regionalGuidePanel !== null && this.regionalGuidePanel.isOpen) ||
      (this.arenaPanel !== null && this.arenaPanel.isOpen) ||
      (this.factionWarPanel !== null && this.factionWarPanel.isOpen) ||
      (this.martialArtsPanel !== null && this.martialArtsPanel.isOpen) ||
      (this.martialArtForgePanel !== null && this.martialArtForgePanel.isOpen) ||
      (this.equipmentForgePanel !== null && this.equipmentForgePanel.isOpen) ||
      (this.alchemyPanel !== null && this.alchemyPanel.isOpen) ||
      (this.endingPanel !== null && this.endingPanel.isOpen) ||
      (this.achievementPanel !== null && this.achievementPanel.isOpen) ||
      (this.meridianPanel !== null && this.meridianPanel.isOpen) ||
      (this.controlsPanel !== null && this.controlsPanel.isOpen)
    );
  }

  private regionalGuideInput(): RegionalGuideInput | null {
    const world=this.world;if(world===null)return null;
    const period=this.clock?.currentPeriod().id;
    const npc=this.activeCompanionNpc(),marker=this.companionFollower?.marker,map=this.map;
    const follower=npc!==undefined&&marker?.visible&&map!==null ? {npc,mapResourceId:this.currentMapResourceId,
      col:Math.floor((marker.x-this.mapOrigin.x)/map.tileSize),row:Math.floor((marker.y-this.mapOrigin.y)/map.tileSize)}:undefined;
    return {worldMap:world.worldMap,currentMapResourceId:this.currentMapResourceId,...(world.assembly.endings === null ? {} : { endingGate: world.assembly.endings.gate }),baseNpcs:world.assembly.npcs,
      periodNpcs:period===undefined?world.assembly.npcs:world.assembly.npcsByPeriod.get(period)??world.assembly.npcs,
      currentMapNpcs:this.placedNpcs,...(follower===undefined?{}:{follower}),activeFollowerNpcId:this.companions.get(this.companionState.activeCompanionId??'')?.npcId,shops:world.assembly.shops,items:world.assembly.items,
      shopStocks:this.shopStocks,knownKnowledgeNodeIds:this.knownKnowledgeNodeIds,
      liveCurrency:this.inventory?.currency,travelMinutes:this.clock?.calendar.actionCosts.travelMinutes};
  }

  private toggleRegionalGuide(): void {
    const panel=this.regionalGuidePanel;if(panel===null)return;
    if(panel.isOpen){panel.close();return;}if(this.anyOverlayOpen()||this.moving||this.activeSession!==null)return;
    const input=this.regionalGuideInput();if(input===null)return;
    const world=input.worldMap,region=world.regions.find(r=>r.mapResourceId===this.currentMapResourceId),guide=world.regionGuides?.find(g=>g.mapResourceId===this.currentMapResourceId);
    // Round 110: both quest bands (active journeys with their original
    // objective navigation, plus commissions acceptable from local givers)
    // come from the Phaser-free quest-guide helper. A non-null input already
    // proves the loaded world exists.
    const loaded=this.world!;
    const entries:RegionGuideEntry[]=[
      ...buildRegionalGuideEntries(input),
      ...buildQuestGuideEntries({guide:input,quests:this.quests,journal:this.questJournal,
        access:{factionId:this.factionState.membership?.factionId??null,knownKnowledgeNodeIds:this.knownKnowledgeNodeIds},
        // Round 151: the admission hint reads the giver's assembled F
        // conversation against the same live context the F panel evaluates,
        // so shop-first E keys and dialogue-only acceptances are described
        // truthfully instead of advertising a board E that opens a store.
        dialogues:this.dialogues,dialogueContextFor:(npcId)=>this.dialogueContextFor(npcId),
        encounters:loaded.assembly.encounters,
        craftingStations:[...loaded.assembly.equipmentForges,...loaded.assembly.alchemyStations],
        knowledgeNodeTitles:new Map([...loaded.knowledgeGraph.nodes].map(([id,node])=>[id,node.title]))}),
    ];
    panel.open({name:region?.name??this.currentMapResourceId,role:guide?REGION_ROLE_LABELS[guide.role]:'区域',
      advice:guide?.advice??'此资料未声明区域角色；以下入口从当前装配、库存和差事推导，导航只带路。',entries,
      onNavigate:id=>{this.navigationDestinationId=id;this.refreshNavigationGuide();this.updateInteractHint();}});
    this.updateInteractHint();
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
    const world = this.world;
    panel.open({
      factions: this.progression.factions,
      membership: this.factionState.membership,
      social: this.social,
      npcNames: new Map((world?.assembly.npcs ?? []).map((npc) => [npc.record.id, npc.record.name])),
      npcRegionNames: world === null
        ? undefined
        : deriveNpcRegionNames(world.assembly.npcs, world.worldMap.regions),
      quests: this.quests,
      character: this.playerState,
      journal: this.questJournal,
      martialArts: this.progression.martialArts,
    });
    this.updateInteractHint();
  }

  /** U reads current ownership and learning thresholds; never grants an art. */
  private toggleMartialArtsPanel(): void {
    const panel = this.martialArtsPanel;
    if (panel === null) return;
    if (panel.isOpen) { panel.close(); return; }
    if (this.anyOverlayOpen()) return;
    panel.open({ character: this.playerState, factionId: this.factionState.membership?.factionId ?? null,
      factions: this.progression.factions, martialArts: this.combatMartialArts() });
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
      mapResourceId: this.currentMapResourceId,
      npcNames: new Map((this.world?.assembly.npcs ?? []).map((npc) => [npc.record.id, npc.record.name])),
      knowledgeTitles: new Map([...(this.world?.knowledgeGraph.nodes ?? [])].map(([id, node]) => [id, node.title])),
      knowledgeNodes: this.world?.knowledgeGraph.nodes,
      playerKnownNodeIds: this.knownKnowledgeNodeIds,
      social: this.social,
      onDismiss: () => {
        this.companionState.activeCompanionId = null;
        this.refreshNpcPlacements();
      },
      onTalk: () => {
        const npc = this.activeCompanionNpc();
        if (npc !== undefined) this.openDialogueWith({ ...npc, col: this.playerCol, row: this.playerRow });
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
      factionNames: new Map([...this.progression.factions].map(([id, faction]) => [id, faction.name])),
      knowledgeNodeTitles: new Map([...(this.world?.knowledgeGraph.nodes ?? new Map())]
        .map(([id, node]) => [id, node.title])),
      access: {
        factionId: this.factionState.membership?.factionId ?? null,
        knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
      },
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
    if (this.map === null) return;
    this.refreshNavigationGuide();
    const questTarget = this.navigationQuestTarget();
    panel.open(
      world.worldMap,
      this.currentMapResourceId,
      this.map,
      world.maps,
      this.playerCol,
      this.playerRow,
      this.knownKnowledgeNodeIds,
      this.navigationDestinationId,
      questTarget === null ? [] : [questTarget],
      this.navigationBlockedCells(),
      this.navigationEventContext(),
    );
    this.updateInteractHint();
  }

  /**
   * Projects the current active quest route as a supplemental map pin.
   * Already-accepted quests may reveal their target before the underlying
   * landmark is discovered; locked or unaccepted quests are never projected.
   */
  private navigationQuestTarget(): QuestNavigationTarget | null {
    const destinationId = this.navigationDestinationId;
    if (destinationId === null || !destinationId.startsWith(QUEST_NAVIGATION_ID_PREFIX)) return null;
    const questId = destinationId.slice(QUEST_NAVIGATION_ID_PREFIX.length);
    const resolution = this.resolveQuestNavigation(questId);
    if (resolution.status === 'no-target') return null;
    return resolution.target;
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

  /** F2 key: inspect MOD order, per-resource final sources and diagnostics. */
  private toggleModStatus(): void {
    const panel = this.modStatusPanel;
    const world = this.world;
    if (panel === null || world === null) return;
    if (panel.isOpen) {
      panel.close();
      return;
    }
    if (this.anyOverlayOpen()) return;
    panel.open({
      enabledMods: world.enabledMods,
      resourceSources: world.resourceSources,
      modDiagnostics: world.modDiagnostics,
    });
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
    const newlyDiscovered = discoverObservedKnowledge(graph, this.knownKnowledgeNodeIds, observations);
    this.progressKnowledgeDiscoveries(newlyDiscovered.map((node) => node.id));
  }

  /** Advances matching one-time quest objectives for actual first discoveries. */
  private progressKnowledgeDiscoveries(nodeIds: readonly string[]): void {
    if (nodeIds.length > 0) {
      this.achievementState = recordAchievementCounter(
        this.achievementState,
        'discoveredKnowledge',
        nodeIds.length,
      );
    }
    for (const nodeId of nodeIds) {
      this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, {
        type: 'knowledge-discovery',
        nodeId,
      }));
    }
  }

  /** Records one registered knowledge node and advances quests only once. */
  private markKnowledgeDiscovered(nodeId: string): boolean {
    if (!this.world?.knowledgeGraph.nodes.has(nodeId) || this.knownKnowledgeNodeIds.has(nodeId)) return false;
    this.knownKnowledgeNodeIds.add(nodeId);
    this.progressKnowledgeDiscoveries([nodeId]);
    return true;
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
  private refreshAchievementUnlocks(): string[] {
    const set = this.world?.assembly.achievements ?? null;
    const profile = this.playerProfile;
    const character = this.playerState;
    const inventory = this.inventory;
    if (set === null || profile === null || character === null || inventory === null) return [];
    const notices: string[] = [];
    const receipts: string[] = [];
    for (let pass = 0; pass <= set.achievements.length; pass += 1) {
      const context = this.achievementEvaluationContext();
      if (context === null) return receipts;
      const result = unlockReadyAchievements(set, this.achievementState, context);
      if (result.newlyUnlocked.length === 0) break;
      this.achievementState = result.state;
      for (const achievement of result.newlyUnlocked) {
        const currency = achievement.reward.currency ?? 0;
        const currencyBefore = inventory.currency;
        inventory.currency = Math.min(999_999_999, inventory.currency + currency);
        const experience = grantExperience(profile, character, achievement.reward.experience ?? 0);
        if (this.meridianSet !== null) {
          awardCultivationPoints(character, experience.levelsGained, this.meridianSet.resource);
        }
        notices.push(achievement.title);
        receipts.push(`首次成就「${achievement.title}」：经验 +${(achievement.reward.experience ?? 0) - experience.discardedExperience} · 银两 +${inventory.currency - currencyBefore}`);
        console.info('[achievement] 已解锁 "%s"：经验 +%d，银两 +%d',
          achievement.id, achievement.reward.experience ?? 0, currency);
      }
    }
    if (notices.length > 0) this.showRegionNotice('成就达成：' + notices.join('、'));
    return receipts;
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
    const factsUpdate = reconcileQuestFacts(this.quests, this.questJournal, {
      knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
      completedEncounterIds: this.completedEncounters,
      ...(this.inventory === null ? {} : { itemCounts: this.questItemCounts() }),
    });
    update = { changed: update.changed || factsUpdate.changed, completed: [...update.completed, ...factsUpdate.completed], failedQuestIds: [...update.failedQuestIds, ...factsUpdate.failedQuestIds] };
    const completed = [...update.completed];
    if (completed.length > 0 || update.failedQuestIds.length > 0) {
      this.questNoticeTimer?.remove(false);
      this.questNoticeTimer = null;
    }
    if (this.playerProfile !== null && this.playerState !== null && this.inventory !== null) {
      const completionNotices: string[] = [];
      for (let index = 0; index < completed.length; index += 1) {
        const reward = completed[index]!;
        const quest = this.quests.get(reward.questId);
        const experience = grantExperience(this.playerProfile, this.playerState, reward.experience);
        const cultivation = this.meridianSet === null
          ? 0
          : awardCultivationPoints(this.playerState, experience.levelsGained, this.meridianSet.resource);
        const paidExperience = reward.experience - experience.discardedExperience;
        this.inventory.currency += reward.currency;
        const cultivationText = cultivation > 0 ? ` · 修为 +${cultivation}` : '';
        const consequences = applyQuestRewardConsequences(
          reward,
          this.social,
          this.knownKnowledgeNodeIds,
        );
        const factionText = consequences.factionRenown.map((standing) => {
          const name = this.progression.factions.get(standing.factionId)?.name ?? standing.factionId;
          return `${name}声望 ${standing.delta > 0 ? '+' : ''}${standing.delta}`;
        });
        const knowledgeText = consequences.discoveredKnowledgeNodeIds.flatMap((nodeId) => {
          const node = this.world?.knowledgeGraph.nodes.get(nodeId);
          return node === undefined ? [] : [`新见闻「${node.title}」`];
        });
        for (const nodeId of consequences.discoveredKnowledgeNodeIds) {
          const chained = applyQuestSignal(this.quests, this.questJournal, {
            type: 'knowledge-discovery',
            nodeId,
          });
          completed.push(...chained.completed);
        }
        const consequenceText = [...factionText, ...knowledgeText].join(' · ');
        const rewardText = consequenceText.length > 0 ? ` · ${consequenceText}` : '';
        const notice = quest === undefined
          ? `差事完成：经验 +${paidExperience} · 银两 +${reward.currency}${cultivationText}${rewardText}`
          : `完成「${quest.name}」：经验 +${paidExperience} · 银两 +${reward.currency}${cultivationText}${rewardText}`;
        completionNotices.push(notice);
        console.info('[quest] 任务 "%s" 完成：经验 +%d，银两 +%d%s', reward.questId, paidExperience, reward.currency, rewardText);
      }
      if (completionNotices.length > 0) this.questNotice = completionNotices.join('；');
    }
    if (update.failedQuestIds.length > 0) {
      const failed = this.quests.get(update.failedQuestIds[update.failedQuestIds.length - 1] ?? '');
      this.questNotice = failed === undefined ? '有一项差事已失败' : `差事「${failed.name}」已失败`;
      for (const id of update.failedQuestIds) console.info('[quest] 任务 "%s" 已失败', id);
    }
    this.updateQuestTrackerHud();
    this.updateInteractHint();
    // Objective progress may have completed the navigated target: re-resolve.
    this.refreshNavigationGuide();
  }

  private updateQuestTrackerHud(): void {
    const text = this.questTrackerText;
    if (text === null) return;
    if (this.questNotice !== null && this.questNoticeTimer === null) {
      this.questNoticeTimer = this.time.delayedCall(5000, () => {
        this.questNotice = null;
        this.questNoticeTimer = null;
        this.updateQuestTrackerHud();
      });
    }
    // Round 117: the line text and tone come from one pure projection, so
    // every caller (boot, quest updates, journal navigation, region switches,
    // schedule changes) renders the current map's live state.
    const line = projectQuestTrackerLine({
      npcs: this.placedNpcs,
      position: { col: this.playerCol, row: this.playerRow },
      quests: this.quests,
      journal: this.questJournal,
      notice: this.questNotice,
    });
    this.hudLines.quest = line.text;
    text.setColor(line.tone === 'notice' ? UI.textWarn : line.tone === 'tracked' ? UI.textMuted : UI.textPrimary);
    this.relayoutHud();
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
    // Round 41: every movement key stays bound, but each handler checks the
    // live layout setting first, so switching the layout in the pause menu
    // takes effect on the very next keypress without rebinding.
    const codeByName: Record<MovementKeyName, number> = {
      UP: KeyCodes.UP,
      DOWN: KeyCodes.DOWN,
      LEFT: KeyCodes.LEFT,
      RIGHT: KeyCodes.RIGHT,
      W: KeyCodes.W,
      A: KeyCodes.A,
      S: KeyCodes.S,
      D: KeyCodes.D,
    };
    const bindings: { key: MovementKeyName; dCol: number; dRow: number }[] = [
      { key: 'UP', dCol: 0, dRow: -1 },
      { key: 'DOWN', dCol: 0, dRow: 1 },
      { key: 'LEFT', dCol: -1, dRow: 0 },
      { key: 'RIGHT', dCol: 1, dRow: 0 },
      { key: 'W', dCol: 0, dRow: -1 },
      { key: 'S', dCol: 0, dRow: 1 },
      { key: 'A', dCol: -1, dRow: 0 },
      { key: 'D', dCol: 1, dRow: 0 },
    ];

    keyboard.addCapture(bindings.map(({ key }) => codeByName[key]));
    const listeners = bindings.map(({ key, dCol, dRow }) => {
      const keyCode = keyboard.addKey(codeByName[key]);
      const onDown = (): void => {
        if (isMovementKeyEnabled(currentMovementLayout(), key)) {
          this.tryMove(dCol, dRow);
        }
      };
      keyCode.on('down', onDown);
      return { key: keyCode, onDown };
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

    const regionalGuideKey = keyboard.addKey(KeyCodes.R);
    const onRegionalGuide = (): void => this.toggleRegionalGuide();
    regionalGuideKey.on('down', onRegionalGuide);
    const worldMapKey = keyboard.addKey(KeyCodes.M);
    const onWorldMap = (): void => this.toggleWorldMap();
    worldMapKey.on('down', onWorldMap);

    const encyclopediaKey = keyboard.addKey(KeyCodes.K);
    const onEncyclopedia = (): void => this.toggleEncyclopedia();
    encyclopediaKey.on('down', onEncyclopedia);

    const modStatusKey = keyboard.addKey(KeyCodes.F2);
    const onModStatus = (): void => this.toggleModStatus();
    modStatusKey.on('down', onModStatus);

    const collectionKey = keyboard.addKey(KeyCodes.L);
    const onCollection = (): void => this.toggleCollection();
    collectionKey.on('down', onCollection);

    const factionKey = keyboard.addKey(KeyCodes.J);
    const onFaction = (): void => this.toggleFactionPanel();
    factionKey.on('down', onFaction);

    const martialArtsKey = keyboard.addKey(KeyCodes.U);
    const onMartialArts = (): void => this.toggleMartialArtsPanel();
    martialArtsKey.on('down', onMartialArts);

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
      regionalGuideKey.off('down', onRegionalGuide);
      encyclopediaKey.off('down', onEncyclopedia);
      modStatusKey.off('down', onModStatus);
      collectionKey.off('down', onCollection);
      factionKey.off('down', onFaction);
      martialArtsKey.off('down', onMartialArts);
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
      this.travelConfirmation?.destroy();
      this.travelConfirmation = null;
      this.worldMapPanel?.destroy();
      this.worldMapPanel = null;
      this.encyclopediaPanel?.destroy();
      this.encyclopediaPanel = null;
      this.modStatusPanel?.destroy();
      this.modStatusPanel = null;
      this.collectionPanel?.destroy();
      this.collectionPanel = null;
      this.factionPanel?.destroy();
      this.factionPanel = null;
      this.regionalGuidePanel?.destroy();
      this.regionalGuidePanel = null;
      this.companionPanel?.destroy();
      this.companionPanel = null;
      this.arenaPanel?.destroy();
      this.arenaPanel = null;
      this.factionWarPanel?.destroy();
      this.factionWarPanel = null;
      this.martialArtsPanel?.destroy();
      this.martialArtsPanel = null;
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
   * E reaches a ready map inspection before a talk-only NPC if they share
   * the approach cell. Dedicated shops/quest boards retain priority; F is
   * always available for conversation. The HUD uses the same priority rule.
   */
  private handleInteraction(): void {
    if (this.anyOverlayOpen() || this.dataReloading) {
      return; // Whichever overlay is open owns the keyboard; hot reload rebuilds.
    }
    const target = selectInteractionTarget(this.placedNpcs, {
      col: this.playerCol,
      row: this.playerRow,
    });
    const mapEvent = this.interactableRegionEventTarget();
    const targetShop = target?.record.shopId === null || target === null
      ? undefined
      : this.shops.get(target.record.shopId);
    const targetStock = targetShop === undefined ? undefined : this.shopStocks.get(targetShop.record.id);
    const targetHasQuests = target !== null && [...this.quests.values()].some(
      (quest) => quest.giverNpcId === target.record.id,
    );
    const npcHasDedicatedInteraction = target !== null && (
      (targetShop !== undefined && targetStock !== undefined && this.inventory !== null) ||
      (target.record.questGiver && targetHasQuests && this.inventory !== null && this.questPanel !== null)
    );
    if (shouldPreferRegionalEventInteraction(mapEvent !== null, npcHasDedicatedInteraction)) {
      this.faceInteractionCell(mapEvent!.event);
      this.presentRegionEvents([mapEvent!.event]);
      return;
    }
    if (target !== null) {
      this.faceInteractionTarget(target);
      this.recordKnowledgeObservations({ characterIds: [target.record.id] });
      if (targetShop !== undefined && targetStock !== undefined && this.inventory !== null) {
        this.shopPanel?.open({
          shop: targetShop,
          stock: targetStock,
          inventory: this.inventory,
          items: this.items,
        });
        this.updateInteractHint();
        return;
      }
      if (
        target.record.questGiver && targetHasQuests && this.inventory !== null &&
        this.questPanel !== null
      ) {
        this.questPanel.open({
          quests: this.quests,
          journal: this.questJournal,
          giverNpcId: target.record.id,
          giverName: target.record.name,
          itemCounts: this.questItemCounts(),
          factionNames: new Map([...this.progression.factions].map(([id, faction]) => [id, faction.name])),
          knowledgeNodeTitles: new Map([...(this.world?.knowledgeGraph.nodes ?? new Map())]
            .map(([id, node]) => [id, node.title])),
          access: {
            factionId: this.factionState.membership?.factionId ?? null,
            knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
          },
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
            this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, { type: 'recipe-crafted', recipeId }));
          }
          return outcome.ok
            ? { ok: true, message: craftingReceipt('锻成', outcome.result.name, outcome.remainingCurrency, inventory.currency) }
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
        getInsight: () => this.playerState?.attributes.insight ?? character.attributes.insight,
        onCraft: (recipeId) => {
          const outcome = craftAlchemy({
            station: alchemy,
            recipeId,
            character: this.playerState ?? character,
            knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
            inventory,
            items: this.items,
          });
          if (!outcome.ok) return { ok: false, message: outcome.reason };
          this.achievementState = recordAchievementCounter(this.achievementState, 'alchemyCrafts');
          this.refreshQuestCollectObjectives();
          this.markKnowledgeDiscovered(outcome.result.id);
          this.applyQuestUpdate(applyQuestSignal(this.quests, this.questJournal, { type: 'recipe-crafted', recipeId }));
          return { ok: true, message: craftingReceipt('炼成', outcome.result.name, outcome.remainingCurrency, inventory.currency) };
        },
      });
      this.updateInteractHint();
      return;
    }
    if (mapEvent !== null) {
      this.faceInteractionCell(mapEvent.event);
      this.presentRegionEvents([mapEvent.event]);
      return;
    }
    const gate = this.world === null
      ? null
      : selectAdjacentTransition(this.world.worldMap.transitions, this.currentMapResourceId, {
          col: this.playerCol,
          row: this.playerRow,
        });
    if (gate !== null) {
      const accessReason = transitionAccessReason(gate, this.knownKnowledgeNodeIds);
      if (accessReason !== null) { this.showRegionNotice(accessReason); return; }
      if ((gate.fare ?? 0) > 0 && this.travelConfirmation !== null) {
        const quote = quoteTransitionCost(gate, this.clock?.calendar.actionCosts.travelMinutes ?? 0, this.inventory?.currency ?? 0);
        this.travelConfirmation.open(gate.name, quote.fare, quote.minutes, this.inventory?.currency ?? 0, () => this.switchRegion(gate));
      } else this.switchRegion(gate);
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
    if (this.anyOverlayOpen() || this.dataReloading) {
      return; // Whichever overlay is open owns the keyboard; hot reload rebuilds.
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
    this.faceInteractionTarget(target);
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
      oralPrerequisites: (node) => describeOralPrerequisites(node, this.dialogueContextFor(target.record.id)),
      visibleOptions: (node) =>
        getVisibleOptionsForDisplay(node, this.dialogueContextFor(target.record.id)),
      confirmOption: (session, visibleIndex, displayedRawIndex) =>
        this.confirmDialogueOption(target.record.id, session, visibleIndex, displayedRawIndex),
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
      weatherId: this.currentClimate()?.weather.id,
      companions: this.companions,
      companionState: this.companionState,
      dialogueVariables: this.dialogueVariables,
      battleReadiness: {
        currentMapResourceId: this.currentMapResourceId,
        targets: new Map(this.activeEncounters().map(encounter => [encounter.record.id, encounter.record])),
        completedEncounterIds: this.completedEncounters,
        characterReady: this.playerProfile !== null && this.playerState !== null && this.playerState.health.current > 0,
        panelReady: this.battlePanel !== null && !this.battlePanel.isOpen && !this.dialogueBattlePending,
      },
      teleportReadiness: this.buildDialogueTeleportReadiness(),
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
    displayedRawIndex?: number,
  ): DialogueConfirmOutcome {
    const context = this.dialogueContextFor(speakerNpcId);
    const choice = dialogueChoiceForConfirmation(session.currentNode, context, visibleIndex, displayedRawIndex);
    if (choice === undefined) {
      return { advanced: false, feedback: displayedRawIndex === undefined ? null : '选项条件已变化，请重新选择。' };
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
      const achievementReceipts = this.refreshAchievementUnlocks();
      const feedbackLines = [...result.summary.lines, ...achievementReceipts];
      const feedback = feedbackLines.length > 0 ? feedbackLines.join(' · ') : null;
      session.choose(choice.index);
      if (result.summary.teleportRequest !== undefined) {
        const request = result.summary.teleportRequest;
        const generation = this.dialogueBattleGeneration;
        this.dialogueBattlePending = true;
        return { advanced: true, feedback, afterClose: onceDialogueBattleDispatch(() => {
          this.time.delayedCall(0, () => {
            if (generation !== this.dialogueBattleGeneration) return;
            this.dialogueBattlePending = false;
            const world = this.world;
            if (world === null) return;
            const arrivalClock = new GameClock(world.calendar, this.clock?.elapsedMinutes ?? 0);
            arrivalClock.advance(request.travelMinutes);
            this.arriveAtMap(request.mapResourceId, request.col, request.row, request.travelMinutes, arrivalClock.currentPeriod().id, null);
          });
        }) };
      }
      if (result.summary.battleRequest !== undefined) {
        const encounter = this.encounters.find(entry => entry.record.id === result.summary.battleRequest!.encounterId);
        // Preflight resolved this synchronously before transaction commit.
        if (encounter !== undefined) {
          this.dialogueBattlePending = true;
          const generation = this.dialogueBattleGeneration;
          return { advanced: true, feedback, afterClose: onceDialogueBattleDispatch(() => {
            // Defer beyond the current keyboard event to avoid an extra attack.
            this.time.delayedCall(0, () => {
              if (generation !== this.dialogueBattleGeneration) return;
              this.dialogueBattlePending = false;
              this.openEncounterBattle(encounter);
            });
          }) };
        }
      }
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
    return this.openEncounterBattle(encounter);
  }

  /** Shared initialization and settlement for physical and authored dialogue entry. */
  private openEncounterBattle(encounter: PlacedEncounter): boolean {
    const battlePanel = this.battlePanel;
    if (battlePanel === null || battlePanel.isOpen || this.playerProfile === null || this.playerState === null) return false;
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
        ? { companion: { name: companionNpc.record.name, support: resolveCompanionStance(activeCompanion, { mapResourceId: this.currentMapResourceId, sharedKnowledgeNodeIds: this.social.npcKnowledge.get(activeCompanion.npcId) ?? new Set() }).combatSupport } }
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
    if (
      map === null ||
      marker === null ||
      this.moving ||
      this.anyOverlayOpen() ||
      this.dataReloading
    ) {
      return; // Also locked while a dialogue, battle, backpack or shop panel is open — or a data hot reload is rebuilding the world.
    }

    if (dCol < 0) this.playerFacing = 'left';
    else if (dCol > 0) this.playerFacing = 'right';
    else if (dRow < 0) this.playerFacing = 'up';
    else if (dRow > 0) this.playerFacing = 'down';
    this.updatePlayerActorFrame(false);

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
    this.updateTransitionMarkerProximity();
    this.updateInteractHint();
    // Round 119: the tracker line quotes the nearest giver's live cell, so
    // every successful step re-projects it (zero-minute steps included — the
    // notice timer and active-quest priority live inside the projection).
    this.updateQuestTrackerHud();
    const baseStepMinutes = this.clock?.calendar.actionCosts.stepMinutes ?? 0;
    const weatherStepMinutes = this.currentClimate()?.weather.stepMinutes ?? 0;
    this.advanceTime(baseStepMinutes + weatherStepMinutes);
    // A step can cross a period boundary. Refresh schedules even for maps
    // whose step cost is zero, then rebuild the guide against live blockers.
    // advanceTime already performs this when the clock actually advances.
    if (baseStepMinutes + weatherStepMinutes <= 0) this.syncNpcSchedule(false);
    // Quote the remaining walk against the new time, live occupancy and weather.
    // This also refreshes zero-time movement, where advanceTime is a no-op.
    this.refreshNavigationGuide();

    const target = cellCenterOffset(map, targetCol, targetRow);
    const finishMove = (): void => {
      this.setWorldActorDepth(marker, undefined, map.tileSize);
      this.moving = false;
      this.updatePlayerActorFrame(false);
      this.refreshCompanionFollower(previousCell);
      this.triggerRegionEvents('', true);
      void this.runPendingDataReload(); // Safe boundary for a latched data change.
    };
    this.moving = true;
    this.updatePlayerActorFrame(true, 0);
    if (currentReducedMotion()) {
      // Round 41: reduced motion snaps the marker to the target cell and
      // settles synchronously — game state advances on the same code path,
      // just without the tween (companion follows and region events included).
      marker.setPosition(this.mapOrigin.x + target.x, this.mapOrigin.y + target.y);
      finishMove();
      return;
    }
    this.tweens.add({
      targets: marker,
      x: this.mapOrigin.x + target.x,
      y: this.mapOrigin.y + target.y,
      duration: MOVE_DURATION_MS,
      onUpdate: (tween) => {
        const walkFrames = map.data.art?.actors.playerFrames?.walk[this.playerFacing];
        if (walkFrames !== undefined && walkFrames.length > 0) {
          const step = Math.min(walkFrames.length - 1, Math.floor(tween.progress * walkFrames.length));
          this.updatePlayerActorFrame(true, step);
        }
        this.setWorldActorDepth(marker, undefined, map.tileSize);
      },
      onComplete: finishMove,
    });
  }

  private updatePlayerActorFrame(moving: boolean, stepIndex = 0): void {
    const map = this.map;
    const marker = this.marker;
    const actors = map?.data.art?.actors;
    if (map === null || map === undefined || marker === null || actors === undefined ||
      !(marker instanceof Phaser.GameObjects.Image)) return;
    setGridMapActorFrame(
      this,
      map,
      marker,
      selectGridMapPlayerFrame(actors, this.playerFacing, moving, stepIndex),
    );
  }

  /** Check actual arrival-period occupancy before publishing a dialogue journey. */
  private buildDialogueTeleportReadiness(): DialogueTeleportReadiness {
    const world = this.world;
    return {
      characterReady: this.playerState !== null && this.playerProfile !== null && this.playerState.health.current > 0,
      panelReady: world !== null && !this.dataReloading && !this.moving && !this.dialogueBattlePending && !(this.battlePanel?.isOpen ?? false),
      canEnter: (mapResourceId, col, row) => world?.maps.get(mapResourceId)?.canEnter(col, row) ?? false,
      landingBlocked: (request, activeCompanionId) => {
        if (world === null) return true;
        const arrivalClock = new GameClock(world.calendar, this.clock?.elapsedMinutes ?? 0);
        arrivalClock.advance(request.travelMinutes);
        const npcs = world.assembly.npcsByPeriod.get(arrivalClock.currentPeriod().id) ?? world.assembly.npcs;
        const companionNpcId = activeCompanionId === null ? null : world.assembly.companions.get(activeCompanionId)?.npcId ?? null;
        const tideId = this.climateRuntime?.tideForStamp(arrivalClock.snapshot())?.id ?? null;
        const facilities = [
          ...world.assembly.arenas.map(entry => entry.record),
          ...world.assembly.factionWars.map(entry => entry.record),
          ...world.assembly.equipmentForges.map(entry => entry.record),
          ...world.assembly.alchemyStations.map(entry => entry.record),
        ];
        const endingGate = world.assembly.endings?.gate;
        return isDialogueLandingOccupied(request, {
          npcs: npcs.map(npc => ({ id: npc.record.id, mapResourceId: npc.record.mapResourceId, col: npc.col, row: npc.row })),
          activeCompanionNpcId: companionNpcId,
          encounters: world.assembly.encounters.filter(encounter => encounterMatchesTide(encounter.record, tideId)).map(encounter => ({ id: encounter.record.id, repeatable: encounter.record.repeatable, mapResourceId: encounter.record.mapResourceId, col: encounter.col, row: encounter.row })),
          completedEncounterIds: this.completedEncounters,
          markers: [
            ...facilities.map(entry => ({ mapResourceId: entry.mapResourceId, ...entry.position })),
            ...(endingGate ? [{ mapResourceId: endingGate.mapResourceId, ...endingGate.position }] : []),
            ...world.worldMap.transitions.map(transition => transition.from),
          ],
        });
      },
    };
  }

  /** Travels through one validated world-map endpoint after a fresh occupancy check. */
  private switchRegion(transition: RegionTransitionData): void {
    const world = this.world;
    if (this.dataReloading || transition.from.mapResourceId !== this.currentMapResourceId ||
        Math.abs(transition.from.col - this.playerCol) + Math.abs(transition.from.row - this.playerRow) !== 1 ||
        !world?.worldMap.transitions.some(current => current === transition)) {
      this.showRegionNotice('交通资料或位置已变化，请重新确认乘行。');
      return;
    }
    const accessReason = transitionAccessReason(transition, this.knownKnowledgeNodeIds);
    if (accessReason !== null) { this.showRegionNotice(accessReason); return; }
    const destinationMap = world?.maps.get(transition.to.mapResourceId);
    if (world === null || destinationMap === undefined) {
      this.showRegionNotice(`关口「${transition.name}」通向的地图当前不可用。`);
      return;
    }
    if (!destinationMap.canEnter(transition.to.col, transition.to.row)) {
      this.showRegionNotice(`关口「${transition.name}」的落点不可通行。`);
      return;
    }
    const quote = quoteTransitionCost(transition, this.clock?.calendar.actionCosts.travelMinutes ?? 0, this.inventory?.currency ?? 0);
    if (!quote.affordable) {
      this.showRegionNotice(`银两不足：乘行需 ${quote.fare}，尚缺 ${quote.missingCurrency}。`);
      return;
    }
    const travelMinutes = quote.minutes;
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

    // Only a freshly validated, accepted journey spends its fare.
    if (this.inventory !== null) this.inventory.currency -= quote.fare;

    this.arriveAtMap(transition.to.mapResourceId, transition.to.col, transition.to.row, travelMinutes, arrivalPeriodId, transition.id);
  }

  /** Shared map rendering, discovery, camera, clock and companion handoff. */
  private arriveAtMap(mapResourceId: string, col: number, row: number, travelMinutes: number, arrivalPeriodId: string, arrivalTransitionId: string | null): void {
    const world = this.world;
    const destinationMap = world?.maps.get(mapResourceId);
    if (world === null || destinationMap === undefined) return;
    this.mapLayer?.destroy();
    // Round 111: a plain Container.remove() re-queues the marker through the
    // scene display list, and the scene-wide ADDED_TO_SCENE HUD pin there
    // would zero its scroll factor (invisible after the camera scrolls).
    if (this.marker !== null && this.npcLayer !== null) detachGridMapWorldActor(this.npcLayer, this.marker);
    this.npcLayer?.destroy();
    this.encounterLayer?.destroy();
    // Old gate markers go down with the old map layers; every refusal above
    // has already returned, so markers never vanish on a refused transition.
    this.destroyTransitionMarkers();
    this.mapLayer = null;
    this.npcLayer = null;
    this.encounterLayer = null;
    this.npcVisuals.clear();
    this.companionFollower = null;
    this.encounterMarkers.clear();

    this.currentMapResourceId = mapResourceId;
    this.recordKnowledgeObservations({ placeIds: [this.currentMapResourceId] });
    this.map = destinationMap;
    this.playerCol = col;
    this.playerRow = row;
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
    this.setMapOrigin(destinationMap);
    this.mapLayer = renderGridMap(this, destinationMap, this.mapOrigin.x, this.mapOrigin.y);
    this.mapLayer.setScrollFactor(1);
    const center = cellCenterOffset(destinationMap, this.playerCol, this.playerRow);
    this.marker?.setPosition(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y);
    if (this.marker !== null) this.setWorldActorDepth(this.marker, undefined, destinationMap.tileSize);
    // Round 111: show the destination atlas' idle frame immediately instead
    // of waiting for the first step (maps may declare different actor sets).
    this.updatePlayerActorFrame(false);
    this.configureMapCamera(destinationMap, this.marker);
    this.renderNpcs(destinationMap);
    this.renderEncounterMarkers(destinationMap);
    this.renderArenaMarkers(destinationMap);
    this.renderFactionWarMarkers(destinationMap);
    this.renderEquipmentForgeMarkers(destinationMap);
    this.renderAlchemyMarkers(destinationMap);
    this.renderEndingGateMarker(destinationMap);
    this.ensureDaylightLayer(); // The rebuilt world layers must sit below the wash again.
    this.rebuildTransitionMarkers(); // New map: new outgoing gates at their world cells.
    this.hudLines.title = destinationMap.data.name;
    this.updateCoordsHud();
    this.advanceTime(travelMinutes);
    // Round 117: the tracker line still names the previous map's nearby
    // guide otherwise. advanceTime above may already have re-run the NPC
    // schedule for the arrival period; this one call renders whatever the
    // new map's live placements now are (including "no guide here").
    this.updateQuestTrackerHud();
    this.refreshCompanionFollower(null);
    this.refreshNavigationGuide();
    this.showRegionNotice(`已抵达「${destinationMap.data.name}」。`);
    // Round 90: the arrival cause is handed over only here — every blocked or
    // refused gate above has already returned, so arrival roaming events see
    // the actual travelled transition id after the switch truly completed.
    this.triggerRegionEvents('', false, arrivalTransitionId);
  }

  /** Fires ready events authored for the exact current cell. */
  /** Live knowledge/period/weather/adjacent-NPC state shared by region-event evaluation. */
  private regionEventContext(): RegionEventContext {
    const climate = this.currentClimate();
    const nearbyNpcIds = new Set(this.placedNpcs
      .filter((npc) =>
        Math.abs(npc.col - this.playerCol) + Math.abs(npc.row - this.playerRow) === 1,
      )
      .map((npc) => npc.record.id));
    return {
      knownKnowledgeNodeIds: this.knownKnowledgeNodeIds,
      periodId: this.clock?.currentPeriod().id ?? null,
      weatherId: climate?.weather.id ?? null,
      tideId: climate?.tide?.id ?? null,
      nearbyNpcIds,
    };
  }

  /** Finds the nearest usable map event and keeps intermediate walls/actors from being targeted through. */
  private interactableRegionEventTarget(): RegionEventInteractionSelection | null {
    const world = this.world;
    const map = this.map;
    if (world === null || map === null) return null;
    return selectInteractableRegionEvent(
      world.worldMap.events,
      { mapResourceId: this.currentMapResourceId, col: this.playerCol, row: this.playerRow },
      this.completedRegionalEvents,
      this.regionEventContext(),
      (col, row) => map.canEnter(col, row) &&
        !this.occupancy.isOccupied(col, row) &&
        !this.encounterCells.has(`${col},${row}`),
    );
  }

  private triggerRegionEvents(prefix = '', afterPlayerStep = false, arrivalTransitionId: string | null = null): void {
    const world = this.world;
    if (world === null) {
      if (prefix.length > 0) this.showRegionNotice(prefix);
      return;
    }
    const eventContext = this.regionEventContext();
    const events = selectTriggeredRegionEvents(
      world.worldMap.events,
      { mapResourceId: this.currentMapResourceId, col: this.playerCol, row: this.playerRow },
      this.completedRegionalEvents,
      eventContext,
      arrivalTransitionId,
    );
    // Round 90: the roaming draw keeps its two causes strictly separate — a
    // finished grid step samples step rows only, while a completed map switch
    // samples arrival rows through the gate actually travelled. Startup,
    // waiting and refused transitions pass neither and never roll.
    const randomEvent = afterPlayerStep
      ? selectTriggeredRandomRegionEvent(
          world.worldMap.randomEvents,
          this.currentMapResourceId,
          this.completedRegionalEvents,
          eventContext,
        )
      : arrivalTransitionId !== null
        ? selectTriggeredRandomRegionEvent(
            world.worldMap.randomEvents,
            this.currentMapResourceId,
            this.completedRegionalEvents,
            eventContext,
            undefined,
            arrivalTransitionId,
          )
        : null;
    const allEvents = randomEvent === null ? events : [...events, randomEvent];
    this.presentRegionEvents(allEvents, prefix);
  }

  /** Shares one-shot settlement, discovery and notice presentation across step and E-key events. */
  private presentRegionEvents(
    events: readonly (RegionEventData | RandomRegionEventData)[],
    prefix = '',
  ): void {
    const world = this.world;
    if (world === null) {
      if (prefix.length > 0) this.showRegionNotice(prefix);
      return;
    }
    const notices = prefix.length > 0 ? [prefix] : [];
    for (const event of events) {
      if (event.once) this.completedRegionalEvents.add(event.id);
      notices.push(event.text);
    }
    const newlyDiscoveredTitles = new Set<string>();
    const eventKnowledgeNodeIds = new Set(world.knowledgeGraph.nodes.keys());
    for (const nodeId of selectNewRegionEventKnowledgeIds(events, this.knownKnowledgeNodeIds, eventKnowledgeNodeIds)) {
      const node = world.knowledgeGraph.nodes.get(nodeId);
      if (node === undefined) continue;
      if (!this.markKnowledgeDiscovered(nodeId)) continue;
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
