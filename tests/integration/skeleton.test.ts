import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@goober/db';
import { signHmac, verifyHmac } from '@goober/providers';

// These tests intentionally cross the public Next.js proxy into the Nest API.
// Do not replace fetch/database calls with mocks: this is the G1 boundary proof.
const origin = process.env.TRUSTED_ORIGIN ?? 'http://127.0.0.1:3000';
const runId = randomUUID();
const email = `g1-${runId}@example.invalid`;
const eventId = `g1-${runId}`;
let cookie = '';
let userId = '';

function request(path: string, init?: RequestInit) {
  return fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(25_000) });
}

function signedEvent(raw: string, signature?: string) {
  const secret = process.env.FIXTURE_WEBHOOK_SECRET!;
  return request('/api/v1/webhooks/fixture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goober-signature': signature ?? signHmac(Buffer.from(raw), secret) },
    body: raw,
  });
}

describe('G1 public authentication/API and raw callback skeleton', () => {
  beforeAll(async () => {
    expect(['local', 'test']).toContain(process.env.APP_ENV ?? 'local');
    expect(process.env.DATA_ENV ?? 'test').toBe('test');
    expect(process.env.PAYMENT_MODE ?? 'fixture').toBe('fixture');
    expect(process.env.FIXTURE_WEBHOOK_SECRET, 'load isolated local .env before tests').toBeTruthy();
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(origin).hostname);
    const ready = await request('/api/v1/health/ready');
    expect(ready.status, 'start PostgreSQL, Redis, Nest and Next.js before G1').toBe(200);
    expect(await ready.json()).toMatchObject({ status: 'ready', database: 'ready', queue: 'ready', environment: 'test' });
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('rejects unauthenticated API access even with forged identity headers', async () => {
    const response = await request('/api/v1/me', { headers: { 'x-user-id': 'forged', 'x-role': 'ADMIN' } });
    expect(response.status).toBe(401);
  });

  it('registers through Better Auth and resolves the same database session in Nest', async () => {
    const response = await request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, name: 'G1 Synthetic Customer', password: randomBytes(24).toString('base64url'), role: 'ADMIN' }),
    });
    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some(value => /httponly/i.test(value))).toBe(true);
    cookie = setCookies.map(value => value.split(';')[0]).join('; ');
    expect(cookie).not.toBe('');
    const registered = await response.json() as { user: { id: string; email: string } };
    userId = registered.user.id;
    expect(registered.user.email).toBe(email);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);

    const me = await request('/api/v1/me', { headers: { cookie, 'x-role': 'ADMIN' } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ id: userId, email, role: 'CUSTOMER', environment: 'test' });
  });

  it('uses current database roles and immediately rejects a revoked session', async () => {
    expect(userId).not.toBe('');
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    const promoted = await request('/api/v1/me', { headers: { cookie } });
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({ role: 'ADMIN' });
    await prisma.user.update({ where: { id: userId }, data: { role: 'CUSTOMER' } });
    const demoted = await request('/api/v1/me', { headers: { cookie } });
    expect(await demoted.json()).toMatchObject({ role: 'CUSTOMER' });
    await prisma.session.deleteMany({ where: { userId } });
    expect((await request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
  });

  it('verifies original whitespace bytes and persists the digest before acknowledgement', async () => {
    const raw = `{\n  "eventId": "${eventId}", "type": "skeleton.probe",\n "environment": "test"\n}\n`;
    const signature = signHmac(Buffer.from(raw), process.env.FIXTURE_WEBHOOK_SECRET!);
    expect(verifyHmac(Buffer.from(raw), signature, process.env.FIXTURE_WEBHOOK_SECRET!)).toBe(true);
    const response = await signedEvent(raw);
    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ accepted: true });
    const record = await prisma.inbox.findUniqueOrThrow({ where: {
      provider_providerAccount_environment_eventId: { provider: 'fixture', providerAccount: 'fixture', environment: 'test', eventId },
    } });
    expect(record.payloadDigest).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(record.eventType).toBe('skeleton.probe');
    expect((await signedEvent(raw)).status).toBe(202);
    expect(await prisma.inbox.count({ where: { eventId, provider: 'fixture', environment: 'test' } })).toBe(1);

    const modified = raw.replace('skeleton.probe', 'skeleton.changed');
    expect((await signedEvent(modified, signature)).status).toBe(401);
    expect((await signedEvent(modified)).status).toBe(400);
    expect((await signedEvent(raw, 'a')).status).toBe(401);
    expect((await signedEvent(raw, 'z'.repeat(64))).status).toBe(401);
    const wrongEnvironment = raw.replace('"test"', '"live"').replace(eventId, `${eventId}-wrong-env`);
    expect((await signedEvent(wrongEnvironment)).status).toBe(400);
    expect(await prisma.inbox.count({ where: { eventId: `${eventId}-wrong-env` } })).toBe(0);
  });
});
