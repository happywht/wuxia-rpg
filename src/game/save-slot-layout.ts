/**
 * Round 121 (correction): bounded, measured save-slot row layout (Phaser-free).
 *
 * Slot labels used Phaser's space-based wordWrap with a fixed row pitch and a
 * vertically centred origin: at the max font scale (or with a long MOD display
 * name) the wrapped label grew symmetrically past its selection box into the
 * neighbouring rows. The first fix wrapped and stacked, but had no viewport
 * budget — three long labels could push the last slot, the feedback line and
 * the hint off-screen. This bounded layout wraps every label at real measured
 * grapheme widths; while the natural stack fits the available region rows keep
 * their natural heights (no blank bands), and once it would overflow, each
 * label paginates losslessly into per-slot pages sized to an equal share of
 * the region. The host decides which page a slot shows; Enter/selection/
 * storage semantics never change here.
 */
import { wrapDialogueText } from './dialogue-layout';

export interface SaveSlotRowLayout {
  /** Top of the row's box. */
  y: number;
  /** Row box height (stable across that slot's pages while paginating). */
  height: number;
  /** The label's pages; each page holds whole wrapped lines in order. */
  pages: readonly string[];
  /** True when the label needed more than one page to fit its share. */
  paged: boolean;
}

export function layoutSaveSlotRows(input: {
  labels: readonly string[];
  width: number;
  measure: (text: string) => number;
  lineHeight: number;
  /** Inclusive top of the available row region. */
  top: number;
  /** Exclusive bottom of the available row region (viewport-bounded). */
  bottom: number;
  minHeight?: number;
  gap?: number;
}): SaveSlotRowLayout[] {
  const minHeight = input.minHeight ?? 38;
  const gap = input.gap ?? 10;
  const count = input.labels.length;
  if (count === 0) return [];
  const available = input.bottom - input.top;
  if (available < Math.max(minHeight, input.lineHeight + 8) * count + gap * (count - 1)) {
    throw new RangeError('存档列表区域不足以容纳三栏文字，请扩大视口或调整布局。');
  }
  const wrapped = input.labels.map(label => wrapDialogueText(label, Math.max(1, input.width), input.measure));
  const naturalHeights = wrapped.map(lines => Math.max(minHeight, lines.length * input.lineHeight + 8));
  const naturalTotal = naturalHeights.reduce((sum, height) => sum + height, 0) + gap * (count - 1);
  let y = input.top;
  if (naturalTotal <= available) {
    // The whole stack fits: natural heights, no blank bands, no paging.
    return wrapped.map((lines, index) => {
      const page = lines.join('\n');
      const row = { y, height: naturalHeights[index]!, pages: [page], paged: false };
      y += naturalHeights[index]! + gap;
      return row;
    });
  }
  // Overflow: every slot gets an equal share; its label pages within that
  // share, whole lines per page, nothing truncated.
  const perSlot = Math.floor((available - gap * (count - 1)) / count);
  const maxLines = Math.max(1, Math.floor((perSlot - 8) / input.lineHeight));
  const rowHeight = Math.max(minHeight, maxLines * input.lineHeight + 8);
  return wrapped.map(lines => {
    const pages: string[] = [];
    for (let index = 0; index < lines.length; index += maxLines) {
      pages.push(lines.slice(index, index + maxLines).join('\n'));
    }
    const row = { y, height: rowHeight, pages, paged: pages.length > 1 };
    y += rowHeight + gap;
    return row;
  });
}
