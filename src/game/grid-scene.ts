import Phaser from 'phaser';

import type { Diagnostic } from '../engine/data-loader';
import { GridMap } from '../engine/grid-map';
import { cellCenterOffset, renderGridMap } from '../engine/grid-map-renderer';
import { selectAdjacentTransition, type RegionTransitionData } from '../engine/world-map';
import { createKnowledgeState } from '../engine/knowledge-graph';
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
import { type SocialState, createSocialState } from '../engine/social-state';
import {
  NpcOccupancyIndex,
  type PlacedNpc,
  selectInteractionTarget,
} from '../engine/npc-placement';
import {
  type CharacterProfileData,
  type CharacterState,
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
  type AssembledShop,
  type InventoryState,
  type ItemRecordData,
  type ShopStockRuntime,
  createInventoryState,
  createShopStockRuntime,
  countItem,
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
import { PauseMenuPanel } from './pause-menu';
import { ControlsPanel } from './controls-ui';
import { FactionPanel } from './faction-ui';
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
 * the Round 08 dialogue condition/effect runtime and the Round 09
 * menu/save/settings flow.
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

/** Vertical space reserved for the HUD strip above the map (two warning lines). */
const HUD_HEIGHT = 64;

const MOVE_DURATION_MS = 110;

/** Presentation-only NPC palette, cycled by placement order (content stays in data). */
const NPC_PALETTE = [0x7ec8a9, 0xc89fd4, 0x8fb7e8, 0xe89f8f] as const;

/** Presentation-only enemy-marker styling (content stays in data). */
const ENCOUNTER_FILL = 0xc96a5a;
const ENCOUNTER_BORDER = 0x30120e;
const ENCOUNTER_SIZE_RATIO = 0.66;

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
  private dialogues: ReadonlyMap<string, DialogueData> = new Map();

  /** Validated progression datasets (assembled by the shared world loader). */
  private progression: ProgressionAssembly = {
    profiles: new Map(),
    factions: new Map(),
    martialArts: new Map(),
  };

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

  /** Round 08 social state (morality/renown/NPC relationships). */
  private social: SocialState = createSocialState();
  /** Current student→master relationship, persisted independently of lore. */
  private factionState: FactionMembershipState = createFactionMembershipState();
  /** Discovered encyclopedia entries are run state and participate in saves. */
  private knownKnowledgeNodeIds = new Set<string>();

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
    this.progression = assembly.progression;
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
        this.playerState = createCharacterState(profile);
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
    this.buildHud(activeMap, world.optionalWarnings, world.modWarnings);
    this.updateCoordsHud();

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
    this.worldMapPanel = new WorldMapPanel(this, () => this.noteOverlayClosed());
    this.encyclopediaPanel = new EncyclopediaPanel(this, { onClose: () => this.noteOverlayClosed() });
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
      },
      warnings: plan.warnings,
    };
  }

  /** Assembles the world id/geometry index a save preflight checks against. */
  private saveWorldReferences(world: LoadedWorld, snapshot: SaveSnapshotV1) {
    const map = world.map;
    const completedEncounters = new Set(snapshot.completedEncounters);
    const maps = new Map([...world.maps.entries()].map(([mapId, regionMap]) => {
      const occupiedCells = new Set(
        world.assembly.npcs
          .filter((npc) => npc.record.mapResourceId === mapId)
          .map((npc) => `${npc.col},${npc.row}`),
      );
      for (const encounter of world.assembly.encounters) {
        if (encounter.record.mapResourceId === mapId &&
            (encounter.record.repeatable || !completedEncounters.has(encounter.record.id))) {
          occupiedCells.add(`${encounter.col},${encounter.row}`);
        }
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
    };
  }

  /** Captures the live run into one slot; readable feedback for the pause menu. */
  private saveToSlot(slotId: SaveSlotId): { ok: boolean; message: string } {
    if (this.storage === null || this.playerState === null || this.inventory === null) {
      return { ok: false, message: '浏览器本地存储不可用或当前无可保存的进度' };
    }
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
      factionMembership: this.factionState.membership,
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

  /**
   * Battle-overlay close hook: the session has already settled everything
   * (experience, defeat recovery) inside the engine; the scene only records
   * one-shot completion, drops panel references and refreshes the HUD.
   */
  private settleBattleClose(): void {
    const session = this.activeSession;
    const encounter = this.activeEncounter;
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
    this.placedNpcs.forEach((npc, index) => {
      const center = cellCenterOffset(map, npc.col, npc.row);
      const body = createPixelPerson(
        this,
        this.mapOrigin.x + center.x,
        this.mapOrigin.y + center.y,
        map.tileSize,
        NPC_PALETTE[index % NPC_PALETTE.length] ?? NPC_PALETTE[0],
      );

      const label = this.registerScaledText(this.add
        .text(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y - map.tileSize * 0.42 - 4, npc.record.name, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(10),
          color: UI.textPrimary,
        })
        .setOrigin(0.5, 1), 10);
      this.npcLayer?.add([body, label]);
    });
  }

  private buildHud(
    map: GridMap,
    optionalWarnings: readonly Diagnostic[],
    modWarnings: readonly Diagnostic[],
  ): void {
    this.registerScaledText(this.add
      .text(16, 12, '方向键 / WASD 移动 · E 交互 · H 帮助', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textMuted,
      })
      .setOrigin(0, 0), 13);

    this.questTrackerText = this.registerScaledText(this.add
      .text(16, 34, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(11),
        color: UI.textMuted,
        wordWrap: { width: 360 },
      })
      .setOrigin(0, 0), 11);

    this.mapNameText = this.registerScaledText(this.add
      .text(VIEW_WIDTH / 2, 14, map.data.name, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: UI.textPrimary,
      })
      .setOrigin(0.5, 0), 14);

    const lines: { text: string; shown: boolean }[] = [
      {
        text: '部分可选资料（NPC/对话/角色模板/门派/武学/战斗遭遇/物品/商店）无效，已禁用相应内容（详情见控制台）',
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
        .setOrigin(0.5, 0), 11);
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
      .setOrigin(1, 0), 13);

    // Interaction status line under the map: adjacent-NPC prompt or the
    // explicit empty-state hint required when no NPC is interactable.
    this.interactText = this.registerScaledText(this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT - 14, '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.textWarn,
      })
      .setOrigin(0.5, 1), 12);
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

  /** Refreshes the bottom status line from the current adjacency state. */
  private updateInteractHint(): void {
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
    if (this.placedNpcs.length === 0 && this.activeEncounters().length === 0) {
      this.interactText.setText('暂无可交互人物');
      return;
    }
    this.interactText.setText('H 操作帮助 · Esc 暂停');
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
      (this.factionPanel !== null && this.factionPanel.isOpen) ||
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
      npcNames: new Map((this.world?.assembly.npcs ?? []).map((npc) => [npc.record.id, npc.record.name])),
      quests: this.quests,
    });
    this.updateInteractHint();
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
        const paidExperience = reward.experience - experience.discardedExperience;
        this.inventory.currency += reward.currency;
        this.questNotice = quest === undefined
          ? `差事完成：经验 +${paidExperience} · 银两 +${reward.currency}`
          : `完成「${quest.name}」：经验 +${paidExperience} · 银两 +${reward.currency}`;
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

    const factionKey = keyboard.addKey(KeyCodes.J);
    const onFaction = (): void => this.toggleFactionPanel();
    factionKey.on('down', onFaction);

    const controlsKey = keyboard.addKey(KeyCodes.H);
    const onControls = (): void => this.toggleControlsPanel();
    controlsKey.on('down', onControls);

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
      factionKey.off('down', onFaction);
      controlsKey.off('down', onControls);
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
      this.factionPanel?.destroy();
      this.factionPanel = null;
      this.controlsPanel?.destroy();
      this.controlsPanel = null;
      this.activeSession = null;
      this.activeEncounter = null;
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
    const gate = this.world === null
      ? null
      : selectAdjacentTransition(this.world.worldMap.transitions, this.currentMapResourceId, {
          col: this.playerCol,
          row: this.playerRow,
        });
    if (gate !== null) this.switchRegion(gate);
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
      npcNames: new Map(this.placedNpcs.map((npc) => [npc.record.id, npc.record.name])),
      character: this.playerState,
      factions: this.progression.factions,
      martialArts: this.progression.martialArts,
      factionState: this.factionState,
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
      const result = applyDialogueEffects(effects, context);
      if (!result.ok) {
        console.info('[dialogue] 效果被拒绝：%s', result.reason);
        return { advanced: false, feedback: result.reason };
      }
      if (result.summary.questUpdate.changed) {
        this.applyQuestUpdate(result.summary.questUpdate);
      }
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
    const session = new CombatSession({
      encounter: encounter.record,
      profile: this.playerProfile,
      player: this.playerState,
      martialArts: this.progression.martialArts,
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

    const target = cellCenterOffset(map, targetCol, targetRow);
    this.moving = true;
    this.tweens.add({
      targets: marker,
      x: this.mapOrigin.x + target.x,
      y: this.mapOrigin.y + target.y,
      duration: MOVE_DURATION_MS,
      onComplete: () => {
        this.moving = false;
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
    const occupiedByNpc = world.assembly.npcs.some((npc) =>
      npc.record.mapResourceId === transition.to.mapResourceId &&
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
    this.encounterMarkers.clear();

    this.currentMapResourceId = transition.to.mapResourceId;
    this.map = destinationMap;
    this.playerCol = transition.to.col;
    this.playerRow = transition.to.row;
    this.placedNpcs = world.assembly.npcs.filter(
      (npc) => npc.record.mapResourceId === this.currentMapResourceId,
    );
    this.occupancy = new NpcOccupancyIndex(this.placedNpcs);
    this.encounters = world.assembly.encounters.filter(
      (encounter) => encounter.record.mapResourceId === this.currentMapResourceId,
    );
    this.encounterCells = new Map(
      this.activeEncounters().map((encounter) => [
        `${encounter.col},${encounter.row}`,
        encounter,
      ]),
    );
    this.mapOrigin.set(
      (VIEW_WIDTH - destinationMap.pixelWidth) / 2,
      HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT - destinationMap.pixelHeight) / 2,
    );
    this.mapLayer = renderGridMap(this, destinationMap, this.mapOrigin.x, this.mapOrigin.y);
    const center = cellCenterOffset(destinationMap, this.playerCol, this.playerRow);
    this.marker?.setPosition(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y);
    this.renderNpcs(destinationMap);
    this.renderEncounterMarkers(destinationMap);
    this.mapNameText?.setText(destinationMap.data.name);
    this.updateCoordsHud();
    this.showRegionNotice(`已抵达「${destinationMap.data.name}」。`);
    this.triggerRegionEvents();
  }

  /** Fires events authored for the exact cell just entered. */
  private triggerRegionEvents(): void {
    const events = this.world?.worldMap.events.filter((event) =>
      event.mapResourceId === this.currentMapResourceId &&
      event.col === this.playerCol && event.row === this.playerRow &&
      (!event.once || !this.completedRegionalEvents.has(event.id)),
    ) ?? [];
    if (events.length === 0) return;
    for (const event of events) {
      if (event.once) this.completedRegionalEvents.add(event.id);
    }
    this.showRegionNotice(events.map((event) => event.text).join(' '));
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
