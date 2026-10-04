import { createHash } from 'node:crypto';

/** Validate an extracted release against an independently selected source commit. */
export function verifyReleaseCandidate(manifest, files, expectedCommit) {
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit ?? '')) throw new Error('expectedCommit must be a full Git SHA');
  if (manifest?.formatVersion !== 1 || manifest.sourceCommit !== expectedCommit) throw new Error('release source commit does not match candidate');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || !Array.isArray(files)) throw new Error('missing release files');
  const seen = new Set();
  const actual = new Map();
  const safe = p => typeof p === 'string' && p.split('/').every(s => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(s));
  for (const file of files) {
    if (!safe(file.path) || actual.has(file.path) || !(file.content instanceof Uint8Array)) throw new Error('invalid or duplicate extracted file');
    actual.set(file.path, file.content);
  }
  for (const entry of manifest.files) {
    if (!safe(entry.path) || entry.path === 'release-manifest.json' || seen.has(entry.path)) throw new Error('invalid or duplicate manifest path');
    seen.add(entry.path);
    const bytes = actual.get(entry.path);
    if (!bytes || bytes.byteLength !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`release file mismatch: ${entry.path}`);
  }
  for (const path of actual.keys()) if (path !== 'release-manifest.json' && !seen.has(path)) throw new Error(`unlisted release file: ${path}`);
  for (const path of ['index.html','base/manifest.json','THIRD-PARTY-NOTICES.md']) if (!seen.has(path)) throw new Error(`missing required release file: ${path}`);
  return {sourceCommit: expectedCommit, verifiedFiles: seen.size};
}
