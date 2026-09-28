import Phaser from 'phaser';

import { type CellPosition, type GridMap } from '../engine/grid-map';
import { findGridPath, summarizePathRuns } from '../engine/grid-path';
import { clampMapViewport, createMapViewport, panMapViewport, zoomMapViewport, type MapViewportBounds, type MapViewportState } from '../engine/map-viewport';
import { gridMapArtTextureKey } from '../engine/grid-map-renderer';
import { selectVisibleWorldLandmarks, type WorldLandmarkCategory, type WorldMapAssembly } from '../engine/world-map';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY } from './ui-theme';

const WIDTH = 960;
const COLORS = {
  panelFill: 0x10141d,
  stroke: 0x53627b,
  text: '#d8dee9',
  muted: '#8a94a6',
  accent: '#e8b04b',
  player: 0xffdc70,
  viewport: 0x080b10,
  settlement: 0x76e0a8,
  water: 0x78d7f1,
  crossing: 0xf09a68,
  route: 0xe8b04b,
  other: 0xc3a0f5,
} as const;

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

interface MapWaypoint {
  id: string;
  name: string;
  category: WorldLandmarkCategory;
  position: CellPosition;
  kind: 'landmark' | 'transition';
  approachRadius: number;
  destinationRegionName?: string;
}

interface MapPin {
  waypointId: string;
  pin: Phaser.GameObjects.Arc;
}

/** Movable, zoomable atlas overlay; location names and routes stay data-driven. */
export class WorldMapPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private readonly mapBounds: MapViewportBounds = { x: 122, y: 128, width: 520, height: 298 };
  private openState = false;
  private mapImage: Phaser.GameObjects.Image | null = null;
  private mapContent: Phaser.GameObjects.Container | null = null;
  private mapCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private playerPin: Phaser.GameObjects.Arc | null = null;
  private readonly mapPins: MapPin[] = [];
  private readonly waypointRows: { id: string; text: Phaser.GameObjects.Text }[] = [];
  private inputZone: Phaser.GameObjects.Zone | null = null;
  private routeGraphics: Phaser.GameObjects.Graphics | null = null;
  private selectedNameText: Phaser.GameObjects.Text | null = null;
  private routeDistanceText: Phaser.GameObjects.Text | null = null;
  private routeDirectionsText: Phaser.GameObjects.Text | null = null;
  private routeDestinationText: Phaser.GameObjects.Text | null = null;
  private activeMap: GridMap | null = null;
  private waypoints: MapWaypoint[] = [];
  private routeCells: CellPosition[] | null = null;
  private viewportState: MapViewportState = { x: 0, y: 0, scale: 1 };
  private mapWidth = 0;
  private mapHeight = 0;
  private artTileSize = 16;
  private baseScale = 1;
  private playerCol = 0;
  private playerRow = 0;
  private draggingPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private readonly pointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.draggingPointerId === null || pointer.id !== this.draggingPointerId) return;
    if (Math.hypot(pointer.x - this.dragStartX, pointer.y - this.dragStartY) > 4) this.dragMoved = true;
    this.viewportState = panMapViewport(
      this.mapBounds, this.mapWidth, this.mapHeight, this.viewportState,
      pointer.x - this.lastPointerX, pointer.y - this.lastPointerY,
    );
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    this.updateMapPosition();
  };

  private readonly pointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.draggingPointerId) return;
    const clicked = !this.dragMoved;
    this.draggingPointerId = null;
    if (!clicked || !this.isPointerInsideMap(pointer.x, pointer.y)) return;
    const waypoint = this.waypoints
      .map((candidate) => ({ waypoint: candidate, point: this.waypointScreenPosition(candidate.position) }))
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.point.x - pointer.x, candidate.point.y - pointer.y) }))
      .filter((candidate) => candidate.distance <= 13)
      .sort((a, b) => a.distance - b.distance)[0]?.waypoint;
    if (waypoint !== undefined) this.selectWaypoint(waypoint.id);
  };

  private readonly pointerWheel = (
    pointer: Phaser.Input.Pointer,
    _currentlyOver: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    if (!this.openState || this.mapImage === null) return;
    if (
      pointer.x < this.mapBounds.x || pointer.x > this.mapBounds.x + this.mapBounds.width ||
      pointer.y < this.mapBounds.y || pointer.y > this.mapBounds.y + this.mapBounds.height
    ) return;
    this.zoom(pointer.x, pointer.y, deltaY > 0 ? 0.88 : 1.12);
  };

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1100).setScrollFactor(0);
  }

  get isOpen(): boolean { return this.openState; }

  open(
    worldMap: WorldMapAssembly,
    currentMapResourceId: string,
    map: GridMap,
    playerCol: number,
    playerRow: number,
    knownKnowledgeNodeIds: ReadonlySet<string> = new Set(),
  ): void {
    if (this.openState) return;
    this.openState = true;
    this.container.setVisible(true);
    this.playerCol = playerCol;
    this.playerRow = playerRow;
    this.bindKeys();
    this.scene.input.on('pointermove', this.pointerMove);
    this.scene.input.on('pointerup', this.pointerUp);
    this.scene.input.on('wheel', this.pointerWheel);
    this.activeMap = map;
    this.waypoints = this.buildWaypoints(worldMap, currentMapResourceId, knownKnowledgeNodeIds);
    this.render(worldMap, currentMapResourceId, map);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.scene.input.off('pointermove', this.pointerMove);
    this.scene.input.off('pointerup', this.pointerUp);
    this.scene.input.off('wheel', this.pointerWheel);
    this.draggingPointerId = null;
    this.container.setVisible(false);
    this.container.removeAll(true);
    if (this.mapCamera !== null) this.scene.cameras.remove(this.mapCamera);
    this.mapCamera = null;
    this.mapContent?.destroy();
    this.mapContent = null;
    this.mapImage = null;
    this.playerPin = null;
    this.mapPins.length = 0;
    this.waypointRows.length = 0;
    this.routeGraphics = null;
    this.selectedNameText = null;
    this.routeDistanceText = null;
    this.routeDirectionsText = null;
    this.routeDestinationText = null;
    this.activeMap = null;
    this.waypoints = [];
    this.routeCells = null;
    this.inputZone = null;
    this.onClose?.();
  }

  destroy(): void {
    this.close();
    this.container.destroy();
  }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const close = (): void => this.close();
    for (const code of [codes.ESC, codes.M]) {
      const key = keyboard.addKey(code);
      key.on('down', close);
      this.bindings.push({ key, handler: close });
    }
    for (const [code, dx, dy] of [
      [codes.LEFT, 36, 0], [codes.RIGHT, -36, 0], [codes.UP, 0, 36], [codes.DOWN, 0, -36],
    ] as const) {
      const key = keyboard.addKey(code);
      const handler = (): void => this.pan(dx, dy);
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private render(worldMap: WorldMapAssembly, currentMapResourceId: string, map: GridMap): void {
    addPixelPanelChrome(this.scene, this.container, { x: 90, y: 45, width: 780, height: 450 }, 0.9);
    this.addText(WIDTH / 2, 62, '江湖舆图', 20, COLORS.text, 0.5);
    this.addText(WIDTH / 2, 91, '拖动平移 · 滚轮缩放 · 方向键微调 · 按 M 或 Esc 收起', 12, COLORS.muted, 0.5);

    const art = map.data.art;
    const textureKey = art === undefined ? null : gridMapArtTextureKey(map);
    if (art !== undefined && textureKey !== null && this.scene.textures.exists(textureKey)) {
      this.mapWidth = map.columns * art.tileSize;
      this.mapHeight = map.rows * art.tileSize;
      this.artTileSize = art.tileSize;
      this.baseScale = Math.min(this.mapBounds.width / this.mapWidth, this.mapBounds.height / this.mapHeight);
      this.viewportState = createMapViewport(this.mapBounds, this.mapWidth, this.mapHeight);
      this.mapContent = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(1200);
      const background = this.scene.add.rectangle(
        this.mapBounds.x + this.mapBounds.width / 2,
        this.mapBounds.y + this.mapBounds.height / 2,
        this.mapBounds.width,
        this.mapBounds.height,
        COLORS.viewport,
      ).setStrokeStyle(1, COLORS.stroke);
      this.container.add(background);
      this.mapImage = this.scene.add.image(
        this.viewportState.x - this.mapBounds.x,
        this.viewportState.y - this.mapBounds.y,
        textureKey,
      ).setScale(this.viewportState.scale);
      this.mapContent.add(this.mapImage);
      this.routeGraphics = this.scene.add.graphics();
      this.mapContent.add(this.routeGraphics);
      for (const waypoint of this.waypoints) {
        const pin = this.scene.add.circle(0, 0, waypoint.kind === 'transition' ? 6 : 4.5, COLORS[waypoint.category])
          .setStrokeStyle(2, 0x16202a);
        this.mapPins.push({ waypointId: waypoint.id, pin });
        this.mapContent.add(pin);
      }
      this.playerPin = this.scene.add.circle(0, 0, 6, COLORS.player).setStrokeStyle(2, 0x241b0b);
      this.mapContent.add(this.playerPin);
      this.inputZone = this.scene.add.zone(
        this.mapBounds.x + this.mapBounds.width / 2,
        this.mapBounds.y + this.mapBounds.height / 2,
        this.mapBounds.width,
        this.mapBounds.height,
      ).setInteractive();
      this.inputZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.draggingPointerId = pointer.id;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        this.dragMoved = false;
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
      });
      this.container.add(this.inputZone);
      this.updateMapPosition();
    } else {
      const fallback = this.scene.add.rectangle(
        this.mapBounds.x + this.mapBounds.width / 2,
        this.mapBounds.y + this.mapBounds.height / 2,
        this.mapBounds.width,
        this.mapBounds.height,
        COLORS.panelFill,
      ).setStrokeStyle(1, COLORS.stroke);
      this.container.add(fallback);
      this.addText(this.mapBounds.x + 20, this.mapBounds.y + 32, '此地图未声明像素图层。', 13, COLORS.muted, 0);
    }

    const current = worldMap.regions.find((region) => region.mapResourceId === currentMapResourceId);
    this.addText(672, 137, current?.name ?? currentMapResourceId, 15, COLORS.accent, 0);
    this.addText(672, 166, current?.description ?? '当前区域', 12, COLORS.muted, 0);
    this.addText(672, 203, `已知地点与关口 ${this.waypoints.length} 处`, 12, COLORS.text, 0);
    this.waypoints.slice(0, 6).forEach((waypoint, index) => {
      const y = 224 + index * 19;
      this.addLegendSwatch(678, y, COLORS[waypoint.category]);
      const row = this.addText(690, y, `${waypoint.kind === 'transition' ? '关口' : '地点'} · ${waypoint.name}`, 11,
        COLORS.text, 0).setInteractive({ useHandCursor: true });
      row.on('pointerdown', () => this.selectWaypoint(waypoint.id));
      this.waypointRows.push({ id: waypoint.id, text: row });
    });
    if (this.waypoints.length > 6) {
      this.addText(690, 337, `其余 ${this.waypoints.length - 6} 处可点选地图标记`, 10, COLORS.muted, 0);
    }
    this.selectedNameText = this.addText(672, 355, '选择地点规划步行路线', 11, COLORS.accent, 0);
    this.routeDistanceText = this.addText(672, 377, '', 11, COLORS.text, 0);
    this.routeDirectionsText = this.addText(672, 399, '', 10, COLORS.muted, 0);
    this.routeDestinationText = this.addText(672, 448, '', 10, COLORS.muted, 0);
    this.addText(122, 443, `${map.data.name} · 格坐标 (${this.playerCol}, ${this.playerRow})`, 11, COLORS.muted, 0);
    if (this.mapContent !== null) this.createAtlasCamera();
  }

  /** A viewport camera gives the movable atlas a real rectangular clip region. */
  private createAtlasCamera(): void {
    const content = this.mapContent;
    if (content === null) return;
    const camera = this.scene.cameras.add(
      this.mapBounds.x,
      this.mapBounds.y,
      this.mapBounds.width,
      this.mapBounds.height,
      false,
      'world-map-atlas',
    ).setScroll(0, 0).setZoom(1);
    camera.ignore(this.scene.children.list.filter((child) => child !== content));
    this.scene.cameras.main.ignore(content);
    this.mapCamera = camera;
  }

  private zoom(pointerX: number, pointerY: number, factor: number): void {
    if (this.mapImage === null) return;
    this.viewportState = zoomMapViewport(
      this.mapBounds, this.mapWidth, this.mapHeight, this.viewportState,
      pointerX, pointerY, factor, this.baseScale * 0.5, this.baseScale * 6,
    );
    this.updateMapPosition();
  }

  private pan(dx: number, dy: number): void {
    if (this.mapImage === null) return;
    this.viewportState = panMapViewport(
      this.mapBounds, this.mapWidth, this.mapHeight, this.viewportState, dx, dy,
    );
    this.updateMapPosition();
  }

  private updateMapPosition(): void {
    if (this.mapImage === null) return;
    this.viewportState = clampMapViewport(this.mapBounds, this.mapWidth, this.mapHeight, this.viewportState);
    this.mapImage.setPosition(
      this.viewportState.x - this.mapBounds.x,
      this.viewportState.y - this.mapBounds.y,
    ).setScale(this.viewportState.scale);
    this.playerPin?.setPosition(
      this.viewportState.x - this.mapBounds.x - this.mapWidth * this.viewportState.scale / 2 + (this.playerCol + 0.5) * this.artTileSize * this.viewportState.scale,
      this.viewportState.y - this.mapBounds.y - this.mapHeight * this.viewportState.scale / 2 + (this.playerRow + 0.5) * this.artTileSize * this.viewportState.scale,
    );
    for (const { waypointId, pin } of this.mapPins) {
      const waypoint = this.waypoints.find((candidate) => candidate.id === waypointId);
      if (waypoint !== undefined) pin.setPosition(...this.waypointMapContentPosition(waypoint.position));
    }
    this.drawRoute();
  }

  private buildWaypoints(
    worldMap: WorldMapAssembly,
    currentMapResourceId: string,
    knownKnowledgeNodeIds: ReadonlySet<string>,
  ): MapWaypoint[] {
    const landmarks = selectVisibleWorldLandmarks(worldMap.landmarks, knownKnowledgeNodeIds)
      .filter((landmark) => landmark.mapResourceId === currentMapResourceId)
      .map((landmark): MapWaypoint => ({
        id: `landmark:${landmark.id}`,
        name: landmark.name,
        category: landmark.category,
        position: { col: landmark.col, row: landmark.row },
        kind: 'landmark',
        approachRadius: 2,
      }));
    const transitions = worldMap.transitions
      .filter((transition) => transition.from.mapResourceId === currentMapResourceId)
      .map((transition): MapWaypoint => ({
        id: `transition:${transition.id}`,
        name: transition.name,
        category: 'crossing',
        position: { col: transition.from.col, row: transition.from.row },
        kind: 'transition',
        approachRadius: 0,
        destinationRegionName: worldMap.regions.find((region) => region.mapResourceId === transition.to.mapResourceId)?.name ?? transition.to.mapResourceId,
      }));
    return [...landmarks, ...transitions];
  }

  private selectWaypoint(id: string): void {
    const waypoint = this.waypoints.find((candidate) => candidate.id === id);
    const map = this.activeMap;
    if (waypoint === undefined || map === null) return;
    this.routeCells = findGridPath(
      map,
      { col: this.playerCol, row: this.playerRow },
      waypoint.position,
      { approachRadius: waypoint.approachRadius },
    );
    this.selectedNameText?.setText(`${waypoint.kind === 'transition' ? '关口' : '地点'}：${waypoint.name}`);
    if (this.routeCells === null) {
      this.routeDistanceText?.setText('当前地形没有可行路线');
      this.routeDirectionsText?.setText('请从别处重新规划。');
    } else {
      const steps = Math.max(0, this.routeCells.length - 1);
      const arrivedAtTarget = this.routeCells.at(-1)?.col === waypoint.position.col &&
        this.routeCells.at(-1)?.row === waypoint.position.row;
      this.routeDistanceText?.setText(`步行 ${steps} 格${arrivedAtTarget ? '' : ' · 至最近可行停靠点'}`);
      this.routeDirectionsText?.setText(formatRouteDirections(this.routeCells));
    }
    this.routeDestinationText?.setText(waypoint.destinationRegionName === undefined
      ? '' : `抵达后通往：${waypoint.destinationRegionName}`);
    for (const row of this.waypointRows) {
      const selected = row.id === id;
      row.text.setColor(selected ? COLORS.accent : COLORS.text);
      const entry = this.waypoints.find((candidate) => candidate.id === row.id);
      if (entry !== undefined) row.text.setText(`${selected ? '›' : '·'} ${entry.kind === 'transition' ? '关口' : '地点'} · ${entry.name}`);
    }
    for (const { waypointId, pin } of this.mapPins) pin.setScale(waypointId === id ? 1.4 : 1);
    this.drawRoute();
  }

  private drawRoute(): void {
    const graphics = this.routeGraphics;
    const path = this.routeCells;
    if (graphics === null) return;
    graphics.clear();
    if (path === null || path.length < 2) return;
    graphics.lineStyle(3, COLORS.route, 0.9);
    graphics.beginPath();
    const first = this.waypointMapContentPosition(path[0]!);
    graphics.moveTo(first[0], first[1]);
    for (const cell of path.slice(1)) {
      const point = this.waypointMapContentPosition(cell);
      graphics.lineTo(point[0], point[1]);
    }
    graphics.strokePath();
  }

  private waypointMapContentPosition(position: CellPosition): [number, number] {
    return [
      this.viewportState.x - this.mapBounds.x - this.mapWidth * this.viewportState.scale / 2 + (position.col + 0.5) * this.artTileSize * this.viewportState.scale,
      this.viewportState.y - this.mapBounds.y - this.mapHeight * this.viewportState.scale / 2 + (position.row + 0.5) * this.artTileSize * this.viewportState.scale,
    ];
  }

  private waypointScreenPosition(position: CellPosition): { x: number; y: number } {
    const [x, y] = this.waypointMapContentPosition(position);
    return { x: x + this.mapBounds.x, y: y + this.mapBounds.y };
  }

  private isPointerInsideMap(x: number, y: number): boolean {
    return x >= this.mapBounds.x && x <= this.mapBounds.x + this.mapBounds.width &&
      y >= this.mapBounds.y && y <= this.mapBounds.y + this.mapBounds.height;
  }

  private addLegendSwatch(x: number, y: number, color: number): void {
    const swatch = this.scene.add.circle(x, y, 4, color).setStrokeStyle(1, 0x16202a).setScrollFactor(0);
    this.container.add(swatch);
  }

  private addText(x: number, y: number, text: string, size: number, color: string, originX: number): Phaser.GameObjects.Text {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width: 175 },
    }).setOrigin(originX, 0.5).setScrollFactor(0);
    this.container.add(object);
    return object;
  }
}

function formatRouteDirections(path: readonly CellPosition[]): string {
  const labels = { north: '北', east: '东', south: '南', west: '西' } as const;
  const runs = summarizePathRuns(path);
  if (runs.length === 0) return '已经抵达目的地附近。';
  const visible = runs.slice(0, 5).map((run) => `${labels[run.direction]}${run.steps}`);
  if (runs.length > visible.length) visible.push('…');
  return `方向：${visible.join(' → ')}`;
}
