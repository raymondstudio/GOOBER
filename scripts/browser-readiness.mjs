import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';

const startupBudgetMs = 180_000;

function isolatedSettings(env) {
  try {
    if (env.APP_ENV !== 'test' || env.DATA_ENV !== 'test'
      || ['PAYMENT_MODE', 'PAI_MODE', 'GRAML_MODE'].some(key => env[key] !== 'fixture')) throw new Error();
    const database = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol)
      || !['127.0.0.1', 'localhost'].includes(database.hostname)
      || !/^\/goober_test_[a-f0-9]{12}$/.test(database.pathname)) throw new Error();
    for (const key of ['TRUSTED_ORIGIN', 'INTERNAL_API_ORIGIN']) {
      const origin = new URL(env[key]);
      if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.origin !== env[key]
        || Number(origin.port) < 1024 || Number(origin.port) > 65535) throw new Error();
    }
    if (env.BETTER_AUTH_URL !== env.TRUSTED_ORIGIN || env.INTERNAL_API_ORIGIN === env.TRUSTED_ORIGIN
      || typeof env.FIXTURE_WEBHOOK_SECRET !== 'string' || env.FIXTURE_WEBHOOK_SECRET.length < 32) throw new Error();
    return { origin: env.TRUSTED_ORIGIN };
  } catch { throw new Error('Browser readiness requires isolated test database, loopback origins and explicit fixture configuration'); }
}

/** Verification warmup, not an application bypass or an economic retry.
 * Proves the actual auth/API boundary and persistent worker before UI deadlines.
 * Returned diagnostics contain no account, credential, cookie or webhook values.
 */
export async function waitForBrowserReadiness(env, children = []) {
  const { origin } = isolatedSettings(env);
  const deadline = Date.now() + startupBudgetMs;
  let phase = 'authentication';
  let client;
  function remaining() {
    if (children.some(child => child.exitCode != null || child.signalCode != null)) throw new Error('Browser readiness service exited before verification');
    const budget = deadline - Date.now();
    if (budget <= 0) throw new Error('Browser readiness startup budget exhausted');
    return budget;
  }
  async function send(path, { body, cookie, headers = {} } = {}) {
    const timeout = Math.min(30_000, remaining());
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeout),
    });
    remaining();
    return response;
  }
  try {
    const identity = { name: 'Synthetic browser readiness', email: `browser-ready-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('base64url') };
    // A unique registration is attempted once. Failure is not concealed by
    // creating another identity or weakening the database-backed auth limiter.
    const signup = await send('/api/auth/sign-up/email', { body: identity });
    if (signup.status !== 200) throw new Error();
    const account = await signup.json();
    const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    if (!cookie || typeof account?.user?.id !== 'string') throw new Error();
    const current = await send('/api/v1/me', { cookie });
    if (current.status !== 200) throw new Error();
    const me = await current.json();
    if (me.id !== account.user.id || me.environment !== 'test' || me.role !== 'CUSTOMER') throw new Error();
    const signout = await send('/api/auth/sign-out', { body: {}, cookie });
    if (signout.status !== 200) throw new Error();
    await signout.arrayBuffer();
    const revoked = await send('/api/v1/me', { cookie });
    if (revoked.status !== 401) throw new Error();
    await revoked.arrayBuffer();

    phase = 'persistent-worker';
    const eventId = `browser-ready-${randomUUID()}`;
    const raw = JSON.stringify({ eventId, type: 'skeleton.probe', environment: 'test' });
    const signature = createHmac('sha256', env.FIXTURE_WEBHOOK_SECRET).update(Buffer.from(raw)).digest('hex');
    const admission = await send('/api/v1/webhooks/fixture', { body: raw, headers: { 'x-goober-signature': signature } });
    if (admission.status !== 202) throw new Error();
    await admission.arrayBuffer();
    client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: Math.min(2500, remaining()), query_timeout: 2500, statement_timeout: 2500 });
    client.on('error', () => undefined);
    await client.connect();
    while (remaining() > 0) {
      const result = await client.query('SELECT status, "processedAt", attempts FROM "Inbox" WHERE provider=$1 AND "providerAccount"=$2 AND environment=$3 AND "eventId"=$4', ['fixture', 'fixture', 'test', eventId]);
      remaining();
      const row = result.rows[0];
      // processInbox deliberately marks skeleton.probe IGNORED. A PROCESSING
      // claim timestamp or mere durable admission does not prove consumption.
      if (row?.status === 'IGNORED' && row.processedAt && row.attempts >= 1) {
        console.log('Browser readiness verified: current auth/API session, sign-out and persistent nonfinancial worker consumption');
        return { authentication: 'ready', apiSession: 'ready', signout: 'ready', persistentWorker: 'ready' };
      }
      if (row && ['FAILED', 'QUARANTINED', 'PROCESSED'].includes(row.status)) throw new Error();
      await new Promise(resolveDelay => setTimeout(resolveDelay, Math.min(250, remaining())));
    }
    throw new Error();
  } catch {
    // No raw HTTP body, connection configuration or driver exception escapes.
    throw new Error(`Browser readiness failed during ${phase}; check isolated local service readiness and preserved run diagnostics`);
  } finally { await client?.end().catch(() => undefined); }
}
