const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const result = spawnSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    '--runInBand',
    'src/modules/email',
  ],
  {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, EMAIL_INTEGRATION_TEST: '1' },
    windowsHide: true,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
