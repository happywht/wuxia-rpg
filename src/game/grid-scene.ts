import Phaser from 'phaser';

import { GridMap, parseGridMap } from '../engine/grid-map';
import { cellCenterOffset, renderGridMap } from '../engine/grid-map-renderer';

/**
 * Round 01 vertical slice scene.
 *
 * Fetches a grid-map JSON at runtime, renders it with the generic engine
 * renderer and drives one-tile-at-a-time movement. Every failure path
 * (network, HTTP, malformed JSON, invalid structure) lands in a readable
 * in-game panel — the scene stays alive, never a blank canvas or an
 * uncaught error.
 */

/** Map file is static data, never bundled: fetched relative to the deployment base. */
const MAP_URL = `${import.meta.env.BASE_URL}base/maps/round-01-grid.json`;

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

/** Vertical space reserved for the HUD strip above the map. */
const HUD_HEIGHT = 56;

const MOVE_DURATION_MS = 110;

/** Generic geometric player marker (no art assets in this round). */
const MARKER_COLOR = 0xe8b04b;
const MARKER_BORDER = 0x3a2c12;
const MARKER_RADIUS_RATIO = 0.3;

const UI = {
  background: '#0b0e14',
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  fontFamily: 'sans-serif',
} as const;

export class GridScene extends Phaser.Scene {
  private map: GridMap | null = null;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private marker: Phaser.GameObjects.Arc | null = null;
  private playerCol = 0;
  private playerRow = 0;

  /** Movement lock: while a tween is in flight every input is ignored. */
  private moving = false;

  private coordsText: Phaser.GameObjects.Text | null = null;

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
    void this.loadMap();
  }

  private async loadMap(): Promise<void> {
    try {
      const response = await fetch(MAP_URL);
      if (!response.ok) {
        this.showErrorState(`地图数据请求失败（HTTP ${response.status}）`, [
          MAP_URL,
          '请确认 data/base/ 目录已随应用发布，且文件可访问。',
        ]);
        return;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('json')) {
        this.showErrorState('地图数据响应格式错误', [
          `${MAP_URL} 返回了 ${contentType || '未知内容类型'}，预期为 JSON。`,
        ]);
        return;
      }
      const raw: unknown = await response.json();
      const result = parseGridMap(raw);
      if (!result.ok) {
        this.showErrorState('地图数据结构不合规', result.errors);
        return;
      }
      this.setupWorld(result.map);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.showErrorState('地图数据加载失败', [reason, MAP_URL]);
    }
  }

  private setupWorld(map: GridMap): void {
    this.children.removeAll(true); // Drop the transient loading hint.
    this.map = map;

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

    this.buildHud(map);
    this.updateCoordsHud();
  }

  private buildHud(map: GridMap): void {
    this.add
      .text(16, 14, '方向键 / WASD 移动 · 每次一格 · 墙体与边界不可通行', {
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

    this.coordsText = this.add
      .text(VIEW_WIDTH - 16, 14, '', {
        fontFamily: UI.fontFamily,
        fontSize: '13px',
        color: UI.textPrimary,
      })
      .setOrigin(1, 0);
  }

  private updateCoordsHud(): void {
    this.coordsText?.setText(`位置 (${this.playerCol}, ${this.playerRow})`);
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const { key, onDown } of listeners) {
        key.off('down', onDown);
      }
    });
  }

  private tryMove(dCol: number, dRow: number): void {
    const map = this.map;
    const marker = this.marker;
    if (map === null || marker === null || this.moving) {
      return;
    }

    const targetCol = this.playerCol + dCol;
    const targetRow = this.playerRow + dRow;
    if (!map.canEnter(targetCol, targetRow)) {
      return; // Solid tile or outside the grid: the move silently does nothing.
    }

    this.playerCol = targetCol;
    this.playerRow = targetRow;
    this.updateCoordsHud();

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
      '请检查 data/base/maps/ 下的地图 JSON 后刷新页面。',
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
