import { resolve } from 'node:path';
import { prepareRun, execute, launch, stop, waitFor } from './verify-harness.mjs';

const { env, directory } = await prepareRun();
const services = [];
try {
  // Exercise the production-optimized fixture build; no development HMR races.
  await execute(['scripts/web.mjs', 'build'], env, { logFile: resolve(directory, 'build.log') });
  services.push(launch(['--import', 'tsx', 'apps/api/src/main.ts'], env, resolve(directory, 'api.log')));
  services.push(launch(['scripts/web.mjs', 'start'], env, resolve(directory, 'web.log')));
  await waitFor(`${env.TRUSTED_ORIGIN}/api/v1/health/ready`, services);
  // Prove the real auth handler is ready before bounded integration requests.
  await waitFor(`${env.TRUSTED_ORIGIN}/api/auth/get-session`, services);
  // Financial/fault tests own their work explicitly. No autonomous worker may race them.
  await execute(['node_modules/vitest/vitest.mjs', 'run', 'tests/integration/skeleton.test.ts', 'tests/integration/provider-metadata.test.ts', 'tests/integration/commerce.test.ts', 'tests/integration/worker.test.ts', 'tests/integration/worker-recovery.test.ts', 'tests/integration/worker-security.test.ts', 'tests/integration/acceptance.recovery.test.ts', '--pool=threads', '--maxWorkers=1'], env);
  if (!process.argv.includes('--core-only')) {
    services.push(launch(['--import', 'tsx', 'apps/worker/src/main.ts'], env, resolve(directory, 'worker.log')));
    await execute(['node_modules/vitest/vitest.mjs', 'run', 'tests/integration/acceptance.http.test.ts', '--pool=threads', '--maxWorkers=1'], env);
    if (process.argv.includes('--e2e')) {
      // Check all real public routes before browser interaction bounds begin.
      for (const route of ['/sign-in','/wallet','/products/fixture-studio','/orders','/orders/warmup-fixture','/support','/operations']) await waitFor(`${env.TRUSTED_ORIGIN}${route}`, services);
      await execute(['node_modules/@playwright/test/cli.js', 'test'], env);
    }
  }
} finally { for (const child of services.reverse()) await stop(child); }
if (!process.argv.includes('--core-only')) await execute(['--import', 'tsx', 'scripts/verify-restore.mjs'], env);
