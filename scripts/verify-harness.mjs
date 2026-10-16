import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';

export const root = resolve(import.meta.dirname, '..');
export const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
export function persistentEnvironment(env) {
  const keys = ['APP_ENV','DATA_ENV','PAYMENT_MODE','PAI_MODE','GRAML_MODE','DATABASE_URL','DIRECT_DATABASE_URL','REDIS_URL','BETTER_AUTH_SECRET','BETTER_AUTH_URL','TRUSTED_ORIGIN','FIXTURE_WEBHOOK_SECRET','PAI_FIXTURE_WEBHOOK_SECRET','DELIVERY_KEY','DELIVERY_KEY_ID','DISPATCH_PAUSED','API_PORT','WEB_PORT','INTERNAL_API_ORIGIN','NEXT_DIST_DIR','VERIFY_DIRECTORY','PG_BIN_DIR'];
  return Object.fromEntries(keys.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}
export function baseEnvironment() {
  if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  if (!['local', 'test'].includes(env.APP_ENV) || env.DATA_ENV !== 'test' || env.PAYMENT_MODE !== 'fixture') throw new Error('Verification requires isolated local/test fixture configuration');
  for (const key of ['DATABASE_URL', 'DIRECT_DATABASE_URL', 'REDIS_URL']) {
    if (!env[key] || !['127.0.0.1', 'localhost', 'postgres', 'redis'].includes(new URL(env[key]).hostname)) throw new Error('Verification refuses nonlocal service hosts');
  }
  return env;
}
export async function databaseAdmin(env) {
  const direct = new URL(env.DIRECT_DATABASE_URL); direct.pathname = '/postgres';
  let client = new Client({ connectionString: direct.toString() });
  await client.connect();
  const role = await client.query('SELECT rolcreatedb, rolsuper FROM pg_roles WHERE rolname=current_user');
  if (role.rows[0]?.rolcreatedb || role.rows[0]?.rolsuper) return client;
  await client.end();
  const passwordFile = resolve(root, '.local/postgres-bootstrap-password');
  if (direct.hostname !== '127.0.0.1' || direct.port !== '54329' || !existsSync(passwordFile)) throw new Error('Test database creation requires local CREATEDB role or native local bootstrap setup');
  direct.username = 'goober_bootstrap'; direct.password = readFileSync(passwordFile, 'utf8').trim();
  client = new Client({ connectionString: direct.toString() }); await client.connect(); return client;
}
export async function createDatabase(env, name) {
  if (!/^goober_(test|restore)_[a-f0-9]{12}$/.test(name)) throw new Error('Unsafe test database name');
  const owner = decodeURIComponent(new URL(env.DIRECT_DATABASE_URL).username);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(owner)) throw new Error('Unexpected migration owner identifier');
  const admin = await databaseAdmin(env);
  try { await admin.query(`CREATE DATABASE "${name}" OWNER "${owner}"`); } finally { await admin.end(); }
  const change = key => { const url = new URL(env[key]); url.pathname = `/${name}`; return url.toString(); };
  return { ...env, DATABASE_URL: change('DATABASE_URL'), DIRECT_DATABASE_URL: change('DIRECT_DATABASE_URL') };
}
export function execute(args, env, { logFile } = {}) {
  return new Promise((resolveRun, reject) => {
    const descriptor = logFile ? openSync(logFile, 'a') : undefined;
    const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: descriptor === undefined ? 'inherit' : ['ignore', descriptor, descriptor] });
    child.once('error', reject);
    child.once('exit', code => { if (descriptor !== undefined) closeSync(descriptor); if (code === 0) resolveRun(); else reject(new Error(`Verification command ${args[0]} exited ${code}`)); });
  });
}
export function launch(args, env, logFile, cwd = root) {
  const descriptor = openSync(logFile, 'a');
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', descriptor, descriptor] });
  closeSync(descriptor); child.on('error', () => undefined);
  return child;
}
export async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Only descendants of this runner's recorded PID are targeted.
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* already exited */ }
  } else child.kill('SIGTERM');
  for (let attempt = 0; attempt < 30 && child.exitCode === null; attempt++) await delay(100);
  if (child.exitCode === null) child.kill('SIGKILL');
}
export async function waitFor(url, children, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (children.some(child => child.exitCode !== null)) throw new Error('Verification service exited early; inspect ignored run logs');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (response.ok) return; } catch { /* booting */ }
    await delay(500);
  }
  throw new Error(`Local verification service not ready: ${new URL(url).pathname}`);
}
export async function prepareRun() {
  const token = randomBytes(6).toString('hex');
  const directory = resolve(root, `.local/verification-${token}`); mkdirSync(directory, { recursive: true });
  const env = await createDatabase(baseEnvironment(), `goober_test_${token}`);
  Object.assign(env, { APP_ENV: 'test', DATA_ENV: 'test', PAYMENT_MODE: 'fixture', PAI_MODE: 'fixture', GRAML_MODE: 'fixture', API_PORT: '3006', WEB_PORT: '3005', TRUSTED_ORIGIN: 'http://127.0.0.1:3005', BETTER_AUTH_URL: 'http://127.0.0.1:3005', INTERNAL_API_ORIGIN: 'http://127.0.0.1:3006', NEXT_DIST_DIR: '.next-test', DISPATCH_PAUSED: 'false', VERIFY_DIRECTORY: directory });
  env.PAI_FIXTURE_WEBHOOK_SECRET = randomBytes(32).toString('hex');
  const redis = new URL(env.REDIS_URL); redis.pathname = '/11'; env.REDIS_URL = redis.toString();
  // Secrets stay in ignored local files; reports contain only database names and counts.
  writeFileSync(resolve(directory, 'environment.json'), JSON.stringify(persistentEnvironment(env)), { mode: 0o600 });
  await execute(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'packages/db/prisma.config.ts'], env);
  await execute(['--import', 'tsx', 'scripts/infra/permissions.ts'], env);
  await execute(['--import', 'tsx', 'packages/db/src/seed.ts'], env);
  console.log(`Created isolated verification database goober_test_${token}; preserved for review. Logs: .local/verification-${token}`);
  return { env, directory, token };
}
