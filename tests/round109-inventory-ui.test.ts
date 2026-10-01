import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';

vi.mock('phaser', () => ({
  default: { Input: { Keyboard: { KeyCodes: { UP: 1, W: 2, DOWN: 3, S: 4, ENTER: 5, ESC: 6, SPACE: 7 } } } },
}));

/** Records every panel frame and selection rectangle for geometry asserts. */
const panelBounds: { x: number; y: number; width: number; height: number }[] = [];
const selectionBounds: { x: number; y: number; width: number; height: number }[] = [];
vi.mock('../src/game/ui-theme', () => ({
  UI_FONT_FAMILY: 'monospace',
  addPixelPanelChrome: (_scene: unknown, _container: unknown, bounds: { x: number; y: number; width: number; height: number }) => {
    panelBounds.push({ ...bounds });
  },
  addPixelSelection: (_scene: unknown, _container: unknown, bounds: { x: number; y: number; width: number; height: number }) => {
    selectionBounds.push({ ...bounds });
  },
}));

let scale = 1;
vi.mock('../src/game/settings', () => ({ uiFontSize: (n: number) => `${Math.round(n * scale)}px` }));

import { InventoryPanel } from '../src/game/inventory-ui';
import {
  createCharacterState,
  type CharacterProfileData,
} from '../src/engine/character-progression';
import type { InventoryState, ItemRecordData } from '../src/engine/item-system';

// The dialogue-layout module, the item engine and the progression engine run
// for real: these tests cover measured wrapping, pagination and engine rules.

type MockText = {
  text: string;
  x: number;
  y: number;
  size: number;
  destroyed: boolean;
  originX: number;
  originY: number;
  context: { measureText: (value: string) => { width: number } };
  setOrigin: (ox?: number, oy?: number) => MockText;
  setText: (value: string) => MockText;
};

const UP = 1;
const DOWN = 3;
const ENTER = 5;
const ESC = 6;
const SPACE = 7;

const LONG_DESC =
  '残页·内功总纲：此页自前朝武库废墟的灰烬里重见天日，纸色焦黄，边角残缺，字迹却仍可辨认。📖 首行录有调息口诀，中段绘图标注经脉走向，末页盖有半枚朱印「藏锋」。🗡️🍃 据传集齐同源三页，可在铸台合订为完整总纲。🀄 前朝武库当年一夜焚尽，此页为何独存，江湖众说纷纭：有人说是守库人拼死抢出，有人说是天火择纸而燃。\n另一段持有者手记：夜半诵读时，隐约可闻远处钟声，与页边小注「闻钟而止」四字遥相呼应。👨‍👩‍👧 同门曾以三锭银子求观一眼而不可得，个中关联，尚待查证。\n再补：藏书人于扉页夹层发现半幅舆图，朱线蜿蜒，标注七处渡口与三座废驿。🗺️ 前朝驿道以钟声为令，一响开闸、二响换马、三响闭渡，页边小注正指此制。后人沿图寻访，只在第三座废驿的墙缝里摸到一枚锈钟舌，摇之无声，恰应止字。🔎 此页以桑皮纸裁成，帘纹粗疏，边角有火燎痕迹却不透背，纸质与前朝官库藏本同源，私坊仿造不出。';

function makeItem(
  overrides: Partial<ItemRecordData> & Pick<ItemRecordData, 'id' | 'name' | 'description' | 'category'>,
): ItemRecordData {
  return { stackLimit: 9, buyPrice: 10, sellPrice: 5, consumable: null, equipment: null, ...overrides };
}

const BASE_ITEMS: ItemRecordData[] = [
  makeItem({ id: 'item.scroll', name: '残页·内功总纲', description: LONG_DESC, category: 'misc' }),
  makeItem({
    id: 'item.blade',
    name: '玄铁重剑',
    description: '剑脊沉厚，开锋内敛。',
    category: 'equipment',
    equipment: { slot: 'weapon', attributeBonuses: { body: 2 }, healthBonus: 10, qiBonus: 0 },
  }),
  makeItem({
    id: 'item.salve',
    name: '生肌散',
    description: '外敷伤药，止血生肌。',
    category: 'consumable',
    consumable: { healthRestore: 30, qiRestore: 20 },
  }),
];

function makeProfile(): CharacterProfileData {
  return {
    id: 'test.profile',
    name: '测试角色',
    description: '测试档案',
    attributeLabels: { body: '膂力', force: '根骨', agility: '身法', insight: '洞悉', resolve: '定力' },
    attributes: { body: 12, force: 11, agility: 10, insight: 9, resolve: 8 },
    startingLevel: 3,
    startingExperience: 0,
    maxLevel: 30,
    attributeCap: 99,
    progression: { baseExperience: 20, experiencePerLevel: 30 },
    growth: { body: 1, force: 1, agility: 1, insight: 1, resolve: 1 },
    derivedStats: {
      health: { base: 80, perLevel: 10, attributeWeights: { body: 2 } },
      qi: { base: 40, perLevel: 5, attributeWeights: { resolve: 2, insight: 1 } },
    },
    startingMartialArtIds: [],
    startingCurrency: 120,
    inventoryCapacity: 16,
    startingItems: [],
  };
}

interface SetupOptions {
  width?: number;
  height?: number;
  fontScale?: number;
  items?: ItemRecordData[];
  stacks?: [string, number][];
  healthGap?: number;
}

function setup(options: SetupOptions = {}) {
  const { width = 960, height = 540, fontScale = 1, items = BASE_ITEMS, stacks = [
    ['item.scroll', 1],
    ['item.blade', 1],
    ['item.salve', 2],
  ], healthGap = 0 } = options;
  scale = fontScale;
  panelBounds.length = 0;
  selectionBounds.length = 0;

  const keys = new Map<number, Set<() => void>>();
  const shown: MockText[] = [];
  const container = {
    setVisible() { return this; },
    setDepth() { return this; },
    add() { return this; },
    removeAll() { for (const t of shown) t.destroyed = true; return this; },
    destroy() {},
  };
  const scene = {
    scale: { width, height },
    input: {
      keyboard: {
        addKey(code: number) {
          if (!keys.has(code)) keys.set(code, new Set());
          return {
            on: (_event: string, fn: () => void) => { keys.get(code)!.add(fn); },
            off: (_event: string, fn: () => void) => { keys.get(code)!.delete(fn); },
          };
        },
      },
    },
    add: {
      container: () => container,
      text: (x: number, y: number, text: string, style: { fontSize: string }) => {
        const size = Number.parseInt(style.fontSize, 10);
        const t: MockText = {
          text, x, y, size, destroyed: false, originX: 0, originY: 0,
          context: { measureText: (value: string) => ({ width: Array.from(value).length * size }) },
          setOrigin(ox = 0, oy = 0) { this.originX = ox; this.originY = oy; return this; },
          setText(value: string) { this.text = value; return this; },
        };
        shown.push(t);
        return t;
      },
    },
  } as unknown as Phaser.Scene;

  const profile = makeProfile();
  const character = createCharacterState(profile);
  if (healthGap > 0) {
    character.health.current = Math.max(1, character.health.max - healthGap);
    character.qi.current = Math.max(1, character.qi.max - healthGap);
  }
  const inventory: InventoryState = {
    currency: 120,
    capacity: 16,
    stacks: stacks.map(([itemId, quantity]) => ({ itemId, quantity })),
    equipped: {},
  };

  let closed = 0;
  let changes = 0;
  const actions: { type: string; itemId: string }[] = [];
  const panel = new InventoryPanel(scene, {
    onClose: () => { closed += 1; },
    onChange: () => { changes += 1; },
    onAction: (action) => { actions.push(action); },
  });
  panel.open({
    profile,
    character,
    inventory,
    items: new Map(items.map((item) => [item.id, item])),
  });

  return {
    panel,
    character,
    inventory,
    actions,
    changes: () => changes,
    closed: () => closed,
    boundHandlers: () => [...keys.values()].reduce((total, set) => total + set.size, 0),
    press: (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); },
    visible: () => shown.filter((t) => !t.destroyed),
    frame: () => panelBounds[panelBounds.length - 1]!,
    selection: () => selectionBounds[selectionBounds.length - 1],
  };
}

/** The rendered page of the long description: the only text whose content is
 *  a contiguous run of the description itself (names are unique to rows). */
function detailOf(result: ReturnType<typeof setup>, description: string): MockText | undefined {
  const flat = description.replace(/\n/g, '');
  return result.visible().find((t) => {
    const candidate = t.text.split('\n').join('');
    return candidate.length > 0 && flat.includes(candidate);
  });
}

/** Parses the "说明 p/n · Space 续读" hint, null when single-paged. */
function pageHint(result: ReturnType<typeof setup>): { page: number; count: number } | null {
  for (const t of result.visible()) {
    const match = /^说明 (\d+)\/(\d+)/.exec(t.text);
    if (match !== null) {
      return { page: Number(match[1]), count: Number(match[2]) };
    }
  }
  return null;
}

/** Every visible text must sit inside the frame at its own origin. */
function assertInsidePanel(
  panel: { x: number; y: number; width: number; height: number },
  texts: readonly MockText[],
): void {
  for (const t of texts) {
    if (t.text.trim() === '') {
      continue; // Empty measuring probes paint nothing anywhere.
    }
    const lines = t.text.split('\n');
    const width = Math.max(0, ...lines.map((line) => Array.from(line).length * t.size));
    const boxHeight = lines.length * (t.size + 3);
    const left = t.originX === 1 ? t.x - width : t.x;
    const right = t.originX === 1 ? t.x : t.x + width;
    const top = t.originY === 1 ? t.y - boxHeight : t.y;
    expect(left, `left edge of "${lines[0]}"`).toBeGreaterThanOrEqual(panel.x + 3);
    expect(right, `right edge of "${lines[0]}"`).toBeLessThanOrEqual(panel.x + panel.width - 3);
    expect(top, `top edge of "${lines[0]}"`).toBeGreaterThanOrEqual(panel.y + 2);
    expect(top + boxHeight, `bottom edge of "${lines[0]}"`).toBeLessThanOrEqual(panel.y + panel.height + 2);
  }
}

describe('Round109 inventory panel: measured description reading and adaptive geometry', () => {
  it('pages a long Chinese+emoji description with Space, losing no graphemes and never crossing the right border', () => {
    const result = setup();
    const panel = result.frame();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(960);
    expect(panel.y + panel.height).toBeLessThanOrEqual(540);

    const pages: string[] = [];
    let guard = 0;
    do {
      const detail = detailOf(result, LONG_DESC);
      expect(detail, 'current description page renders').toBeDefined();
      for (const line of detail!.text.split('\n')) {
        // Measured grapheme wrap: every line fits the content width.
        expect(detail!.x + Array.from(line).length * detail!.size, `line width "${line}"`).toBeLessThanOrEqual(panel.x + panel.width - 4);
      }
      pages.push(detail!.text);
      const hint = pageHint(result);
      expect(hint, 'multi-page description shows a page hint').not.toBeNull();
      expect(hint!.page).toBe(pages.length);
      result.press(SPACE);
    } while (pageHint(result)!.page !== 1 && ++guard < 80);

    const count = pageHint(result)!.count;
    expect(count).toBeGreaterThan(1);
    expect(pages.length).toBe(count);
    // Full reading: stripping the display line breaks and concatenating the
    // pages in order restores the description code-point for code-point —
    // surrogate-pair and ZWJ emoji stay whole because wrapping is grapheme-based.
    expect(pages.map((page) => page.split('\n').join('')).join('')).toBe(LONG_DESC.split('\n').join(''));
    result.panel.destroy();
  });

  it('Space is pure reading: no item, vital, callback or close state changes', () => {
    const result = setup({ healthGap: 30 });
    const stacksBefore = JSON.stringify(result.inventory.stacks);
    const equippedBefore = JSON.stringify(result.inventory.equipped);
    const healthBefore = result.character.health.current;
    const qiBefore = result.character.qi.current;
    for (let index = 0; index < 12; index += 1) {
      result.press(SPACE);
    }
    expect(JSON.stringify(result.inventory.stacks)).toBe(stacksBefore);
    expect(JSON.stringify(result.inventory.equipped)).toBe(equippedBefore);
    expect(result.character.health.current).toBe(healthBefore);
    expect(result.character.qi.current).toBe(qiBefore);
    expect(result.actions).toEqual([]);
    expect(result.changes()).toBe(0);
    expect(result.closed()).toBe(0);
    expect(result.panel.isOpen).toBe(true);
    result.panel.destroy();
  });

  it('moving the selection resets the description to its first page', () => {
    const secondDesc = `${LONG_DESC}又及：第二卷残页的持有者在渡口失踪，遗物清单上只有一枚干涸的墨锭。🖋️`;
    const result = setup({
      items: [
        makeItem({ id: 'item.scroll', name: '残页·内功总纲', description: LONG_DESC, category: 'misc' }),
        makeItem({ id: 'item.scroll2', name: '残页·渡口遗恨', description: secondDesc, category: 'misc' }),
      ],
      stacks: [['item.scroll', 1], ['item.scroll2', 1]],
    });
    expect(pageHint(result)!.page).toBe(1);
    expect(pageHint(result)!.count).toBeGreaterThanOrEqual(3);
    result.press(SPACE);
    result.press(SPACE);
    expect(pageHint(result)!.page).toBe(3);
    result.press(DOWN);
    expect(pageHint(result)!.page).toBe(1); // New stack: fresh first page.
    result.press(SPACE);
    expect(pageHint(result)!.page).toBe(2);
    result.press(UP);
    expect(pageHint(result)!.page).toBe(1); // Back on the first stack: reset, not page 3.
    result.panel.destroy();
  });

  it('Enter keeps its exact engine semantics — use, equip, unequip and misc refuse — even after paging', () => {
    const result = setup({ healthGap: 30 });
    // Equipment (row 1): equip once, then unequip; only the equip signals onAction.
    result.press(DOWN);
    result.press(ENTER);
    expect(result.inventory.equipped.weapon).toBe('item.blade');
    expect(result.actions).toEqual([{ type: 'item-equipped', itemId: 'item.blade' }]);
    expect(result.changes()).toBe(1);
    result.press(ENTER);
    expect(result.inventory.equipped.weapon).toBeUndefined();
    expect(result.actions).toHaveLength(1);
    expect(result.changes()).toBe(2);

    // Consumable (row 2): paging first must not blunt Enter — one unit goes,
    // vitals rise by exactly the data-declared amounts and callbacks fire.
    result.press(DOWN);
    for (let index = 0; index < 5; index += 1) {
      result.press(SPACE);
    }
    const salveBefore = result.inventory.stacks.find((stack) => stack.itemId === 'item.salve')!.quantity;
    const healthBefore = result.character.health.current;
    const qiBefore = result.character.qi.current;
    result.press(ENTER);
    expect(result.inventory.stacks.find((stack) => stack.itemId === 'item.salve')!.quantity).toBe(salveBefore - 1);
    expect(result.character.health.current).toBe(healthBefore + 30);
    expect(result.character.qi.current).toBe(qiBefore + 20);
    expect(result.actions).toContainEqual({ type: 'item-used', itemId: 'item.salve' });
    expect(result.changes()).toBe(3);

    // Misc (row 0 via wrap-around): refused with the status line, nothing else changes.
    result.press(DOWN);
    const actionsBefore = result.actions.length;
    const changesBefore = result.changes();
    result.press(ENTER);
    expect(result.actions).toHaveLength(actionsBefore);
    expect(result.changes()).toBe(changesBefore);
    expect(result.visible().some((t) => t.text.includes('此物此刻用不上'))).toBe(true);
    result.panel.destroy();
  });

  it('default 960×540 geometry keeps every row, selection band and footer inside the panel', () => {
    const longRowItem = makeItem({
      id: 'item.longrow',
      name: '沼琥珀印',
      description: '湿地深处凝结的琥珀印。🍃',
      category: 'equipment',
      equipment: { slot: 'ornament', attributeBonuses: { resolve: 2, insight: 2 }, healthBonus: 12, qiBonus: 16 },
    });
    const items = [...BASE_ITEMS, longRowItem];
    // Nine distinct stacks: the window shows at most eight plus the "more" note.
    const stacks: [string, number][] = [
      ['item.scroll', 1],
      ['item.longrow', 2],
      ['item.blade', 1],
      ['item.salve', 2],
    ];
    for (let index = 0; index < 5; index += 1) {
      items.push(makeItem({ id: `item.filler${index}`, name: `行囊杂记·${index + 1}`, description: `杂记第${index + 1}页。`, category: 'misc' }));
      stacks.push([`item.filler${index}`, 1]);
    }

    const result = setup({ items, stacks });
    const panel = result.frame();
    const visible = result.visible();
    assertInsidePanel(panel, visible);

    // The long equipment row degrades instead of crossing the border,
    // keeping the name and count readable.
    const longRow = visible.find((t) => t.text.includes('沼琥珀印'));
    expect(longRow, 'long equipment row renders').toBeDefined();
    expect(longRow!.text).toContain('×2');
    expect(longRow!.x + Array.from(longRow!.text).length * longRow!.size).toBeLessThanOrEqual(panel.x + panel.width - 4);

    // Selection band sits inside the frame with the scaled row height.
    const band = result.selection();
    expect(band).toBeDefined();
    expect(band!.x).toBeGreaterThanOrEqual(panel.x);
    expect(band!.y).toBeGreaterThanOrEqual(panel.y);
    expect(band!.x + band!.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(band!.y + band!.height).toBeLessThanOrEqual(panel.y + panel.height);
    expect(band!.height).toBe(26);
    expect(band!.width).toBe(panel.width - 48);

    // Nine stacks overflow one window: the "more" note shows, still inside.
    expect(visible.some((t) => t.text.includes('其余堆数未显示'))).toBe(true);
    result.panel.destroy();
  });

  it('640×360 at the 1.5 font scale still fits everything and keeps one row plus one description line', () => {
    const result = setup({ width: 640, height: 360, fontScale: 1.5 });
    const panel = result.frame();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(640);
    expect(panel.y + panel.height).toBeLessThanOrEqual(360);
    assertInsidePanel(panel, result.visible());

    const band = result.selection();
    expect(band, 'at least one list row renders').toBeDefined();
    expect(band!.y + band!.height).toBeLessThanOrEqual(panel.y + panel.height);
    expect(detailOf(result, LONG_DESC), 'description first page renders').toBeDefined();
    expect(result.visible().some((t) => t.text.includes('Esc 关闭')), 'footer hint renders').toBe(true);
    result.panel.destroy();
  });

  it('every stack beyond the visible window stays reachable by scrolling and wrap-around', () => {
    const items: ItemRecordData[] = [];
    const stacks: [string, number][] = [];
    const names: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const id = `item.sundry${index}`;
      items.push(makeItem({ id, name: `行囊杂货·${index + 1}`, description: `第${index + 1}件杂物。`, category: 'misc' }));
      stacks.push([id, 1]);
      names.push(`行囊杂货·${index + 1}`);
    }
    const result = setup({ items, stacks });
    const seen: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      const active = result.visible().find((t) => t.text.startsWith('▸ '));
      expect(active, `selected row ${step} renders`).toBeDefined();
      seen.push(active!.text);
      result.press(DOWN);
    }
    // All twelve stacks were selected and shown exactly once around the ring.
    for (const name of names) {
      expect(seen.some((line) => line.includes(name)), `stack ${name} was reached`).toBe(true);
    }
    expect(seen).toHaveLength(12);
    // Wrap-around: from the first row, Up lands on the twelfth stack.
    result.press(UP);
    const wrapped = result.visible().find((t) => t.text.startsWith('▸ '));
    expect(wrapped!.text).toContain('行囊杂货·12');
    result.panel.destroy();
  });

  it('close and destroy release every key binding; later presses do nothing', () => {
    const result = setup();
    expect(result.boundHandlers()).toBeGreaterThan(0);
    result.press(ESC);
    expect(result.closed()).toBe(1);
    expect(result.boundHandlers()).toBe(0);
    const textsAfterClose = result.visible().length;
    result.press(UP);
    result.press(DOWN);
    result.press(ENTER);
    result.press(SPACE);
    result.press(ESC);
    expect(result.closed()).toBe(1);
    expect(result.actions).toEqual([]);
    expect(result.changes()).toBe(0);
    expect(result.visible()).toHaveLength(textsAfterClose);

    // Reopening rebinds; destroy unbinds again without a second close signal.
    result.panel.open({
      profile: makeProfile(),
      character: result.character,
      inventory: result.inventory,
      items: new Map(BASE_ITEMS.map((item) => [item.id, item])),
    });
    expect(result.boundHandlers()).toBeGreaterThan(0);
    result.panel.destroy();
    expect(result.boundHandlers()).toBe(0);
    expect(result.closed()).toBe(2);
  });
});
