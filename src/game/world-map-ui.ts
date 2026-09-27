import Phaser from 'phaser';

import type { WorldMapAssembly } from '../engine/world-map';
import { uiFontSize } from './settings';

const WIDTH = 960;
const HEIGHT = 540;
const COLORS = {
  overlay: 0x05070b,
  panel: 0x10141d,
  stroke: 0x53627b,
  text: '#d8dee9',
  muted: '#8a94a6',
  accent: '#e8b04b',
  line: 0x53627b,
} as const;

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Read-only, input-owning atlas overlay; all place names and links come from data. */
export class WorldMapPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private openState = false;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1100);
  }

  get isOpen(): boolean { return this.openState; }

  open(worldMap: WorldMapAssembly, currentMapResourceId: string): void {
    if (this.openState) return;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render(worldMap, currentMapResourceId);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
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
    for (const code of [codes.ESC, codes.M]) {
      const key = keyboard.addKey(code);
      const handler = (): void => this.close();
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private render(worldMap: WorldMapAssembly, currentMapResourceId: string): void {
    this.container.add(this.scene.add.rectangle(0, 0, WIDTH, HEIGHT, COLORS.overlay, 0.84).setOrigin(0));
    this.container.add(
      this.scene.add.rectangle(WIDTH / 2, HEIGHT / 2, 780, 450, COLORS.panel).setStrokeStyle(2, COLORS.stroke),
    );
    this.addText(WIDTH / 2, 62, '江湖舆图', 20, COLORS.text, 0.5);
    this.addText(WIDTH / 2, 91, '各处行路相连 · 按 M 或 Esc 收起', 12, COLORS.muted, 0.5);

    const left = 130;
    const top = 135;
    const atlasWidth = 700;
    const atlasHeight = 245;
    const toPoint = (x: number, y: number) => ({
      x: left + atlasWidth * x / 100,
      y: top + atlasHeight * y / 100,
    });
    const regionIds = new Set(worldMap.regions.map((region) => region.mapResourceId));
    const pairs = new Set<string>();
    const lines = this.scene.add.graphics();
    lines.lineStyle(3, COLORS.line, 0.9);
    for (const transition of worldMap.transitions) {
      const from = transition.from.mapResourceId;
      const to = transition.to.mapResourceId;
      if (!regionIds.has(from) || !regionIds.has(to)) continue;
      const pair = [from, to].sort().join('|');
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      const source = worldMap.regions.find((region) => region.mapResourceId === from);
      const destination = worldMap.regions.find((region) => region.mapResourceId === to);
      if (source === undefined || destination === undefined) continue;
      const a = toPoint(source.atlasPosition.x, source.atlasPosition.y);
      const b = toPoint(destination.atlasPosition.x, destination.atlasPosition.y);
      lines.lineBetween(a.x, a.y, b.x, b.y);
    }
    this.container.add(lines);

    for (const region of worldMap.regions) {
      const point = toPoint(region.atlasPosition.x, region.atlasPosition.y);
      const isCurrent = region.mapResourceId === currentMapResourceId;
      const node = this.scene.add.circle(point.x, point.y, isCurrent ? 17 : 13, isCurrent ? 0x855f22 : 0x303b4c);
      node.setStrokeStyle(isCurrent ? 3 : 2, isCurrent ? 0xe8b04b : COLORS.stroke);
      this.container.add(node);
      this.addText(point.x, point.y - 30, region.name, 13, isCurrent ? COLORS.accent : COLORS.text, 0.5);
      if (isCurrent) this.addText(point.x, point.y + 25, '当前位置', 10, COLORS.accent, 0.5);
    }

    const current = worldMap.regions.find((region) => region.mapResourceId === currentMapResourceId);
    if (current !== undefined) {
      this.addText(52, 405, current.description, 13, COLORS.muted, 0);
    }
    const links = worldMap.transitions.length;
    this.addText(52, 440, `区域 ${worldMap.regions.length} 处 · 已登记关口 ${links} 处`, 11, COLORS.muted, 0);
  }

  private addText(x: number, y: number, text: string, size: number, color: string, originX: number): void {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: 'sans-serif', fontSize: uiFontSize(size), color,
      wordWrap: { width: 680 },
    }).setOrigin(originX, 0.5);
    this.container.add(object);
  }
}
