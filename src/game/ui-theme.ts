import Phaser from 'phaser';

/** Shared, content-agnostic palette for the original handheld-inspired UI. */
export const UI_FONT_FAMILY = '"Courier New", "Microsoft YaHei", monospace';

export const UI_PALETTE = {
  backdrop: 0x070a0f,
  shadow: 0x030507,
  frame: 0x7d6338,
  frameLight: 0xc5a25e,
  panel: 0x111720,
  inset: 0x202b36,
  selected: 0xc39b4d,
  text: '#d8dee9',
  muted: '#929cab',
  accent: '#f0c96a',
  jade: '#a8d8b0',
} as const;

export interface PixelPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draws the shared stepped frame behind an existing overlay panel. */
export function addPixelPanelChrome(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  bounds: PixelPanelBounds,
  overlayAlpha?: number,
): void {
  const { x, y, width, height } = bounds;
  const parts: Phaser.GameObjects.GameObject[] = [];

  if (overlayAlpha !== undefined) {
    const overlay = scene.add.rectangle(
      scene.scale.width / 2,
      scene.scale.height / 2,
      scene.scale.width,
      scene.scale.height,
      UI_PALETTE.backdrop,
      overlayAlpha,
    );
    parts.push(overlay);
  }

  const shadow = scene.add.rectangle(x + width / 2 + 4, y + height / 2 + 4, width, height, UI_PALETTE.shadow);
  const outer = scene.add.rectangle(x + width / 2, y + height / 2, width, height, UI_PALETTE.frame);
  outer.setStrokeStyle(1, UI_PALETTE.frameLight, 0.9);
  const body = scene.add.rectangle(
    x + width / 2,
    y + height / 2,
    Math.max(1, width - 6),
    Math.max(1, height - 6),
    UI_PALETTE.panel,
  );
  body.setStrokeStyle(1, UI_PALETTE.inset, 1);

  const corner = 6;
  const inset = 4;
  const corners = [
    scene.add.rectangle(x + inset + corner / 2, y + inset + 1, corner, 2, UI_PALETTE.frameLight),
    scene.add.rectangle(x + inset + 1, y + inset + corner / 2, 2, corner, UI_PALETTE.frameLight),
    scene.add.rectangle(x + width - inset - corner / 2, y + height - inset - 1, corner, 2, UI_PALETTE.frame),
    scene.add.rectangle(x + width - inset - 1, y + height - inset - corner / 2, 2, corner, UI_PALETTE.frame),
  ];
  parts.push(shadow, outer, body, ...corners);
  container.add(parts);
}

/** Adds a non-color-only focus band before the selected row's text. */
export function addPixelSelection(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  bounds: PixelPanelBounds,
): void {
  const { x, y, width, height } = bounds;
  const wash = scene.add.rectangle(x + width / 2, y + height / 2, width, height, UI_PALETTE.selected, 0.12);
  const rail = scene.add.rectangle(x + 2, y + height / 2, 3, height, UI_PALETTE.frameLight);
  const top = scene.add.rectangle(x + width / 2, y, width, 1, UI_PALETTE.frameLight, 0.65);
  const bottom = scene.add.rectangle(x + width / 2, y + height, width, 1, UI_PALETTE.frame, 0.9);
  container.add([wash, rail, top, bottom]);
}

/** Procedural low-resolution person marker shared by the player and NPCs. */
export function createPixelPerson(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileSize: number,
  robe: number,
  outline = 0x18202a,
): Phaser.GameObjects.Container {
  const person = scene.add.container(x, y);
  const px = Math.max(2, Math.round(tileSize / 8));
  const skin = 0xe2b788;
  const hair = 0x292630;
  const addPart = (dx: number, dy: number, w: number, h: number, color: number): void => {
    person.add(scene.add.rectangle(dx, dy, w, h, color));
  };

  addPart(0, Math.round(px * 3.5), px * 5, px * 2, outline); // feet shadow
  addPart(0, Math.round(px * 1.5), px * 5, px * 4, robe); // robe
  addPart(0, -Math.round(px * 2), px * 3, px * 3, skin); // face
  addPart(0, -Math.round(px * 3.5), px * 4, px * 2, hair); // hair
  addPart(-Math.round(px * 2.5), Math.round(px * 1), px, px * 3, outline);
  addPart(Math.round(px * 2.5), Math.round(px * 1), px, px * 3, outline);
  addPart(0, Math.round(px * 4.5), px * 5, px, UI_PALETTE.shadow); // hem
  return person;
}
