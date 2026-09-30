/**
 * Type declarations for `scripts/lib/atlas-rle.mjs` so the strict TypeScript
 * tests (and any future TS consumer) can import the exact row-RLE codec the
 * Round 85+ generators use to read and write world-atlas layers.
 */

/** Encodes one dense gid row into its canonical `runLength:gid` wire string. */
export function encodeAtlasRow(cells: number[]): string;

/** Encodes a full dense layer matrix into the compact wire row list. */
export function encodeAtlasCells(cells: number[][]): string[];

/** Decodes one wire row into its dense cells and total run length. */
export function decodeAtlasRow(row: string, expectedColumns?: number): { cells: number[]; total: number };

/** Decodes a full wire layer back into the dense matrix, checking its shape. */
export function decodeAtlasCells(rows: string[], expectedRows: number, expectedColumns: number): number[][];
