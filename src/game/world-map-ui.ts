import Phaser from 'phaser';

import { type CellPosition, type GridMap } from '../engine/grid-map';
import { findGridPath, findGridPathToAdjacentCell, summarizePathRuns } from '../engine/grid-path';
import { clampMapViewport, createMapViewport, panMapViewport, zoomMapViewport, type MapViewportBounds, type MapViewportState } from '../engine/map-viewport';
import { ensureGridMapArtTexture, ensureGridMapLayerTexture } from '../engine/grid-map-renderer';
import { QUEST_NAVIGATION_ID_PREFIX, type QuestNavigationTarget } from '../engine/quest-navigation';
import { type WorldMapAssembly } from '../engine/world-map';
import {
  buildWorldAtlasOverlays,
  projectWorldCell,
  worldAtlasArtTextureKey,
  type WorldAtlasConnection,
  type WorldAtlasLandmarkMarker,
  type WorldAtlasPoint,
  type WorldAtlasRegionMarker,
  type WorldAtlasOverlays,
} from '../engine/world-atlas-view';
import { buildWorldMapWaypoints, cycleWorldWaypointIndex, normalizeWorldMapPointer, type WorldMapWaypoint } from '../engine/world-navigation';
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
  region: 0xffe3a0,
} as const;

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

interface MapPin {
  waypointId: string;
  pin: Phaser.GameObjects.Arc;
}

interface AtlasRegionPin {
  marker: WorldAtlasRegionMarker;
  pin: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

interface AtlasLandmarkPin {
  marker: WorldAtlasLandmarkMarker;
  pin: Phaser.GameObjects.Arc;
}

/** Movable, zoomable atlas overlay; location names and routes stay data-driven. */
export class WorldMapPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private readonly onDestinationPicked?: (destinationId: string | null) => void;
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
  private worldMap: WorldMapAssembly | null = null;
  private allMaps: ReadonlyMap<string, GridMap> = new Map();
  private waypoints: WorldMapWaypoint[] = [];
  private atlasOverlays: WorldAtlasOverlays | null = null;
  private readonly atlasRegionPins: AtlasRegionPin[] = [];
  private readonly atlasLandmarkPins: AtlasLandmarkPin[] = [];
  private atlasConnections: WorldAtlasConnection[] = [];
  private atlasConnectionGraphics: Phaser.GameObjects.Graphics | null = null;
  private atlasPlayerPin: Phaser.GameObjects.Arc | null = null;
  private viewMode: 'world' | 'local' = 'world';
  private knownKnowledgeNodeIds: ReadonlySet<string> = new Set();
  private routeCells: CellPosition[] | null = null;
  private selectedWaypointId: string | null = null;
  private focusedWaypointIndex = -1;
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

  private readonly pointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.openState) return;
    const point = this.panelPointer(pointer);
    if (point.x >= 672 && point.x <= 860) {
      const index = Math.round((point.y - 224) / 19);
      const rowY = 224 + index * 19;
      if (index >= 0 && index < Math.min(8, this.waypoints.length) && Math.abs(point.y - rowY) <= 9) {
        this.draggingPointerId = null;
        this.focusWaypoint(index);
        const waypoint = this.waypoints[index];
        if (waypoint !== undefined) this.selectWaypoint(waypoint.id);
        return;
      }
    }
    if (!this.isPointerInsideMap(point.x, point.y)) {
      this.draggingPointerId = null;
      return;
    }
    this.draggingPointerId = pointer.id;
    this.dragStartX = point.x;
    this.dragStartY = point.y;
    this.dragMoved = false;
    this.lastPointerX = point.x;
    this.lastPointerY = point.y;
  };

  private readonly pointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.draggingPointerId === null || pointer.id !== this.draggingPointerId) return;
    const point = this.panelPointer(pointer);
    if (Math.hypot(point.x - this.dragStartX, point.y - this.dragStartY) > 4) this.dragMoved = true;
    this.viewportState = panMapViewport(
      this.mapBounds, this.mapWidth, this.mapHeight, this.viewportState,
      point.x - this.lastPointerX, point.y - this.lastPointerY,
    );
    this.lastPointerX = point.x;
    this.lastPointerY = point.y;
    this.updateMapPosition();
  };

  private readonly pointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.draggingPointerId) return;
    const point = this.panelPointer(pointer);
    const clicked = !this.dragMoved;
    this.draggingPointerId = null;
    if (!clicked || !this.isPointerInsideMap(point.x, point.y)) return;
    if (this.viewMode === 'world') {
      this.selectOverviewPoint(point.x, point.y);
      return;
    }
    const waypoint = this.waypoints
      .map((candidate) => ({ waypoint: candidate, point: this.waypointScreenPosition(candidate.position) }))
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) }))
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
    const point = this.panelPointer(pointer);
    if (
      point.x < this.mapBounds.x || point.x > this.mapBounds.x + this.mapBounds.width ||
      point.y < this.mapBounds.y || point.y > this.mapBounds.y + this.mapBounds.height
    ) return;
    this.zoom(point.x, point.y, deltaY > 0 ? 0.88 : 1.12);
  };

  constructor(
    scene: Phaser.Scene,
    onClose?: () => void,
    onDestinationPicked?: (destinationId: string | null) => void,
  ) {
    this.scene = scene;
    this.onClose = onClose;
    this.onDestinationPicked = onDestinationPicked;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1100).setScrollFactor(0);
  }

  get isOpen(): boolean { return this.openState; }

  open(
    worldMap: WorldMapAssembly,
    currentMapResourceId: string,
    map: GridMap,
    maps: ReadonlyMap<string, GridMap>,
    playerCol: number,
    playerRow: number,
    knownKnowledgeNodeIds: ReadonlySet<string> = new Set(),
    selectedDestinationId: string | null = null,
    supplementalQuestTargets: readonly QuestNavigationTarget[] = [],
  ): void {
    if (this.openState) return;
    this.openState = true;
    this.container.setVisible(true);
    this.playerCol = playerCol;
    this.playerRow = playerRow;
    this.worldMap = worldMap;
    this.allMaps = maps;
    this.knownKnowledgeNodeIds = knownKnowledgeNodeIds;
    this.viewMode = worldMap.data.atlasArt === undefined ? 'local' : 'world';
    this.bindKeys();
    this.scene.input.on('pointerdown', this.pointerDown);
    this.scene.input.on('pointermove', this.pointerMove);
    this.scene.input.on('pointerup', this.pointerUp);
    this.scene.input.on('wheel', this.pointerWheel);
    this.activeMap = map;
    this.waypoints = buildWorldMapWaypoints(
      worldMap,
      currentMapResourceId,
      knownKnowledgeNodeIds,
      supplementalQuestTargets,
    );
    this.selectedWaypointId = null;
    this.focusedWaypointIndex = -1;
    this.render(worldMap, currentMapResourceId, map);
    const selectedProjection = selectedDestinationId === null
      ? undefined
      : this.waypoints.find((waypoint) => waypoint.destinationId === selectedDestinationId);
    if (selectedProjection !== undefined) this.selectWaypoint(selectedProjection.id);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.scene.input.off('pointerdown', this.pointerDown);
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
    this.atlasConnectionGraphics = null;
    this.atlasRegionPins.length = 0;
    this.atlasLandmarkPins.length = 0;
    this.atlasConnections = [];
    this.atlasOverlays = null;
    this.atlasPlayerPin = null;
    this.selectedNameText = null;
    this.routeDistanceText = null;
    this.routeDirectionsText = null;
    this.routeDestinationText = null;
    this.activeMap = null;
    this.worldMap = null;
    this.allMaps = new Map();
    this.waypoints = [];
    this.routeCells = null;
    this.selectedWaypointId = null;
    this.focusedWaypointIndex = -1;
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
    const previous = keyboard.addKey(codes.W);
    const previousHandler = (): void => this.focusWaypoint(
      cycleWorldWaypointIndex(this.focusedWaypointIndex, this.waypoints.length, -1),
    );
    previous.on('down', previousHandler);
    this.bindings.push({ key: previous, handler: previousHandler });
    const next = keyboard.addKey(codes.S);
    const nextHandler = (): void => this.focusWaypoint(
      cycleWorldWaypointIndex(this.focusedWaypointIndex, this.waypoints.length, 1),
    );
    next.on('down', nextHandler);
    this.bindings.push({ key: next, handler: nextHandler });
    const confirm = keyboard.addKey(codes.ENTER);
    const confirmHandler = (): void => {
      if (this.focusedWaypointIndex < 0) return;
      const waypoint = this.waypoints[this.focusedWaypointIndex];
      if (waypoint !== undefined) this.selectWaypoint(waypoint.id);
    };
    confirm.on('down', confirmHandler);
    this.bindings.push({ key: confirm, handler: confirmHandler });
    const toggle = keyboard.addKey(codes.G);
    const toggleHandler = (): void => this.toggleView();
    toggle.on('down', toggleHandler);
    this.bindings.push({ key: toggle, handler: toggleHandler });
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private render(worldMap: WorldMapAssembly, currentMapResourceId: string, map: GridMap): void {
    addPixelPanelChrome(this.scene, this.container, { x: 90, y: 45, width: 780, height: 450 }, 0.9);
    this.addText(WIDTH / 2, 62, '江湖舆图', 20, COLORS.text, 0.5);
    this.addText(WIDTH / 2, 99, '拖动平移 · 滚轮缩放 · 方向键微调 · W/S 选点 · Enter 规划 · G 切换视图 · M/Esc 收起', 12, COLORS.muted, 0.5, 720);
    if (worldMap.data.atlasArt !== undefined) {
      this.addText(778, 63, this.viewMode === 'world' ? 'G · 本区细图' : 'G · 全域总览', 11, COLORS.accent, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.toggleView());
    }

    const background = this.scene.add.rectangle(
      this.mapBounds.x + this.mapBounds.width / 2,
      this.mapBounds.y + this.mapBounds.height / 2,
      this.mapBounds.width,
      this.mapBounds.height,
      COLORS.viewport,
    ).setStrokeStyle(1, COLORS.stroke);
    this.container.add(background);
    this.inputZone = this.scene.add.zone(
      this.mapBounds.x + this.mapBounds.width / 2,
      this.mapBounds.y + this.mapBounds.height / 2,
      this.mapBounds.width,
      this.mapBounds.height,
    ).setInteractive();
    this.container.add(this.inputZone);

    const atlasArt = this.viewMode === 'world' ? worldMap.data.atlasArt : undefined;
    const atlasKey = this.viewMode === 'world' ? worldAtlasArtTextureKey(worldMap) : null;
    const atlasTexture = atlasArt === undefined || atlasKey === null
      ? null
      : ensureGridMapLayerTexture(this.scene, atlasArt, atlasArt.columns, atlasArt.rows, atlasKey);
    const localArt = this.viewMode === 'local' ? map.data.art : undefined;
    const localKey = localArt === undefined ? null : ensureGridMapArtTexture(this.scene, map);
    const textureKey = atlasTexture ?? localKey;
    if (textureKey !== null) {
      const usingOverview = atlasTexture !== null;
      this.mapWidth = usingOverview
        ? atlasArt!.columns * atlasArt!.tileSize
        : map.columns * localArt!.tileSize;
      this.mapHeight = usingOverview
        ? atlasArt!.rows * atlasArt!.tileSize
        : map.rows * localArt!.tileSize;
      this.artTileSize = usingOverview ? atlasArt!.tileSize : localArt!.tileSize;
      this.baseScale = Math.min(this.mapBounds.width / this.mapWidth, this.mapBounds.height / this.mapHeight);
      this.viewportState = createMapViewport(this.mapBounds, this.mapWidth, this.mapHeight);
      this.mapContent = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(1200);
      this.mapImage = this.scene.add.image(
        this.viewportState.x - this.mapBounds.x,
        this.viewportState.y - this.mapBounds.y,
        textureKey,
      ).setScale(this.viewportState.scale);
      this.mapContent.add(this.mapImage);
      if (usingOverview) {
        this.atlasOverlays = buildWorldAtlasOverlays(
          worldMap,
          this.allMaps,
          currentMapResourceId,
          { col: this.playerCol, row: this.playerRow },
          this.knownKnowledgeNodeIds,
        );
        this.atlasConnections = this.atlasOverlays.connections;
        this.atlasConnectionGraphics = this.scene.add.graphics();
        this.mapContent.add(this.atlasConnectionGraphics);
        this.routeGraphics = this.scene.add.graphics();
        this.mapContent.add(this.routeGraphics);
        for (const marker of this.atlasOverlays.regions) {
          const pin = this.scene.add.circle(0, 0, 7, COLORS.region).setStrokeStyle(2, 0x271e13);
          const label = this.scene.add.text(0, 0, marker.name, {
            fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(11), color: '#fff1cb',
            backgroundColor: '#10141d', padding: { x: 3, y: 1 },
          }).setOrigin(0.5, 1).setScrollFactor(0);
          this.atlasRegionPins.push({ marker, pin, label });
          this.mapContent.add([pin, label]);
        }
        for (const marker of this.atlasOverlays.landmarks) {
          const pin = this.scene.add.circle(0, 0, 4.5, COLORS[marker.category]).setStrokeStyle(1, 0x16202a);
          this.atlasLandmarkPins.push({ marker, pin });
          this.mapContent.add(pin);
        }
        if (this.atlasOverlays.player !== null) {
          this.atlasPlayerPin = this.scene.add.circle(0, 0, 6, COLORS.player).setStrokeStyle(2, 0x241b0b);
          this.mapContent.add(this.atlasPlayerPin);
        }
      } else {
        this.routeGraphics = this.scene.add.graphics();
        this.mapContent.add(this.routeGraphics);
        for (const waypoint of this.waypoints) {
          // Remote objectives share their map marker with the first gate. Keep
          // the local gate pin unambiguous; the remote destination stays in the sidebar.
          if (waypoint.kind === 'remote-region' || waypoint.kind === 'remote-landmark') continue;
          const pin = this.scene.add.circle(0, 0, waypoint.kind === 'transition' ? 6 : 4.5, COLORS[waypoint.category])
            .setStrokeStyle(2, 0x16202a);
          pin.setInteractive(new Phaser.Geom.Circle(0, 0, 14), Phaser.Geom.Circle.Contains);
          pin.on('pointerdown', () => this.selectWaypoint(waypoint.id));
          this.mapPins.push({ waypointId: waypoint.id, pin });
          this.mapContent.add(pin);
        }
        this.playerPin = this.scene.add.circle(0, 0, 6, COLORS.player).setStrokeStyle(2, 0x241b0b);
        this.mapContent.add(this.playerPin);
      }
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
      this.addText(this.mapBounds.x + 20, this.mapBounds.y + 32, atlasArt === undefined && this.viewMode === 'world'
        ? '此世界资料未声明全域底图；可按 G 查看本区地图。'
        : '此地图未声明像素图层。', 13, COLORS.muted, 0);
    }

    const current = worldMap.regions.find((region) => region.mapResourceId === currentMapResourceId);
    this.addText(672, 137, current?.name ?? currentMapResourceId, 15, COLORS.accent, 0);
    this.addText(672, 166, current?.description ?? '当前区域', 12, COLORS.muted, 0);
    this.addText(672, 203, `已知地点与关口 ${this.waypoints.length} 处`, 12, COLORS.text, 0);
    this.waypoints.slice(0, 8).forEach((waypoint, index) => {
      const y = 224 + index * 19;
      this.addLegendSwatch(678, y, COLORS[waypoint.category]);
      const row = this.addText(690, y, `${waypointLabel(waypoint)} · ${waypoint.name}`, 11, COLORS.text, 0);
      const hitZone = this.scene.add.zone(777, y, 174, 18)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.focusWaypoint(index);
          this.selectWaypoint(waypoint.id);
        });
      this.container.add(hitZone);
      this.waypointRows.push({ id: waypoint.id, text: row });
    });
    if (this.waypoints.length > 8) {
      this.addText(690, 373, `其余 ${this.waypoints.length - 8} 处可用 W/S 切换`, 10, COLORS.muted, 0);
    }
    this.selectedNameText = this.addText(672, 393, '选择地点规划步行路线', 11, COLORS.accent, 0);
    this.routeDistanceText = this.addText(672, 415, '', 11, COLORS.text, 0);
    this.routeDirectionsText = this.addText(672, 437, '', 10, COLORS.muted, 0);
    this.routeDestinationText = this.addText(672, 465, '', 10, COLORS.muted, 0);
    this.addText(122, 443, this.viewMode === 'world'
      ? `全域总图 · ${worldMap.regions.length} 个区域 · ${worldMap.data.atlasArt?.columns ?? 0}×${worldMap.data.atlasArt?.rows ?? 0} 格`
      : `${map.data.name} · 格坐标 (${this.playerCol}, ${this.playerRow})`, 11, COLORS.muted, 0);
    if (this.mapContent !== null) this.createAtlasCamera();
  }

  private toggleView(): void {
    const worldMap = this.worldMap;
    const map = this.activeMap;
    if (worldMap?.data.atlasArt === undefined || map === null) return;
    const selectedId = this.selectedWaypointId;
    this.viewMode = this.viewMode === 'world' ? 'local' : 'world';
    if (this.mapCamera !== null) this.scene.cameras.remove(this.mapCamera);
    this.mapCamera = null;
    this.mapContent?.destroy();
    this.mapContent = null;
    this.container.removeAll(true);
    this.mapImage = null;
    this.playerPin = null;
    this.atlasPlayerPin = null;
    this.atlasConnectionGraphics = null;
    this.atlasConnections = [];
    this.atlasRegionPins.length = 0;
    this.atlasLandmarkPins.length = 0;
    this.atlasOverlays = null;
    this.mapPins.length = 0;
    this.waypointRows.length = 0;
    this.selectedNameText = null;
    this.routeDistanceText = null;
    this.routeDirectionsText = null;
    this.routeDestinationText = null;
    this.routeGraphics = null;
    this.inputZone = null;
    this.render(worldMap, map.data.id, map);
    if (selectedId !== null) this.selectWaypoint(selectedId);
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
    if (this.viewMode === 'world' && this.atlasOverlays !== null) {
      for (const entry of this.atlasRegionPins) {
        const [x, y] = this.mapWorldContentPosition(entry.marker.position);
        entry.pin.setPosition(x, y);
        entry.label.setPosition(x, y - 10);
      }
      for (const entry of this.atlasLandmarkPins) {
        const [x, y] = this.mapWorldContentPosition(entry.marker.position);
        entry.pin.setPosition(x, y);
      }
      if (this.atlasOverlays.player !== null) {
        this.atlasPlayerPin?.setPosition(...this.mapWorldContentPosition(this.atlasOverlays.player));
      }
      this.drawAtlasConnections();
    } else {
      this.playerPin?.setPosition(
        this.viewportState.x - this.mapBounds.x - this.mapWidth * this.viewportState.scale / 2 + (this.playerCol + 0.5) * this.artTileSize * this.viewportState.scale,
        this.viewportState.y - this.mapBounds.y - this.mapHeight * this.viewportState.scale / 2 + (this.playerRow + 0.5) * this.artTileSize * this.viewportState.scale,
      );
      for (const { waypointId, pin } of this.mapPins) {
        const waypoint = this.waypoints.find((candidate) => candidate.id === waypointId);
        if (waypoint !== undefined) pin.setPosition(...this.waypointMapContentPosition(waypoint.position));
      }
    }
    this.drawRoute();
  }

  private drawAtlasConnections(): void {
    const graphics = this.atlasConnectionGraphics;
    if (graphics === null) return;
    graphics.clear();
    graphics.lineStyle(3, 0x384c61, 0.95);
    for (const connection of this.atlasConnections) {
      const from = this.mapWorldContentPosition(connection.from);
      const to = this.mapWorldContentPosition(connection.to);
      graphics.beginPath();
      graphics.moveTo(from[0], from[1]);
      graphics.lineTo(to[0], to[1]);
      graphics.strokePath();
    }
  }

  private selectOverviewPoint(screenX: number, screenY: number): boolean {
    const overlays = this.atlasOverlays;
    const worldMap = this.worldMap;
    if (overlays === null || worldMap === null) return false;
    const screenPosition = (point: WorldAtlasPoint): { x: number; y: number } => {
      const [x, y] = this.mapWorldContentPosition(point);
      return { x: x + this.mapBounds.x, y: y + this.mapBounds.y };
    };
    const landmark = this.atlasLandmarkPins
      .map((entry) => ({ entry, point: screenPosition(entry.marker.position) }))
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.point.x - screenX, candidate.point.y - screenY) }))
      .filter((candidate) => candidate.distance <= 14)
      .sort((left, right) => left.distance - right.distance)[0]?.entry.marker;
    if (landmark !== undefined) {
      const waypoint = this.waypoints.find((candidate) => candidate.destinationLandmarkId === landmark.id);
      if (waypoint !== undefined) this.selectWaypoint(waypoint.id);
      return true;
    }
    const region = this.atlasRegionPins
      .map((entry) => ({ entry, point: screenPosition(entry.marker.position) }))
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.point.x - screenX, candidate.point.y - screenY) }))
      .filter((candidate) => candidate.distance <= 18)
      .sort((left, right) => left.distance - right.distance)[0]?.entry.marker;
    if (region !== undefined) {
      const waypoint = this.waypoints.find((candidate) => candidate.id === `region:${region.mapResourceId}`);
      if (waypoint !== undefined) {
        this.selectWaypoint(waypoint.id);
      } else {
        this.selectedNameText?.setText(region.name);
        this.routeDistanceText?.setText(region.mapResourceId === this.activeMap?.data.id ? '你正在此区域。' : '此区域当前没有已装配的步行关口。');
        this.routeDirectionsText?.setText('');
        this.routeDestinationText?.setText('');
      }
      return true;
    }
    const endpoint = this.atlasConnections
      .flatMap((connection) => [
        { connection, position: connection.from },
        { connection, position: connection.to },
      ])
      .map((candidate) => ({ ...candidate, point: screenPosition(candidate.position) }))
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.point.x - screenX, candidate.point.y - screenY) }))
      .filter((candidate) => candidate.distance <= 14)
      .sort((left, right) => left.distance - right.distance)[0]?.connection;
    if (endpoint !== undefined) {
      const waypoint = this.waypoints.find((candidate) => candidate.id === `transition:${endpoint.id}`);
      if (waypoint !== undefined) this.selectWaypoint(waypoint.id);
      return true;
    }
    return false;
  }

  private focusWaypoint(index: number): void {
    if (this.waypoints.length === 0) return;
    this.focusedWaypointIndex = ((index % this.waypoints.length) + this.waypoints.length) % this.waypoints.length;
    const focusedId = this.waypoints[this.focusedWaypointIndex]?.id;
    for (const row of this.waypointRows) {
      const waypoint = this.waypoints.find((candidate) => candidate.id === row.id);
      if (waypoint === undefined) continue;
      const focused = row.id === focusedId;
      const selected = row.id === this.selectedWaypointId;
      row.text.setColor(focused ? COLORS.accent : COLORS.text);
      row.text.setText(`${focused ? '›' : selected ? '✓' : '·'} ${waypointLabel(waypoint)} · ${waypoint.name}`);
    }
  }

  private selectWaypoint(id: string): void {
    const waypoint = this.waypoints.find((candidate) => candidate.id === id);
    const map = this.activeMap;
    if (waypoint === undefined || map === null) return;
    const start = { col: this.playerCol, row: this.playerRow };
    const approachToGate = waypoint.kind === 'transition' ||
      waypoint.kind === 'remote-region' || waypoint.kind === 'remote-landmark';
    this.routeCells = approachToGate
      ? findGridPathToAdjacentCell(map, start, waypoint.position)
      : waypoint.approachRadius === 1
        ? findGridPathToAdjacentCell(map, start, waypoint.position)
        : findGridPath(map, start, waypoint.position, { approachRadius: waypoint.approachRadius });
    this.selectedWaypointId = id;
    this.onDestinationPicked?.(waypoint.destinationId ?? null);
    const kindLabel = waypointLabel(waypoint);
    this.selectedNameText?.setText(`${kindLabel}：${waypoint.name}`);
    if (this.routeCells === null) {
      this.routeDistanceText?.setText('当前地形没有可行路线');
      this.routeDirectionsText?.setText('请从别处重新规划。');
    } else {
      const steps = Math.max(0, this.routeCells.length - 1);
      this.routeDistanceText?.setText(waypoint.kind === 'remote-landmark' || waypoint.kind === 'remote-region'
        ? `首段步行 ${steps} 格至「${waypoint.nextTransitionName ?? '下一关口'}」旁`
        : waypoint.kind === 'transition'
          ? `步行 ${steps} 格到关口旁，按 E 通过`
          : `步行 ${steps} 格 · 至地标或最近可行停靠点`);
      this.routeDirectionsText?.setText(formatRouteDirections(this.routeCells));
    }
    if (waypoint.kind === 'remote-landmark' || waypoint.kind === 'remote-region') {
      this.routeDestinationText?.setText(`行程：${waypoint.regionRouteNames?.join(' → ') ?? waypoint.destinationRegionName ?? ''}`);
    } else {
      this.routeDestinationText?.setText(waypoint.destinationRegionName === undefined
        ? '' : `抵达后通往：${waypoint.destinationRegionName}`);
    }
    const selectedIndex = this.waypoints.findIndex((candidate) => candidate.id === id);
    if (selectedIndex >= 0) this.focusWaypoint(selectedIndex);
    for (const { waypointId, pin } of this.mapPins) pin.setScale(waypointId === id ? 1.4 : 1);
    for (const { marker, pin } of this.atlasRegionPins) pin.setScale(id === `region:${marker.mapResourceId}` ? 1.5 : 1);
    for (const { marker, pin } of this.atlasLandmarkPins) {
      pin.setScale(waypoint.destinationLandmarkId === marker.id ? 1.5 : 1);
    }
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
    const first = this.routeMapContentPosition(path[0]!);
    graphics.moveTo(first[0], first[1]);
    for (const cell of path.slice(1)) {
      const point = this.routeMapContentPosition(cell);
      graphics.lineTo(point[0], point[1]);
    }
    graphics.strokePath();
  }

  private routeMapContentPosition(position: CellPosition): [number, number] {
    const worldMap = this.worldMap;
    const map = this.activeMap;
    if (this.viewMode === 'world' && worldMap?.data.atlasArt !== undefined && map !== null) {
      const region = worldMap.regions.find(({ mapResourceId }) => mapResourceId === map.data.id);
      if (region !== undefined) {
        const point = projectWorldCell(position, map, region.atlasPosition, worldMap.data.atlasArt);
        return this.mapWorldContentPosition(point);
      }
    }
    return this.waypointMapContentPosition(position);
  }

  private mapWorldContentPosition(position: WorldAtlasPoint): [number, number] {
    return [
      this.viewportState.x - this.mapBounds.x - this.mapWidth * this.viewportState.scale / 2 + position.x * this.viewportState.scale,
      this.viewportState.y - this.mapBounds.y - this.mapHeight * this.viewportState.scale / 2 + position.y * this.viewportState.scale,
    ];
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

  /** Phaser scales Pointer.x with the FIT canvas but leaves Pointer.y in CSS pixels here. */
  private panelPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const canvas = this.scene.game.canvas;
    return normalizeWorldMapPointer(pointer, canvas.height, canvas.clientHeight);
  }

  private addLegendSwatch(x: number, y: number, color: number): void {
    const swatch = this.scene.add.circle(x, y, 4, color).setStrokeStyle(1, 0x16202a).setScrollFactor(0);
    this.container.add(swatch);
  }

  private addText(x: number, y: number, text: string, size: number, color: string, originX: number, wrapWidth = 175): Phaser.GameObjects.Text {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width: wrapWidth, useAdvancedWrap: true },
    }).setOrigin(originX, 0.5).setScrollFactor(0);
    this.container.add(object);
    return object;
  }
}

function waypointLabel(waypoint: WorldMapWaypoint): string {
  if (waypoint.destinationId?.startsWith(QUEST_NAVIGATION_ID_PREFIX)) return '差事';
  if (waypoint.kind === 'transition') return '关口';
  if (waypoint.kind === 'remote-region') return '区域';
  if (waypoint.kind === 'remote-landmark') return '远方';
  return '地点';
}

function formatRouteDirections(path: readonly CellPosition[]): string {
  const labels = { north: '北', east: '东', south: '南', west: '西' } as const;
  const runs = summarizePathRuns(path);
  if (runs.length === 0) return '已经抵达目的地附近。';
  const visible = runs.slice(0, 5).map((run) => `${labels[run.direction]}${run.steps}`);
  if (runs.length > visible.length) visible.push('…');
  return `方向：${visible.join(' → ')}`;
}
