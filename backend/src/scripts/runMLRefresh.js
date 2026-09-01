/**
 * Trigger the Python ML batch write-backs so the live app can serve ML-cached
 * recommendations AND K-Means customer segments. Run via `npm run ml:refresh`
 * from backend/.
 *
 * Spawns `python -m recommender.cli` in the sibling ml/ directory:
 *   1. `refresh`   — recommendations → `ml_recommendations` collection.
 *   2. `segment-refresh` — K-Means segments → `ml_segments` collection.
 * The Python process reads MONGO_URI from this backend/.env, so it writes to
 * the same Atlas DB the app reads. Fails with a clear message if python or the
 * recommender package / deps are missing — the app keeps working on its JS
 * fallbacks regardless, since both ML caches are purely additive.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mlDir = path.resolve(__dirname, '../../../ml');

const model = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : 'svd';
const limit = process.argv.includes('--limit')
  ? process.argv[process.argv.indexOf('--limit') + 1]
  : '5';
// --no-segments skips the K-Means refresh (e.g. while iterating on recs only).
const skipSegments = process.argv.includes('--no-segments');

const run = (args) =>
  new Promise((resolve, reject) => {
    const py = spawn('python', ['-m', 'recommender.cli', ...args], {
      cwd: mlDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    py.on('error', reject);
    py.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });

const commands = [
  ['refresh', '--model', model, '--limit', limit],
  ...(skipSegments ? [] : [['segment-refresh']]),
];

try {
  for (const args of commands) {
    console.log(`\n[ml:refresh] python -m recommender.cli ${args.join(' ')}`);
    await run(args);
  }
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      '\n[ml:refresh] Could not start `python`. Make sure Python 3.12+ is on PATH\n' +
        'and run `python -m pip install -r ml/requirements.txt` once.\n' +
        'The app continues to use its built-in JS recommendations without this.'
    );
    process.exit(2);
  }
  console.error(`\n[ml:refresh] Python refresh failed: ${err.message}`);
  process.exit(1);
}
