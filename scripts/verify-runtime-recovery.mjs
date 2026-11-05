import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, createConnection } from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { checkDependencies } from './dependency-preflight.mjs';
import { root, prepareRun, launch, stop, waitFor, delay } from './verify-harness.mjs';
import { assertVerifiedBuild, buildVerified } from './verification-build.mjs';

// Only this runner's loopback proxy sockets are interrupted. Native services,
// existing databases and Redis records remain untouched throughout the test.
async function proxy(target) {
  const sockets = new Set();
  let available = true;
  const server = createServer(incoming => {
    if (!available) { incoming.destroy(); return; }
    const outgoing = createConnection({ host: target.hostname, port: Number(target.port) });
    for (const socket of [incoming, outgoing]) {
      sockets.add(socket);
      socket.on('error', () => { incoming.destroy(); outgoing.destroy(); });
      socket.on('close', () => sockets.delete(socket));
    }
    incoming.pipe(outgoing); outgoing.pipe(incoming);
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  const url = new URL(target); url.hostname = '127.0.0.1'; url.port = String(address.port);
  return {
    url: url.toString(),
    setAvailable(value) { available = value; if (!value) for (const socket of sockets) socket.destroy(); },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolveClose => server.close(resolveClose)); },
  };
}

async function workerChild() {
  const { startWorker } = await import('../apps/worker/src/main.ts');
  const { prisma } = await import('@goober/db');
  const runtime = await startWorker({ prefix: process.env.M3_QUEUE_PREFIX, pollMs: 250 });
  const close = async () => { await runtime.close(); await prisma.$disconnect(); };
  process.once('SIGTERM', () => { void close(); });
  process.once('SIGINT', () => { void close(); });
  console.log('Isolated runtime recovery worker ready');
}

async function run() {
  const webPort = process.env.M3_RECOVERY_WEB_PORT ?? '3012';
  const apiPort = process.env.M3_RECOVERY_API_PORT ?? '3013';
  for (const port of [webPort, apiPort]) assert.ok(/^\d+$/.test(port) && Number(port) >= 1024 && Number(port) <= 65535, 'Invalid isolated verification port');
  assert.notEqual(webPort, apiPort);
  const { env: directEnv, directory, token } = await prepareRun();
  const pgProxy = await proxy(new URL(directEnv.DATABASE_URL));
  const redisProxy = await proxy(new URL(directEnv.REDIS_URL));
  const env = { ...directEnv, DATABASE_URL: pgProxy.url, REDIS_URL: redisProxy.url,
    WEB_PORT: webPort, API_PORT: apiPort, TRUSTED_ORIGIN: `http://127.0.0.1:${webPort}`, BETTER_AUTH_URL: `http://127.0.0.1:${webPort}`,
    INTERNAL_API_ORIGIN: `http://127.0.0.1:${apiPort}`, M3_QUEUE_PREFIX: `goober-m3-${token}` };
  const db = new Client({ connectionString: directEnv.DATABASE_URL });
  const children = [];
  const evidence = { token, database: `goober_test_${token}`, modes: 'test/fixture only', proxyFaultsOnly: true, checks: [] };
  const record = (check, extra = {}) => { evidence.checks.push({ check, result: 'PASS', ...extra }); console.log(`PASS ${check}`); };
  const origin = env.TRUSTED_ORIGIN;
  const canary = `GOOBER-SYNTHETIC-PRIVATE-${randomUUID()}`;
  let cookie = '';
  async function request(path, body, { auth = false, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
    return fetch(origin + path, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json', origin, 'x-goober-csrf': '1' }), ...(auth ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25_000) });
  }
  async function ok(response) { assert.ok(response.ok, `Unexpected local HTTP status ${response.status}`); return response.json(); }
  async function until(operation, predicate, timeout = 30_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await operation(); if (predicate(value)) return value; await delay(200); }
    throw new Error('Timed out waiting for isolated recovery assertion');
  }
  function safe(text) {
    assert.ok(!text.includes(canary), 'Synthetic private marker leaked');
    for (const secret of [env.BETTER_AUTH_SECRET, env.FIXTURE_WEBHOOK_SECRET, env.PAI_FIXTURE_WEBHOOK_SECRET, env.DELIVERY_KEY, decodeURIComponent(new URL(directEnv.DATABASE_URL).password)]) if (secret) assert.ok(!text.includes(secret), 'Configured secret leaked');
    assert.doesNotMatch(text, /PrismaClient|P1001|RateLimit|SELECT\s|ECONNREFUSED|postgresql:\/\/|\bat\s+[^\r\n]+:\d+:\d+/);
  }
  try {
    await db.connect();
    if (process.argv.includes('--skip-build')) {
      const verifiedRun = process.env.M3_VERIFIED_BUILD_RUN;
      assert.match(verifiedRun ?? '', /^[a-f0-9]{12}$/, 'Build reuse requires a recorded verification run token');
      assertVerifiedBuild(env, resolve(root, `.local/verification-${verifiedRun}`));
    } else await buildVerified(env, directory);
    // Next's destination is compiled at build time. Reuse only the correct
    // configured API origin, after its earlier verification services stopped.
    const manifest = JSON.parse(readFileSync(resolve('apps/web', env.NEXT_DIST_DIR, 'routes-manifest.json'), 'utf8'));
    assert.ok(JSON.stringify(manifest.rewrites).includes(env.INTERNAL_API_ORIGIN + '/api/v1/'), 'Existing build API destination differs; rebuild or use matching isolated ports');
    children.push(launch(['--import', 'tsx', 'apps/api/src/main.ts'], env, resolve(directory, 'api.log')));
    // Do not create proxy-startup errors before the deliberately injected faults.
    await waitFor(env.INTERNAL_API_ORIGIN + '/api/v1/health/ready', children);
    children.push(launch(['scripts/web.mjs', 'start'], env, resolve(directory, 'web.log')));
    await waitFor(origin + '/api/v1/health/ready', children);
    assert.equal((await checkDependencies(env)).ready, true);
    record('healthy actual PostgreSQL auth schema and Redis preflight');
    const customer = { name: 'Synthetic runtime recovery', email: `m3-${token}@example.invalid`, password: randomBytes(24).toString('base64url') };
    const signup = await request('/api/auth/sign-up/email', customer);
    const user = (await ok(signup)).user;
    cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(cookie);
    assert.equal((await ok(await request('/api/v1/me', undefined, { auth: true }))).id, user.id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "Session" WHERE "userId"=$1', [user.id])).rows[0].n, 1);
    assert.ok((await ok(await request('/api/v1/products'))).some(product => product.id === 'fixture-studio'));
    record('healthy signup persists user/session and real catalog');

    pgProxy.setAvailable(false);
    const outageInput = { ...customer, email: `m3-down-${token}@example.invalid`, password: canary };
    for (const [path, input] of [['/api/auth/sign-up/email', outageInput], ['/api/auth/sign-in/email', { email: customer.email, password: customer.password }]]) {
      const failure = await request(path, input);
      assert.equal(failure.status, 503);
      assert.equal(failure.headers.get('set-cookie'), null);
      assert.match(failure.headers.get('cache-control') ?? '', /no-store/);
      safe(await failure.text());
    }
    const catalogDown = await request('/api/v1/products'); assert.equal(catalogDown.status, 503); safe(await catalogDown.text());
    assert.equal((await checkDependencies(env)).ready, false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "User" WHERE email=$1', [outageInput.email])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "Session" WHERE "userId"=$1', [user.id])).rows[0].n, 1);
    record('database outage rejects signup/login/catalog safely without account/session success');

    pgProxy.setAvailable(true);
    await until(() => checkDependencies(env), value => value.ready);
    const login = await request('/api/auth/sign-in/email', { email: customer.email, password: customer.password });
    await ok(login); cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); assert.ok(cookie);
    assert.equal((await ok(await request('/api/v1/me', undefined, { auth: true }))).id, user.id);
    assert.ok((await ok(await request('/api/v1/products'))).some(product => product.id === 'fixture-studio'));
    const restoredEmail = `m3-restored-${token}@example.invalid`;
    const restoredSignup = await request('/api/auth/sign-up/email', { ...customer, email: restoredEmail });
    await ok(restoredSignup);
    assert.ok(restoredSignup.headers.get('set-cookie'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "User" WHERE email=$1', [restoredEmail])).rows[0].n, 1);
    assert.ok((await db.query('SELECT count(*)::int AS n FROM "RateLimit"')).rows[0].n > 0);
    const wrongOrigin = await request('/api/auth/sign-in/email', { email: customer.email, password: customer.password }, { headers: { origin: 'https://attacker.invalid' } });
    assert.equal(wrongOrigin.status, 403);
    record('database restoration recovers signup/login/session/catalog with DB limiter and origin checks retained');

    children.push(launch(['--import', 'tsx', 'scripts/verify-runtime-recovery.mjs', '--worker'], env, resolve(directory, 'worker.log')));
    await until(async () => { try { return readFileSync(resolve(directory, 'worker.log'), 'utf8'); } catch { return ''; } }, value => value.includes('worker ready'));
    redisProxy.setAvailable(false);
    const notReady = await request('/api/v1/health/ready'); assert.equal(notReady.status, 503); safe(await notReady.text());
    const preflight = await checkDependencies(env); assert.equal(preflight.database, 'ready'); assert.equal(preflight.ready, false);
    // Catalog is SQL-backed and stays useful while the queue is offline.
    assert.ok((await ok(await request('/api/v1/products'))).length > 0);
    const funding = await ok(await request('/api/v1/funding/intents', { amountMinor: '1000000' }, { auth: true }));
    await ok(await request(`/api/v1/funding/intents/${funding.id}/simulate`, {}, { auth: true }));
    const intent = await db.query('SELECT status FROM "PaymentIntent" WHERE id=$1', [funding.id]);
    const pending = await db.query('SELECT count(*)::int AS n FROM "Inbox" WHERE "eventId"=$1', [`fixture-payment:${funding.reference}`]);
    assert.equal(pending.rows[0].n, 1); assert.equal(intent.rows[0].status, 'PENDING');
    record('Redis outage fails readiness while SQL catalog and durable funding inbox survive');
    redisProxy.setAvailable(true);
    await waitFor(origin + '/api/v1/health/ready', children);
    await until(() => db.query('SELECT status FROM "PaymentIntent" WHERE id=$1', [funding.id]), result => result.rows[0].status === 'CREDITED');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "Journal" WHERE "operationId"=$1', [`fund:${funding.id}`])).rows[0].n, 1);
    const quote = await ok(await request('/api/v1/quotes', { productId: 'fixture-studio', quantity: 1 }, { auth: true }));
    redisProxy.setAvailable(false);
    const order = await ok(await request('/api/v1/orders', { quoteId: quote.id }, { auth: true, headers: { 'idempotency-key': randomUUID() } }));
    const durable = await db.query('SELECT status FROM "Outbox" WHERE "aggregateId"=$1 AND "eventType"=$2', [order.id, 'ORDER_FULFILL']);
    assert.equal(durable.rows.length, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "ProviderAttempt" WHERE "orderId"=$1', [order.id])).rows[0].n, 0);
    record('Redis outage preserves reserved order and durable outbox before dispatch');
    redisProxy.setAvailable(true);
    await until(() => db.query('SELECT fulfillment FROM "Order" WHERE id=$1', [order.id]), value => value.rows[0].fulfillment === 'DELIVERED');
    await delay(1500);
    const counts = async () => ({ capture: (await db.query('SELECT count(*)::int AS n FROM "Journal" WHERE "operationId"=$1', [`capture:${order.id}`])).rows[0].n,
      dispatch: (await db.query('SELECT "dispatchCount" FROM "ProviderAttempt" WHERE "orderId"=$1', [order.id])).rows[0].dispatchCount });
    assert.deepEqual(await counts(), { capture: 1, dispatch: 1 });
    redisProxy.setAvailable(false); await delay(1800); redisProxy.setAvailable(true);
    await waitFor(origin + '/api/v1/health/ready', children); await delay(1500);
    assert.deepEqual(await counts(), { capture: 1, dispatch: 1 });
    const unbalanced = await db.query('SELECT j.id FROM "Journal" j JOIN "Posting" p ON p."journalId"=j.id WHERE j."postedAt" IS NOT NULL GROUP BY j.id HAVING sum(CASE WHEN p.direction=\'DEBIT\' THEN p."amountMinor" ELSE -p."amountMinor" END) <> 0');
    assert.equal(unbalanced.rows.length, 0);
    record('persistent worker recovers inbox/outbox once after repeated Redis interruption', await counts());
    for (const file of ['api.log', 'web.log', 'worker.log']) safe(readFileSync(resolve(directory, file), 'utf8'));
    record('captured HTTP/server/worker diagnostics contain no tested secrets or database internals');
    writeFileSync(resolve(directory, 'runtime-recovery-report.json'), JSON.stringify({ ...evidence, result: 'implemented-local', limitation: 'Transport outage through owned proxies; native services/data preserved. No external provider or production claim.' }, null, 2));
    console.log(`Runtime recovery verified; safe report .local/verification-${token}/runtime-recovery-report.json`);
  } finally {
    pgProxy.setAvailable(true); redisProxy.setAvailable(true);
    for (const child of children.reverse()) await stop(child);
    await db.end(); await pgProxy.close(); await redisProxy.close();
  }
}

if (process.argv.includes('--worker')) await workerChild(); else await run();
