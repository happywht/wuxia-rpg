export interface ReleaseFileInput {
  path: string;
  content: Uint8Array;
}

export interface ReleaseManifest {
  formatVersion: 1;
  packageName: string;
  version: string;
  sourceCommit: string | null;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

export function createReleaseManifest(input: {
  packageName: string;
  version: string;
  sourceCommit?: string | null;
  files: ReleaseFileInput[];
}): ReleaseManifest;

export function assertPackContents(packedPaths: string[], expectedPaths: string[]): true;
