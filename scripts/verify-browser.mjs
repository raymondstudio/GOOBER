import { readFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { root, baseEnvironment, launch, stop, waitFor, execute } from './verify-harness.mjs';
import { assertVerifiedBuild, buildVerified } from './verification-build.mjs';

// Targeted rerun after a recorded core/HTTP run; this never claims those suites reran.
const token = process.argv[2];
if (!/^[a-f0-9]{12}$/.test(token ?? '')) throw new Error('Supply the generated verification run token');
const directory = resolve(root, `.local/verification-${token}`);
const env = { ...baseEnvironment(), ...JSON.parse(readFileSync(resolve(directory, 'environment.json'), 'utf8')) };
delete env.NODE_OPTIONS;
if (env.APP_ENV !== 'test' || env.DATA_ENV !== 'test' || env.PAYMENT_MODE !== 'fixture' || env.PAI_MODE !== 'fixture' || env.GRAML_MODE !== 'fixture' || new URL(env.DATABASE_URL).pathname !== `/goober_test_${token}` || new URL(env.REDIS_URL).pathname !== '/11') throw new Error('Only the matching isolated fixture run can be resumed');
console.log(`Targeted browser/restore verification reuses isolated goober_test_${token}; core/HTTP results are recorded separately.`);
env.VERIFY_DIRECTORY = resolve(directory, `browser-${randomBytes(3).toString('hex')}`);
mkdirSync(env.VERIFY_DIRECTORY, { recursive: true });
const services = [];
try {
  if (process.argv.includes('--reuse-build')) assertVerifiedBuild(env, directory);
  else await buildVerified(env, directory, { logFile: resolve(env.VERIFY_DIRECTORY, 'build.log') });
  services.push(launch(['--import', 'tsx', 'apps/api/src/main.ts'], env, resolve(env.VERIFY_DIRECTORY, 'api.log')));
  await waitFor(`${env.INTERNAL_API_ORIGIN}/api/v1/health/ready`, services);
  services.push(launch(['scripts/web.mjs', 'start'], env, resolve(env.VERIFY_DIRECTORY, 'web.log')));
  services.push(launch(['--import', 'tsx', 'apps/worker/src/main.ts'], env, resolve(env.VERIFY_DIRECTORY, 'worker.log')));
  for (const route of ['/api/v1/health/ready','/api/auth/get-session','/sign-in','/wallet','/products/fixture-studio','/orders','/orders/warmup-fixture','/support','/operations']) await waitFor(`${env.TRUSTED_ORIGIN}${route}`, services);
  if (process.argv.includes('--http')) await execute(['node_modules/vitest/vitest.mjs', 'run', 'tests/integration/acceptance.http.test.ts', '--pool=threads', '--maxWorkers=1'], env);
  await execute(['node_modules/@playwright/test/cli.js', 'test'], env);
} finally { for (const child of services.reverse()) await stop(child); }
await execute(['--import', 'tsx', 'scripts/verify-restore.mjs'], env);
