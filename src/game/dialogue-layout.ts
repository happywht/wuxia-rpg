/** Content-agnostic grapheme wrapping and pagination; no Phaser dependency. */
export function wrapDialogueText(text: string, width: number, measure: (text: string) => number): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line !== '' && measure(line + segment) > Math.max(1, width)) {
        lines.push(line);
        line = '';
      }
      line += segment;
    }
    lines.push(line);
  }
  return lines;
}
export function paginateDialogueLines(lines: readonly string[], capacity: number): string[] {
  const size = Math.max(1, Math.floor(capacity));
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += size) pages.push(lines.slice(index, index + size).join('\n'));
  return pages.length === 0 ? [''] : pages;
}
/**
 * Blank-line-aware pagination for authored multi-block text (e.g. epilogues:
 * an introduction followed by `title\nbody` chapter blocks). Each block's
 * opening line is kept together with its following line, so a chapter title
 * is never orphaned at the bottom of a page. Content-agnostic: it never
 * inspects the text itself, never drops or reorders lines (blank separators
 * included), and with a capacity of 1 the pairing rule is disabled so every
 * line still becomes exactly one page (no loss, no endless loop).
 */
export function paginateDialogueBlocks(lines: readonly string[], capacity: number): string[] {
  const size = Math.max(1, Math.floor(capacity));
  const blockLength = (start: number): number => {
    let length = 0;
    while (start + length < lines.length && lines[start + length] !== '') length += 1;
    return length;
  };
  const pages: string[][] = [];
  let page: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const startsBlock = index === 0 || (lines[index] !== '' && lines[index - 1] === '');
    if (startsBlock && size >= 2 && blockLength(index) >= 2 && page.length >= size - 1) {
      pages.push(page); // The block's first two lines would not fit together.
      page = [];
    }
    page.push(lines[index]!);
    if (page.length >= size) {
      pages.push(page);
      page = [];
    }
  }
  if (page.length > 0) pages.push(page);
  return pages.length === 0 ? [''] : pages.map((chunk) => chunk.join('\n'));
}
export function dialogueConfirmAction(bodyPage: number, bodyCount: number, optionPage: number, optionCount: number): 'body' | 'option' | 'confirm' {
  if (bodyPage < bodyCount - 1) return 'body';
  if (optionPage < optionCount - 1) return 'option';
  return 'confirm';
}
