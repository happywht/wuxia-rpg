import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { ENTER: 1, ESC: 2, PAGE_UP: 3 } } } } }));
vi.mock('../src/game/settings', () => ({ uiFontSize: (value: number) => value }));
vi.mock('../src/game/ui-theme', () => ({ UI_FONT_FAMILY: 'test', addPixelPanelChrome: () => {} }));
import { TravelConfirmationPanel } from '../src/game/travel-confirmation';
import type Phaser from 'phaser';

function harness() {
  const bindings = new Map<number, Set<() => void>>();
  const texts: { text: string; width: number; height: number; setText: (value: string | string[]) => unknown }[] = [];
  const container = { setDepth() { return this; }, setVisible() { return this; }, removeAll() { return this; }, add() { return this; }, destroy: vi.fn() };
  const scene = { scale: { width: 640, height: 360 }, add: { container: () => container, text: (_x: number, _y: number, value: string) => {
    const text = { text: value, width: 0, height: 18, setLineSpacing() { return this; }, setText(value: string | string[]) { this.text = Array.isArray(value) ? value.join('\n') : value; this.width = this.text.length * 14; return this; } };
    texts.push(text); return text;
  } }, input: { keyboard: { addKey: (code: number) => ({ on: (_event: string, fn: () => void) => { if (!bindings.has(code)) bindings.set(code, new Set()); bindings.get(code)!.add(fn); }, off: (_event: string, fn: () => void) => bindings.get(code)?.delete(fn) }) } } };
  const close = vi.fn(), commit = vi.fn();
  const panel = new TravelConfirmationPanel(scene as unknown as Phaser.Scene, close);
  return { panel, close, commit, bindings, texts };
}
describe('Round123 confirmation ownership and paging', () => {
  it('cancel never commits and releases bindings exactly once', () => {
    const h = harness(); h.panel.open('交通', 8, 20, 10, h.commit); h.panel.close(); h.panel.close();
    expect(h.commit).not.toHaveBeenCalled(); expect(h.close).toHaveBeenCalledTimes(1);
    expect([...h.bindings.values()].every(set => set.size === 0)).toBe(true);
  });
  it('requires reading every page before a single commit and notifies close after commit', () => {
    const h = harness(), order: string[] = [];
    h.close.mockImplementation(() => order.push('close'));
    h.panel.open('长交通名称'.repeat(100), 8, 20, 10, () => { order.push('commit'); h.commit(); });
    const total = Number(h.texts[1]!.text.split('/')[1]!.split(' ')[0]);
    expect(total).toBeGreaterThan(1);
    for (let page = 0; page < total - 1; page++) { h.panel.accept(); expect(h.commit).not.toHaveBeenCalled(); }
    h.panel.accept(); h.panel.accept();
    expect(h.commit).toHaveBeenCalledTimes(1); expect(order).toEqual(['commit', 'close']); expect(h.panel.isOpen).toBe(false);
  });
});
