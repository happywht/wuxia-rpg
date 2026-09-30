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
export function dialogueConfirmAction(bodyPage: number, bodyCount: number, optionPage: number, optionCount: number): 'body' | 'option' | 'confirm' {
  if (bodyPage < bodyCount - 1) return 'body';
  if (optionPage < optionCount - 1) return 'option';
  return 'confirm';
}
