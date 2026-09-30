/**
 * Row-RLE codec for world-atlas layers (Round 86 wire protocol).
 *
 * A compact layer stores one string per atlas row, each a comma-separated
 * list of `runLength:gid` tokens, for example `448:0,3:12,2:0`. Encoded rows
 * are canonical: every run length is a positive decimal without leading
 * zeros, every gid is an unsigned decimal, and equal neighbouring gids are
 * merged into a single run so encoding a decoded row is byte-stable.
 */

const RUN_TOKEN = /^([1-9][0-9]*):(0|[1-9][0-9]*)$/;

/** Encodes one dense row into its canonical `runLength:gid` wire string. */
export function encodeAtlasRow(cells) {
  const tokens = [];
  let gid = cells[0];
  let runLength = 0;
  for (const value of cells) {
    if (value === gid) {
      runLength += 1;
      continue;
    }
    tokens.push(`${runLength}:${gid}`);
    gid = value;
    runLength = 1;
  }
  if (runLength > 0) tokens.push(`${runLength}:${gid}`);
  return tokens.join(',');
}

/** Encodes a full dense layer matrix into the compact wire row list. */
export function encodeAtlasCells(cells) {
  return cells.map(encodeAtlasRow);
}

/** Decodes one wire row into `{ cells, total }`; throws on malformed tokens. */
export function decodeAtlasRow(row, expectedColumns = 512) {
  const cells = [];
  let total = 0;
  for (const token of row.split(',')) {
    const match = RUN_TOKEN.exec(token);
    if (match === null) throw new Error(`无效的舆图 RLE 段："${token}"`);
    const runLength = Number(match[1]);
    const gid = Number(match[2]);
    total += runLength;
    if (total > expectedColumns) {
      throw new Error(`舆图 RLE 行游程超过 ${expectedColumns} 格的列数上限。`);
    }
    for (let repeat = 0; repeat < runLength; repeat += 1) cells.push(gid);
  }
  return { cells, total };
}

/** Decodes a full wire layer back into the dense matrix, checking its shape. */
export function decodeAtlasCells(rows, expectedRows, expectedColumns) {
  if (!Array.isArray(rows)) throw new Error('舆图 RLE 应为字符串数组。');
  if (rows.length !== expectedRows) {
    throw new Error(`舆图 RLE 应有 ${expectedRows} 行，实际 ${rows.length} 行。`);
  }
  return rows.map((row) => {
    const { cells, total } = decodeAtlasRow(row, expectedColumns);
    if (total !== expectedColumns) {
      throw new Error(`舆图 RLE 行游程应有 ${expectedColumns} 格，实际 ${total} 格。`);
    }
    return cells;
  });
}
