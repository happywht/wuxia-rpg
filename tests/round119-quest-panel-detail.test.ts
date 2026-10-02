/**
 * Round 119: 成功步进刷新最近托付 HUD + Q/E 任务面板中文长文完整分页。
 *
 * 一、tryMove 成功路径（含零分钟步进）此前不重投影任务行，最近托付人
 * 提示一直引用旧格；R117 的纯投影已就位，此处由源级护栏锁定步进调用点。
 * 二、任务面板原先用 Phaser 的空格 wordWrap——中文无空格不断行，长描述
 * 溢出面板且无分页。现改为实测字宽换行（wrapDialogueText）+ 空行分块
 * 分页（paginateDialogueBlocks），页脚/状态带从底边先预留，行带与详情带
 * 在剩余空间内按实测行高分配：最大字号与窄画布下互不覆盖、不丢文本。
 * 以下用真实 round-97 澜心任务与长 MOD 形状在纯布局层与 mock 场景两层
 * 验证，行选择与接取/跟踪/导航/放弃语义保持。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { buildQuestDetailBlocks, buildQuestPanelGeometry, paginateQuestDetail, questFooterColumns } from '../src/game/quest-panel-layout';
import { createQuestJournal, parseQuestSet, type QuestData } from '../src/engine/quest-system';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const questParse = parseQuestSet(read('data/base/quests/round-97-lanxin-reef-quests.json'));
if (!questParse.ok) throw Error(questParse.errors.join('\n'));
const tideLedger = questParse.set.quests.find((quest) => quest.id === 'quest.r97-tide-ledger')!;
const quests = new Map(questParse.set.quests.map((quest) => [quest.id, quest]));

const measure = (text: string, px = 12): number => Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

describe('Round119 measured panel geometry fits every band at max font and narrow canvas', () => {
  for (const [viewWidth, viewHeight, fontScale, label] of [[960, 540, 1, 'default'], [640, 360, 1.6, 'narrow 640x360 at scale 1.6']] as const) {
    it(`${label}: rows, detail, status and hint stay disjoint and inside the panel`, () => {
      const px = (size: number) => Math.round(size * fontScale);
      const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
      const g = buildQuestPanelGeometry({
        viewWidth, viewHeight,
        titleHeight: lineSize(18), subtitleHeight: lineSize(11),
        rowHeight: lineSize(12) + 6, detailLineHeight: lineSize(12),
        statusHeight: lineSize(11), hintHeight: lineSize(10),
      });
      expect(g.width).toBeLessThanOrEqual(viewWidth - 40 + 0.5);
      expect(g.height).toBeLessThanOrEqual(viewHeight - 40 + 0.5);
      expect(g.visibleRows).toBeGreaterThanOrEqual(1);
      expect(g.detailCapacity).toBeGreaterThanOrEqual(1);
      expect(g.listTop + g.visibleRows * g.rowHeight).toBeLessThanOrEqual(g.detailTop + 0.5);
      expect(g.detailTop + g.detailCapacity * g.detailLineHeight).toBeLessThanOrEqual(g.statusTop - 5.5);
      expect(g.statusTop + lineSize(11)).toBeLessThanOrEqual(g.hintTop + 0.5);
      expect(g.hintTop + lineSize(10)).toBeLessThanOrEqual(g.top + g.height - 9.5);
      expect(g.left).toBeGreaterThanOrEqual(0);
      expect(g.top).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('Round119 complete lossless detail body (real R97 task and long MOD)', () => {
  it('assembles description, live objectives and full rewards without dropping text', () => {
    const journal = createQuestJournal(quests);
    const state = journal.states.get(tideLedger.id)!;
    state.status = 'active';
    state.objectiveCounts.set(tideLedger.objectives[0]!.id, 1);
    const blocks = buildQuestDetailBlocks(tideLedger, state);
    const body = blocks.join('\n\n');
    for (const char of tideLedger.description) expect(body).toContain(char === '\n' ? ' ' : char); // Every authored char survives (newlines re-flow as separators).
    expect(blocks[0]).toBe(tideLedger.name);
    expect(blocks[1]).toBe(tideLedger.description);
    // Round 122: an active ORDERED errand shows staged lines; the invariant
    // stays "every objective's count and text is visible" — done steps carry
    // their count in （c/r）, the current step keeps the 目标 c/r prefix.
    for (const objective of tideLedger.objectives) {
      expect(body).toContain(objective.text);
      expect(body).toContain(`${state.objectiveCounts.get(objective.id) ?? 0}/${objective.requiredCount}`);
    }
    expect(body).toContain('[已完成]');
    expect(body).toContain('[当前]');
    expect(body).toContain(`报酬：经验 +${tideLedger.rewards.experience} · 银两 +${tideLedger.rewards.currency}`);
    for (const reward of tideLedger.rewards.factionRenown ?? []) {
      expect(body).toContain(`${reward.delta > 0 ? '+' : ''}${reward.delta}`);
    }
  });

  it('paginates the real task at a tight band with zero lost lines', () => {
    const journal = createQuestJournal(quests);
    const blocks = buildQuestDetailBlocks(tideLedger, journal.states.get(tideLedger.id));
    const width = 672 - 48;
    const pages = paginateQuestDetail(blocks, width, 2, (text) => measure(text, 12));
    expect(pages.length).toBeGreaterThan(1); // Genuinely paged at a two-line band.
    const pagedLines = pages.flatMap((page) => page.split('\n'));
    const allLines = paginateQuestDetail(blocks, width, 9999, (text) => measure(text, 12))[0]!.split('\n');
    expect(pagedLines).toEqual(allLines); // Same lines, same order, nothing dropped or reordered.
    expect(pages.every((page) => page.split('\n').length <= 2)).toBe(true);
  });

  it('keeps a MOD-flooded long description fully readable across pages', () => {
    const mod: QuestData = {
      ...tideLedger, id: 'quest.mod-flood', name: '超长MOD差事名'.repeat(12),
      description: '澜心湾潮簿考据'.repeat(400),
      objectives: [{ ...tideLedger.objectives[0]!, text: '逐页核对潮簿刻线'.repeat(60) }],
    };
    const blocks = buildQuestDetailBlocks(mod, createQuestJournal(new Map([[mod.id, mod]])).states.get(mod.id));
    const pages = paginateQuestDetail(blocks, 300, 3, (text) => measure(text, 12));
    const paged = pages.join('\n').replace(/\n/g, '');
    expect(paged).toContain(mod.name);
    // Every repetition of both chunks survives pagination, wraps and all.
    expect(paged.split('澜心湾潮簿考据').length - 1).toBe(400);
    expect(paged.split('逐页核对潮簿刻线').length - 1).toBe(60);
    expect(pages.length).toBeGreaterThan(10);
    expect(pages.every((page) => page.split('\n').length <= 3)).toBe(true);
  });
});

describe('Round119 footer columns preserve horizontal separation', () => {
  it('long status and page trail cannot overlap at ordinary or narrow width', () => {
    for (const width of [672, 552, 300]) {
      const columns = questFooterColumns(width);
      expect(columns.statusWidth + columns.trailWidth + columns.gap).toBe(width);
      expect(columns.statusWidth).toBeGreaterThan(0);
      expect(columns.trailWidth).toBeGreaterThan(0);
      expect(columns.gap).toBe(8);
    }
  });
  it('a one-task board returns unused list rows to the detail band', () => {
    const input = { viewWidth: 960, viewHeight: 540, titleHeight: 44, subtitleHeight: 27, rowHeight: 35, detailLineHeight: 29, statusHeight: 27, hintHeight: 24 };
    const journal = buildQuestPanelGeometry(input);
    const board = buildQuestPanelGeometry({ ...input, maxVisibleRows: 1 });
    expect(board.visibleRows).toBe(1);
    expect(board.detailCapacity).toBeGreaterThan(journal.detailCapacity);
    const source = readFileSync(join(root, 'src/game/quest-ui.ts'), 'utf8');
    expect(source).toContain('maxVisibleRows: Math.min(VISIBLE_ROWS, Math.max(1, rows.length))');
    expect(source).toContain('lineSpacing: Math.ceil(Number.parseInt(uiFontSize(fontSize), 10) * 0.4)');
  });
});

// ── UI layer with a measured mock scene ─────────────────────────────────────
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { UP: 1, DOWN: 2, ENTER: 3, N: 4, A: 5, ESC: 6, W: 7, S: 8, PAGE_UP: 33, PAGE_DOWN: 34 } } } } }));
vi.mock('../src/game/ui-theme', () => ({
  addPixelPanelChrome: () => {},
  addPixelSelection: () => {},
  UI_FONT_FAMILY: 'monospace',
}));
let fontScale = 1;
vi.mock('../src/game/settings', () => ({ uiFontSize: (n: number) => `${Math.max(8, Math.round(n * fontScale))}px` }));
import { QuestPanel } from '../src/game/quest-ui';

interface Shown { text: string; color: string; x: number; y: number; fontPx: number; lines: string[]; destroyed: boolean;
  get height (): number; setText (v: string): Shown; setOrigin (): Shown; setColor (): Shown; setVisible (): Shown; destroy (): void;
  context: { measureText: (s: string) => { width: number } }; }

function setupPanel(viewWidth: number, viewHeight: number) {
  const shown: Shown[] = [];
  const makeText = (x: number, y: number, text: string, style: { fontSize: string; color: string }): Shown => {
    const fontPx = Number.parseFloat(style.fontSize);
    const node = {
      x, y, text, fontPx, color: style.color, lines: text.split('\n'), destroyed: false,
      get height() { return this.lines.length * this.fontPx * 1.2 + 2; },
      setText(v: string) { this.text = v; this.lines = v.split('\n'); return this; },
      setOrigin() { return this; }, setColor() { return this; }, setVisible() { return this; },
      destroy() { this.destroyed = true; },
      context: { measureText: (s: string) => ({ width: measure(s, fontPx) }) },
    } as Shown;
    shown.push(node);
    return node;
  };
  const keys = new Map<number, Set<() => void>>();
  const container = { setDepth() { return this; }, setVisible() { return this; }, removeAll() { for (const t of shown) t.destroyed = true; return this; }, add() { return this; }, destroy() {} };
  const scene = {
    scale: { width: viewWidth, height: viewHeight },
    input: { keyboard: { addKey(code: number) { if (!keys.has(code)) keys.set(code, new Set()); return { on(_e: string, fn: () => void) { keys.get(code)!.add(fn); }, off(_e: string, fn: () => void) { keys.get(code)!.delete(fn); } }; } } },
    add: {
      text: (x: number, y: number, text: string, style: { fontSize: string; color: string }) => makeText(x, y, text, style),
      container: () => container,
    },
  } as unknown as Phaser.Scene;
  const updates: string[] = [];
  const navigated: string[] = [];
  const accepted: string[] = [];
  const panel = new QuestPanel(scene, {
    onUpdate: () => updates.push('updated'),
    onQuestAccepted: (id) => accepted.push(id),
    onNavigateQuest: (id) => { navigated.push(id); return { ok: false, message: '尚缺当前调查的有效落脚格' }; },
  });
  const journal = createQuestJournal(quests);
  const state = journal.states.get(tideLedger.id)!;
  state.status = 'offered'; // The tide ledger is acceptable right here.
  panel.open({ quests, journal, itemCounts: new Map(), access: { factionId: null, knownKnowledgeNodeIds: new Set() } });
  const visible = () => shown.filter((t) => !t.destroyed && t.text.length > 0 && t.x > -300);
  const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
  return { panel, journal, shown, visible, press, updates, state, navigated, accepted };
}

describe('Round119 QuestPanel paged CJK detail with intact row semantics', () => {
  it('shows the real R97 task, paginates its detail and resets on row change', () => {
    fontScale = 1.6; // Max font scale: the detail must genuinely paginate.
    const r = setupPanel(640, 360);
    const detailOf = () => r.visible().find(t => t.color === '#d8dee9'); // UI.primary: the one detail body.
    expect(r.visible().some(t => t.text.includes('任务日志'))).toBe(true);
    const firstPage = detailOf()!.text;
    expect(firstPage.length).toBeGreaterThan(0);
    const pageHintOf = () => r.visible().find(t => /详情\d+\/\d+页/.test(t.text))!.text;
    expect(pageHintOf()).toMatch(/详情1\/\d+页/); // The visible page hint tells the truth.
    r.press(34); // PageDown
    expect(detailOf()!.text).not.toBe(firstPage);
    expect(pageHintOf()).toMatch(/详情2\/\d+页/);
    r.press(1); // ↑ moves to another row: that row's detail restarts from page one.
    expect(pageHintOf()).toMatch(/详情1\/\d+页/);
    r.press(2); // ↓ back to the original row: still its first page.
    expect(pageHintOf()).toMatch(/详情1\/\d+页/);
    expect(detailOf()!.text).toBe(firstPage);
    r.press(33); // PageUp clamps at page one instead of wrapping to the end.
    expect(detailOf()!.text).toBe(firstPage);
    r.panel.close();
    fontScale = 1;
  });

  it('keeps bands disjoint at max font on the narrow canvas', () => {
    fontScale = 1.6;
    const r = setupPanel(640, 360);
    const height = Math.min(440, 360 - 40), top = (360 - height) / 2;
    const rows = r.visible().filter(t => t.text.startsWith('▸') || t.text.startsWith('  '));
    const body = r.visible().filter(t => t.lines.length > 1 && !t.text.startsWith('▸'));
    const legend = r.visible().filter(t => t.text.includes('Esc 关闭') || t.text.includes('接取/跟踪'));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(body.length).toBeGreaterThanOrEqual(1);
    const rowBottom = Math.max(...rows.map(t => t.y + t.height));
    for (const band of body) expect(band.y).toBeGreaterThanOrEqual(rowBottom - 0.5);
    for (const foot of legend) {
      expect(foot.y).toBeGreaterThan(Math.max(...body.map(t => t.y)));
      expect(foot.y + foot.height).toBeLessThanOrEqual(top + height - 9.5);
    }
    for (const t of r.visible()) expect(t.y + t.height).toBeLessThanOrEqual(top + height - 8.5);
    r.panel.close();
    fontScale = 1;
  });

  it('accepts the offered row with Enter and reports it, keeping N/A/Esc semantics', () => {
    fontScale = 1;
    const r = setupPanel(960, 540);
    expect(r.state.status).toBe('offered');
    r.press(3); // Enter on the offered tide ledger.
    expect(r.state.status).toBe('active');
    expect(r.journal.trackedQuestId).toBe(tideLedger.id);
    expect(r.accepted).toEqual([tideLedger.id]);
    expect(r.visible().some(t => t.text.includes('已接取'))).toBe(true);
    expect(r.updates.length).toBeGreaterThan(0);
    r.press(4); // N forwards the selected id; a readable refusal keeps the panel open.
    expect(r.navigated).toEqual([tideLedger.id]);
    expect(r.visible().some(t => t.text.includes('尚缺当前调查'))).toBe(true);
    expect(r.panel.isOpen).toBe(true);
    r.press(5); // A opens the Round 140 abandon confirmation (default cancel)…
    r.press(2); // …↓ picks the explicit permanent abandon…
    r.press(3); // …Enter commits it through the read gate.
    expect(r.state.status).toBe('failed');
    expect(r.visible().some(t => t.text.includes('已放弃'))).toBe(true);
    r.press(6); // Esc closes.
    expect(r.panel.isOpen).toBe(false);
    r.panel.destroy();
  });

  it('tryMove refreshes the tracker line on every successful step (source guard)', () => {
    const source = readFileSync(join(root, 'src/game/grid-scene.ts'), 'utf8');
    const tryMoveBody = source.slice(source.indexOf('  private tryMove(')).split(/\n  private /)[0]!;
    expect(tryMoveBody).toContain('this.updateQuestTrackerHud()');
    // …and it sits with the other position refreshes, before the clock advance.
    expect(tryMoveBody.indexOf('this.updateInteractHint();')).toBeLessThan(tryMoveBody.indexOf('this.updateQuestTrackerHud();'));
    expect(tryMoveBody.indexOf('this.updateQuestTrackerHud();')).toBeLessThan(tryMoveBody.indexOf('this.advanceTime('));
  });
});
