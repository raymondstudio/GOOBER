import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { root, createDatabase, persistentEnvironment } from './verify-harness.mjs';

if (process.env.APP_ENV !== 'test' || process.env.DATA_ENV !== 'test' || !/^\/goober_test_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL ?? '').pathname)) throw new Error('Restore verification only accepts a generated isolated verification source');
const source = { ...process.env }; delete source.NODE_OPTIONS;
const name = `goober_restore_${randomBytes(6).toString('hex')}`;
const restored = await createDatabase(source, name);
const directory = source.VERIFY_DIRECTORY ?? resolve(root, '.local/restore-verification'); mkdirSync(directory, { recursive: true });
const dump = resolve(directory, 'synthetic-backup.dump');
const started = Date.now();
function pgTool(name) {
  if (source.PG_BIN_DIR) { const selected = resolve(source.PG_BIN_DIR, name + (process.platform === 'win32' ? '.exe' : '')); if (!existsSync(selected)) throw new Error(`Configured PG_BIN_DIR lacks ${name}`); return selected; }
  const local = resolve(root, `.local/postgres/pgsql/bin/${name}.exe`); return existsSync(local) ? local : name;
}
async function pgRun(tool, args, connection) {
  const url = new URL(connection); if (!['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname)) throw new Error('Restore refuses nonlocal host');
  const env = { ...source, PGPASSWORD: decodeURIComponent(url.password) };
  return new Promise((resolveRun, reject) => {
    const child = spawn(pgTool(tool), ['--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username), '--dbname', url.pathname.slice(1), ...args], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = false; child.stderr.on('data', () => { errorOutput = true; });
    child.on('error', reject); child.on('exit', code => { if (code === 0) resolveRun(); else reject(new Error(`${tool} failed (${code}); credentials and payloads suppressed${errorOutput ? '; diagnostics available by rerunning locally' : ''}`)); });
  });
}
async function snapshot(connection) {
  const client = new Client({ connectionString: connection }); await client.connect();
  try {
    const counts = await client.query('SELECT (SELECT count(*)::text FROM "Journal") journals,(SELECT count(*)::text FROM "Posting") postings,(SELECT count(*)::text FROM "Order") orders,(SELECT count(*)::text FROM "Delivery") deliveries,(SELECT count(*)::text FROM "ProviderAttempt" WHERE "dispatchCount">0) fences');
    const totals = await client.query('SELECT currency,direction,sum("amountMinor")::text total FROM "Posting" GROUP BY currency,direction ORDER BY currency,direction');
    return { counts: counts.rows[0], totals: totals.rows };
  } finally { await client.end(); }
}
const original = await snapshot(source.DATABASE_URL);
if (Number(original.counts.deliveries) < 1 || Number(original.counts.fences) < 1) throw new Error('Restore source must contain actual synthetic delivered and fenced orders');
await pgRun('pg_dump', ['--format=custom', '--file', dump], source.DIRECT_DATABASE_URL);
await pgRun('pg_restore', ['--exit-on-error', '--no-owner', dump], restored.DIRECT_DATABASE_URL);
const copy = await snapshot(restored.DATABASE_URL);
if (JSON.stringify(original) !== JSON.stringify(copy)) throw new Error('Restored financial/order/fence snapshot differs');
Object.assign(process.env, restored, { DISPATCH_PAUSED: 'true' });
const { prisma } = await import('@goober/db');
const { open, createFundingIntent, applyFundingEvent, createQuote, createOrder } = await import('@goober/commerce');
const { processOutbox } = await import('../apps/worker/src/main.ts');
let decrypted = 0;
let corruptProbesRejected = 0;
try {
  const deliveries = await prisma.delivery.findMany({ include: { order: true } });
  for (const delivery of deliveries) {
    if (delivery.order.reviewReason === 'ISOLATED_ENVELOPE_CORRUPTION_PROBE') {
      let rejected = false; try { open(delivery, { orderId: delivery.orderId, provider: delivery.provider, environment: delivery.environment }); } catch { rejected = true; }
      if (!rejected) throw new Error('Restored deliberately corrupted envelope was accepted'); corruptProbesRejected++; continue;
    }
    const value = open(delivery, { orderId: delivery.orderId, provider: delivery.provider, environment: delivery.environment }); if (!Array.isArray(value.products) || value.products.length !== 1) throw new Error('Restored synthetic delivery did not decrypt'); decrypted++;
  }
  const pendingGraml = await prisma.order.findFirst({ where: { provider: 'GRAML', fulfillment: 'NEEDS_REVIEW', attempts: { some: { dispatchCount: 1 } } } });
  if (!pendingGraml) throw new Error('Restore requires an uncertain fenced Graml fixture');
  const event = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: pendingGraml.id, eventType: 'ORDER_FULFILL' } });
  await prisma.outbox.update({ where: { id: event.id }, data: { status: 'PENDING', attempts: 0, leaseUntil: null } });
  await processOutbox(event.id);
  const attempt = await prisma.providerAttempt.findFirstOrThrow({ where: { orderId: pendingGraml.id } });
  if (attempt.dispatchCount !== 1) throw new Error('Restored fence allowed a repeated supplier dispatch');
  const owner = `restore-${randomBytes(6).toString('hex')}`;
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.invalid`, name: 'Synthetic restored pause proof' } });
  const funding = await createFundingIntent(owner, '500000');
  await applyFundingEvent({ eventId: owner, type: 'payment.succeeded', environment: 'test', reference: funding.reference, amountMinor: '500000', currency: 'NGN' });
  const quote = await createQuote(owner, 'fixture-studio'); const order = await createOrder(owner, quote.id, randomBytes(16).toString('hex'));
  const newEvent = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: order.id, eventType: 'ORDER_FULFILL' } });
  await processOutbox(newEvent.id);
  if (await prisma.providerAttempt.count({ where: { orderId: order.id } })) throw new Error('Restored dispatch pause failed');
  const report = { sourceDatabase: new URL(source.DATABASE_URL).pathname.slice(1), restoredDatabase: name, original, restored: copy, decryptableSyntheticDeliveries: decrypted, deliberatelyCorruptedProbesRejected: corruptProbesRejected, restoredGramlDispatchCount: attempt.dispatchCount, newDispatchPaused: true, elapsedMs: Date.now() - started, status: 'implemented-local', limitation: 'Synthetic encryption keys and fixture providers only; no production RPO/RTO claim. Corruption probes are explicit nonfinancial test fixtures.' };
  writeFileSync(resolve(directory, 'restore-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(resolve(directory, 'restored-environment.json'), JSON.stringify(persistentEnvironment({ ...restored, DISPATCH_PAUSED: 'true' })), { mode: 0o600 });
  console.log(`Isolated restore passed: ${decrypted} synthetic deliveries decrypt, financial totals match, Graml fence retained and dispatch paused. Database ${name} preserved.`);
} finally { await prisma.$disconnect(); }
