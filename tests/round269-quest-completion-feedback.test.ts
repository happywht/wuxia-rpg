/**
 * Round 269: 任务日志完成反馈（会话收据 + 一次性完成焦点 + 每页身份头）。
 *
 * 一、完成差事后打开 Q，应优先看到刚完成的差事一次：焦点由场景在真实
 * 发奖路径记录、全局日志打开时恰好消费一次；NPC 名录打开不消费、不
 * 覆盖；未发生完成时进行中任务/就近可接的既有初始选择保持不变；陈旧
 * 或未知焦点安全落回正常打开。
 * 二、详情报酬区分三种真相：待接/进行中只是未结算预览；已完成且本会话
 * 无收据（读档/场景重建）只展示约定报酬并明说无记录；已完成且有本会话
 * 收据展示实付（经验封顶弃置单独标注，零实付照实显示 +0），收据跨页
 * 完整可读。
 * 三、详情每一页都带「任务名」［状态］身份头：长/MOD 名用实测字宽截断，
 * 640×360 大字号下不溢出面板，身份头使用既有副标题区域。
 * 收据只在真实发奖分支产生、不改存档、世界重建即清空；以下用纯层 +
 * 实测字宽 mock 面板 + 真实 GridScene 方法三层验证行为回归。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  QuestSessionFeedback,
  questSettlementBlocks,
  type QuestSessionReceipt,
} from '../src/game/quest-feedback';
import { buildQuestDetailBlocks } from '../src/game/quest-panel-layout';
import { createQuestJournal, parseQuestSet, type QuestData, type QuestRewardGrant } from '../src/engine/quest-system';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const questParse = parseQuestSet(read('data/base/quests/round-97-lanxin-reef-quests.json'));
if (!questParse.ok) throw Error(questParse.errors.join('\n'));
const tideLedger = questParse.set.quests.find((quest) => quest.id === 'quest.r97-tide-ledger')!;
const beaconRelight = questParse.set.quests.find((quest) => quest.id === 'quest.r97-beacon-relight')!;
const quests = new Map(questParse.set.quests.map((quest) => [quest.id, quest]));

const measure = (text: string, px = 12): number =>
  Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

const makeQuest = (id: string, name: string): QuestData => ({
  id,
  name,
  description: `${name}的托付说明。`,
  giverNpcId: 'char.r269-giver',
  prerequisiteQuestIds: [],
  objectives: [{
    id: `${id}-obj1`,
    kind: 'talkToNpc',
    targetId: 'char.r269-target',
    requiredCount: 1,
    text: `${name}的目标`,
  }],
  failOnEncounterIds: [],
  rewards: { experience: 30, currency: 5 },
});

const sampleReceipt = (overrides: Partial<QuestSessionReceipt> = {}): QuestSessionReceipt => ({
  questId: tideLedger.id,
  paidExperience: 27,
  discardedExperience: 3,
  currency: 5,
  cultivation: 2,
  factionRenown: [{ factionId: 'faction.r269-hearthwatch', delta: 1 }],
  discoveredKnowledgeNodeIds: ['knowledge.r269-tide-lore'],
  ...overrides,
});

describe('Round269 QuestSessionFeedback state machine', () => {
  it('records receipts, keeps the most recent completion as the pending focus', () => {
    const feedback = new QuestSessionFeedback();
    feedback.recordCompletion(sampleReceipt({ questId: tideLedger.id }));
    feedback.recordCompletion(sampleReceipt({ questId: beaconRelight.id, paidExperience: 56 }));
    expect(feedback.receiptOf(tideLedger.id)!.paidExperience).toBe(27); // Both kept.
    expect(feedback.receiptOf(beaconRelight.id)!.paidExperience).toBe(56);
    expect(feedback.peekPendingFocusQuestId()).toBe(beaconRelight.id); // Most recent wins.
  });

  it('the global journal open consumes the pending focus exactly once', () => {
    const feedback = new QuestSessionFeedback();
    feedback.recordCompletion(sampleReceipt());
    expect(feedback.takePendingFocusQuestId()).toBe(tideLedger.id);
    expect(feedback.takePendingFocusQuestId()).toBeNull(); // Never twice.
    expect(feedback.receiptOf(tideLedger.id)).toBeDefined(); // Receipt survives the focus.
  });

  it('reset clears receipts and focus together (fresh world adoption)', () => {
    const feedback = new QuestSessionFeedback();
    feedback.recordCompletion(sampleReceipt());
    feedback.reset();
    expect(feedback.receiptOf(tideLedger.id)).toBeUndefined();
    expect(feedback.peekPendingFocusQuestId()).toBeNull();
  });
});

describe('Round269 questSettlementBlocks honesty', () => {
  it('offered, active and locked rows say the reward is an unpaid preview', () => {
    for (const status of ['offered', 'active', 'locked'] as const) {
      const blocks = questSettlementBlocks({ status, receipt: sampleReceipt() });
      expect(blocks).toEqual(['结算：差事尚未完成，以上报酬未入账']);
    }
  });

  it('a failed row says no reward was paid', () => {
    expect(questSettlementBlocks({ status: 'failed', receipt: undefined })).toEqual(['结算：差事已失败，报酬未发放']);
  });

  it('a completion without a receipt never fabricates a payout', () => {
    const blocks = questSettlementBlocks({ status: 'completed', receipt: undefined });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('本会话无到账记录');
    expect(blocks[0]).toContain('差事约定报酬');
    expect(blocks[0]).not.toContain('本次到账'); // Only a real receipt says that.
    expect(blocks[0]).not.toMatch(/\+(27|30)/); // No amount posing as paid.
  });

  it('a real receipt quotes the paid amount, the cap discard and every consequence', () => {
    const blocks = questSettlementBlocks({
      status: 'completed',
      receipt: sampleReceipt(),
      maps: {
        factionNames: new Map([['faction.r269-hearthwatch', '炉山守望']]),
        knowledgeNodeTitles: new Map([['knowledge.r269-tide-lore', '潮簿旧闻']]),
      },
    });
    expect(blocks).toEqual(['本次到账：经验 +27（封顶弃3） · 银两 +5 · 修为 +2 · 炉山守望声望 +1 · 新见闻「潮簿旧闻」']);
  });

  it('a fully capped grant reports zero paid experience, not the authored amount', () => {
    const blocks = questSettlementBlocks({
      status: 'completed',
      receipt: sampleReceipt({ paidExperience: 0, discardedExperience: 30 }),
    });
    expect(blocks[0]).toContain('经验 +0（封顶弃30）');
    expect(blocks[0]).not.toContain('经验 +30'); // Authored ≠ paid.
  });

  it('zero-delta lines stay honest and map-less ids fall back to their raw ids', () => {
    const plain = questSettlementBlocks({
      status: 'completed',
      receipt: sampleReceipt({ cultivation: 0, discardedExperience: 0, factionRenown: [], discoveredKnowledgeNodeIds: [] }),
    });
    expect(plain).toEqual(['本次到账：经验 +27 · 银两 +5']);
    const raw = questSettlementBlocks({ status: 'completed', receipt: sampleReceipt({ cultivation: 0 }) });
    expect(raw[0]).toContain('faction.r269-hearthwatch声望 +1');
    expect(raw[0]).toContain('新见闻「knowledge.r269-tide-lore」');
  });
});

describe('Round269 buildQuestDetailBlocks appends the settlement after the reward line', () => {
  it('keeps the authored reward line first, then the settlement blocks', () => {
    const journal = createQuestJournal(quests);
    const state = journal.states.get(tideLedger.id)!;
    state.status = 'active';
    const withSettlement = buildQuestDetailBlocks(tideLedger, state, {}, undefined, ['结算：差事尚未完成，以上报酬未入账']);
    const without = buildQuestDetailBlocks(tideLedger, state);
    expect(without[without.length - 1]).toMatch(/^预计报酬：/);
    expect(without[without.length - 1]).toContain('未结算');
    expect(withSettlement.slice(0, without.length)).toEqual(without); // Nothing before it changed.
    expect(withSettlement[withSettlement.length - 1]).toBe('结算：差事尚未完成，以上报酬未入账');
  });
});

// ── UI layer with a measured mock scene ─────────────────────────────────────
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Input: { Keyboard: { KeyCodes: { UP: 1, DOWN: 2, ENTER: 3, N: 4, A: 5, ESC: 6, W: 7, S: 8, PAGE_UP: 33, PAGE_DOWN: 34, LEFT: 9, RIGHT: 10 } } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
  },
}));
vi.mock('../src/game/ui-theme', () => ({
  addPixelPanelChrome: () => {},
  addPixelSelection: () => {},
  UI_FONT_FAMILY: 'monospace',
}));
let fontScale = 1;
vi.mock('../src/game/settings', async (importOriginal) => ({
  // GridScene's field initializers spread DEFAULT_GAME_SETTINGS: keep every
  // real export and only re-point the font probe at the live test scale.
  ...(await importOriginal<typeof import('../src/game/settings')>()),
  uiFontSize: (n: number) => `${Math.max(8, Math.round(n * fontScale))}px`,
}));
import { QuestPanel } from '../src/game/quest-ui';
import { GridScene } from '../src/game/grid-scene';
import { createCharacterState, parseCharacterProfileSet, cumulativeExperienceForLevel } from '../src/engine/character-progression';
import { createInventoryState, parseItemSet } from '../src/engine/item-system';
import { createSocialState } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';

interface Shown { text: string; color: string; x: number; y: number; fontPx: number; lines: string[]; destroyed: boolean;
  get height (): number; setText (v: string): Shown; setOrigin (): Shown; setColor (): Shown; setVisible (): Shown; destroy (): void;
  context: { measureText: (s: string) => { width: number } }; }

function makeMockScene(viewWidth: number, viewHeight: number) {
  const shown: Shown[] = [];
  const keys = new Map<number, Set<() => void>>();
  const container = { setDepth() { return this; }, setVisible() { return this; }, removeAll() { for (const t of shown) t.destroyed = true; return this; }, add() { return this; }, destroy() {} };
  const scene = {
    scale: { width: viewWidth, height: viewHeight },
    input: { keyboard: { addKey(code: number) { if (!keys.has(code)) keys.set(code, new Set()); return { on(_e: string, fn: () => void) { keys.get(code)!.add(fn); }, off(_e: string, fn: () => void) { keys.get(code)!.delete(fn); } }; } } },
    add: {
      text: (x: number, y: number, text: string, style: { fontSize: string; color: string }): Shown => {
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
      },
      container: () => container,
    },
  } as unknown as Phaser.Scene;
  const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
  return { scene, shown, press };
}

function setupPanel(viewWidth: number, viewHeight: number, questMap: ReadonlyMap<string, QuestData> = quests) {
  const host = makeMockScene(viewWidth, viewHeight);
  const panel = new QuestPanel(host.scene, {
    onClose: () => {},
    onUpdate: () => {},
    onQuestAccepted: () => {},
    onNavigateQuest: () => ({ ok: false, message: '' }),
  });
  const journal = createQuestJournal(questMap);
  const visible = () => host.shown.filter((t) => !t.destroyed && t.text.length > 0 && t.x > -300);
  const headerOf = () => visible().find((t) => t.color === '#8a94a6' && /^「.+」［.+］$/.test(t.text));
  const detailTexts = () => visible().filter((t) => t.color === '#d8dee9').map((t) => t.text);
  const pageHint = () => visible().find((t) => /详情\d+\/\d+页/.test(t.text))?.text ?? null;
  return { panel, host, journal, visible, headerOf, detailTexts, pageHint, press: host.press };
}

describe('Round269 QuestPanel one-shot completion focus', () => {
  it('focuses the just-completed quest once even while another task stays active', () => {
    fontScale = 1;
    const r = setupPanel(960, 540);
    r.journal.states.get(tideLedger.id)!.status = 'completed';
    r.journal.states.get(beaconRelight.id)!.status = 'active';
    const base = { quests, journal: r.journal, itemCounts: new Map<string, number>(), access: { factionId: null, knownKnowledgeNodeIds: new Set<string>() } };
    r.panel.open({ ...base, focusQuestId: tideLedger.id });
    expect(r.headerOf()!.text).toBe(`「${tideLedger.name}」［已完成］`); // The completion owns this open…
    r.panel.close();
    r.panel.open({ ...base, recommendedQuestId: beaconRelight.id }); // …and only this open.
    expect(r.headerOf()!.text).toContain(beaconRelight.name);
    expect(r.headerOf()!.text).toContain('［进行中］'); // Normal initial selection is back.
    r.panel.destroy();
  });

  it('a stale focus id degrades to a normal open instead of breaking', () => {
    fontScale = 1;
    const r = setupPanel(960, 540);
    r.journal.states.get(beaconRelight.id)!.status = 'active';
    r.panel.open({
      quests, journal: r.journal, focusQuestId: 'quest.r269-unknown',
      itemCounts: new Map(), access: { factionId: null, knownKnowledgeNodeIds: new Set() },
    });
    expect(r.panel.isOpen).toBe(true);
    expect(r.headerOf()!.text).toContain(beaconRelight.name); // Row zero, the plain initial selection.
    r.panel.destroy();
  });

  it('an unknown completion falls back to the recommended local offer', () => {
    const r = setupPanel(960, 540);
    r.panel.open({ quests, journal: r.journal, focusQuestId: 'quest.gone',
      recommendedQuestId: beaconRelight.id, itemCounts: new Map(),
      access: { factionId: null, knownKnowledgeNodeIds: new Set() } });
    expect(r.headerOf()!.text).toContain(beaconRelight.name);
    r.panel.destroy();
  });

  it('an NPC board ignores a supplied completion focus and keeps offers first', () => {
    const offer = makeQuest('quest.board-offer', '现场托付');
    const done = makeQuest('quest.board-done', '上次托付');
    const map = new Map([[offer.id, offer], [done.id, done]]);
    const r = setupPanel(960, 540, map);
    r.journal.states.get(done.id)!.status = 'completed';
    r.panel.open({ quests: map, journal: r.journal, giverNpcId: offer.giverNpcId,
      focusQuestId: done.id, itemCounts: new Map(),
      access: { factionId: null, knownKnowledgeNodeIds: new Set() } });
    expect(r.headerOf()!.text).toContain(offer.name);
    r.panel.destroy();
  });
});

describe('Round269 per-page identity header and readable settlement', () => {
  it.each([360, 300])('every page keeps identity without footer overlap at 640x%d / max font', (viewHeight) => {
    fontScale = 1.6;
    const mod: QuestData = {
      ...tideLedger, id: 'quest.r269-mod-flood', name: '超长MOD差事名'.repeat(12),
      description: '澜心湾潮簿考据'.repeat(40),
      objectives: [{ ...tideLedger.objectives[0]!, text: '逐页核对潮簿刻线'.repeat(20) }],
    };
    const modQuests = new Map([[mod.id, mod]]);
    const host = makeMockScene(640, viewHeight);
    const panel = new QuestPanel(host.scene, { onClose: () => {} });
    const journal = createQuestJournal(modQuests);
    journal.states.get(mod.id)!.status = 'completed';
    panel.open({ quests: modQuests, journal, itemCounts: new Map(), access: { factionId: null, knownKnowledgeNodeIds: new Set() } });
    const visible = () => host.shown.filter((t) => !t.destroyed && t.text.length > 0 && t.x > -300);
    const headerOf = () => visible().find((t) => t.color === '#8a94a6' && /^「.+」［.+］$/.test(t.text));
    const pageHint = () => visible().find((t) => /详情\d+\/\d+页/.test(t.text))?.text ?? null;
    const header = headerOf()!;
    expect(header.text).toContain('…'); // A MOD-flooded name truncates…
    expect(header.text.endsWith('［已完成］')).toBe(true); // …but never the status off the tail.
    const contentWidth = Math.min(720, 640 - 40) - 48;
    expect(measure(header.text, header.fontPx)).toBeLessThanOrEqual(contentWidth);
    const panelHeight = Math.min(440, viewHeight - 40);
    const panelTop = (viewHeight - panelHeight) / 2;
    const assertBands = () => {
      const footer = visible().find(t => /详情\d+\/\d+页/.test(t.text))!;
      for (const t of visible()) {
        expect(t.y + t.height).toBeLessThanOrEqual(panelTop + panelHeight - 8.5);
        if (t.color === '#d8dee9') expect(t.y + t.height).toBeLessThan(footer.y);
      }
    };
    assertBands();
    let guard = 0;
    const firstHint = pageHint();
    if (firstHint !== null) { // A genuinely paged body: walk some pages, header present on each.
      while (guard < 5) {
        const before = pageHint()!;
        host.press(34);
        const after = pageHint();
        if (after === before || after === null) break; // Reached the last page.
        guard += 1;
        expect(headerOf()).toBeDefined();
        expect(headerOf()!.text).toBe(header.text); // Same quest, same status, every page.
        assertBands();
      }
      expect(guard).toBeGreaterThan(0); // The body really did page under the header.
    }
    panel.destroy();
    fontScale = 1;
  });

  it('the unpaid preview, the no-record wording and the real receipt read distinctly across paging', () => {
    fontScale = 1;
    const archived = makeQuest('quest.r269-archived', '旧档差事');
    const all = new Map([...quests, [archived.id, archived]]);
    const r = setupPanel(960, 540, all);
    r.journal.states.get(tideLedger.id)!.status = 'completed';
    r.journal.states.get(archived.id)!.status = 'completed';
    const base = {
      quests: all, journal: r.journal, itemCounts: new Map<string, number>(),
      questReceiptOf: (questId: string) => (questId === tideLedger.id ? sampleReceipt() : undefined),
      access: { factionId: null, knownKnowledgeNodeIds: new Set<string>() },
    };
    const collectBody = (): string => {
      const seen: string[] = [];
      for (let guard = 0; guard < 80; guard += 1) {
        seen.push(...r.visible().filter((t) => t.color === '#d8dee9').map((t) => t.text));
        const hint = r.pageHint();
        if (hint === null) break; // Single page: everything is already collected.
        const [, current, total] = hint.match(/详情(\d+)\/(\d+)页/)!.map(Number);
        if (current === total) break;
        r.press(34);
      }
      return seen.join('\n').replace(/\n/g, '');
    };
    r.panel.open({ ...base, focusQuestId: tideLedger.id });
    const paid = collectBody();
    expect(paid).toContain('本次到账');
    expect(paid).toContain('经验 +27（封顶弃3）');
    expect(paid).toContain('银两 +5');
    expect(paid).toContain('修为 +2');
    expect(paid).toContain('声望 +1');
    expect(paid).toContain('新见闻');
    expect(paid).toContain(`报酬：经验 +${tideLedger.rewards.experience}`); // The promise stays quoted beside it.
    r.panel.close();
    // A completed row without a receipt (read save / rebuilt scene): honest no-record.
    r.panel.open({ ...base, focusQuestId: archived.id });
    const noRecord = collectBody();
    expect(noRecord).toContain('本会话无到账记录');
    expect(noRecord).toContain('差事约定报酬');
    expect(noRecord).not.toContain('本次到账');
    r.panel.close();
    // An offered row previews the reward as unpaid.
    r.panel.open({ ...base, focusQuestId: beaconRelight.id });
    const preview = collectBody();
    expect(preview).toContain('结算：差事尚未完成，以上报酬未入账');
    expect(preview).not.toContain('本次到账');
    r.panel.destroy();
  });
});

// ── Scene integration: the real grant path feeds the feedback ───────────────
function hostScene() {
  const profileParse = parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json'));
  const itemParse = parseItemSet(read('data/base/items/round-06-items.json'));
  if (!profileParse.ok || !itemParse.ok) throw Error('fixture');
  const profile = profileParse.set.profiles[0]!;
  const character = createCharacterState(profile);
  const inventory = createInventoryState(profile, []);
  const journal = createQuestJournal(quests);
  // One other task stays in progress; the beacon relight is the one being
  // completed by the grant below (its journal transition happens alongside
  // the grant in the real signal path — mirrored manually here).
  journal.states.get(tideLedger.id)!.status = 'active';
  journal.states.get(beaconRelight.id)!.status = 'active';
  const panelHost = makeMockScene(960, 540);
  const questPanel = new QuestPanel(panelHost.scene, { onClose: () => {} });
  const scene = new GridScene();
  Object.assign(scene, {
    quests, questJournal: journal, playerProfile: profile, playerState: character,
    inventory, social: createSocialState(), knownKnowledgeNodeIds: new Set<string>(),
    completedEncounters: new Set<string>(), meridianSet: null, world: null, placedNpcs: [],
    playerCol: 0, playerRow: 0, factionState: createFactionMembershipState(),
    progression: { factions: new Map(), profiles: new Map() },
    questNotice: null, questNoticeTimer: null, questPanel,
    updateQuestTrackerHud: vi.fn(), updateInteractHint: vi.fn(),
    refreshNavigationGuide: vi.fn(), noteOverlayClosed: vi.fn(), anyOverlayOpen: () => false,
  });
  const internals = scene as unknown as {
    applyQuestUpdate: (update: { changed: boolean; completed: QuestRewardGrant[]; failedQuestIds: string[] }) => void;
    toggleQuestJournal: () => void;
    questFeedback: QuestSessionFeedback;
  };
  const visible = () => panelHost.shown.filter((t) => !t.destroyed && t.text.length > 0 && t.x > -300);
  const headerOf = () => visible().find((t) => t.color === '#8a94a6' && /^「.+」［.+］$/.test(t.text));
  const grant: QuestRewardGrant = {
    questId: beaconRelight.id,
    experience: 56,
    currency: 48,
    factionRenown: [{ factionId: 'faction.r269-hearthwatch', delta: 2 }],
    discoverKnowledgeNodeIds: ['knowledge.r269-tide-lore'],
  };
  return { scene, internals, journal, character, inventory, profile, questPanel, panelHost, visible, headerOf, grant };
}

describe('Round269 GridScene grant path records in-session receipts', () => {
  it('stores what was actually paid, with consequences, and arms the focus', () => {
    const h = hostScene();
    const currencyBefore = h.inventory.currency;
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    const receipt = h.internals.questFeedback.receiptOf(beaconRelight.id);
    expect(receipt).toBeDefined();
    expect(receipt!.paidExperience + receipt!.discardedExperience).toBe(56); // Paid + discarded = authored.
    expect(receipt!.currency).toBe(48);
    expect(receipt!.cultivation).toBe(0); // No meridian set in this run.
    expect(receipt!.factionRenown).toEqual([{ factionId: 'faction.r269-hearthwatch', delta: 2 }]);
    expect(receipt!.discoveredKnowledgeNodeIds).toEqual(['knowledge.r269-tide-lore']);
    expect(h.inventory.currency).toBe(currencyBefore + 48); // The grant itself is unchanged.
    expect(h.internals.questFeedback.takePendingFocusQuestId()).toBe(beaconRelight.id);
  });

  it('a maxed character records zero paid experience with the full discard', () => {
    const h = hostScene();
    h.character.level = h.profile.maxLevel;
    h.character.experience = cumulativeExperienceForLevel(h.profile, h.profile.maxLevel);
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    const receipt = h.internals.questFeedback.receiptOf(beaconRelight.id)!;
    expect(receipt.paidExperience).toBe(0);
    expect(receipt.discardedExperience).toBe(56);
  });

  it('receipts record the clamped faction change rather than promised renown', () => {
    const h = hostScene();
    const social = (h.scene as unknown as { social: { factionRenown: Map<string, number> } }).social;
    social.factionRenown.set('faction.r269-hearthwatch', 999);
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    expect(social.factionRenown.get('faction.r269-hearthwatch')).toBe(1000);
    expect(h.internals.questFeedback.receiptOf(beaconRelight.id)!.factionRenown)
      .toEqual([{ factionId: 'faction.r269-hearthwatch', delta: 1 }]);
  });

  it('no playable profile means no grant and no receipt (never fabricated)', () => {
    const h = hostScene();
    Object.assign(h.scene, { playerProfile: null, playerState: null });
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    expect(h.internals.questFeedback.receiptOf(beaconRelight.id)).toBeUndefined();
    expect(h.internals.questFeedback.peekPendingFocusQuestId()).toBeNull();
  });

  it('the world adoption boundary clears the ledger (no receipts across a reload)', () => {
    const h = hostScene();
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    h.internals.questFeedback.reset(); // What setupWorld does on every (re)adoption.
    expect(h.internals.questFeedback.receiptOf(beaconRelight.id)).toBeUndefined();
    const source = readFileSync(join(root, 'src/game/grid-scene.ts'), 'utf8');
    expect(source).toContain('this.questFeedback.reset(); // Round 269'); // Guard the reset stays on that path.
  });
});

describe('Round269 GridScene journal focus consumption', () => {
  it('toggleQuestJournal spends the pending completion focus exactly once', () => {
    const h = hostScene();
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    h.journal.states.get(beaconRelight.id)!.status = 'completed'; // The signal path's transition.
    h.internals.toggleQuestJournal();
    expect(h.questPanel.isOpen).toBe(true);
    expect(h.headerOf()!.text).toBe(`「${beaconRelight.name}」［已完成］`); // The completion owns the open…
    expect(h.internals.questFeedback.peekPendingFocusQuestId()).toBeNull(); // …and the focus is spent.
    h.internals.toggleQuestJournal(); // Close.
    h.internals.toggleQuestJournal(); // Open again: no focus left.
    expect(h.questPanel.isOpen).toBe(true);
    expect(h.headerOf()!.text).toBe(`「${tideLedger.name}」［进行中］`); // The active task leads again, as before.
    h.questPanel.destroy();
  });

  it('an NPC board open neither spends nor overrides the pending focus', () => {
    const h = hostScene();
    h.internals.applyQuestUpdate({ changed: true, completed: [h.grant], failedQuestIds: [] });
    h.journal.states.get(beaconRelight.id)!.status = 'completed';
    h.questPanel.open({ // The board path: giver model, no focusQuestId, no take.
      quests,
      journal: h.journal,
      giverNpcId: 'char.r269-giver',
      giverName: '炉山守望人',
      questReceiptOf: (questId: string) => h.internals.questFeedback.receiptOf(questId),
      itemCounts: new Map(),
      access: { factionId: null, knownKnowledgeNodeIds: new Set() },
    });
    expect(h.questPanel.isOpen).toBe(true);
    h.questPanel.close();
    h.internals.toggleQuestJournal();
    expect(h.headerOf()!.text).toBe(`「${beaconRelight.name}」［已完成］`); // Still armed for Q.
    h.questPanel.destroy();
  });

  it('a stale pending focus is still consumed and degrades to a plain open', () => {
    const h = hostScene();
    h.internals.questFeedback.recordCompletion({
      questId: 'quest.r269-gone', paidExperience: 1, discardedExperience: 0, currency: 0,
      cultivation: 0, factionRenown: [], discoveredKnowledgeNodeIds: [],
    });
    h.internals.toggleQuestJournal();
    expect(h.questPanel.isOpen).toBe(true);
    expect(h.headerOf()!.text).toContain('［进行中］'); // Row zero: the normal initial selection.
    expect(h.internals.questFeedback.peekPendingFocusQuestId()).toBeNull(); // Consumed, not stuck.
    h.internals.toggleQuestJournal(); // The next open is a normal one too.
    expect(h.questPanel.isOpen).toBe(false);
    h.questPanel.destroy();
  });
});
