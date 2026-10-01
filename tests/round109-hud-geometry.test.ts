/**
 * Round 109 measured-HUD geometry and wiring checks.
 *
 * The HUD lines below are fakes whose measuring context mirrors the real
 * one (width = graphemes × live font size), so every assertion checks the
 * geometry GridScene actually computes: reserved bands that cannot overlap
 * at the maximum text scale, an ellipsized compact title that still avoids
 * the coordinates column, capped quest lines that keep their actionable
 * head, a navigation band that keeps full route copy, a bottom interaction
 * line whose bar always covers the shown lines, and re-layout from the RAW
 * copy after the text scale changes (no stale truncation).
 *
 * Pure geometry via the scene's own relayoutHud; the GridScene marker
 * wiring/lifecycle checks live in round109-transition-markers.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(_key?: string) {} },
    Input: { Keyboard: { KeyCodes: {} } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
  },
}));

import { GridScene } from '../src/game/grid-scene';
import { DEFAULT_GAME_SETTINGS, loadGameSettings, TEXT_SCALE_STEPS, uiFontSize } from '../src/game/settings';

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

function settingsStorage(textScaleIndex: number) {
  const payload = JSON.stringify({ ...DEFAULT_GAME_SETTINGS, textScaleIndex });
  return { read: () => payload, write: () => true, remove: () => {} };
}

interface FakeText {
  text: string;
  x: number;
  y: number;
  ox: number;
  oy: number;
  fontPx: number;
  lines: string[];
  width: number;
  height: number;
  setFontSize(value: string): FakeText;
  setText(value: string): FakeText;
  setOrigin(ox: number, oy: number): FakeText;
  setPosition(x: number, y: number): FakeText;
  setColor(): FakeText;
  context: { measureText(value: string): { width: number } };
}

function fakeText(base: number): FakeText {
  const t = {
    text: '', x: 0, y: 0, ox: 0, oy: 0, fontPx: Number.parseFloat(uiFontSize(base)),
    setFontSize(value: string) { this.fontPx = Number.parseFloat(value); return this; },
    setText(value: string) { this.text = value; return this; },
    setOrigin(ox: number, oy: number) { this.ox = ox; this.oy = oy; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setColor() { return this; },
    get lines() { return this.text.split('\n'); },
    get width() { return Math.max(0, ...this.lines.map((l) => l.length * this.fontPx)); },
    get height() { return this.lines.length * this.fontPx; },
    context: {} as { measureText(value: string): { width: number } },
  };
  t.context = { measureText: (s: string) => ({ width: s.length * t.fontPx }) };
  return t as FakeText;
}

interface FakeRect { x: number; y: number; width: number; height: number }
function fakeRect(): FakeRect & { setPosition(x: number, y: number): unknown; setSize(w: number, h: number): unknown } {
  return {
    x: 0, y: 0, width: 0, height: 0,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setSize(w: number, h: number) { this.width = w; this.height = h; return this; },
  };
}

interface HudRect { left: number; right: number; top: number; bottom: number }
function rectOf(text: FakeText): HudRect {
  const left = text.ox === 0.5 ? text.x - text.width / 2 : text.ox === 1 ? text.x - text.width : text.x;
  const top = text.oy === 1 ? text.y - text.height : text.y;
  return { left, right: left + text.width, top, bottom: top + text.height };
}

interface HudRaws {
  title?: string; time?: string; climate?: string; help?: string;
  quest?: string; nav?: string; interact?: string; name?: string;
}

function seedHud(textScaleIndex: number, raws: HudRaws = {}) {
  loadGameSettings(settingsStorage(textScaleIndex));
  const scene = new GridScene();
  const I = scene as unknown as Record<string, unknown>;
  const texts = {
    help: fakeText(13), quest: fakeText(11), nav: fakeText(10), title: fakeText(14),
    coords: fakeText(13), time: fakeText(13), climate: fakeText(10), interact: fakeText(12),
  };
  const hudTopRect = fakeRect();
  const hudBottomRect = fakeRect();
  Object.assign(I, {
    hudMeasureText: fakeText(12),
    movementHintText: texts.help,
    questTrackerText: texts.quest,
    navigationHintText: texts.nav,
    mapNameText: texts.title,
    coordsText: texts.coords,
    timeText: texts.time,
    climateText: texts.climate,
    interactText: texts.interact,
    hudTopRect, hudBottomRect,
    hudWarningTexts: [], hudWarningRawLines: [],
    hudLines: {
      title: raws.title ?? '铁嶂北道·岩关驿镇',
      time: raws.time ?? '第1年 三月12日 12:19 · 午后',
      climate: raws.climate ?? '初春 · 小雨 · 潮位：回落',
      help: raws.help ?? '方向键 / WASD 移动 · E 交互 · R 行旅 · H 帮助',
      quest: raws.quest ?? '',
      nav: raws.nav ?? '',
      interact: raws.interact ?? '',
    },
    playerDisplayName: raws.name ?? '',
    playerCol: 4,
    playerRow: 7,
  });
  const relayout = (): void => (I.relayoutHud as () => void).call(scene);
  const layoutInteract = (): void => (I.layoutInteractHint as () => void).call(scene);
  relayout();
  return { scene, I, texts, hudTopRect, hudBottomRect, relayout, layoutInteract };
}

describe('Round109 measured HUD geometry', () => {
  it('retains the actual at-gate action when both authored names are very long', () => {
    const {scene,I,texts}=seedHud(4);
    const guide={status:'at-gate',destinationName:'目的地'.repeat(60),nextTransitionName:'关口'.repeat(80),path:[]};
    Object.assign(I,{map:{pixelWidth:100,pixelHeight:100},world:{},navigationDestinationId:'test',resolveNavigationGuide:()=>guide});
    (I.refreshNavigationGuide as ()=>void).call(scene);
    expect(texts.nav.text).toContain('按 E 通过');
    expect(texts.nav.text).toContain('…');
    expect(texts.nav.lines.length).toBeLessThanOrEqual(3);
    expect(guide.destinationName).toBe('目的地'.repeat(60));
  });
  it('at the default scale no band overlaps and the backing rect covers the stack', () => {
    const { texts, hudTopRect } = seedHud(1, {
      quest: '跟踪：护送药材北上　收集药材 2/3 · 送往青帆埠 0/1',
      nav: '行路「青帆埠」· 南3格→东12格至「落潮湾渡口」旁。',
    });
    const title = rectOf(texts.title), coords = rectOf(texts.coords);
    const help = rectOf(texts.help), time = rectOf(texts.time);
    const quest = rectOf(texts.quest), climate = rectOf(texts.climate);
    const nav = rectOf(texts.nav);
    // Row one: title and coordinates share the band without touching.
    expect(title.right).toBeLessThanOrEqual(coords.left - 10);
    expect(title.left).toBeGreaterThanOrEqual(16);
    expect(title.right).toBeLessThanOrEqual(VIEW_WIDTH - 16);
    // Left column bands are strictly ordered below the title band.
    expect(help.top).toBeGreaterThanOrEqual(Math.max(title.bottom, coords.bottom));
    expect(quest.top).toBeGreaterThanOrEqual(help.bottom);
    expect(nav.top).toBeGreaterThanOrEqual(Math.max(quest.bottom, climate.bottom));
    // Same-row columns never touch: help vs date, quest vs climate.
    expect(help.right).toBeLessThanOrEqual(time.left - 10);
    expect(quest.right).toBeLessThanOrEqual(climate.left - 10);
    // The backing rectangle covers every band, not a fixed slab.
    expect(hudTopRect.width).toBe(VIEW_WIDTH);
    expect(hudTopRect.height).toBeGreaterThanOrEqual(nav.bottom);
    expect(hudTopRect.height).toBeLessThanOrEqual(110);
  });

  it('at the maximum scale 1.6 with a long CJK MOD name every band still separates', () => {
    const maxIndex = TEXT_SCALE_STEPS.length - 1;
    expect(TEXT_SCALE_STEPS[maxIndex]).toBe(1.6);
    const { texts, hudTopRect } = seedHud(maxIndex, {
      title: '云岭古道·断云栈道以西外加的极长MOD命名后缀再加一段更长说明',
      name: '背着长剑四处漂泊的年轻侠客',
      quest: '附近：老铁匠铺的掌柜师傅铁三通 (23,7) · 相邻按 F 打听 / E 看托付 · Q 查差事',
      nav: '行路「东海群岛·落潮湾」· 北2格→西14格至「雾雨渡口」旁。',
    });
    const title = rectOf(texts.title), coords = rectOf(texts.coords);
    const help = rectOf(texts.help), time = rectOf(texts.time);
    const quest = rectOf(texts.quest), climate = rectOf(texts.climate);
    const nav = rectOf(texts.nav);
    // The compact heading is a single ellipsized line inside the free zone.
    expect(texts.title.lines).toHaveLength(1);
    expect(texts.title.text.endsWith('…')).toBe(true);
    expect(texts.title.text).not.toBe('云岭古道·断云栈道以西外加的极长MOD命名后缀再加一段更长说明');
    expect(title.right).toBeLessThanOrEqual(coords.left - 10);
    // The long display name ellipsizes; the position fact is never dropped.
    expect(texts.coords.text).toContain('位置 (4, 7)');
    expect(coords.right).toBeLessThanOrEqual(VIEW_WIDTH - 16);
    // Columns and bands keep their distances at the largest scale.
    expect(help.top).toBeGreaterThanOrEqual(Math.max(title.bottom, coords.bottom));
    expect(help.right).toBeLessThanOrEqual(time.left - 10);
    expect(quest.right).toBeLessThanOrEqual(climate.left - 10);
    expect(quest.top).toBeGreaterThanOrEqual(help.bottom);
    expect(nav.top).toBeGreaterThanOrEqual(Math.max(quest.bottom, climate.bottom));
    // The neighbour line keeps its actionable head and stays bounded.
        expect(texts.quest.lines.length).toBeLessThanOrEqual(2);
    expect(texts.quest.lines[0]).toContain('附近：');
    expect(texts.quest.lines.every((l) => l.length * texts.quest.fontPx <= climate.left - 14 - 16)).toBe(true);
    // The opaque band grows only as far as the measured stack needs. The
    // mock measures EVERY grapheme at full CJK width (ASCII included), so
    // this worst-case headroom is ~30% above the real-browser stack.
    expect(hudTopRect.height).toBeGreaterThanOrEqual(nav.bottom);
    expect(hudTopRect.height).toBeLessThanOrEqual(200);
  });

  it('caps quest notices at two measured lines with an ellipsis, keeping the head', () => {
    const { texts } = seedHud(4, {
      quest: '完成「护送药材北上并沿途打探消息」：经验 +12 · 银两 +34 · 新见闻「盐道风物」 · 完成「顺路捎信」：经验 +8 · 银两 +12 · 门派声望提升 · 解锁新武学残页 · 获得称号「盐道行者」 · 奖励翻倍',
    });
    expect(texts.quest.lines.length).toBeLessThanOrEqual(2);
    expect(texts.quest.lines[0]).toContain('完成「护送药材北上');
    expect(texts.quest.text.endsWith('…')).toBe(true);
  });

  it('keeps navigation copy within three lines and never truncates the short at-gate prompt', () => {
    const long = seedHud(4, {
      nav: `行路「极长的MOD目的地名称之外还有更长的前缀」· 西3格→南21格→西9格至「同样极长的MOD关口名称」旁，通路复复杂杂。${'附注'.repeat(150)}`,
    });
        expect(long.texts.nav.lines.length).toBeLessThanOrEqual(3);
    expect(long.texts.nav.text.endsWith('…')).toBe(true);

    const short = seedHud(4, { nav: '行路「雾雨渡口」· 已到「雾岬北口」旁，按 E 通过。' });
    expect(short.texts.nav.lines).toHaveLength(1);
    expect(short.texts.nav.text).toContain('按 E 通过');
  });

  it('fits the bottom interaction line inside its bar at the maximum scale', () => {
    const { texts, hudBottomRect, layoutInteract } = seedHud(4, {
      interact: '按 E 与「老铁匠铺的掌柜师傅」交谈',
    });
    layoutInteract();
    const hint = rectOf(texts.interact);
    expect(hint.bottom).toBeLessThanOrEqual(VIEW_HEIGHT - 4);
    expect(hint.top).toBeGreaterThanOrEqual(hudBottomRect.y - hudBottomRect.height / 2);
    expect(hudBottomRect.y + hudBottomRect.height / 2).toBeLessThanOrEqual(VIEW_HEIGHT);

    const { texts: longTexts, hudBottomRect: longBar, layoutInteract: again } = seedHud(4, {
      interact: `远处传来轰鸣：${'山道上商队络绎不绝，据说北面关口起了风雪。'.repeat(12)}`,
    });
    again();
    expect(longTexts.interact.lines.length).toBeLessThanOrEqual(3);
    const longHint = rectOf(longTexts.interact);
    expect(longHint.top).toBeGreaterThanOrEqual(longBar.y - longBar.height / 2 - 0.5);
    expect(longBar.width).toBe(VIEW_WIDTH);
  });

  it('stacks optional/MOD warning lines below the navigation band, covered by the rect', () => {
    loadGameSettings(settingsStorage(4));
    const warning = fakeText(11);
    const warningLong = fakeText(11);
    const scene = new GridScene();
    const I = scene as unknown as Record<string, unknown>;
    const help = fakeText(13), quest = fakeText(11), nav = fakeText(10), title = fakeText(14);
    const coords = fakeText(13), time = fakeText(13), climate = fakeText(10), interact = fakeText(12);
    const hudTopRect = fakeRect(), hudBottomRect = fakeRect();
    Object.assign(I, {
      hudMeasureText: fakeText(12),
      movementHintText: help, questTrackerText: quest, navigationHintText: nav,
      mapNameText: title, coordsText: coords, timeText: time, climateText: climate,
      interactText: interact, hudTopRect, hudBottomRect,
      hudWarningTexts: [warning, warningLong],
      hudWarningRawLines: [
        '部分可选资料（NPC/伙伴/对话/成长/战斗/物品/商店/任务）无效，已禁用相应内容（详情见控制台）',
        '部分 MOD 覆盖无效，已回退到上一有效数据（按 F2 查看原因与修复建议）',
      ],
      hudLines: {
        title: '铁嶂北道·岩关驿镇', time: '第1年 三月12日 12:19 · 午后', climate: '初春 · 小雨',
        help: '方向键 / WASD 移动 · E 交互 · R 行旅 · H 帮助', quest: '', nav: '行路「雾雨渡口」· 南6格。', interact: '',
      },
      playerDisplayName: '', playerCol: 4, playerRow: 7,
    });
    (I.relayoutHud as () => void).call(scene);
    const navRect = rectOf(nav);
    const first = rectOf(warning), second = rectOf(warningLong);
    expect(first.top).toBeGreaterThanOrEqual(navRect.bottom); // never above the nav band
    expect(second.top).toBeGreaterThanOrEqual(first.bottom); // stacked, no clash between lines
    expect(hudTopRect.height).toBeGreaterThanOrEqual(second.bottom); // all covered by the rect
    for (const line of [...warning.lines, ...warningLong.lines]) {
      expect(line.length * warning.fontPx).toBeLessThanOrEqual(VIEW_WIDTH - 32); // wrapped to width
    }
  });

  it('re-layouts from the raw copy after the scale changes (no stale truncation)', () => {
    const longTitle = '云岭古道·断云栈道以西外加的极长MOD命名后缀再加一段更长说明';
    const small = seedHud(4, { title: longTitle, name: '极长名字的侠客测试角色' });
    expect(small.texts.title.text.endsWith('…')).toBe(true);

    // Switch the live setting back to standard scale and re-run the layout.
    loadGameSettings(settingsStorage(1));
    small.relayout();
    expect(small.texts.title.text).toBe(longTitle); // full name restored from the raw line
    expect(small.texts.coords.text).toContain('极长名字的侠客测试角色');
  });
});
