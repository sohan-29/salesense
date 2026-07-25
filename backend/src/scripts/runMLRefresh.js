/**
 * Trigger the Python ML recommender's batch write-back so the live app can
 * serve ML-cached recommendations. Run via `npm run ml:refresh` from backend/.
 *
 * Spawns `python -m recommender.cli refresh` in the sibling ml/ directory.
 * The Python process reads MONGO_URI from this backend/.env, so it writes to
 * the same Atlas DB the app reads. Fails with a clear message if python or the
 * recommender package / deps are missing — the app keeps working on its JS CF
 * fallback regardless, since the ML cache is purely additive.
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

const py = spawn(
  'python',
  ['-m', 'recommender.cli', 'refresh', '--model', model, '--limit', limit],
  { cwd: mlDir, stdio: 'inherit', shell: process.platform === 'win32' }
);

py.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(
      '\n[ml:refresh] Could not start `python`. Make sure Python 3.12+ is on PATH\n' +
        'and run `python -m pip install -r ml/requirements.txt` once.\n' +
        'The app continues to use its built-in JS recommendations without this.'
    );
    process.exit(2);
  }
  console.error(`\n[ml:refresh] Failed to run python: ${err.message}`);
  process.exit(1);
});

py.on('exit', (code) => {
  if (code !== 0) {
    console.error(`\n[ml:refresh] Python refresh exited with code ${code}.`);
    process.exit(code ?? 1);
  }
});
