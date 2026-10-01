/**
 * Round 120: 炼丹/锻造面板全文可读 —— 纯布局与 UI 两层回归。
 *
 * 两面板原先以 clip(100/96) 截断作者描述、药材/预览/状态钉在固定 y、用
 * Phaser 空格 wordWrap（中文不断行）。现复用 R119 的实测几何与无损分页
 * （crafting-panel-layout → quest-panel-layout → dialogue-layout），详情
 * 含完整标题、全文描述、每味材料持有/所需、工钱资格、产物属性与用途，
 * PgUp/PgDn 线性翻页并在换选/开面/制作后回到第一页；未识药方的详情块
 * 由构造保密——只有线索行，绝无配方名、材料或产物。以下用真实
 * round-25/round-24/round-06 资料在纯层验证内容与保密，在 mock 场景验证
 * 键位行为：Enter 恰好调用一次 onCraft、翻页不触发制作。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { checkAlchemyRecipe, parseAlchemySet, selectAlchemyOutcome } from '../src/engine/alchemy-system';
import { checkEquipmentForgeRecipe, parseEquipmentForgeSet } from '../src/engine/equipment-forge';
import { createInventoryState, indexItems, parseItemSet } from '../src/engine/item-system';
import { parseCharacterProfileSet } from '../src/engine/character-progression';
import {
  buildAlchemyDetailBlocks,
  buildCraftingPanelGeometry,
  buildForgeDetailBlocks,
  craftingIngredientViews,
  craftingReceipt,
  paginateCraftingDetail,
} from '../src/game/crafting-panel-layout';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const alchemyParse = parseAlchemySet(read('data/base/alchemy/round-25-alchemy.json'));
const forgeParse = parseEquipmentForgeSet(read('data/base/forges/round-24-equipment-forges.json'));
const itemParse = parseItemSet(read('data/base/items/round-06-items.json'));
const profileParse = parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json'));
if (!alchemyParse.ok || !forgeParse.ok || !itemParse.ok || !profileParse.ok) throw Error('fixture 解析失败');
const items = indexItems(itemParse.set).byId;
const profile = profileParse.set.profiles[0]!;
const inventory = () => { const state = createInventoryState(profile, []); state.currency = 300; return state; };

const alchemyStation = { record: alchemyParse.set.stations[0]!, recipes: alchemyParse.set.recipes };
const forgeStation = { record: forgeParse.set.stations[0]!, recipes: forgeParse.set.recipes };
const shengji = alchemyStation.recipes[0]!;
const penSword = forgeStation.recipes[0]!;

const measure = (text: string, px = 12): number => Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

describe('Round120 crafting panel geometry fits every band at both scales', () => {
  for (const [maxWidth, maxHeight, fontScale, label] of [[860, 510, 1, 'alchemy default'], [840, 508, 1.6, 'forge max font 640x360']] as const) {
    it(`${label}: rows, detail, status and hint stay disjoint and inside the panel`, () => {
      const px = (size: number) => Math.round(size * fontScale);
      const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
      const g = buildCraftingPanelGeometry({
        viewWidth: fontScale === 1 ? 960 : 640, viewHeight: fontScale === 1 ? 540 : 360,
        titleHeight: lineSize(21), subtitleHeight: lineSize(11),
        rowHeight: lineSize(12) + 6, detailLineHeight: lineSize(12),
        statusHeight: lineSize(11), hintHeight: lineSize(10),
        maxWidth, maxHeight,
      });
      expect(g.width).toBeLessThanOrEqual(Math.min(maxWidth, (fontScale === 1 ? 960 : 640) - 40) + 0.5);
      expect(g.visibleRows).toBeGreaterThanOrEqual(1);
      expect(g.detailCapacity).toBeGreaterThanOrEqual(1);
      expect(g.listTop + g.visibleRows * g.rowHeight).toBeLessThanOrEqual(g.detailTop + 0.5);
      expect(g.detailTop + g.detailCapacity * g.detailLineHeight).toBeLessThanOrEqual(g.statusTop - 5.5);
      expect(g.statusTop + lineSize(11)).toBeLessThanOrEqual(g.hintTop + 0.5);
      expect(g.hintTop + lineSize(10)).toBeLessThanOrEqual(g.top + g.height - 9.5);
    });
  }
});

describe('Round120 lossless crafting detail blocks (real round-25/24/06 data)', () => {
  it('known alchemy recipe carries the full description, materials, outcome and eligibility', () => {
    const bag = inventory();
    const views = craftingIngredientViews(shengji, bag, items);
    const quality = selectAlchemyOutcome(shengji, 8);
    const result = items.get(quality!.resultItemId)!;
    const eligibility = checkAlchemyRecipe({ recipe: shengji, insight: 8, knownKnowledgeNodeIds: new Set([shengji.discoveryNodeId]), inventory: bag, items });
    const blocks = buildAlchemyDetailBlocks({
      recipe: shengji, known: true, index: 1, ingredientViews: views,
      outcome: { qualityName: quality!.name, itemName: result.name, healthRestore: result.consumable!.healthRestore, qiRestore: result.consumable!.qiRestore, description: result.description },
      eligibility,
    });
    const body = blocks.join('\n\n');
    expect(blocks[0]).toBe(shengji.name); // Full selected title in the details.
    for (const char of shengji.description) expect(body).toContain(char);
    for (const view of views) expect(body).toContain(`${view.name}　${view.owned}/${view.quantity}`);
    expect(body).toContain(`恢复气血 ${result.consumable!.healthRestore}`);
    expect(body).toContain(result.description);
    expect(body).toContain(eligibility.available ? '材料与工钱齐备，可以开炉。' : eligibility.reason!);
  });

  it('an undiscovered formula reveals only clue lines — never materials or outcomes', () => {
    const blocks = buildAlchemyDetailBlocks({
      recipe: shengji, known: false, index: 1,
      ingredientViews: craftingIngredientViews(shengji, inventory(), items),
      outcome: null, eligibility: { available: false, reason: null },
    });
    // Exactly the four fixed clue lines — the authored hint may name the
    // formula (that is its job), but nothing else about it leaks.
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toBe('未识药方 1');
    expect(blocks[1]).toBe('尚未掌握此方');
    expect(blocks[2]).toBe(shengji.discoveryHint);
    expect(blocks[3]).toBe('与江湖人物交谈、留心见闻，或许能找到传授药方的人。');
    const body = blocks.join('\n\n');
    expect(body).not.toContain(shengji.description);
    for (const ingredient of shengji.ingredients) {
      expect(body).not.toContain(items.get(ingredient.itemId)?.name ?? ingredient.itemId);
    }
    for (const outcome of shengji.outcomes) {
      // Full outcome item names carry the quality suffix, distinct from the hint.
      expect(body).not.toContain(items.get(outcome.resultItemId)?.name ?? outcome.resultItemId);
    }
  });

  it('forge recipe carries description,投入, full outcome stats/slot/use text and eligibility', () => {
    const bag = inventory();
    const views = craftingIngredientViews(penSword, bag, items);
    const result = items.get(penSword.resultItemId)!;
    const eligibility = checkEquipmentForgeRecipe({ recipe: penSword, inventory: bag, items });
    const blocks = buildForgeDetailBlocks({
      recipe: penSword, ingredientViews: views,
      result: { name: result.name, statsLine: '膂力 +1　·　兵刃', description: result.description },
      eligibility,
    });
    const body = blocks.join('\n\n');
    expect(blocks[0]).toBe(penSword.name);
    for (const char of penSword.description) expect(body).toContain(char);
    for (const view of views) expect(body).toContain(`${view.name}　${view.owned}/${view.quantity}`);
    expect(body).toContain(result.name);
    expect(body).toContain(result.description);
  });

  it('a forge recipe without materials states 无 instead of an empty block', () => {
    const blocks = buildForgeDetailBlocks({
      recipe: { ...penSword, ingredients: [] }, ingredientViews: [],
      result: null, eligibility: { available: true, reason: null },
    });
    expect(blocks.join('\n\n')).toContain('投入\n无');
  });

  it('multi-material long MOD fields paginate with zero lost lines', () => {
    const modRecipe = {
      ...penSword, id: 'forge.mod-flood', name: '超长MOD锻造名'.repeat(10),
      description: '重理笔剑刃口考据'.repeat(200),
      ingredients: [
        { itemId: penSword.ingredients[0]!.itemId, quantity: 3 },
        { itemId: penSword.ingredients[1]!.itemId, quantity: 2 },
      ],
    };
    const views = craftingIngredientViews(modRecipe, inventory(), items);
    const blocks = buildForgeDetailBlocks({
      recipe: modRecipe, ingredientViews: views,
      result: { name: '淬锋短剑', statsLine: '膂力 +1　·　兵刃', description: '用途说明'.repeat(120) },
      eligibility: { available: false, reason: '测试原因' },
    });
    const width = 840 - 60;
    const pages = paginateCraftingDetail(blocks, width, 3, (text) => measure(text, 12));
    const pagedLines = pages.flatMap((page) => page.split('\n'));
    const allLines = paginateCraftingDetail(blocks, width, 9999, (text) => measure(text, 12))[0]!.split('\n');
    expect(pagedLines).toEqual(allLines); // Nothing dropped or reordered.
    expect(pages.length).toBeGreaterThan(6);
    const flat = pages.join('\n').replace(/\n/g, '');
    expect(flat.split('重理笔剑刃口考据').length - 1).toBe(200); // Every repetition survived.
    expect(flat).toContain('超长MOD锻造名'.repeat(5));
    expect(flat.split('用途说明').length - 1).toBe(120);
  });
});

// ── UI layer with a measured mock scene (honest simulated-renderer scope) ────
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { UP: 1, DOWN: 2, ENTER: 3, ESC: 6, W: 7, S: 8, PAGE_UP: 33, PAGE_DOWN: 34 } } } } }));
vi.mock('../src/game/ui-theme', () => ({
  addPixelPanelChrome: () => {},
  UI_FONT_FAMILY: 'monospace',
  UI_PALETTE: { accent: '#fff', muted: '#aaa', text: '#eee', jade: '#afa' },
}));
let fontScale = 1;
vi.mock('../src/game/settings', () => ({ uiFontSize: (n: number) => `${Math.max(8, Math.round(n * fontScale))}px` }));
import { AlchemyPanel } from '../src/game/alchemy-ui';
import { EquipmentForgePanel } from '../src/game/equipment-forge-ui';

interface Shown { text: string; color: string; x: number; y: number; fontPx: number; lines: string[]; destroyed: boolean;
  get height (): number; setText (v: string): Shown; setOrigin (): Shown; setColor (): Shown; setVisible (): Shown; destroy (): void;
  context: { measureText: (s: string) => { width: number } }; }

function setupPanel<T>(PanelClass: new (scene: Phaser.Scene, onClose?: () => void) => T, viewWidth: number, viewHeight: number) {
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
  const events: string[] = [];
  const container = { setDepth() { return this; }, setVisible() { return this; }, removeAll() { for (const t of shown) t.destroyed = true; return this; }, add() { return this; }, destroy() {} };
  const scene = {
    scale: { width: viewWidth, height: viewHeight },
    input: { keyboard: { addKey(code: number) { if (!keys.has(code)) keys.set(code, new Set()); return { on(_e: string, fn: () => void) { keys.get(code)!.add(fn); }, off(_e: string, fn: () => void) { keys.get(code)!.delete(fn); } }; } } },
    add: {
      text: (x: number, y: number, text: string, style: { fontSize: string; color: string }) => makeText(x, y, text, style),
      container: () => container,
    },
  } as unknown as Phaser.Scene;
  const panel = new PanelClass(scene, () => events.push('closed'));
  const visible = () => shown.filter((t) => !t.destroyed && t.text.length > 0 && t.x > -300);
  const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
  return { panel, shown, visible, press, events };
}

describe('Round120 crafting panels: paging, confidentiality and exactly-one craft', () => {
  it('alchemy panel pages the known formula, resets on selection and crafts exactly once per Enter', () => {
    fontScale = 1.6;
    const r = setupPanel(AlchemyPanel, 640, 360);
    let crafts = 0;
    const bag = inventory();
    r.panel.open({
      station: alchemyStation, inventory: bag, items,
      knownKnowledgeNodeIds: new Set([shengji.discoveryNodeId]), insight: 8,
      onCraft: () => { crafts += 1; return { ok: true, message: '炼成：生肌散（成色普通）' }; },
    });
    const detail = () => r.visible().find((t) => t.color === '#eee' && t.lines.length >= 2 && !t.text.startsWith('▸') && !t.text.startsWith('　'));
    const firstPage = detail()!.text;
    expect(r.visible().some((t) => t.text.includes(shengji.name))).toBe(true); // Full title in the details.
    const hintOf = () => r.visible().find((t) => /详情\d+\/\d+页/.test(t.text))?.text;
    { // Paging is mandatory at this geometry; assertions cannot be skipped.
      expect(hintOf()).toMatch(/详情1\/\d+页/);
      r.press(34); // PageDown never crafts.
      expect(crafts).toBe(0);
      expect(hintOf()).toMatch(/详情2\/\d+页/);
      r.press(1); // ↑ to another formula: page one again.
      expect(hintOf()).toMatch(/详情1\/\d+页/);
      r.press(2); // ↓ back to the original formula: its own first page again.
      expect(detail()!.text).toBe(firstPage);
      r.press(33); // PgUp clamps at page one.
      expect(hintOf()).toMatch(/详情1\/\d+页/);
    }
    r.press(3); // Enter: exactly one craft call.
    expect(crafts).toBe(1);
    expect(r.visible().some((t) => t.text.includes('炼成'))).toBe(true); // The crafting notice shows.
    r.press(3);
    expect(crafts).toBe(2); // One Enter, one craft — paging never batched.
    r.press(6);
    expect(r.panel.isOpen).toBe(false);
    expect(r.events).toEqual(['closed']);
    fontScale = 1;
  });

  it('an unknown formula stays confidential and Enter reports the clue without crafting', () => {
    fontScale = 1;
    const r = setupPanel(AlchemyPanel, 960, 540);
    let crafts = 0;
    r.panel.open({
      station: alchemyStation, inventory: inventory(), items,
      knownKnowledgeNodeIds: new Set(['knowledge.never']), insight: 8,
      onCraft: () => { crafts += 1; return { ok: false, message: '不应到达' }; },
    });
    expect(r.visible().some((t) => t.text.includes('未识药方 1'))).toBe(true);
    // No material or outcome leaks anywhere on the panel (the authored hint
    // itself may mention the formula's common name — that is its job).
    for (const leaked of ['寒珠草', '苍崖根', '生肌散·']) {
      expect(r.visible().some((t) => t.text.includes(leaked))).toBe(false);
    }
    r.press(3);
    expect(crafts).toBe(0);
    expect(r.visible().some((t) => t.text.includes(shengji.discoveryHint))).toBe(true);
    r.panel.close();
  });

  it('forge panel pages its recipe and crafts exactly once per Enter', () => {
    fontScale = 1;
    const r = setupPanel(EquipmentForgePanel, 960, 540);
    let crafts = 0;
    r.panel.open({
      station: forgeStation, inventory: inventory(), items,
      attributeLabels: { body: '膂力', force: '内劲', agility: '身法', insight: '悟性', resolve: '心志' },
      onCraft: () => { crafts += 1; return { ok: true, message: '锻造完成：淬锋短剑' }; },
    });
    expect(r.visible().some((t) => t.text.includes(penSword.name))).toBe(true);
    expect(r.visible().some((t) => t.text.includes('现有银两 300'))).toBe(true); // Fee/silver facts stay visible.
    r.press(34); // PageDown only.
    expect(crafts).toBe(0);
    r.press(3);
    expect(crafts).toBe(1);
    expect(r.visible().some((t) => t.text.includes('锻造完成'))).toBe(true);
    r.press(6);
    expect(r.panel.isOpen).toBe(false);
    r.panel.destroy();
  });
});


describe('Round120 primary review: readable keys and complete craft notices', () => {
  it('alchemy keeps Esc on its own band and preserves a long rejection across detail pages', () => {
    fontScale = 1.6;
    const r = setupPanel(AlchemyPanel, 640, 360);
    const message = '材料尚缺，请先准备齐再来。'.repeat(30) + '通知完整尾标';
    let calls = 0;
    r.panel.open({ station: alchemyStation, inventory: inventory(), items,
      knownKnowledgeNodeIds: new Set([shengji.discoveryNodeId]), insight: 16,
      onCraft: () => { calls++; return { ok: false, message }; },
    });
    const heading = r.visible().find(t => t.text.includes('炼丹'))!;
    const keys = r.visible().find(t => t.text.includes('Esc 收起'))!;
    expect(keys).toBeDefined(); expect(keys.y).toBeGreaterThan(heading.y);
    r.press(34); r.press(3);
    const hint = r.visible().find(t => /详情1\/\d+页/.test(t.text))!;
    expect(hint).toBeDefined();
    const count = Number(hint.text.match(/详情1\/(\d+)页/)![1]);
    const texts: string[] = [];
    for (let i=0;i<count;i++) { texts.push(...r.visible().filter(t=>t.color === '#eee' && t.fontPx === Math.round(12 * fontScale)).map(t=>t.text)); r.press(34); }
    expect(texts.join('').replace(/\n/g,'')).toContain(message);
    expect(calls).toBe(1);
    r.panel.close(); fontScale=1;
  });
  it('forge keeps full long notices in pages and never crafts while paging', () => {
    fontScale=1.6;
    const r=setupPanel(EquipmentForgePanel,640,360);
    const message='锻造拒绝，旧器仍穿戴中。'.repeat(30)+'通知完整尾标'; let calls=0;
    r.panel.open({station:forgeStation,inventory:inventory(),items,
      attributeLabels:{body:'体魄',force:'力道',agility:'身法',insight:'悟性',resolve:'定力'},
      onCraft:()=>{calls++;return {ok:false,message};}});
    expect(r.visible().some(t=>t.text.includes('Esc 收起'))).toBe(true);
    r.press(3);
    const hint=r.visible().find(t=>/详情1\/\d+页/.test(t.text))!;
    expect(hint).toBeDefined(); const count=Number(hint.text.match(/详情1\/(\d+)页/)![1]);
    const texts:string[]=[];
    for(let i=0;i<count;i++){texts.push(...r.visible().filter(t=>t.color === '#eee' && t.fontPx === Math.round(12 * fontScale)).map(t=>t.text));r.press(34);}
    expect(texts.join('').replace(/\n/g,'')).toContain(message);
    expect(calls).toBe(1);r.panel.close();fontScale=1;
  });
});


describe('Round120 crafting growth feedback', () => {
  it('receipt distinguishes first-craft reward from the craft settlement', () => {
    expect(craftingReceipt('炼成','成药',475,520)).toContain('工钱结算后 475，随后变化 +45，当前银两 520');
    expect(craftingReceipt('锻成','成器',100,126)).toContain('当前银两 126');
    expect(craftingReceipt('锻成','成器',100,100)).toBe('已锻成「成器」，当前银两 100。');
    const source=readFileSync(join(root,'src/game/grid-scene.ts'),'utf8');
    expect(source).toContain("craftingReceipt('炼成', outcome.result.name, outcome.remainingCurrency, inventory.currency)");
    expect(source).toContain('getInsight: () => this.playerState?.attributes.insight');
    expect(source).toContain('character: this.playerState ?? character');
  });
  it('recomputes preview and eligibility from live insight after crafting grows the player', () => {
    fontScale=1;
    const r=setupPanel(AlchemyPanel,960,540);let liveInsight=8;
    const bag=inventory();
    r.panel.open({station:alchemyStation,inventory:bag,items,
      knownKnowledgeNodeIds:new Set([shengji.discoveryNodeId]),insight:8,getInsight:()=>liveInsight,
      onCraft:()=>{liveInsight=24;return {ok:true,message:'已炼成'};}});
    expect(r.visible().some(t=>t.text.includes('悟性 8'))).toBe(true);
    r.press(3);
    expect(r.visible().some(t=>t.text.includes('悟性 24'))).toBe(true);
    const texts:string[]=[];
    for(let i=0;i<20;i++){texts.push(...r.visible().map(t=>t.text));r.press(34);}
    expect(texts.join('')).toContain('上乘');
    expect(texts.join('')).not.toContain('当前粗制');
    r.panel.close();
  });
});
