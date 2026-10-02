import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function evaluateQuestEvidence(ledger, { knownQuestIds, existingEvidence }) {
  const issues = [];
  if (!Array.isArray(ledger?.quests)) return { issues: ['quests must be an array'], implementedCount: 0, journeyCount: 0, categoryCoverage: [] };
  const seen = new Set();
  const categories = new Set();
  let journeyCount = 0;
  for (const [index, row] of ledger.quests.entries()) {
    const label = `quests[${index}]`;
    if (!row?.id || seen.has(row.id)) issues.push(`${label}: missing or duplicate id ${row?.id ?? ''}`);
    if (row?.id) seen.add(row.id);
    if (!knownQuestIds.has(row?.id)) issues.push(`${label}: unknown quest id ${row?.id}`);
    if (!Array.isArray(row?.categories) || row.categories.length === 0) issues.push(`${label}: categories required`);
    else for (const category of row.categories) categories.add(category);
    for (const field of ['implementation', 'journey']) {
      if (!row?.[field] || !existingEvidence.has(row[field])) issues.push(`${label}: missing ${field} evidence ${row?.[field] ?? ''}`);
    }
    if (!['partial', 'unverified', 'played'].includes(row?.journeyStatus)) issues.push(`${label}: invalid journeyStatus`);
    if (row?.journeyStatus === 'played') journeyCount++;
  }
  if (seen.size < 12) issues.push(`only ${seen.size} distinct quest IDs; need at least 12`);
  for (const category of ['调查', '战斗', '物品/补给', '人物立场']) {
    if (!categories.has(category)) issues.push(`missing category coverage: ${category}`);
  }
  return { issues, implementedCount: seen.size, journeyCount, categoryCoverage: [...categories].sort() };
}

function collectJsonFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectJsonFiles(full) : entry.isFile() && entry.name.endsWith('.json') ? [full] : [];
  });
}

export function runAudit(repoRoot = root) {
  const ledgerPath = path.join(repoRoot, 'iterations/round-204/deepened-quests.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const questFiles = collectJsonFiles(path.join(repoRoot, 'data/base/quests'));
  const knownQuestIds = new Set(questFiles.flatMap(file => {
    try { return (JSON.parse(fs.readFileSync(file, 'utf8')).quests ?? []).map(quest => quest.id); }
    catch { return []; }
  }));
  const existingEvidence = new Set();
  for (const row of ledger.quests ?? []) for (const field of ['implementation', 'journey']) {
    if (row[field] && fs.existsSync(path.join(repoRoot, row[field]))) existingEvidence.add(row[field]);
  }
  const result = evaluateQuestEvidence(ledger, { knownQuestIds, existingEvidence });
  console.log(`Round204 quest evidence: ${result.implementedCount} distinct IDs; ${result.journeyCount} marked as complete real journeys; categories=${result.categoryCoverage.join(',')}`);
  if (result.issues.length) {
    for (const issue of result.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else console.log('Ledger structure and cited files are valid. Partial journey evidence is not a completion claim.');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAudit();
