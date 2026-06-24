import { spawnSync } from 'node:child_process';

const explicitSchema = process.argv[2];
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
const schema = explicitSchema || (baseUrl ? baseUrl + '/openapi.json' : undefined);

if (!schema) {
  console.error('Usage: npm run generate:api-types -- <openapi-url-or-file>');
  console.error('Or set EXPO_PUBLIC_API_BASE_URL before running the script.');
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npxCommand,
  [
    '--yes',
    '--package',
    'openapi-typescript@7.13.0',
    'openapi-typescript',
    schema,
    '-o',
    'src/types.gen.ts',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
