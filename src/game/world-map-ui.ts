import Phaser from 'phaser';

import { type GridMap } from '../engine/grid-map';
import { clampMapViewport, createMapViewport, panMapViewport, zoomMapViewport, type MapViewportBounds, type MapViewportState } from '../engine/map-viewport';
import { gridMapArtTextureKey } from '../engine/grid-map-renderer';
import type { WorldLandmarkData, WorldMapAssembly } from '../engine/world-map';
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
  private readonly landmarkPins: { data: WorldLandmarkData; pin: Phaser.GameObjects.Arc }[] = [];
  private inputZone: Phaser.GameObjects.Zone | null = null;
  private viewportState: MapViewportState = { x: 0, y: 0, scale: 1 };
  private mapWidth = 0;
  private mapHeight = 0;
  private artTileSize = 16;
  private baseScale = 1;
  private playerCol = 0;
  private playerRow = 0;
  private draggingPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private readonly pointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.draggingPointerId === null || pointer.id !== this.draggingPointerId) return;
    this.viewportState = panMapViewport(
      this.mapBounds, this.mapWidth, this.mapHeight, this.viewportState,
      pointer.x - this.lastPointerX, pointer.y - this.lastPointerY,
    );
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    this.updateMapPosition();
  };

  private readonly pointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.draggingPointerId) this.draggingPointerId = null;
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
    this.landmarkPins.length = 0;
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
      const landmarks = worldMap.landmarks.filter((landmark) => landmark.mapResourceId === currentMapResourceId);
      for (const landmark of landmarks) {
        const pin = this.scene.add.circle(0, 0, 4.5, COLORS[landmark.category])
          .setStrokeStyle(2, 0x16202a);
        this.landmarkPins.push({ data: landmark, pin });
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
    const landmarks = worldMap.landmarks.filter((landmark) => landmark.mapResourceId === currentMapResourceId);
    this.addText(672, 203, `本区地标 ${landmarks.length} 处`, 12, COLORS.text, 0);
    landmarks.slice(0, 5).forEach((landmark, index) => {
      const y = 224 + index * 19;
      this.addLegendSwatch(678, y, COLORS[landmark.category]);
      this.addText(690, y, `${landmark.name}  (${landmark.col},${landmark.row})`, 11, COLORS.text, 0);
    });
    if (landmarks.length > 5) this.addText(690, 320, `另有 ${landmarks.length - 5} 处`, 10, COLORS.muted, 0);
    const transitionNames = worldMap.transitions
      .filter((transition) => transition.from.mapResourceId === currentMapResourceId)
      .map((transition) => transition.name);
    this.addText(672, 342, `可行关口 ${transitionNames.length} 处`, 12, COLORS.text, 0);
    transitionNames.slice(0, 3).forEach((name, index) => this.addText(672, 363 + index * 18, `· ${name}`, 11, COLORS.muted, 0));
    const otherRegions = worldMap.regions.filter((region) => region.mapResourceId !== currentMapResourceId);
    this.addText(672, 421, `其他区域 ${otherRegions.length} 处`, 11, COLORS.text, 0);
    otherRegions.slice(0, 2).forEach((region, index) => {
      this.addText(672, 440 + index * 16, `· ${region.name}`, 10, COLORS.muted, 0);
    });
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
    for (const { data, pin } of this.landmarkPins) {
      pin.setPosition(
        this.viewportState.x - this.mapBounds.x - this.mapWidth * this.viewportState.scale / 2 + (data.col + 0.5) * this.artTileSize * this.viewportState.scale,
        this.viewportState.y - this.mapBounds.y - this.mapHeight * this.viewportState.scale / 2 + (data.row + 0.5) * this.artTileSize * this.viewportState.scale,
      );
    }
  }

  private addLegendSwatch(x: number, y: number, color: number): void {
    const swatch = this.scene.add.circle(x, y, 4, color).setStrokeStyle(1, 0x16202a).setScrollFactor(0);
    this.container.add(swatch);
  }

  private addText(x: number, y: number, text: string, size: number, color: string, originX: number): void {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width: 175 },
    }).setOrigin(originX, 0.5).setScrollFactor(0);
    this.container.add(object);
  }
}
