export function verifyReleaseCandidate(manifest: unknown, files: Array<{path: string; content: Uint8Array}>, expectedCommit: string): {sourceCommit: string; verifiedFiles: number};
