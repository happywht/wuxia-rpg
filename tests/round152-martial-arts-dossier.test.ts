import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { ESC: 1, PAGE_UP: 2, PAGE_DOWN: 3 } } } } }));
vi.mock('../src/game/ui-theme', () => ({ UI_FONT_FAMILY: 'monospace', UI_PALETTE: { accent: 'a', text: 't', muted: 'm' }, addPixelPanelChrome: () => {} }));
let scale = 1;
vi.mock('../src/game/settings', () => ({ uiFontSize: (n: number) => `${n * scale}px` }));
import { createCharacterState, parseCharacterProfileSet, parseFactionSet, parseMartialArtSet } from '../src/engine/character-progression';
import { buildMartialArtsDossier } from '../src/engine/martial-arts-dossier';
import { MartialArtsPanel } from '../src/game/martial-arts-ui';
import { paginateFactionDossier } from '../src/game/faction-panel-layout';
const read = (p: string) => JSON.parse(readFileSync('data/base/' + p, 'utf8'));
const pp = parseCharacterProfileSet(read('characters/round-04-profiles.json'));
const fp = parseFactionSet(read('factions/round-04-factions.json'));
const ap = parseMartialArtSet(read('skills/round-04-martial-arts.json'));
if (!pp.ok || !fp.ok || !ap.ok) throw Error('invalid fixture');
const profile = pp.set.profiles[0]!;
const arts = new Map(ap.set.martialArts.map(a => [a.id, a]));
const factions = new Map(fp.set.factions.map(f => [f.id, f]));
function input() {
  const character = createCharacterState(profile);
  character.level = 5;
  character.attributes = { body: 17, force: 14, agility: 11, insight: 12, resolve: 11 };
  character.martialArtIds = ['skill.jianghu-sanshou', 'skill.tiezhang-zhuanggong', 'skill.r32-tiezhang-tiezhuang-quan'];
  return { character, factionId: 'faction.tiezhang-pai', factions, martialArts: arts };
}
function setup(model = input()) {
  const handlers = new Map<number, () => void>();
  const shown: { text: string; dead: boolean }[] = [];
  let closed = 0;
  const container = { setDepth() { return this; }, setVisible() { return this; }, add() { return this; },
    removeAll() { shown.forEach(t => t.dead = true); return this; }, destroy() {} };
  const scene = { scale: { width: 960, height: 540 }, input: { keyboard: { addKey(code: number) {
    return { on(_e: string, fn: () => void) { handlers.set(code, fn); }, off() { handlers.delete(code); } };
  } } }, add: { container: () => container, text: (_x: number, _y: number, text: string, style: { fontSize: string }) => {
    const t = { text, dead: false, context: { measureText: (v: string) => ({ width: Array.from(v).length * Number.parseFloat(style.fontSize) }) } };
    shown.push(t); return t;
  } } };
  const panel = new MartialArtsPanel(scene as unknown as Phaser.Scene, () => closed++);
  panel.open(model);
  return { panel, press: (key: number) => handlers.get(key)?.(), shown: () => shown.filter(t => !t.dead).map(t => t.text).join('\n'), handlers, closed: () => closed };
}
describe('Round152 martial arts ownership and growth reader', () => {
  it('shows actual ownership separately from teaching eligibility and real costs', () => {
    const blocks = buildMartialArtsDossier(input());
    expect(blocks.find(b => b.startsWith('铁桩靠山拳'))).toContain('已学');
    expect(blocks.find(b => b.startsWith('铁桩靠山拳'))).toContain('耗气3');
    expect(blocks.some(b => b.includes('未学：当前门槛达到'))).toBe(true);
    expect(blocks.some(b => b.includes('未学：尚未达到门槛'))).toBe(true);
    expect(blocks.join()).not.toContain('当前熟练度');
  });
  it('includes current-school and common directions without listing unrelated unlearned schools', () => {
    const i = input(), text = buildMartialArtsDossier(i).join('\n');
    for (const art of arts.values()) {
      if (art.factionIds.length > 0 && !art.factionIds.includes(i.factionId) && !i.character.martialArtIds.includes(art.id)) {
        expect(text).not.toContain(art.name + ' ·');
      }
    }
  });
  it('refreshes eligibility after level/attribute/faction changes without granting ownership', () => {
    const i = input(), before = [...i.character.martialArtIds];
    i.character.level = 20;
    for (const id of Object.keys(i.character.attributes) as (keyof typeof i.character.attributes)[]) i.character.attributes[id] = 50;
    expect(buildMartialArtsDossier(i).join()).not.toContain('未学：尚未达到门槛');
    expect(i.character.martialArtIds).toEqual(before);
    i.factionId = '';
    expect(buildMartialArtsDossier(i).join()).not.toContain('十手推碑腿 ·');
    expect(buildMartialArtsDossier(i).join()).toContain('铁桩靠山拳');
  });
  it('handles absent player/data and unknown learned ids without dropping their records', () => {
    expect(buildMartialArtsDossier({ ...input(), character: null })).toEqual(['角色资料暂不可用。']);
    const i = input(); i.martialArts = new Map();
    expect(buildMartialArtsDossier(i).join()).toContain('已学资料暂不可用');
    expect(i.character.martialArtIds).toHaveLength(3);
  });
  it('includes a learned custom art using its loaded effect and complete description', () => {
    const i = input(), custom = { ...arts.values().next().value!, id: 'custom.test', name: '自创测试', description: '完整长文'.repeat(200), combat: { kind: 'guard' as const, power: 9, qiCost: 6 } };
    i.martialArts = new Map([...arts, [custom.id, custom]]); i.character.martialArtIds.push(custom.id);
    const text = buildMartialArtsDossier(i).join('\n');
    expect(text).toContain(custom.description); expect(text).toContain('下一次受击抵挡9'); expect(text).toContain('耗气6');
  });
  it('labels healing as health only and never promises free qi or universal final damage', () => {
    const text = buildMartialArtsDossier(input()).join('\n');
    expect(text).toContain('不回复内力'); expect(text).toContain('敌体魄'); expect(text).toContain('战斗状态影响');
  });
  it('does not mutate source character or arts', () => {
    const i = input(), before = structuredClone(i); buildMartialArtsDossier(i);
    expect(i).toEqual(before);
  });
  it('paginates all characters of long descriptions without omission', () => {
    const text = '长文完整显示'.repeat(100);
    const pages = paginateFactionDossier([text], 200, 5, value => Array.from(value).length * 12);
    expect(pages).toHaveLength(8);
    expect(pages.join('').replaceAll('\n', '')).toBe(text);
  });
  it.each([1, 1.5])('keyboard page reader closes and reopens cleanly at font scale %s', value => {
    scale = value;
    const s = setup(); const first = s.shown(); s.press(3);
    expect(s.shown()).not.toBe(first); s.press(2); expect(s.shown()).toBe(first);
    expect(s.handlers.size).toBe(3); s.press(1); expect(s.panel.isOpen).toBe(false);
    expect(s.closed()).toBe(1); expect(s.handlers.size).toBe(0);
    s.panel.close(); expect(s.closed()).toBe(1);
    s.panel.open(input()); expect(s.shown()).toBe(first); s.panel.destroy(); expect(s.handlers.size).toBe(0);
    scale = 1;
  });
  it('scene connects U, shared overlay gating, replacement and shutdown ownership', () => {
    const scene = readFileSync('src/game/grid-scene.ts', 'utf8');
    expect(scene).toContain("'martialArtsPanel', 'martialArtForgePanel'");
    expect(scene).toContain('keyboard.addKey(KeyCodes.U)');
    expect(scene).toContain("martialArtsKey.off('down', onMartialArts)");
    expect(scene).toContain('(this.martialArtsPanel !== null && this.martialArtsPanel.isOpen)');
    expect(scene).toContain('this.martialArtsPanel?.destroy();');
    expect(scene).toContain('martialArts: this.combatMartialArts()');
    expect(scene).toContain('if (this.anyOverlayOpen()) return;\n    panel.open({ character:');
  });
});

