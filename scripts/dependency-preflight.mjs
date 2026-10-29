import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

// Cold local authentication took five seconds on the supported 8 GB workstation.
// Keep readiness bounded without rejecting a healthy preserved cluster under load.
const timeoutMs = 10000;

/** Check real dependencies without exposing driver errors or connection credentials. */
export async function checkDependencies(settings = process.env) {
  async function database() {
    let pool;
    try {
      const url = new URL(settings.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) return 'configuration';
      pool = new Pool({ connectionString: settings.DATABASE_URL, max: 1,
        connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs, statement_timeout: timeoutMs });
      pool.on('error', () => undefined);
      await pool.query('SELECT 1');
      // The DB-backed auth limiter must exist and be accessible, not merely the TCP port.
      await pool.query('SELECT 1 FROM "RateLimit" LIMIT 0');
      return 'ready';
    } catch { return pool ? 'unavailable' : 'configuration'; }
    finally { if (pool) await pool.end().catch(() => undefined); }
  }
  async function queue() {
    let redis;
    try {
      const url = new URL(settings.REDIS_URL);
      if (!['redis:', 'rediss:'].includes(url.protocol)) return 'configuration';
      redis = new Redis(settings.REDIS_URL, { lazyConnect: true, connectTimeout: timeoutMs,
        commandTimeout: timeoutMs, maxRetriesPerRequest: 0, retryStrategy: () => null,
        enableOfflineQueue: false });
      redis.on('error', () => undefined);
      await redis.connect();
      return await redis.ping() === 'PONG' ? 'ready' : 'unavailable';
    } catch { return redis ? 'unavailable' : 'configuration'; }
    finally { redis?.disconnect(); }
  }
  const [databaseStatus, queueStatus] = await Promise.all([database(), queue()]);
  return { database: databaseStatus, queue: queueStatus,
    ready: databaseStatus === 'ready' && queueStatus === 'ready' };
}

export async function runPreflight() {
  try {
    if (existsSync('.env')) process.loadEnvFile('.env');
  } catch {
    console.error('Local configuration could not be loaded. See docs/LOCAL-RUNTIME.md; preserve .env.');
    return 1;
  }
  const result = await checkDependencies();
  if (result.ready) {
    console.log('Dependency preflight passed: PostgreSQL auth storage and Redis are reachable.');
    return 0;
  }
  if (result.database !== 'ready') console.error('PostgreSQL auth storage is unavailable or not prepared.');
  if (result.queue !== 'ready') console.error('Redis queue is unavailable or not configured.');
  console.error('Start exactly one infrastructure path. For the documented native path: pnpm dev:infra.');
  console.error('If services are running, follow database setup and diagnostics in docs/LOCAL-RUNTIME.md, then retry pnpm dev.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runPreflight();
}
