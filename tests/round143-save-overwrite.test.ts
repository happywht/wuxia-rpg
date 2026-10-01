/**
 * Round 143: 非空存档槽覆盖确认（纯投影 + 模拟 UI）。
 *
 * 覆盖是存档页唯一破坏性存储操作：Enter 先做即时读取——空槽直接保存；
 * 非空（含损坏）槽打开测量分页的确认浮层，正文给出确切槽标签、槽内
 * 侠名/等级、旧保存时间与永久替换后果；默认焦点在取消，Enter 默认即
 * 取消，显式确认必须先读完正文所有页，提交前复读同一存储键并比对
 * 打开时捕获的不透明原始载荷——确认期间任何字节级变化（即使摘要
 * 看起来相同）或读取异常都拒绝写入、刷新槽列表并要求重新确认。
 * 取消/Esc 返回同槽同标签页，关闭/重开整体清掉待确认，原始载荷
 * 绝不出现在任何界面文本里。键盘与手柄走同一状态机。存储 fixture
 * 只用内存适配器，绝不触碰真实 localStorage。以下先在纯层锁定几何、
 * 投影、状态机与复读守卫，再以实测字宽的 mock 场景覆盖完整流程。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SAVE_KEY_PREFIX,
  SAVE_PROTOCOL_VERSION,
  SAVE_SLOT_LABELS,
  type SaveSnapshotV1,
  type SaveSlotId,
  type SaveStorage,
  createMemorySaveStorage,
  formatSavedAt,
  writeSaveSlot,
} from '../src/engine/save-system';
import {
  buildSaveOverwriteBlocks,
  buildSaveOverwriteGeometry,
  createSaveOverwriteConfirmation,
  describeSaveOverwritePayload,
  moveSaveOverwriteChoice,
  turnSaveOverwritePage,
  truncateGrapheme,
  verifySaveOverwriteTarget,
} from '../src/game/save-overwrite-confirmation';

const measure = (text: string, px = 12): number =>
  Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

const LONG_NAME = '超长侠名占满二十四字上限测试用例一二三四五六';

const makeSnapshot = (displayName: string, level: number, savedAt: string): SaveSnapshotV1 => ({
  protocolVersion: SAVE_PROTOCOL_VERSION,
  savedAt,
  displayName,
  profileId: 'profile.round143',
  mapResourceId: 'map.round143',
  playerPosition: { col: 1, row: 2 },
  player: {
    level,
    experience: 0,
    baseAttributes: { body: 5, force: 5, agility: 5, insight: 5, resolve: 5 },
    healthCurrent: 50,
    qiCurrent: 30,
    martialArtIds: [],
    factionMembership: null,
    cultivationPoints: 0,
    unlockedMeridianNodeIds: [],
  },
  inventory: { currency: 10, capacity: 20, stacks: [], equipped: {} },
  shopStocks: [],
  quests: { states: [], trackedQuestId: null },
  social: { morality: 0, renown: 0, factionRenown: [], relationships: [] },
  completedEncounters: [],
  completedRegionalEvents: [],
  knownKnowledgeNodeIds: [],
  elapsedGameMinutes: 0,
  worldSeed: 1,
  activeCompanionId: null,
  arenaRecords: [],
  factionWarRecords: [],
  customMartialArts: [],
  achievementState: { unlockedIds: [], battleVictories: 0, equipmentCrafts: 0, alchemyCrafts: 0 },
});

const slotKey = (slotId: SaveSlotId): string => `${SAVE_KEY_PREFIX}${slotId}`;

/** Single-page confirmation state bound to one raw payload (wide, roomy). */
const makeState = (rawPayload: string | null, slotId: SaveSlotId = 'slot-1') =>
  createSaveOverwriteConfirmation({
    slotId,
    slotLabel: SAVE_SLOT_LABELS[slotId],
    facts: rawPayload === null
      ? { displayName: null, level: null, savedAtText: null, damageNote: null }
      : describeSaveOverwritePayload(rawPayload),
    rawPayload,
    width: 4000,
    capacity: 40,
    measure: (text) => measure(text, 12),
  });

describe('Round143 overwrite confirmation geometry keeps bands disjoint', () => {
  for (const [viewWidth, viewHeight, fontScale, label] of [
    [960, 540, 1, 'default'],
    [640, 480, 1.4, 'narrow 640x480 at scale 1.4'],
    [640, 360, 1.6, 'narrow 640x360 at max scale 1.6'],
  ] as const) {
    it(`${label}: body, choices and hint stay ordered, inside the panel and canvas`, () => {
      const px = (size: number) => Math.max(8, Math.round(size * fontScale));
      const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
      const g = buildSaveOverwriteGeometry({
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

describe('Round143 payload facts and confirmation blocks', () => {
  const savedAt = '2026-09-30T21:30:00.000Z';
  const raw = JSON.stringify(makeSnapshot('云隐弟子', 10, savedAt));

  it('derives readable name/level/timestamp facts from a valid payload', () => {
    expect(describeSaveOverwritePayload(raw)).toEqual({
      displayName: '云隐弟子',
      level: 10,
      savedAtText: formatSavedAt(savedAt),
      damageNote: null,
    });
  });

  it('degrades broken JSON and protocol-violating payloads to a damage note', () => {
    expect(describeSaveOverwritePayload('not-json{{{').damageNote).toContain('无法解析');
    const badProtocol = JSON.stringify({ ...makeSnapshot('甲', 1, savedAt), protocolVersion: 99 });
    expect(describeSaveOverwritePayload(badProtocol).damageNote).toContain('不受支持');
    const corrupt = JSON.stringify({ ...makeSnapshot('甲', 1, savedAt), player: null });
    expect(describeSaveOverwritePayload(corrupt).damageNote).not.toBeNull();
  });

  it('blocks carry the exact slot label, name/level/timestamp and permanence', () => {
    const blocks = buildSaveOverwriteBlocks({
      slotLabel: SAVE_SLOT_LABELS['slot-2'],
      facts: describeSaveOverwritePayload(raw),
    }).join('\n');
    expect(blocks).toContain(`拟覆盖存档：${SAVE_SLOT_LABELS['slot-2']}`);
    expect(blocks).toContain('云隐弟子');
    expect(blocks).toContain('Lv.10');
    expect(blocks).toContain(formatSavedAt(savedAt));
    expect(blocks).toContain('永久替换');
    expect(blocks).toContain('无法找回');
    expect(blocks).toContain('读完全部说明');
  });

  it('damaged payloads describe the replacement instead of naming ghosts', () => {
    const blocks = buildSaveOverwriteBlocks({
      slotLabel: SAVE_SLOT_LABELS['slot-3'],
      facts: describeSaveOverwritePayload('not-json{{{'),
    }).join('\n');
    expect(blocks).toContain(`拟覆盖存档：${SAVE_SLOT_LABELS['slot-3']}`);
    expect(blocks).toContain('无法读取的存档');
    expect(blocks).not.toContain('not-json{{{'); // The raw payload never leaks into prompt text.
    expect(blocks).toContain('替换这些数据');
  });
});

describe('Round143 pure confirmation state machine', () => {
  it('starts on cancel at page one; a single page is fully read immediately', () => {
    const state = makeState(JSON.stringify(makeSnapshot('甲', 3, '2026-10-01T10:00:00.000Z')));
    expect(state.choice).toBe('cancel');
    expect(state.page).toBe(0);
    expect(state.bodyPages.length).toBe(1);
    expect(state.readAllPages).toBe(true);
  });

  it('a genuinely paged body starts unread and gates on the final page', () => {
    const state = createSaveOverwriteConfirmation({
      slotId: 'slot-1',
      slotLabel: SAVE_SLOT_LABELS['slot-1'],
      facts: describeSaveOverwritePayload(JSON.stringify(makeSnapshot(LONG_NAME, 10, '2026-09-30T21:30:00.000Z'))),
      rawPayload: 'raw',
      width: 220,
      capacity: 2,
      measure: (text) => measure(text, 12),
    });
    expect(state.bodyPages.length).toBeGreaterThan(1);
    expect(state.readAllPages).toBe(false);
    turnSaveOverwritePage(state, -1);
    expect(state.page).toBe(0); // Clamped, never wraps.
    turnSaveOverwritePage(state, 1);
    expect(state.readAllPages).toBe(false); // Only the final page latches it.
    while (state.page < state.bodyPages.length - 1) turnSaveOverwritePage(state, 1);
    expect(state.readAllPages).toBe(true);
    turnSaveOverwritePage(state, -10);
    expect(state.page).toBe(0);
    expect(state.readAllPages).toBe(true); // Reading backwards never unlatches.
  });

  it('cycles the two choices in both directions', () => {
    const state = makeState('raw');
    moveSaveOverwriteChoice(state, 1);
    expect(state.choice).toBe('confirm');
    moveSaveOverwriteChoice(state, 1);
    expect(state.choice).toBe('cancel');
    moveSaveOverwriteChoice(state, -1);
    expect(state.choice).toBe('confirm');
  });

  it('pagination is lossless: every character survives across the pages', () => {
    const facts = describeSaveOverwritePayload(JSON.stringify(makeSnapshot(LONG_NAME, 10, '2026-09-30T21:30:00.000Z')));
    const state = createSaveOverwriteConfirmation({
      slotId: 'slot-1', slotLabel: SAVE_SLOT_LABELS['slot-1'], facts, rawPayload: 'raw',
      width: 220, capacity: 2, measure: (text) => measure(text, 12),
    });
    expect(state.bodyPages.join('\n').replace(/\n/g, '')).toBe(
      buildSaveOverwriteBlocks({ slotLabel: SAVE_SLOT_LABELS['slot-1'], facts }).join('\n').replace(/\n/g, ''),
    );
  });
});

describe('Round143 commit recheck against the memory storage fixture', () => {
  const snapshot = makeSnapshot('云隐弟子', 10, '2026-09-30T21:30:00.000Z');
  const rawA = JSON.stringify(snapshot);

  it('an untouched slot is unchanged and a byte-identical re-read passes', () => {
    const storage = createMemorySaveStorage(new Map([[slotKey('slot-1'), rawA]]));
    expect(verifySaveOverwriteTarget(storage, makeState(rawA))).toEqual({ kind: 'unchanged' });
  });

  it('a byte-level change behind an identical summary refuses the write', () => {
    const storage = createMemorySaveStorage(new Map([[slotKey('slot-1'), rawA]]));
    const prompt = makeState(rawA);
    expect(prompt.facts.displayName).toBe('云隐弟子');
    storage.write(slotKey('slot-1'), JSON.stringify(snapshot, null, 2));
    const precheck = verifySaveOverwriteTarget(storage, prompt);
    expect(precheck.kind).toBe('changed');
    expect(precheck.kind === 'changed' && precheck.message).toContain('发生了变化');
  });

  it('a slot emptied or filled since the prompt opened refuses the write', () => {
    const emptied = createMemorySaveStorage(new Map([[slotKey('slot-1'), rawA]]));
    emptied.remove(slotKey('slot-1'));
    expect(verifySaveOverwriteTarget(emptied, makeState(rawA)).kind).toBe('changed');
    const filled = createMemorySaveStorage();
    filled.write(slotKey('slot-1'), rawA);
    expect(verifySaveOverwriteTarget(filled, makeState(null)).kind).toBe('changed');
  });

  it('a storage read error refuses the write with a readable message', () => {
    const faulting: SaveStorage = {
      read() { throw new Error('quota'); },
      write() {},
      remove() {},
    };
    const precheck = verifySaveOverwriteTarget(faulting, makeState(rawA));
    expect(precheck.kind).toBe('unavailable');
    expect(precheck.kind === 'unavailable' && precheck.message).toContain('未写入');
  });
});

describe('Round143 hint truncation', () => {
  it('keeps a fitting value verbatim and ellipsizes only overflow', () => {
    expect(truncateGrapheme('短提示', 500, (text) => measure(text, 10))).toBe('短提示');
    const long = '一二三四五六七八九十'.repeat(6);
    const cut = truncateGrapheme(long, 200, (text) => measure(text, 10));
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(long.length);
    expect(measure(cut, 10)).toBeLessThanOrEqual(200);
  });
});

// ── UI layer with a measured mock scene (honest simulated-renderer scope) ────
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { UP: 1, DOWN: 2, ENTER: 3, W: 7, S: 8, ESC: 6, LEFT: 9, RIGHT: 10, PAGE_UP: 33, PAGE_DOWN: 34 } } } } }));
vi.mock('../src/game/ui-theme', () => ({
  addPixelPanelChrome: () => {},
  addPixelSelection: () => {},
  UI_FONT_FAMILY: 'monospace',
}));
let fontScale = 1;
vi.mock('../src/game/settings', () => ({
  uiFontSize: (n: number) => `${Math.max(8, Math.round(n * fontScale))}px`,
  DEFAULT_GAME_SETTINGS: { volume: 1, textScale: 1, movementLayout: 'arrows', gamepad: true, highContrast: false, reducedMotion: false },
  SETTINGS_ROW_COUNT: 6,
  adjustGameSetting: (settings: unknown) => settings,
  applyGameSettings: () => {},
  saveGameSettings: () => {},
  settingsRows: () => ['一', '二', '三', '四', '五', '六'],
}));
import type Phaser from 'phaser';
import { PauseMenuPanel } from '../src/game/pause-menu';

interface Shown { text: string; color: string; x: number; y: number; fontPx: number; lines: string[]; destroyed: boolean; originX: number;
  get width (): number; get height (): number; setText (v: string): Shown; setOrigin (x?: number, y?: number): Shown; setColor (): Shown; setVisible (): Shown; destroy (): void;
  context: { measureText: (s: string) => { width: number } }; }

/** Choice rows alone carry a cursor prefix; body lines never do. */
const choiceRow = (texts: Shown[], label: string): Shown =>
  texts.find(t => (t.text.startsWith('▸') || t.text.startsWith('  ')) && t.text.includes(label))!;

interface PauseSetup {
  panel: PauseMenuPanel;
  shown: Shown[];
  visible: () => Shown[];
  press: (code: number) => void;
  saves: SaveSlotId[];
  enterSavePage: () => void;
  failReads: () => void;
  failSaves: () => void;
  rawOf: (slotId: SaveSlotId) => string | null;
  /** Writes through the fixture's memory store (simulates another tab). */
  writeRaw: (slotId: SaveSlotId, text: string | null) => void;
}

function setupPauseMenu(viewWidth: number, viewHeight: number, initial: Map<string, string>): PauseSetup {
  const shown: Shown[] = [];
  const makeText = (x: number, y: number, text: string, style: { fontSize: string; color: string; lineSpacing?: number }): Shown => {
    const fontPx = Number.parseFloat(style.fontSize);
    const node = {
      x, y, text, fontPx, originX: 0, color: style.color, lines: text.split('\n'), destroyed: false,
      get width() { return Math.max(...this.lines.map(line => measure(line, this.fontPx))); },
      get height() { return this.lines.length * this.fontPx + Math.max(0, this.lines.length - 1) * (style.lineSpacing ?? 0) + 2; },
      setText(v: string) { this.text = v; this.lines = v.split('\n'); return this; },
      setOrigin(x = 0.5) { this.originX = x; return this; }, setColor() { return this; }, setVisible() { return this; },
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
      text: (x: number, y: number, text: string, style: { fontSize: string; color: string; lineSpacing?: number }) => makeText(x, y, text, style),
      container: () => container,
    },
    game: {},
  } as unknown as Phaser.Scene;
  const memory = createMemorySaveStorage(initial);
  let failReads = false;
  let failSaves = false;
  const gated: SaveStorage = {
    read(key) { if (failReads) throw new Error('quota'); return memory.read(key); },
    write(key, value) { memory.write(key, value); },
    remove(key) { memory.remove(key); },
  };
  const saves: SaveSlotId[] = [];
  const panel = new PauseMenuPanel(scene, {
    storage: gated,
    save: (slotId) => {
      saves.push(slotId);
      if (failSaves) return { ok: false, message: '空间不足，未写入' };
      const written = writeSaveSlot(memory, slotId, makeSnapshot('新进度侠士', 11, '2026-10-02T09:00:00.000Z'));
      return written.ok ? { ok: true, message: '已保存' } : { ok: false, message: written.ok ? '' : written.message };
    },
    returnToMenu: () => {},
  });
  panel.open({ volume: 1, textScale: 1, movementLayout: 'arrows', gamepad: true, highContrast: false, reducedMotion: false } as never);
  const visible = () => shown.filter(t => !t.destroyed && t.text.length > 0 && t.x > -300);
  const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
  return {
    panel, shown, visible, press, saves,
    enterSavePage: () => { press(2); press(3); }, // ↓ 保存进度 → Enter.
    failReads: () => { failReads = true; },
    failSaves: () => { failSaves = true; },
    rawOf: (slotId) => memory.dump().get(slotKey(slotId)) ?? null,
    writeRaw: (slotId, text) => {
      if (text === null) memory.remove(slotKey(slotId));
      else memory.write(slotKey(slotId), text);
    },
  };
}

/** Prompt chrome texts (title/body/choices/hint), filtered from the page. */
const promptTexts = (visible: () => Shown[]): Shown[] => visible().filter(t =>
  /覆盖存档[一二三]？/.test(t.text)
  || t.text.includes('拟覆盖存档')
  || t.text.includes('取消覆盖')
  || t.text.includes('确认覆盖')
  || (t.text.includes('Enter 执行') && t.text.includes('Esc 取消'))
  || t.text.includes('请先翻页读完说明'));

const SAVED_AT = '2026-09-30T21:30:00.000Z';
const rawSlot1 = (): string => JSON.stringify(makeSnapshot('云隐弟子', 10, SAVED_AT));

describe('Round143 PauseMenuPanel overwrite confirmation flow', () => {
  it('confirmation owns the footer and failed saves consume the old confirmation', () => {
    fontScale = 1;
    const raw = rawSlot1();
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), raw]]));
    r.enterSavePage(); r.press(3);
    expect(r.visible().some(t => t.text.includes('Enter保存'))).toBe(false);
    expect(r.visible().filter(t => t.text.includes('Esc 取消'))).toHaveLength(1);
    r.failSaves(); r.press(2); r.press(3);
    expect(r.saves).toEqual(['slot-1']);
    expect(r.rawOf('slot-1')).toBe(raw);
    expect(r.visible().some(t => t.text.includes('空间不足'))).toBe(true);
    r.press(3); r.press(3); // Reopen default cancel and cancel; no retry write.
    expect(r.saves).toEqual(['slot-1']);
    expect(r.rawOf('slot-1')).toBe(raw);
    r.panel.destroy();
  });

  it('gamepad left/right reads every page before a narrow-font confirmation', () => {
    fontScale = 1.4;
    const r = setupPauseMenu(320, 360, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage(); r.press(3);
    const choice = () => choiceRow(promptTexts(r.visible), '确认覆盖');
    expect(choice().text).toContain('先读说明');
    r.panel.handleGamepadEdges({direction: 'down', confirm: false, back: false});
    r.panel.handleGamepadEdges({direction: null, confirm: true, back: false});
    expect(r.saves).toEqual([]);
    let pages = 0;
    while (choice().text.includes('先读说明') && pages < 40) {
      r.panel.handleGamepadEdges({direction: 'right', confirm: false, back: false});
      pages++;
    }
    expect(pages).toBeGreaterThan(0);
    expect(choice().text).toBe('▸ 确认覆盖');
    const geometry = buildSaveOverwriteGeometry({viewWidth:320, viewHeight:360,
      titleHeight:33,bodyLineHeight:26,choiceHeight:27,hintHeight:21});
    for (const t of promptTexts(r.visible).filter(t => /取消覆盖|确认覆盖/.test(t.text))) {
      expect(t.width).toBeLessThanOrEqual(geometry.contentWidth);
    }
    r.panel.handleGamepadEdges({direction: 'left', confirm: false, back: false});
    r.panel.handleGamepadEdges({direction: null, confirm: true, back: false});
    expect(r.saves).toEqual(['slot-1']);
    r.panel.destroy(); fontScale=1;
  });

  it('Enter on a non-empty slot opens the prompt: exact facts, default cancel, no write', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.press(3); // Enter on 存档一 (non-empty).
    const prompt = promptTexts(r.visible);
    expect(prompt.some(t => t.text === `覆盖${SAVE_SLOT_LABELS['slot-1']}？`)).toBe(true);
    const body = prompt.find(t => t.text.includes('拟覆盖存档'))!.text;
    expect(body).toContain(SAVE_SLOT_LABELS['slot-1']);
    const allPromptText = prompt.map(t => t.text).join('\n');
    expect(allPromptText).toContain('云隐弟子');
    expect(allPromptText).toContain('Lv.10');
    expect(allPromptText).toContain(formatSavedAt(SAVED_AT));
    expect(allPromptText).toContain('永久替换');
    expect(choiceRow(prompt, '取消覆盖').text.startsWith('▸')).toBe(true); // Default focus is cancel.
    expect(choiceRow(prompt, '确认覆盖').text.startsWith('  ')).toBe(true); // Confirm idles.
    // The opaque raw payload never leaks into any rendered text.
    expect(r.visible().some(t => t.text.includes('"protocolVersion"') || t.text.includes('"displayName"'))).toBe(false);
    expect(r.saves).toEqual([]);
    expect(r.rawOf('slot-1')).toBe(rawSlot1());
    r.press(6);
    r.panel.destroy();
  });

  it('repeated Enter with no move and paging never write', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.press(3); // Opens the prompt.
    r.press(3); // Enter on the default cancel choice.
    expect(r.saves).toEqual([]);
    r.press(34); r.press(33); // Paging the prompt body is read-only.
    r.press(3); // Reopens on cancel…
    r.press(3); // …and Enter keeps cancelling.
    expect(r.saves).toEqual([]);
    expect(r.rawOf('slot-1')).toBe(rawSlot1());
    expect(r.visible().some(t => t.text.includes('已取消覆盖'))).toBe(true);
    r.press(6);
    r.panel.destroy();
  });

  it('Esc cancels back onto the same slot and its prior label page', () => {
    fontScale = 1.6; // Long summary on the narrow canvas paginates the label.
    const r = setupPauseMenu(640, 360, new Map([[slotKey('slot-1'), JSON.stringify(makeSnapshot(LONG_NAME, 10, SAVED_AT))]]));
    r.enterSavePage();
    r.press(34); // Label page 2.
    const counterBefore = r.visible().find(t => /^2\/\d+$/.test(t.text))!;
    expect(counterBefore).toBeDefined();
    r.press(3); // Open the overwrite prompt.
    expect(promptTexts(r.visible).length).toBeGreaterThan(0);
    r.press(6); // Esc cancels the prompt only.
    expect(promptTexts(r.visible)).toEqual([]);
    expect(r.panel.isOpen).toBe(true);
    expect(r.visible().some(t => /^2\/\d+$/.test(t.text))).toBe(true); // Same label page.
    expect(r.saves).toEqual([]);
    r.press(33); // PgUp walks back to page one — proving the page really survived.
    expect(r.visible().some(t => t.text.includes(`▸ ${SAVE_SLOT_LABELS['slot-1']}`))).toBe(true); // Same slot still selected.
    r.press(6); r.press(6);
    fontScale = 1;
    r.panel.destroy();
  });

  it('an empty slot saves directly behind the fresh read', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map());
    r.enterSavePage();
    r.press(3); // Enter on the (listed and actually) empty 存档一.
    expect(r.saves).toEqual(['slot-1']);
    expect(promptTexts(r.visible)).toEqual([]);
    expect(r.visible().some(t => t.text.includes(`${SAVE_SLOT_LABELS['slot-1']}：已保存`))).toBe(true);
    r.press(6);
    r.panel.destroy();
  });

  it('a corrupt slot opens the confirmation too, never saving unconfirmed', () => {
    fontScale = 1;
    const junk = 'not-json{{{';
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-3'), junk]]));
    r.enterSavePage();
    r.press(2); r.press(2); // ↓↓ to 存档三.
    r.press(3);
    const prompt = promptTexts(r.visible);
    expect(prompt.some(t => t.text === `覆盖${SAVE_SLOT_LABELS['slot-3']}？`)).toBe(true);
    expect(prompt.map(t => t.text).join('\n')).toContain('无法读取');
    r.press(3); // Default cancel.
    expect(r.saves).toEqual([]);
    expect(r.rawOf('slot-3')).toBe(junk);
    r.press(3); // Reopen…
    r.press(2); // ↓ to confirm (single readable page already latched the gate).
    r.press(3); // Commit replaces even the damaged payload.
    expect(r.saves).toEqual(['slot-3']);
    expect(r.rawOf('slot-3')).not.toBe(junk);
    r.press(6);
    r.panel.destroy();
  });

  it('a payload changed behind an identical summary is refused and needs a new confirmation', () => {
    fontScale = 1;
    const raw = rawSlot1();
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), raw]]));
    r.enterSavePage();
    r.press(3); // Prompt bound to `raw`.
    // Same summary, different bytes: a pretty-printed reserialization of the
    // very same snapshot (another tab rewrote it byte-for-byte differently).
    r.writeRaw('slot-1', JSON.stringify(JSON.parse(raw), null, 2));
    r.press(2); // ↓ to confirm (single page fully read).
    r.press(3); // Commit: the recheck sees different bytes and refuses.
    expect(r.saves).toEqual([]);
    expect(r.rawOf('slot-1')).toBe(JSON.stringify(JSON.parse(raw), null, 2)); // Untouched.
    expect(promptTexts(r.visible)).toEqual([]); // The prompt is gone…
    expect(r.visible().some(t => t.text.includes('发生了变化') && t.text.includes('未写入'))).toBe(true);
    r.press(3); // A fresh Enter opens a NEW confirmation bound to the new bytes.
    expect(promptTexts(r.visible).length).toBeGreaterThan(0);
    expect(choiceRow(promptTexts(r.visible), '取消覆盖').text.startsWith('▸')).toBe(true); // Default cancel again.
    r.press(6);
    r.panel.destroy();
  });

  it('a storage read error at commit refuses the write', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.press(3);
    r.press(2); // ↓ to confirm (single page fully read).
    r.failReads(); // The recheck read now throws.
    r.press(3);
    expect(r.saves).toEqual([]);
    expect(r.visible().some(t => t.text.includes('未写入存档'))).toBe(true);
    r.press(6);
    r.panel.destroy();
  });

  it('after a committed save, Enter only opens a fresh default-cancel confirmation', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.press(3); r.press(2); r.press(3); // Open, ↓, commit.
    expect(r.saves).toEqual(['slot-1']);
    const after = r.rawOf('slot-1')!;
    expect(after).not.toBe(rawSlot1());
    r.press(3); // Enter again: the now-nonempty slot prompts, default cancel.
    const prompt = promptTexts(r.visible);
    expect(choiceRow(prompt, '取消覆盖').text.startsWith('▸')).toBe(true);
    r.press(3); // Enter stays cancel — no second write.
    expect(r.saves).toEqual(['slot-1']);
    expect(r.rawOf('slot-1')).toBe(after);
    r.press(6);
    r.panel.destroy();
  });

  it('closing and reopening the panel clears the pending confirmation', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.press(3);
    expect(promptTexts(r.visible).length).toBeGreaterThan(0);
    r.press(6); r.press(6); r.press(6); // Esc drops the prompt, backs to main, closes.
    expect(r.panel.isOpen).toBe(false);
    r.panel.open({ volume: 1, textScale: 1, movementLayout: 'arrows', gamepad: true, highContrast: false, reducedMotion: false } as never);
    r.press(2); r.press(3); // Back into the save page.
    expect(promptTexts(r.visible)).toEqual([]); // No stale prompt survived.
    r.press(3); // Enter opens a fresh one, still defaulting to cancel.
    expect(choiceRow(promptTexts(r.visible), '取消覆盖').text.startsWith('▸')).toBe(true);
    expect(r.saves).toEqual([]);
    r.press(6);
    r.panel.destroy();
  });

  it('a slot filled after the summary was listed still prompts instead of saving blind', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map());
    r.enterSavePage(); // The listed summary shows 存档一 as 空（新建存档）.
    expect(r.visible().some(t => t.text.includes('空（新建存档）'))).toBe(true);
    r.writeRaw('slot-1', rawSlot1()); // …but another tab fills it before Enter.
    r.press(3);
    expect(r.saves).toEqual([]); // No blind overwrite.
    const prompt = promptTexts(r.visible);
    expect(prompt.some(t => t.text === `覆盖${SAVE_SLOT_LABELS['slot-1']}？`)).toBe(true);
    expect(prompt.map(t => t.text).join('\n')).toContain('云隐弟子'); // The fresh payload's facts.
    r.press(3); // Default cancel keeps it.
    expect(r.saves).toEqual([]);
    expect(r.rawOf('slot-1')).toBe(rawSlot1());
    r.press(6);
    r.panel.destroy();
  });
});

describe('Round143 measured paging gate and geometry at the extreme scales', () => {
  it('max font on the narrow canvas pages the body and gates confirm on reading it all', () => {
    fontScale = 1.6;
    const r = setupPauseMenu(640, 360, new Map([[slotKey('slot-1'), JSON.stringify(makeSnapshot(LONG_NAME, 10, SAVED_AT))]]));
    r.enterSavePage();
    r.press(3);
    const commitOf = () => choiceRow(promptTexts(r.visible), '确认覆盖');
    expect(commitOf().text).toContain('先读说明'); // Locked by the gate.
    r.press(2);
    r.press(3); // Enter on confirm without having read: refused.
    expect(r.saves).toEqual([]);
    expect(promptTexts(r.visible).some(t => t.text.includes('请先翻页读完说明'))).toBe(true);
    let guard = 0;
    while (commitOf().text.includes('先读说明') && guard < 40) {
      r.press(34); // PageDown walks to the final page, latching the gate.
      guard += 1;
    }
    expect(guard).toBeGreaterThan(0); // The body genuinely paged.
    expect(commitOf().text).toBe('▸ 确认覆盖'); // Unlocked label.
    expect(promptTexts(r.visible).some(t => t.text.includes('请先翻页读完说明'))).toBe(false);
    r.press(3); // Enter commits now.
    expect(r.saves).toEqual(['slot-1']);
    // Lossless: every authored character appeared across the prompt's pages.
    r.press(6);
    fontScale = 1;
    r.panel.destroy();
  });

  it('scale 1.4 on 640x480 keeps the bands ordered and inside the canvas', () => {
    fontScale = 1.4;
    const r = setupPauseMenu(640, 480, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.press(3);
    const prompt = promptTexts(r.visible);
    const title = prompt.find(t => /覆盖存档[一二三]？/.test(t.text))!;
    const body = prompt.find(t => t.text.includes('拟覆盖存档'))!;
    const cancel = choiceRow(prompt, '取消覆盖');
    const commit = choiceRow(prompt, '确认覆盖');
    const hint = prompt.find(t => t.text.includes('Esc 取消'))!;
    expect(title.y).toBeLessThan(body.y);
    expect(body.y).toBeLessThan(cancel.y);
    expect(cancel.y).toBeLessThan(commit.y);
    expect(commit.y).toBeLessThan(hint.y);
    const px = (size: number) => Math.max(8, Math.round(size * fontScale));
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildSaveOverwriteGeometry({
      viewWidth: 640, viewHeight: 480,
      titleHeight: lineSize(16), bodyLineHeight: lineSize(12),
      choiceHeight: lineSize(13), hintHeight: lineSize(10),
    });
    for (const t of prompt) {
      expect(t.y).toBeGreaterThanOrEqual(geometry.top - 0.5);
      expect(t.y + t.height).toBeLessThanOrEqual(geometry.top + geometry.height + 0.5);
      expect(t.x).toBeGreaterThanOrEqual(geometry.left - 0.5);
    }
    expect(body.y + body.height).toBeLessThanOrEqual(geometry.choiceTop - 5.5); // Body stays off the choices.
    r.press(6);
    fontScale = 1;
    r.panel.destroy();
  });

  it('gamepad edges route through the same confirmation boundary', () => {
    fontScale = 1;
    const r = setupPauseMenu(960, 540, new Map([[slotKey('slot-1'), rawSlot1()]]));
    r.enterSavePage();
    r.panel.handleGamepadEdges({ direction: null, confirm: true, back: false }); // A opens the prompt.
    expect(r.saves).toEqual([]);
    const prompt = promptTexts(r.visible);
    expect(prompt.some(t => t.text === `覆盖${SAVE_SLOT_LABELS['slot-1']}？`)).toBe(true);
    expect(choiceRow(prompt, '取消覆盖').text.startsWith('▸')).toBe(true);
    r.panel.handleGamepadEdges({ direction: null, confirm: false, back: true }); // B cancels like Esc.
    expect(r.saves).toEqual([]);
    expect(promptTexts(r.visible)).toEqual([]);
    r.panel.handleGamepadEdges({ direction: null, confirm: true, back: false }); // A reopens it.
    r.panel.handleGamepadEdges({ direction: 'down', confirm: false, back: false }); // Stick ↓ reaches confirm.
    expect(choiceRow(promptTexts(r.visible), '确认覆盖').text.startsWith('▸')).toBe(true);
    r.panel.handleGamepadEdges({ direction: null, confirm: true, back: false }); // A commits (single page read).
    expect(r.saves).toEqual(['slot-1']);
    r.press(6);
    r.panel.destroy();
  });
});
