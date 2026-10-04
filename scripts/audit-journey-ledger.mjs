/**
 * Round 282 journey evidence ledger CLI.
 *
 * Usage:
 *   node scripts/audit-journey-ledger.mjs <expectedCandidate> <checkpoint.json> [more-checkpoint.json ...]
 *
 * Reads the supplied QA checkpoint envelopes IN THE ORDER GIVEN (the caller
 * owns the linear-journey ordering; branch journeys must be audited as
 * separate invocations), prints one JSON report containing per-file sha256
 * hashes, the raw envelope metadata, and the computed ledger deltas, then
 * exits 0 when validation passes and 1 otherwise.
 *
 * Read-only by construction: input files are opened for reading only and are
 * never written, moved, or removed.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {computeJourneyLedger, LEDGER_FORMAT, LEDGER_VERSION} from './lib/journey-ledger.mjs';

const [expectedCandidate, ...paths] = process.argv.slice(2);
if (typeof expectedCandidate !== 'string' || expectedCandidate.length === 0 || paths.length === 0) {
  console.error('Usage: node scripts/audit-journey-ledger.mjs <expectedCandidate> <checkpoint.json> [more-checkpoint.json ...]');
  process.exitCode = 2;
} else {
  try {
    const loaded = paths.map((path) => {
      const content = readFileSync(path);
      return { path, content, envelope: JSON.parse(content.toString('utf8')) };
    });

    const files = loaded.map(({ path, content, envelope }) => ({
      path,
      bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      envelopeMetadata: {
        format: typeof envelope?.format === 'string' ? envelope.format : null,
        version: typeof envelope?.version === 'number' ? envelope.version : null,
        qaRun: typeof envelope?.qaRun === 'string' ? envelope.qaRun : null,
        candidate: typeof envelope?.candidate === 'string' ? envelope.candidate : null,
        stage: typeof envelope?.stage === 'string' ? envelope.stage : null,
        exportedAt: typeof envelope?.exportedAt === 'string' ? envelope.exportedAt : null,
        sourceSlotId: typeof envelope?.sourceSlotId === 'string' ? envelope.sourceSlotId : null,
      },
    }));

    const ledger = computeJourneyLedger(
      loaded.map((entry) => entry.envelope),
      expectedCandidate,
    );

    process.stdout.write(
      JSON.stringify(
        {
          tool: 'audit-journey-ledger',
          ledgerFormat: LEDGER_FORMAT,
          ledgerVersion: LEDGER_VERSION,
          expectedCandidate,
          files,
          ledger,
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = ledger.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(
      JSON.stringify(
        {
          tool: 'audit-journey-ledger',
          error: { code: 'FILE_READ_OR_PARSE_FAILED', message: String(error?.message ?? error) },
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = 1;
  }
}
