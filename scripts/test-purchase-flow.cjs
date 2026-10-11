// Load OCR environment before Jest starts so spawned Python inherits tessdata.
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { parse } = require('dotenv');

const root = resolve(__dirname, '..');
const config = parse(readFileSync(resolve(root, '.env')));
const env = {
  ...process.env,
  ORDERS_PG_TEST: '1',
  TICKET_OCR_TEST: '1',
};
if (config.TESSDATA_PREFIX) env.TESSDATA_PREFIX = config.TESSDATA_PREFIX;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(config.TICKET_PYTHON_PATH || 'python', [
  'scripts/ticket-scanner/generate_fixtures.py',
  ...(process.env.TICKET_TEST_FONT ? ['--font', process.env.TICKET_TEST_FONT] : []),
]);
run(process.execPath, [
  '--experimental-vm-modules',
  'node_modules/jest/bin/jest.js',
  '--runInBand',
  'src/modules/orders/orders.postgres.spec.ts',
]);
