import Phaser from 'phaser';

import {
  type Diagnostic,
  type DataLoaderEventMap,
  type LoadedResource,
  loadGameData,
} from '../engine/data-loader';
import { EventBus } from '../engine/event-bus';
import { GridMap, parseGridMap } from '../engine/grid-map';
import { cellCenterOffset, renderGridMap } from '../engine/grid-map-renderer';
import {
  type DialogueData,
  indexConversations,
  parseDialogueSet,
  validateConversation,
} from '../engine/dialogue-graph';
import {
  assembleNpcPlacements,
  type NpcSetData,
  NpcOccupancyIndex,
  parseNpcSet,
  type PlacedNpc,
  selectInteractionTarget,
} from '../engine/npc-placement';
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
import { DialoguePanel } from './dialogue-ui';

/**
 * Round 03 grid scene, extended with the Round 04 progression datasets.
 *
 * The required map still loads through the generic data loader exactly like
 * Round 02 — manifest/schema/map failures remain fatal and land in the
 * readable error panel. NPC, dialogue, character-profile, faction and
 * martial-art resources are *optional* content on top of that: each failing
 * NPC, conversation, dataset or single martial art is disabled individually
 * with a warning, and the map stays fully playable without them (or with
 * none registered at all, which shows an explicit "no one to talk to" hint).
 *
 * NPCs are rendered at their data-declared walkable cells, block player
 * movement, and can be talked to with E while four-way adjacent. While the
 * dialogue panel is open, movement input is ignored and restored on close.
 * Every name and line of dialogue comes from `data/` — never from code.
 *
 * The Round 04 datasets are parsed and cross-validated at startup and kept
 * on the scene for the coming rounds (character creation, joining, combat);
 * this round deliberately adds no progression UI.
 */

/** Stable resource ids from data/base/manifest.json — never hard-coded URLs. */
const MAP_RESOURCE_ID = 'map.round-01-grid';
const NPC_RESOURCE_ID = 'npc.round-03-set';
const DIALOGUE_RESOURCE_ID = 'dialogue.round-03-set';
const CHARACTER_PROFILE_RESOURCE_ID = 'character-profile.round-04-set';
const FACTION_RESOURCE_ID = 'faction.round-04-set';
const MARTIAL_ART_RESOURCE_ID = 'martial-art.round-04-set';

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

/** Vertical space reserved for the HUD strip above the map (two warning lines). */
const HUD_HEIGHT = 64;

const MOVE_DURATION_MS = 110;

/** Generic geometric player marker (no art assets in this round). */
const MARKER_COLOR = 0xe8b04b;
const MARKER_BORDER = 0x3a2c12;
const MARKER_RADIUS_RATIO = 0.3;

/** Presentation-only NPC palette, cycled by placement order (content stays in data). */
const NPC_PALETTE = [0x7ec8a9, 0xc89fd4, 0x8fb7e8, 0xe89f8f] as const;
const NPC_BORDER = 0x1c2430;
const NPC_SIZE_RATIO = 0.62;

const UI = {
  background: '#0b0e14',
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  fontFamily: 'sans-serif',
} as const;

/** Optional resources (NPC/dialogue/progression content) this scene can lose without dying. */
const OPTIONAL_RESOURCE_IDS = new Set([
  NPC_RESOURCE_ID,
  DIALOGUE_RESOURCE_ID,
  CHARACTER_PROFILE_RESOURCE_ID,
  FACTION_RESOURCE_ID,
  MARTIAL_ART_RESOURCE_ID,
]);

/** Optional-content schemas; schema-level failures carry no resource id, so match by origin. */
const OPTIONAL_SCHEMA_ORIGINS = new Set([
  'schema:npc-set',
  'schema:dialogue-set',
  'schema:character-profiles',
  'schema:faction-set',
  'schema:martial-arts-set',
]);

function isOptionalContentDiagnostic(diagnostic: Diagnostic): boolean {
  return (
    (diagnostic.resource !== undefined && OPTIONAL_RESOURCE_IDS.has(diagnostic.resource)) ||
    OPTIONAL_SCHEMA_ORIGINS.has(diagnostic.origin)
  );
}

/** Flattens loader diagnostics into readable panel lines, one block each. */
function formatDiagnostics(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    const scope =
      diagnostic.resource === undefined
        ? diagnostic.origin
        : `${diagnostic.origin}（资源 ${diagnostic.resource}）`;
    const details = diagnostic.details.length > 0 ? `\n${diagnostic.details.join('\n')}` : '';
    return `${scope}：${diagnostic.message}${details}`;
  });
}

/**
 * Validated Round 04 progression datasets. Assembled and cross-checked at
 * startup so bad data warns early; consumed by the coming rounds (character
 * creation, joining, combat) — this round renders no progression UI.
 */
interface ProgressionAssembly {
  profiles: ReadonlyMap<string, CharacterProfileData>;
  factions: ReadonlyMap<string, FactionData>;
  martialArts: ReadonlyMap<string, MartialArtData>;
}

/** Everything the playable world needs after optional-content assembly. */
interface WorldAssembly {
  npcs: PlacedNpc[];
  dialogues: ReadonlyMap<string, DialogueData>;
  progression: ProgressionAssembly;
  warnings: Diagnostic[];
}

export class GridScene extends Phaser.Scene {
  private map: GridMap | null = null;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private marker: Phaser.GameObjects.Arc | null = null;
  private playerCol = 0;
  private playerRow = 0;

  /** Movement lock: while a tween is in flight every input is ignored. */
  private moving = false;

  /** NPCs placed on the current map and their occupied cells. */
  private placedNpcs: PlacedNpc[] = [];
  private occupancy = new NpcOccupancyIndex();
  private dialogues: ReadonlyMap<string, DialogueData> = new Map();

  /** Validated progression datasets, kept for the coming rounds (no UI yet). */
  private progression: ProgressionAssembly = {
    profiles: new Map(),
    factions: new Map(),
    martialArts: new Map(),
  };

  private dialoguePanel: DialoguePanel | null = null;

  private coordsText: Phaser.GameObjects.Text | null = null;
  private interactText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('grid');
  }

  create(): void {
    this.bindMovementKeys();
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, '正在加载地图数据…', {
        fontFamily: UI.fontFamily,
        fontSize: '14px',
        color: UI.textMuted,
      })
      .setOrigin(0.5);
    void this.loadWorld();
  }

  private async loadWorld(): Promise<void> {
    // Data events mirror the structured diagnostics in the devtools console;
    // the readable error panel below is what players actually see.
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
        },
      });

      // Optional NPC/dialogue problems degrade to warnings; everything else
      // (manifest, schemas, the required map) stays fatal like Round 02.
      const blocking = result.diagnostics.filter(
        (diagnostic) =>
          (diagnostic.severity ?? 'error') === 'error' && !isOptionalContentDiagnostic(diagnostic),
      );
      if (blocking.length > 0) {
        this.showErrorState('资料加载诊断', formatDiagnostics(blocking));
        return;
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
        this.showErrorState('地图资源缺失', [
          `清单中没有 id 为 "${MAP_RESOURCE_ID}" 的资源，请检查 data/base/manifest.json。`,
        ]);
        return;
      }

      const parsed = parseGridMap(mapResource.value);
      if (!parsed.ok) {
        this.showErrorState('地图数据结构不合规', parsed.errors);
        return;
      }

      const assembly = this.assembleOptionalContent(result.resources, parsed.map);
      this.setupWorld(
        parsed.map,
        assembly,
        [...optionalWarnings, ...assembly.warnings],
        modWarnings,
      );
    } catch (error) {
      // loadGameData converts its own failures to diagnostics; this guard
      // only catches the truly unexpected (e.g. a programming error).
      const reason = error instanceof Error ? error.message : String(error);
      this.showErrorState('地图数据加载失败', [reason]);
    } finally {
      offLoaded();
      offError();
    }
  }

  /**
   * Assembles optional NPC/dialogue content. Every failure disables the
   * smallest possible unit — one conversation or one NPC — and becomes a
   * warning instead of killing the scene. Missing (unregistered) resources
   * are legitimate: the world then simply has no one to talk to.
   */
  private assembleOptionalContent(
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

    const progressionAssembled = this.assembleProgressionContent(resources);
    warnings.push(...progressionAssembled.warnings);

    return {
      npcs: placement.npcs,
      dialogues,
      progression: progressionAssembled.assembly,
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
  private assembleProgressionContent(
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

  private setupWorld(
    map: GridMap,
    assembly: WorldAssembly,
    optionalWarnings: readonly Diagnostic[],
    modWarnings: readonly Diagnostic[],
  ): void {
    this.children.removeAll(true); // Drop the transient loading hint.
    this.map = map;
    this.placedNpcs = assembly.npcs;
    this.dialogues = assembly.dialogues;
    this.progression = assembly.progression;
    this.occupancy = new NpcOccupancyIndex(this.placedNpcs);

    // Progression datasets have no UI this round; surface the loaded counts
    // in the console so authors can confirm their JSON actually landed.
    console.info(
      '[progression] 已加载角色模板 %d 个、门派 %d 个、武学 %d 种',
      this.progression.profiles.size,
      this.progression.factions.size,
      this.progression.martialArts.size,
    );

    this.mapOrigin.set(
      (VIEW_WIDTH - map.pixelWidth) / 2,
      HUD_HEIGHT + (VIEW_HEIGHT - HUD_HEIGHT - map.pixelHeight) / 2,
    );
    renderGridMap(this, map, this.mapOrigin.x, this.mapOrigin.y);

    this.playerCol = map.playerStart.col;
    this.playerRow = map.playerStart.row;

    const startOffset = cellCenterOffset(map, this.playerCol, this.playerRow);
    this.marker = this.add.circle(
      this.mapOrigin.x + startOffset.x,
      this.mapOrigin.y + startOffset.y,
      map.tileSize * MARKER_RADIUS_RATIO,
      MARKER_COLOR,
    );
    this.marker.setStrokeStyle(3, MARKER_BORDER);

    this.renderNpcs(map);
    this.buildHud(map, optionalWarnings, modWarnings);
    this.updateCoordsHud();

    this.dialoguePanel = new DialoguePanel(this, {
      onClose: () => this.updateInteractHint(), // Movement is keyed off isOpen.
    });
    this.updateInteractHint();
  }

  /** Draws every placed NPC and its data-driven name label. */
  private renderNpcs(map: GridMap): void {
    this.placedNpcs.forEach((npc, index) => {
      const center = cellCenterOffset(map, npc.col, npc.row);
      const size = map.tileSize * NPC_SIZE_RATIO;
      const body = this.add.rectangle(
        this.mapOrigin.x + center.x,
        this.mapOrigin.y + center.y,
        size,
        size,
        NPC_PALETTE[index % NPC_PALETTE.length] ?? NPC_PALETTE[0],
      );
      body.setStrokeStyle(3, NPC_BORDER);

      this.add
        .text(this.mapOrigin.x + center.x, this.mapOrigin.y + center.y - size / 2 - 4, npc.record.name, {
          fontFamily: UI.fontFamily,
          fontSize: '10px',
          color: UI.textPrimary,
        })
        .setOrigin(0.5, 1);
    });
  }

  private buildHud(
    map: GridMap,
    optionalWarnings: readonly Diagnostic[],
    modWarnings: readonly Diagnostic[],
  ): void {
    this.add
      .text(16, 14, '方向键 / WASD 移动 · 每次一格 · 墙体、边界与人物不可通行 · 邻近人物按 E 交谈', {
        fontFamily: UI.fontFamily,
        fontSize: '13px',
        color: UI.textMuted,
      })
      .setOrigin(0, 0);

    this.add
      .text(VIEW_WIDTH / 2, 14, map.data.name, {
        fontFamily: UI.fontFamily,
        fontSize: '14px',
        color: UI.textPrimary,
      })
      .setOrigin(0.5, 0);

    const lines: { text: string; shown: boolean }[] = [
      {
        text: '部分可选资料（NPC/对话/角色模板/门派/武学）无效，已禁用相应内容（详情见控制台）',
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
      this.add
        .text(VIEW_WIDTH / 2, 33 + index * 15, line.text, {
          fontFamily: UI.fontFamily,
          fontSize: '11px',
          color: UI.textWarn,
        })
        .setOrigin(0.5, 0);
    });
    for (const diagnostic of optionalWarnings) {
      console.warn(`[optional] ${diagnostic.message}`, diagnostic.details);
    }

    this.coordsText = this.add
      .text(VIEW_WIDTH - 16, 14, '', {
        fontFamily: UI.fontFamily,
        fontSize: '13px',
        color: UI.textPrimary,
      })
      .setOrigin(1, 0);

    // Interaction status line under the map: adjacent-NPC prompt or the
    // explicit empty-state hint required when no NPC is interactable.
    this.interactText = this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT - 14, '', {
        fontFamily: UI.fontFamily,
        fontSize: '12px',
        color: UI.textWarn,
      })
      .setOrigin(0.5, 1);
  }

  private updateCoordsHud(): void {
    this.coordsText?.setText(`位置 (${this.playerCol}, ${this.playerRow})`);
  }

  /** Refreshes the bottom status line from the current adjacency state. */
  private updateInteractHint(): void {
    if (this.interactText === null) {
      return;
    }
    if (this.dialoguePanel !== null && this.dialoguePanel.isOpen) {
      this.interactText.setText('');
      return;
    }
    if (this.placedNpcs.length === 0) {
      this.interactText.setText('暂无可交互人物');
      return;
    }
    const target =
      this.map === null
        ? null
        : selectInteractionTarget(this.placedNpcs, {
            col: this.playerCol,
            row: this.playerRow,
          });
    this.interactText.setText(
      target === null ? '' : `按 E 与「${target.record.name}」交谈`,
    );
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const { key, onDown } of listeners) {
        key.off('down', onDown);
      }
      interactKey.off('down', onInteract);
      this.dialoguePanel?.destroy();
      this.dialoguePanel = null;
    });
  }

  /** E key: talk to the four-way adjacent NPC, if any (nearest, id tie-break). */
  private handleInteraction(): void {
    const panel = this.dialoguePanel;
    if (panel === null || panel.isOpen) {
      return; // Never re-open or switch conversations while one is open.
    }
    const target = selectInteractionTarget(this.placedNpcs, {
      col: this.playerCol,
      row: this.playerRow,
    });
    if (target === null) {
      return; // Not adjacent to anyone: E does nothing.
    }
    const conversation = this.dialogues.get(target.record.dialogueId);
    if (conversation === undefined) {
      return; // Defensive: placement already guarantees resolution.
    }
    panel.open(conversation, target.record.name);
    this.updateInteractHint();
  }

  private tryMove(dCol: number, dRow: number): void {
    const map = this.map;
    const marker = this.marker;
    if (
      map === null ||
      marker === null ||
      this.moving ||
      (this.dialoguePanel !== null && this.dialoguePanel.isOpen)
    ) {
      return; // Also locked while a dialogue is open.
    }

    const targetCol = this.playerCol + dCol;
    const targetRow = this.playerRow + dRow;
    if (!map.canEnter(targetCol, targetRow)) {
      return; // Solid tile or outside the grid: the move silently does nothing.
    }
    if (this.occupancy.isOccupied(targetCol, targetRow)) {
      return; // An NPC stands there: occupied cells are not enterable.
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
      },
    });
  }

  private showErrorState(title: string, details: string[]): void {
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
        fontSize: '20px',
        color: UI.textWarn,
      })
      .setOrigin(0.5);

    const body = [
      ...details,
      '',
      '请检查 data/ 下的清单、schema 与地图 JSON，或 mods/ 中的覆盖文件，然后刷新页面。',
    ].join('\n');
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 8, body, {
        fontFamily: UI.fontFamily,
        fontSize: '13px',
        color: UI.textMuted,
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: panelWidth - 48 },
      })
      .setOrigin(0.5);
  }
}
