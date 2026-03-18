import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const probeJson = path.join(ROOT, 'data', 'results', 'probe_results.json');
const publicJson = path.join(ROOT, 'src', 'data', 'public-results.json');
const probeLimit = process.env.PROBE_LIMIT || '300';

execFileSync('node', ['scripts/normalize-candidates.mjs'], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync('node', ['scripts/run-probe-input.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, PROBE_LIMIT: probeLimit },
});

const payload = JSON.parse(fs.readFileSync(probeJson, 'utf8'));
const items = Array.isArray(payload?.items) ? payload.items : [];
const output = {
  items,
  meta: {
    count: items.length,
    failed: payload?.meta?.failed ?? null,
    scanned: payload?.meta?.scanned ?? null,
    source: 'repo_file',
    updated_at: new Date().toISOString(),
  },
};

fs.mkdirSync(path.dirname(publicJson), { recursive: true });
fs.writeFileSync(publicJson, JSON.stringify(output, null, 2) + '\n');

console.log(JSON.stringify({
  success: true,
  probeLimit: Number(probeLimit),
  resultsPath: probeJson,
  publicResultsPath: publicJson,
  count: items.length,
}, null, 2));
