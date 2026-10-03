/**
 * Round 140: 活动差事 A 键放弃确认浮层（纯投影 + 模拟 UI）。
 *
 * 放弃是日志中唯一不可逆的玩家操作：A 先打开测量分页的确认——数据
 * 原文的差事名、永久失败、不可重接、无报酬、被永久锁定的后续差事；
 * 默认焦点在取消，Enter 默认即取消，显式选确认必须先读完正文所有页，
 * 再由引擎 abandonQuest 重新核对存储的差事 id 与 active 状态，恰好
 * 调用一次、onUpdate 恰好一次。Esc 取消提示保留日志，close/Q 整体
 * 丢弃，提示期间导航与行间移动禁用，重复 A 不确认。已失败行详情解释
 * 终态与可另接的开放差事，不承诺原差事重试。NPC 名录板与 W/S 旧键
 * 行为保持。以下先在纯层锁定投影与状态机，再以实测字宽的 mock 场景
 * 覆盖取消/关闭/换状态/重复输入/大字号分页闸门。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  buildAbandonConfirmationGeometry,
  buildFailedQuestTerminalBlocks,
  buildQuestAbandonBlocks,
  createQuestAbandonConfirmation,
  moveAbandonChoice,
  questSuccessorNames,
  submitAbandonConfirmation,
  turnAbandonPage,
} from '../src/game/quest-abandon-confirmation';
import { createQuestJournal, parseQuestSet, type QuestData } from '../src/engine/quest-system';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const questParse = parseQuestSet(read('data/base/quests/round-97-lanxin-reef-quests.json'));
if (!questParse.ok) throw Error(questParse.errors.join('\n'));
const tideLedger = questParse.set.quests.find((quest) => quest.id === 'quest.r97-tide-ledger')!;
const beaconRelight = questParse.set.quests.find((quest) => quest.id === 'quest.r97-beacon-relight')!;
const r97Quests = new Map(questParse.set.quests.map((quest) => [quest.id, quest]));

const measure = (text: string, px = 12): number =>
  Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

const makeQuest = (id: string, name: string, prerequisiteQuestIds: string[] = []): QuestData => ({
  id,
  name,
  description: `${name}的托付说明。`,
  giverNpcId: 'char.round140-giver',
  prerequisiteQuestIds,
  objectives: [{
    id: `${id}-obj1`,
    kind: 'talkToNpc',
    targetId: 'char.round140-target',
    requiredCount: 1,
    text: `${name}的目标`,
  }],
  failOnEncounterIds: [],
  rewards: { experience: 10, currency: 5 },
});

describe('Round140 abandon confirmation geometry keeps bands disjoint', () => {
  for (const [viewWidth, viewHeight, fontScale, label] of [
    [960, 540, 1, 'default'],
    [640, 360, 1.6, 'narrow 640x360 at scale 1.6'],
  ] as const) {
    it(`${label}: body, choices and hint stay ordered, inside the panel and canvas`, () => {
      const px = (size: number) => Math.round(size * fontScale);
      const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
      const g = buildAbandonConfirmationGeometry({
        viewWidth, viewHeight,
        titleHeight: lineSize(16), bodyLineHeight: lineSize(12),
        choiceHeight: lineSize(13), hintHeight: lineSize(10),
      });
      expect(g.width).toBeLessThanOrEqual(viewWidth - 80 + 0.5);
      expect(g.height).toBeLessThanOrEqual(viewHeight - 80 + 0.5);
      expect(g.left).toBeGreaterThanOrEqual(0);
      expect(g.top).toBeGreaterThanOrEqual(0);
      expect(g.bodyCapacity).toBeGreaterThanOrEqual(1);
      expect(g.bodyTop + g.bodyCapacity * lineSize(12)).toBeLessThanOrEqual(g.choiceTop - 5.5);
      expect(g.choiceTop + 2 * lineSize(13)).toBeLessThanOrEqual(g.hintTop + 0.5);
      expect(g.hintTop + lineSize(10)).toBeLessThanOrEqual(g.top + g.height - 9.5);
    });
  }
});

describe('Round140 successor projection from real R97 chain', () => {
  it('names the direct successor of the tide ledger, in authored names', () => {
    const journal = createQuestJournal(r97Quests);
    expect(questSuccessorNames(r97Quests, journal, tideLedger.id)).toEqual([beaconRelight.name]);
  });

  it('excludes completed successors, unrelated quests and the quest itself', () => {
    const journal = createQuestJournal(r97Quests);
    journal.states.get(beaconRelight.id)!.status = 'completed';
    expect(questSuccessorNames(r97Quests, journal, tideLedger.id)).toEqual([]);
    expect(questSuccessorNames(r97Quests, journal, beaconRelight.id)).toEqual([]);
  });
});

describe('Round140 successor state boundary', () => {
  for (const status of ['offered', 'active', 'completed', 'failed'] as const) {
    it(`does not promise a permanent lock for an already ${status} successor`, () => {
      const journal = createQuestJournal(r97Quests);
      journal.states.get(beaconRelight.id)!.status = status;
      expect(questSuccessorNames(r97Quests, journal, tideLedger.id)).toEqual([]);
    });
  }
});

describe('Round140 confirmation body blocks', () => {
  it('carries the exact authored name, permanent failure, no rewards, locked successors', () => {
    const blocks = buildQuestAbandonBlocks(tideLedger, [beaconRelight.name]).join('\n');
    expect(blocks).toContain(`「${tideLedger.name}」`);
    expect(blocks).toContain('已失败');
    expect(blocks).toContain('永久无法重新接取');
    expect(blocks).toContain('不会发放任何报酬');
    expect(blocks).toContain(beaconRelight.name);
    expect(blocks).toContain('无法解锁');
    expect(blocks).toContain('读完全部说明');
  });

  it('omits the successor clause when nothing is actually locked', () => {
    const blocks = buildQuestAbandonBlocks(beaconRelight, []).join('\n');
    expect(blocks).not.toContain('无法解锁');
    expect(blocks).toContain('永久无法重新接取'); // The universal warnings stay.
  });
});

describe('Round140 pure confirmation state machine', () => {
  const twoPages = createQuestAbandonConfirmation({
    quest: tideLedger, successorNames: [beaconRelight.name],
    width: 240, capacity: 2, measure: (text) => measure(text, 12),
  });

  it('starts on cancel at page one; a single page is fully read immediately', () => {
    const onePage = createQuestAbandonConfirmation({
      quest: tideLedger, successorNames: [],
      width: 4000, capacity: 40, measure: (text) => measure(text, 12),
    });
    expect(onePage.choice).toBe('cancel');
    expect(onePage.page).toBe(0);
    expect(onePage.bodyPages.length).toBe(1);
    expect(onePage.readAllPages).toBe(true);
    expect(twoPages.readAllPages).toBe(false); // Genuinely paged body.
    expect(twoPages.bodyPages.length).toBeGreaterThan(1);
  });

  it('cycles the two choices in both directions', () => {
    const state = { ...twoPages };
    moveAbandonChoice(state, 1);
    expect(state.choice).toBe('confirm');
    moveAbandonChoice(state, 1);
    expect(state.choice).toBe('cancel');
    moveAbandonChoice(state, -1);
    expect(state.choice).toBe('confirm');
  });

  it('walks pages linearly and latches the read gate stickily', () => {
    const state = { ...twoPages };
    turnAbandonPage(state, -1);
    expect(state.page).toBe(0); // Clamped, never wraps.
    turnAbandonPage(state, 1);
    expect(state.page).toBe(1);
    expect(state.readAllPages).toBe(false); // Only the final page latches it.
    while (state.page < state.bodyPages.length - 1) turnAbandonPage(state, 1);
    expect(state.readAllPages).toBe(true);
    turnAbandonPage(state, -10);
    expect(state.page).toBe(0);
    expect(state.readAllPages).toBe(true); // Re-reading backwards never unlatches.
    turnAbandonPage(state, 99);
    expect(state.page).toBe(state.bodyPages.length - 1);
  });

  it('submit: cancel keeps the quest; unread body refuses to commit', () => {
    const journal = createQuestJournal(r97Quests);
    const state = journal.states.get(tideLedger.id)!;
    state.status = 'active';
    journal.trackedQuestId = tideLedger.id;
    const cancelled = { ...twoPages, choice: 'cancel' as const };
    expect(submitAbandonConfirmation(cancelled, journal)).toEqual({ kind: 'cancelled' });
    expect(state.status).toBe('active');
    const unread = { ...twoPages, choice: 'confirm' as const };
    expect(submitAbandonConfirmation(unread, journal)).toEqual({ kind: 'not-read' });
    expect(state.status).toBe('active'); // The gate refused before the engine ran.
  });

  it('submit: explicit confirm fails the quest exactly once, then goes stale', () => {
    const journal = createQuestJournal(r97Quests);
    const state = journal.states.get(tideLedger.id)!;
    state.status = 'active';
    journal.trackedQuestId = tideLedger.id;
    const ready = { ...twoPages, choice: 'confirm' as const, readAllPages: true };
    const outcome = submitAbandonConfirmation(ready, journal);
    expect(outcome).toEqual({
      kind: 'abandoned',
      update: { changed: true, completed: [], failedQuestIds: [tideLedger.id] },
    });
    expect(state.status).toBe('failed');
    expect(journal.trackedQuestId).toBeNull();
    // A second submit (double Enter, replayed key) cannot fail it again.
    expect(submitAbandonConfirmation(ready, journal)).toMatchObject({ kind: 'stale' });
  });

  it('submit: a status changed since the prompt opened degrades to stale', () => {
    const journal = createQuestJournal(r97Quests);
    const state = journal.states.get(tideLedger.id)!;
    state.status = 'completed'; // e.g. completed by a signal while the prompt showed.
    const ready = { ...twoPages, choice: 'confirm' as const, readAllPages: true };
    expect(submitAbandonConfirmation(ready, journal)).toEqual({ kind: 'stale', reason: 'not-active' });
    expect(state.status).toBe('completed');
    const fresh = createQuestJournal(new Map([['missing', makeQuest('missing', '无记账')]]));
    expect(submitAbandonConfirmation(ready, fresh)).toEqual({ kind: 'stale', reason: 'unknown-quest' });
  });
});

describe('Round140 failed-row terminal detail blocks', () => {
  it('explains the terminal state and names other open work without a retry promise', () => {
    const blocks = buildFailedQuestTerminalBlocks({
      quest: tideLedger,
      offeredQuestNames: ['重燃星槎灯', '南屏货单'],
    }).join('\n');
    expect(blocks).toContain('已终止为失败');
    expect(blocks).toContain('无法重新接取原差事');
    expect(blocks).toContain('重燃星槎灯');
    expect(blocks).toContain('南屏货单');
    expect(blocks).not.toContain('可重新接取');
  });

  it('points to quest-givers when nothing is open right now', () => {
    const blocks = buildFailedQuestTerminalBlocks({ quest: tideLedger, offeredQuestNames: [] }).join('\n');
    expect(blocks).toContain('眼下没有立即开放的差事');
    expect(blocks).not.toContain('仍可另接其他已开放的差事继续行事'); // No fabricated open-work list.
  });
});

// ── UI layer with a measured mock scene ─────────────────────────────────────
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { UP: 1, DOWN: 2, ENTER: 3, N: 4, A: 5, ESC: 6, W: 7, S: 8, PAGE_UP: 33, PAGE_DOWN: 34, LEFT: 9, RIGHT: 10 } } } } }));
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

interface SetupResult {
  panel: QuestPanel;
  journal: ReturnType<typeof createQuestJournal>;
  shown: Shown[];
  visible: () => Shown[];
  press: (code: number) => void;
  updates: string[];
  navigated: string[];
  promptTexts: () => Shown[];
  keys: Map<number, Set<() => void>>;
}

/** Choice rows alone carry a cursor prefix; body lines never do. */
const choiceRow = (texts: Shown[], label: string): Shown =>
  texts.find(t => (t.text.startsWith('▸') || t.text.startsWith('  ')) && t.text.includes(label))!;

function setupAbandonPanel(
  viewWidth: number,
  viewHeight: number,
  quests: Map<string, QuestData>,
  activeQuestId: string,
  giverNpcId?: string,
): SetupResult {
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
  const panel = new QuestPanel(scene, {
    onUpdate: () => updates.push('updated'),
    onNavigateQuest: (id) => { navigated.push(id); return { ok: false, message: '尚缺当前调查的有效落脚格' }; },
  });
  const journal = createQuestJournal(quests);
  if (activeQuestId !== '') {
    const state = journal.states.get(activeQuestId);
    if (state === undefined) throw Error(`unknown active quest ${activeQuestId}`);
    state.status = 'active';
    journal.trackedQuestId = activeQuestId;
  }
  panel.open({
    quests, journal,
    ...(giverNpcId !== undefined ? { giverNpcId, giverName: '测试托付人' } : {}),
    itemCounts: new Map(),
    access: { factionId: null, knownKnowledgeNodeIds: new Set() },
  });
  const visible = () => shown.filter((t) => !t.destroyed && t.text.length > 0 && t.x > -300);
  const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
  // Prompt texts: rendered after the base panel, they live inside its bounds.
  const promptTexts = () => visible().filter((t) => t.text.includes('保持进行')
    || t.text.includes('永久放弃')
    || t.text.includes('拟放弃差事')
    || /放弃「.+」？/.test(t.text)
    || t.text.includes('Esc 取消')
    || t.text.includes('读完全部说明'));
  return { panel, journal, shown, visible, press, updates, navigated, promptTexts, keys };
}

describe('Round266 exclusive quest acceptance confirmation', () => {
  it('requires a deliberate confirmation before closing an offered sibling branch', () => {
    fontScale = 1;
    const branch = makeQuest('quest.round266-branch-a', '护送药队');
    const sibling = { ...makeQuest('quest.round266-branch-b', '修复栈桥'), exclusiveGroupId: 'round266-route' };
    const first = { ...branch, exclusiveGroupId: 'round266-route' };
    const quests = new Map([[first.id, first], [sibling.id, sibling]]);
    const r = setupAbandonPanel(960, 540, quests, '');
    r.press(3); // First Enter opens a default-cancel prompt.
    expect(r.journal.states.get(first.id)?.status).toBe('offered');
    expect(r.journal.states.get(sibling.id)?.status).toBe('offered');
    expect(r.updates).toEqual([]);
    expect(r.visible().some(t => t.text.includes('永久封止'))).toBe(true);
    expect(r.visible().some(t => t.text.includes('先不接取（默认）') && t.text.startsWith('▸'))).toBe(true);
    r.press(3); // Enter on default cancel closes without changing state.
    expect(r.journal.states.get(first.id)?.status).toBe('offered');
    expect(r.journal.states.get(sibling.id)?.status).toBe('offered');
    expect(r.updates).toEqual([]);
    r.press(3); // Open confirmation again.
    r.press(10); // Explicit Right selects confirmation.
    expect(r.visible().some(t => t.text.includes('确认接取') && t.text.startsWith('▸'))).toBe(true);
    r.press(3); // First Enter arms the explicit confirmation.
    expect(r.journal.states.get(first.id)?.status).toBe('offered');
    r.press(3); // Second Enter commits the armed choice.
    expect(r.journal.states.get(first.id)?.status).toBe('active');
    expect(r.journal.states.get(sibling.id)?.status).toBe('failed');
    expect(r.updates).toEqual(['updated']);
    r.panel.destroy();
  });

  it('Escape cancels the branch prompt without changing either quest', () => {
    fontScale = 1;
    const first = { ...makeQuest('quest.round266-cancel-a', '护送药队'), exclusiveGroupId: 'round266-cancel' };
    const sibling = { ...makeQuest('quest.round266-cancel-b', '修复栈桥'), exclusiveGroupId: 'round266-cancel' };
    const r = setupAbandonPanel(960, 540, new Map([[first.id, first], [sibling.id, sibling]]), '');
    r.press(3);
    r.press(6);
    expect(r.journal.states.get(first.id)?.status).toBe('offered');
    expect(r.journal.states.get(sibling.id)?.status).toBe('offered');
    expect(r.updates).toEqual([]);
    expect(r.panel.isOpen).toBe(true);
    r.panel.destroy();
  });
});

describe('Round140 QuestPanel A-key abandon confirmation flow', () => {
  it('A on an active quest opens the prompt on cancel with the exact name and warnings', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5); // A
    const prompt = r.promptTexts();
    expect(prompt.some(t => t.text === `放弃「${tideLedger.name}」？`)).toBe(true); // Exact authored name.
    expect(prompt.some(t => t.text.includes(`拟放弃差事：「${tideLedger.name}」`))).toBe(true);
    expect(prompt.some(t => t.text.includes('永久无法重新接取'))).toBe(true);
    expect(prompt.some(t => t.text.includes('不会发放任何报酬'))).toBe(true);
    expect(prompt.some(t => t.text.includes(beaconRelight.name) && t.text.includes('无法解锁'))).toBe(true);
    const keep = choiceRow(prompt, '保持进行');
    expect(keep.text.startsWith('▸')).toBe(true); // Default focus is cancel.
    expect(choiceRow(prompt, '永久放弃').text.startsWith('  ')).toBe(true); // Confirm idles.
    r.press(6); // Esc
    r.panel.destroy();
  });

  it('Enter with no move keeps the quest: no update, prompt gone, journal intact', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5);
    r.press(3); // Enter on the default cancel choice.
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('active');
    expect(r.updates).toEqual([]);
    expect(r.promptTexts()).toEqual([]);
    expect(r.visible().some(t => t.text.includes(`已保留「${tideLedger.name}」`))).toBe(true);
    expect(r.panel.isOpen).toBe(true);
    r.press(6);
    r.panel.destroy();
  });

  it('Esc cancels the prompt while the journal panel stays open', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5);
    r.press(6); // Esc
    expect(r.panel.isOpen).toBe(true);
    expect(r.promptTexts()).toEqual([]);
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('active');
    expect(r.updates).toEqual([]);
    r.press(6); // Esc again now closes the whole panel.
    expect(r.panel.isOpen).toBe(false);
  });

  it('explicit confirm fails the quest once: one update, repeated keys add nothing', () => {
    fontScale = 1; // Default canvas: the short body is a single, fully-read page.
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5);
    r.press(2); // ↓ to confirm.
    r.press(3); // Enter commits.
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('failed');
    expect(r.journal.trackedQuestId).toBeNull();
    expect(r.updates).toEqual(['updated']); // onUpdate fired exactly once.
    expect(r.visible().some(t => t.text.includes(`已放弃「${tideLedger.name}」`))).toBe(true);
    expect(r.promptTexts()).toEqual([]);
    for (const code of [3, 3, 5, 5]) r.press(code); // Replay: nothing left to abandon.
    expect(r.updates).toEqual(['updated']);
    r.press(5); // A on the now-failed row explains instead of prompting.
    expect(r.promptTexts()).toEqual([]);
    expect(r.visible().some(t => t.text.includes('只能放弃进行中的差事'))).toBe(true);
    r.press(6);
    r.panel.destroy();
  });

  it('repeated A while the prompt shows neither confirms nor reopens it', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5);
    r.press(5);
    r.press(5);
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('active');
    expect(r.updates).toEqual([]);
    const keep = r.promptTexts().find(t => t.text.includes('保持进行'))!;
    expect(keep.text.startsWith('▸')).toBe(true); // Choice untouched by A.
    r.press(2);
    r.press(5); // Even with confirm focused, A stays a no-op.
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('active');
    expect(r.updates).toEqual([]);
    r.press(6);
    r.panel.destroy();
  });

  it('navigation and row moves are disabled while the prompt shows', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    const rowBefore = r.visible().find(t => t.text.startsWith('▸'))!.text;
    r.press(5);
    r.press(4); // N: objective navigation stays silent.
    expect(r.navigated).toEqual([]);
    const choiceOf = (label: string) => choiceRow(r.promptTexts(), label);
    r.press(1); // ↑ moves the prompt's choice, not the rows.
    expect(choiceOf('永久放弃').text.startsWith('▸')).toBe(true);
    r.press(2); // ↓ moves it back.
    expect(choiceOf('保持进行').text.startsWith('▸')).toBe(true);
    r.press(7); // W/S (old controllers) share the same routed move.
    expect(choiceOf('永久放弃').text.startsWith('▸')).toBe(true);
    r.press(8);
    expect(choiceOf('保持进行').text.startsWith('▸')).toBe(true);
    const rowAfter = r.visible().find(t => t.text.startsWith('▸') && !t.text.includes('保持进行'))!.text;
    expect(rowAfter).toBe(rowBefore); // The journal row selection never moved.
    r.press(33); // PageUp/PgDn feed the prompt's body, not the row detail.
    r.press(34);
    r.press(6);
    r.panel.destroy();
  });

  it('a status change since the prompt opened degrades to a readable stale message', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5);
    r.journal.states.get(tideLedger.id)!.status = 'completed'; // Changed underneath.
    r.press(2);
    r.press(3);
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('completed'); // Untouched.
    expect(r.updates).toEqual([]);
    expect(r.promptTexts()).toEqual([]);
    expect(r.visible().some(t => t.text.includes('已不在进行中，本次未放弃'))).toBe(true);
    r.press(6);
    r.panel.destroy();
  });

  it('close (Q) discards the prompt wholesale and a reopen starts clean', () => {
    fontScale = 1;
    const r = setupAbandonPanel(960, 540, r97Quests, tideLedger.id);
    r.press(5);
    r.press(2); // Confirm focused, unread gates aside.
    r.panel.close();
    expect(r.panel.isOpen).toBe(false);
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('active');
    expect(r.updates).toEqual([]);
    r.panel.open({
      quests: r97Quests, journal: r.journal,
      itemCounts: new Map(), access: { factionId: null, knownKnowledgeNodeIds: new Set() },
    });
    expect(r.promptTexts()).toEqual([]);
    r.press(6);
    r.panel.destroy();
  });
});

describe('Round140 measured paging gate and NPC-board behaviour', () => {
  it('max font on the narrow canvas pages the body and gates confirm on reading it all', () => {
    fontScale = 1.6;
    const r = setupAbandonPanel(640, 360, r97Quests, tideLedger.id);
    r.press(5);
    const commitOf = () => choiceRow(r.promptTexts(), '永久放弃');
    expect(commitOf().text).toContain('需先读完全部说明'); // Locked by the gate.
    r.press(2);
    r.press(3); // Enter on confirm without having read: refused.
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('active');
    expect(r.updates).toEqual([]);
    expect(r.promptTexts().some(t => t.text.includes('请先用 PgDn 读完全部说明'))).toBe(true);
    let guard = 0;
    while (commitOf().text.includes('需先读完全部说明') && guard < 40) {
      r.press(34); // PageDown walks to the final page, latching the gate.
      guard += 1;
    }
    expect(guard).toBeGreaterThan(0); // The body genuinely paged.
    expect(commitOf().text).toBe('▸ 永久放弃'); // Unlocked label.
    r.press(3); // Enter commits now.
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('failed');
    expect(r.updates).toEqual(['updated']);
    // The prompt panel itself stayed inside the canvas the whole time.
    r.press(6);
    fontScale = 1;
    r.panel.destroy();
  });

  it('keeps the prompt bands ordered inside the panel at max font', () => {
    fontScale = 1.6;
    const r = setupAbandonPanel(640, 360, r97Quests, tideLedger.id);
    r.press(5);
    const prompt = r.promptTexts();
    const title = prompt.find(t => /放弃「.+」？/.test(t.text))!;
    const body = prompt.find(t => t.text.includes('拟放弃差事'))!; // Page one: the named-quest block.
    const keep = choiceRow(prompt, '保持进行');
    const commit = choiceRow(prompt, '永久放弃');
    const hint = prompt.find(t => t.text.includes('Esc 取消'))!;
    expect(title.y).toBeLessThan(body.y);
    expect(body.y).toBeLessThan(keep.y);
    expect(keep.y).toBeLessThan(commit.y);
    expect(commit.y).toBeLessThan(hint.y);
    // The centered prompt panel spans y 40..320 on this canvas: everything fits.
    for (const t of prompt) {
      expect(t.y).toBeGreaterThanOrEqual(40);
      expect(t.y + t.height).toBeLessThanOrEqual(312);
    }
    r.press(6);
    fontScale = 1;
    r.panel.destroy();
  });

  it('NPC boards keep accept semantics and the same guarded abandon flow', () => {
    fontScale = 1;
    const board = new Map([[beaconRelight.id, beaconRelight], [tideLedger.id, tideLedger]]);
    const r = setupAbandonPanel(960, 540, board, '', 'char.r97-yu-xingcha');
    r.journal.states.get(tideLedger.id)!.status = 'completed'; // Prerequisite done…
    r.journal.states.get(beaconRelight.id)!.status = 'offered'; // …so the board offers the beacon.
    r.press(2); // Any key re-renders; the board lists the beacon relight offered.
    expect(r.visible().some(t => t.text.includes('任务名录'))).toBe(true);
    r.press(3); // Enter accepts the offered beacon relight on the board.
    expect(r.journal.states.get(beaconRelight.id)!.status).toBe('active');
    expect(r.updates.length).toBe(1);
    r.press(5); // A on that active board quest still opens the guarded prompt.
    expect(r.promptTexts().some(t => t.text === `放弃「${beaconRelight.name}」？`)).toBe(true);
    r.press(3); // Default cancel keeps it active — the board flow is unchanged.
    expect(r.journal.states.get(beaconRelight.id)!.status).toBe('active');
    expect(r.updates.length).toBe(1);
    r.press(6);
    r.panel.destroy();
  });

  it('a failed row details the terminal state and other open work, promising no retry', () => {
    fontScale = 1;
    const other = makeQuest('quest.round140-other', '南屏货单');
    const withOther = new Map([['quest.round140-other', other], [tideLedger.id, tideLedger]]);
    const r = setupAbandonPanel(960, 540, withOther, tideLedger.id);
    r.press(5);
    r.press(2);
    r.press(3); // Abandon the tide ledger for real.
    expect(r.journal.states.get(tideLedger.id)!.status).toBe('failed');
    let guard = 0;
    const detailOf = () => r.visible().filter(t => t.color === '#d8dee9');
    const collectedPages: string[] = [];
    while (guard < 40) { // Page through the failed row's whole detail body.
      const detail = detailOf().map(t => t.text).join('\n');
      collectedPages.push(detail);
      if (detail.includes('另接其他已开放的差事') && detail.includes(other.name)) break;
      r.press(34);
      guard += 1;
    }
    // Round 269: the per-page identity header reserves a body line, so the
    // terminal clauses may spread across pages — assert on the whole body.
    const pagedDetail = collectedPages.join('\n');
    expect(pagedDetail).toContain('已终止为失败');
    expect(pagedDetail).toContain('无法重新接取原差事');
    expect(pagedDetail).toContain(other.name);
    expect(pagedDetail).not.toContain('可重新接取');
    r.press(6);
    r.panel.destroy();
  });
});
