/**
 * Round 121（纠正版）: 师门档案线性全文分页 + 存读行有界分页 —— 纯层与 UI 层回归。
 *
 * 纠正点：faction 面板不再借行列表几何（那会预留 6 个未用行、身体塌缩到
 * 1–2 行、长 MOD 身份被截断）——专用线性几何只固定标题与一句机械说明，
 * 身份/行声与全部门派 blocks 进同一分页正文。存读行获得真实视口预算：
 * 自然堆叠放得下时保持自然行高（无空白带），溢出时每标签按均分份额无损
 * 分页（整行进页、零截断），选中槽 PgUp/PgDown 读页、换槽/换页重置，
 * Enter/选择/存储/删除语义不变，翻页绝不触发存读删。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { parseFactionSet } from '../src/engine/character-progression';
import { createSocialState } from '../src/engine/social-state';
import { buildDossierGeometry, buildFactionBlock, factionAdmissionSummary, paginateFactionDossier } from '../src/game/faction-panel-layout';
import { layoutSaveSlotRows } from '../src/game/save-slot-layout';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const factionParse = parseFactionSet(read('data/base/factions/round-04-factions.json'));
if (!factionParse.ok) throw Error(factionParse.errors.join('\n'));
const factions = new Map(factionParse.set.factions.map(faction => [faction.id, faction]));
const measure = (text: string, px = 12): number => Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

describe('Round121(c) linear faction dossier geometry and blocks (real round-04 data)', () => {
  it('every faction block carries the full data-driven conditions and penalties', () => {
    for (const faction of factionParse.set.factions) {
      const block = buildFactionBlock({
        faction, isCurrent: faction === factionParse.set.factions[0], mentorLabels: faction.mentorNpcIds.map(id => `${id}（江南）`), renown: 0, quests: new Map(),
      });
      expect(block).toContain(faction.name);
      expect(block).toContain('师父：');
      expect(block).toContain('入门：');
      expect(block).toContain(factionAdmissionSummary(faction, new Map()));
      expect(block).toContain(faction.departure.allowed ? '退门代价：' : '退门：门规不许');
      if (faction.departure.allowed) {
        expect(block).toContain(faction.departure.forgetFactionMartialArts ? '遗忘本门武学' : '保留已学武学');
      }
    }
  });

  it('the linear body owns everything between the instruction and the footer at both sizes', () => {
    for (const [viewWidth, viewHeight, fontScale] of [[960, 540, 1], [640, 360, 1.6]] as const) {
      const px = (size: number) => Math.round(size * fontScale);
      const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
      const g = buildDossierGeometry({
        viewWidth, viewHeight,
        titleHeight: lineSize(20), instructionHeight: lineSize(11),
        bodyLineHeight: lineSize(12), statusHeight: lineSize(10), hintHeight: lineSize(10),
        maxWidth: 820, maxHeight: 452, padding: 30,
      });
      // Header separation: the body starts strictly below title+instruction.
      expect(g.bodyTop).toBeGreaterThanOrEqual(g.top + 18 + lineSize(20) + 6 + lineSize(11) + 7.5);
      // Footer separation with zero margin: the body never enters the status line.
      expect(g.bodyTop + g.bodyCapacity * g.bodyLineHeight).toBeLessThanOrEqual(g.statusTop);
      expect(g.statusTop + lineSize(10)).toBeLessThanOrEqual(g.hintTop + 0.5);
      expect(g.hintTop + lineSize(10)).toBeLessThanOrEqual(g.top + g.height - 9.5);
      // No row-list band: the body capacity consumes essentially the whole
      // remainder (a 1–2 line collapse beside six unused rows is impossible).
      const whole = Math.floor((g.statusTop - 6 - (g.top + 18 + lineSize(20) + 6 + lineSize(11) + 8)) / lineSize(12));
      expect(g.bodyCapacity).toBeGreaterThanOrEqual(whole);
      expect(g.bodyCapacity).toBeGreaterThanOrEqual(viewHeight === 360 ? 4 : 12);
    }
  });

  it('identity and social lines page through the body verbatim — nothing ellipsized', () => {
    const longName = '云隐山人超长MOD称号'.repeat(8);
    const identity = `当前身份：${factionParse.set.factions[0]!.name}弟子 · 师从${longName}`;
    const blocks = [identity, '个人行声：善恶 +0 · 江湖声望 0/1000',
      ...factionParse.set.factions.map(faction => buildFactionBlock({ faction, isCurrent: false, mentorLabels: faction.mentorNpcIds.map(id => id), renown: 0, quests: new Map() }))];
    const pages = paginateFactionDossier(blocks, 820 - 60, 6, (text) => measure(text, 12));
    const flat = pages.join('\n').replace(/\n/g, '');
    expect(flat).toContain(longName); // The full MOD name survives, wraps and all.
    expect(flat).not.toContain('…');
    const pagedLines = pages.flatMap(page => page.split('\n'));
    const allLines = paginateFactionDossier(blocks, 820 - 60, 9999, (text) => measure(text, 12))[0]!.split('\n');
    expect(pagedLines).toEqual(allLines); // Lossless.
  });
});

describe('Round121(c) bounded save-slot rows with lossless per-label paging', () => {
  const pxMax = Math.round(14 * 1.6);
  const lineMax = Math.ceil(pxMax * 1.5);
  const longLabels = [
    `第一栏 · ${'超长MOD侠名甲'.repeat(16)} Lv.10 · 第2年 青阳8日 04:36`,
    `第二栏 · ${'超长MOD侠名乙'.repeat(16)} Lv.9 · 第2年 白露3日 21:05`,
    `第三栏 · ${'超长MOD侠名丙'.repeat(16)} Lv.7 · 第1年 谷雨12日 13:52`,
  ];

  it('three very long labels stay inside the viewport region, paging losslessly', () => {
    const top = 100, bottom = 320; // A representative bounded region.
    const rows = layoutSaveSlotRows({ labels: longLabels, width: 540, measure: (text) => measure(text, pxMax), lineHeight: lineMax, top, bottom, gap: 10 });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.y + row.height).toBeLessThanOrEqual(bottom + 0.5); // Never past the region.
      expect(row.paged).toBe(true); // Genuinely paged at this scale.
    }
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index]!.y).toBeGreaterThanOrEqual(rows[index - 1]!.y + rows[index - 1]!.height); // No intersections.
    }
    // Lossless: every character of every label survives across its pages.
    for (const [index, row] of rows.entries()) {
      expect(row.pages.join('\n').replace(/\n/g, '')).toBe(longLabels[index]!);
      for (const page of row.pages) expect(page.split('\n').length).toBeLessThanOrEqual(row.pages[0]!.split('\n').length);
    }
  });

  it('refuses an insufficient row budget instead of extending outside it', () => {
    expect(() => layoutSaveSlotRows({ labels: ['甲', '乙', '丙'], width: 200, measure, lineHeight: 33, top: 100, bottom: 240 })).toThrow(RangeError);
  });

  it('a fitting stack keeps natural heights with no blank bands and no paging', () => {
    const rows = layoutSaveSlotRows({
      labels: ['第一栏 · 云隐弟子 Lv.10 · 第2年 青阳8日 04:36', '第二栏 · 空', '第三栏 · 空'],
      width: 540, measure: (text) => measure(text, pxMax), lineHeight: lineMax, top: 100, bottom: 320, gap: 10,
    });
    expect(rows.every(row => !row.paged)).toBe(true);
    expect(rows.every(row => row.pages.length === 1)).toBe(true);
    expect(rows.every(row => row.height <= Math.max(38, row.pages[0]!.split('\n').length * lineMax + 8))).toBe(true);
    // The normal base-max-font stack needs 1–2 pages at most.
    const base = layoutSaveSlotRows({
      labels: [`第一栏 · ${'普通侠名'.repeat(4)} Lv.10 · 第2年 青阳8日 04:36`, '第二栏 · 空', '第三栏 · 空'],
      width: 540, measure: (text) => measure(text, 14), lineHeight: Math.ceil(14 * 1.5), top: 0, bottom: 200,
    });
    expect(base.every(row => row.pages.length <= 2)).toBe(true);
  });
});

// ── UI layer with a measured mock scene (honest simulated-renderer scope) ────
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { ESC: 6, UP: 1, DOWN: 2, ENTER: 3, LEFT: 9, RIGHT: 10, W: 7, S: 8, D: 13, R: 14, PAGE_UP: 33, PAGE_DOWN: 34 } } } } }));
vi.mock('../src/game/ui-theme', () => ({ addPixelPanelChrome: () => {}, addPixelSelection: () => {}, UI_FONT_FAMILY: 'monospace', UI_PALETTE: { accent: '#fff', muted: '#aaa', text: '#eee', jade: '#afa' } }));
let fontScale = 1.6;
vi.mock('../src/game/settings', () => ({
  uiFontSize: (n: number) => `${Math.max(8, Math.round(n * fontScale))}px`,
  DEFAULT_GAME_SETTINGS: { volume: 1, textScale: 1, movementLayout: 'arrows', gamepad: true, highContrast: false, reducedMotion: false },
  SETTINGS_ROW_COUNT: 6,
  adjustGameSetting: (settings: unknown) => settings,
  applyGameSettings: () => {},
  saveGameSettings: () => {},
  settingsRows: () => ['一', '二', '三', '四', '五', '六'],
}));
vi.mock('../src/engine/save-system', () => ({
  SAVE_SLOT_IDS: ['slot-1', 'slot-2', 'slot-3'],
  SAVE_SLOT_LABELS: { 'slot-1': '第一栏', 'slot-2': '第二栏', 'slot-3': '第三栏' },
  formatSavedAt: (value: string) => value,
  listSaveSlots: () => ({
    ok: true, message: '',
    slots: [1, 2, 3].map(index => ({ state: 'ok', displayName: `${'超长MOD侠名'.repeat(8)}${index}`, level: 10, savedAt: `第2年 青阳${index}日 04:3${index}` })),
  }),
  deleteSaveSlot: () => ({ ok: true, message: '' }),
}));
import { FactionPanel } from '../src/game/faction-ui';
import { PauseMenuPanel } from '../src/game/pause-menu';

interface Shown { text: string; color: string; x: number; y: number; fontPx: number; lines: string[]; destroyed: boolean;
  get width (): number; originX: number; originY: number; get height (): number; setText (v: string): Shown; setOrigin (x?: number, y?: number): Shown; setColor (): Shown; setVisible (): Shown; destroy (): void;
  context: { measureText: (s: string) => { width: number } }; }

function setupScene<T>(create: (scene: Phaser.Scene) => T, viewWidth: number, viewHeight: number) {
  const shown: Shown[] = [];
  const makeText = (x: number, y: number, text: string, style: { fontSize: string; color: string; lineSpacing?: number }): Shown => {
    const fontPx = Number.parseFloat(style.fontSize);
    const node = {
      x, y, text, fontPx, originX: 0, originY: 0, color: style.color, lines: text.split('\n'), destroyed: false,
      get width() { return Math.max(...this.lines.map(line => measure(line, this.fontPx))); },
      get height() { return this.lines.length * this.fontPx + Math.max(0, this.lines.length - 1) * (style.lineSpacing ?? 0) + 2; },
      setText(v: string) { this.text = v; this.lines = v.split('\n'); return this; },
      setOrigin(x = 0.5, y = x) { this.originX = x; this.originY = y; return this; }, setColor() { return this; }, setVisible() { return this; },
      destroy() { this.destroyed = true; },
      context: { measureText: (s: string) => ({ width: measure(s, fontPx) }) },
    } as Shown;
    shown.push(node);
    return node;
  };
  const keys = new Map<number, Set<() => void>>();
  const events: string[] = [];
  const container = { setDepth() { return this; }, setVisible() { return this; }, removeAll() { for (const t of shown) t.destroyed = true; return this; }, add() { return this; }, destroy() {} };
  const scene = {
    scale: { width: viewWidth, height: viewHeight },
    input: { keyboard: { addKey(code: number) { if (!keys.has(code)) keys.set(code, new Set()); return { on(_e: string, fn: () => void) { keys.get(code)!.add(fn); }, off(_e: string, fn: () => void) { keys.get(code)!.delete(fn); } }; }, addCapture() {} } },
    add: {
      text: (x: number, y: number, text: string, style: { fontSize: string; color: string }) => makeText(x, y, text, style),
      container: () => container,
    },
    game: {},
  } as unknown as Phaser.Scene;
  const subject = create(scene);
  const visible = () => shown.filter(t => !t.destroyed && t.text.length > 0 && t.x > -300);
  const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
  return { subject, shown, visible, press, events };
}

describe('Round121(c) UI: dossier reader and pause save page at max font on the narrow canvas', () => {
  it('faction dossier pages the full body with the long master name intact', () => {
    const longName = '云隐山人超长MOD称号'.repeat(8);
    const r = setupScene(scene => new FactionPanel(scene, () => {}), 640, 360);
    r.subject.open({ factions, membership: null, social: createSocialState(), npcNames: new Map([[factionParse.set.factions[0]!.mentorNpcIds[0]!, longName]]), quests: new Map() });
    const pageOf = () => r.visible().find(t => /档案\d+\/\d+页/.test(t.text))?.text;
    expect(pageOf()).toMatch(/档案1\/\d+页/);
    const allBodies: string[] = [];
    const total = Number(pageOf()!.match(/档案1\/(\d+)页/)![1]);
    for (let page = 0; page < total; page += 1) {
      const body = r.visible().find(t => t.color === '#eee')!;
      const footer = r.visible().find(t => /档案\d+\/\d+页/.test(t.text))!;
      expect(body.y + body.height).toBeLessThanOrEqual(footer.y);
      expect(body.x + body.width).toBeLessThanOrEqual(620);
      allBodies.push(body.text);
      r.press(34);
    }
    expect(allBodies.join('').replace(/\n/g, '')).toContain(longName);
    for (const faction of factions.values()) expect(allBodies.join('').replace(/\n/g, '')).toContain(faction.name);
    for (let page = 0; page < total; page += 1) r.press(33);
    r.press(34);
    expect(pageOf()).toMatch(/档案2\/\d+页/);
    r.press(33);
    expect(pageOf()).toMatch(/档案1\/\d+页/);
    r.press(6);
    expect(r.subject.isOpen).toBe(false);
    // Header/footer separation on the real rendered rectangles.
    const body = r.shown.filter(t => !t.destroyed && t.color === '#eee');
    for (const band of body) expect(band.y).toBeLessThan(360 - 40);
  });

  it('pause save page: bounded rows, label paging that never saves, Enter saves once', () => {
    fontScale = 1.6;
    let saves = 0;
    const r = setupScene(scene => new PauseMenuPanel(scene, {
      storage: {} as never,
      save: () => { saves += 1; return { ok: true, message: '已保存' }; },
      returnToMenu: () => {},
    }), 640, 360);
    r.subject.open({ volume: 1, textScale: 1, movementLayout: 'arrows', gamepad: true, highContrast: false, reducedMotion: false } as never);
    // Navigate main → save.
    r.press(2); // ↓ to 保存进度.
    r.press(3); // Enter opens the save page.
    const rows = r.visible().filter(t => t.lines.length >= 1 && (t.text.startsWith('▸') || t.text.startsWith('  ')));
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.y + row.height).toBeLessThanOrEqual(240); // Panel top20 + height320 -100: rows own this bounded region.
      expect(row.y).toBeGreaterThanOrEqual(96);
    }
    const hint = r.visible().find(t => t.text.includes('Esc'));
    expect(hint).toBeDefined();
    expect(hint!.y + hint!.height).toBeLessThanOrEqual(360);
    const counter = r.visible().find(t => /^1\/\d+$/.test(t.text))!;
    expect(counter).toBeDefined();
    const selected = rows.find(t => t.text.startsWith('▸'))!;
    expect(selected.x + selected.width * (1 - selected.originX)).toBeLessThan(counter.x - counter.width * counter.originX);
    expect(counter.y + counter.height).toBeLessThanOrEqual(240);
    // Paging the selected label never saves; Enter does, exactly once each.
    r.press(34);
    expect(saves).toBe(0);
    r.press(33);
    expect(saves).toBe(0);
    r.press(3);
    expect(saves).toBe(1);
    r.press(6); // Esc back to main.
    r.press(6); // Esc closes.
    expect(r.subject.isOpen).toBe(false);
    r.subject.destroy();
    fontScale = 1;
  });
});
