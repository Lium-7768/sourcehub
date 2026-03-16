import { execFileSync } from 'node:child_process';

function run(cmd, args, env = {}) {
  execFileSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

const probeLimit = process.env.PROBE_LIMIT || '2000';

run('node', ['scripts/run-probe-input.mjs'], { PROBE_LIMIT: probeLimit });
run('node', ['scripts/refresh_public_results_db.mjs']);

console.log(JSON.stringify({ success: true, probeLimit: Number(probeLimit) }, null, 2));
