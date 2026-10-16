import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { root, baseEnvironment, createDatabase, launch, stop, waitFor } from './verify-harness.mjs';

// Run after the reviewable implementation commit. Clone contains committed files only.
const token = randomBytes(6).toString('hex'); const directory = resolve(root, `.local/clean-checkout-${token}`);
mkdirSync(directory, { recursive: true }); const checkout = resolve(directory, 'repo');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
execFileSync('git', ['clone', '--no-hardlinks', '--quiet', root, checkout], { cwd: root, stdio: 'inherit', windowsHide: true });
const env = await createDatabase(baseEnvironment(), `goober_test_${token}`); Object.assign(env, { APP_ENV: 'test', DATA_ENV: 'test', PAYMENT_MODE: 'fixture', PAI_MODE: 'fixture', GRAML_MODE: 'fixture', DISPATCH_PAUSED: 'true', API_PORT: '3008', WEB_PORT: '3007', TRUSTED_ORIGIN: 'http://127.0.0.1:3007', BETTER_AUTH_URL: 'http://127.0.0.1:3007', INTERNAL_API_ORIGIN: 'http://127.0.0.1:3008', NEXT_DIST_DIR: '.next' });
const completed = [];
function run(binary, args, shell = false) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { cwd: checkout, env, windowsHide: true, stdio: 'inherit', shell });
    child.on('error', reject); child.on('exit', code => { if (code === 0) resolveRun(); else reject(new Error(`Clean checkout command ${binary} exited ${code}`)); });
  });
}
const commands = [
  ['install', '--frozen-lockfile', '--ignore-scripts'], ['db:generate'], ['db:migrate'],
];
for (const command of commands) { await run('pnpm', command, process.platform === 'win32'); completed.push(`pnpm ${command.join(' ')}`); }
await run(process.execPath, ['--import', 'tsx', 'scripts/infra/permissions.ts']); completed.push('node --import tsx scripts/infra/permissions.ts');
for (const command of [['db:seed'], ['lint'], ['typecheck'], ['test:unit'], ['build']]) { await run('pnpm', command, process.platform === 'win32'); completed.push(`pnpm ${command.join(' ')}`); }
const services = [];
try {
  services.push(launch(['--import', 'tsx', 'apps/api/src/main.ts'], env, resolve(directory, 'api.log'), checkout));
  services.push(launch(['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '127.0.0.1', '--port', env.WEB_PORT], env, resolve(directory, 'web.log'), checkout));
  await waitFor(`${env.TRUSTED_ORIGIN}/api/v1/health/ready`, services);
  const signup = await fetch(`${env.TRUSTED_ORIGIN}/api/auth/sign-up/email`, { method: 'POST', headers: { origin: env.TRUSTED_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Synthetic clean checkout', email: `clean-${token}@example.invalid`, password: randomBytes(24).toString('base64url') }), signal: AbortSignal.timeout(30_000) });
  if (!signup.ok) throw new Error('Clean checkout real auth registration failed');
  const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const me = await fetch(`${env.TRUSTED_ORIGIN}/api/v1/me`, { headers: { cookie }, signal: AbortSignal.timeout(15_000) });
  if (!me.ok || (await me.json()).email !== `clean-${token}@example.invalid`) throw new Error('Clean checkout authenticated web-to-API boundary failed');
  completed.push('production web/API boot + real auth session request');
} finally { for (const child of services.reverse()) await stop(child); }
writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ revision, commands: completed, result: 'implemented-local', checkout, database: `goober_test_${token}`, limitation: 'Local clean clone, production build and actual auth/API boot; remote CI and external providers not claimed' }, null, 2));
console.log(`Clean committed checkout verified at ${revision}; isolated checkout/database preserved in .local/clean-checkout-${token}.`);
