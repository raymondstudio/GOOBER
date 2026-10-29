import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const { checkDependencies } = await import(new URL('../../scripts/dependency-preflight.mjs', import.meta.url).href) as {
  checkDependencies(settings: Record<string, string>): Promise<{ database: string; queue: string; ready: boolean }>;
};

async function unusedPort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test port unavailable');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

describe('local dependency preflight safe failures', () => {
  it('rejects malformed connection configuration without exposing supplied values', async () => {
    expect(await checkDependencies({ DATABASE_URL: 'not-a-database-secret', REDIS_URL: 'https://not-redis.invalid' }))
      .toEqual({ database: 'configuration', queue: 'configuration', ready: false });
  });

  it('fails the real CLI on refused loopback sockets with fixed actionable diagnostics', async () => {
    const port = await unusedPort();
    const marker = 'GOOBER-SYNTHETIC-CONNECTION-CANARY';
    let result: { code?: number; stdout?: string; stderr?: string } = {};
    try {
      await execute(process.execPath, ['scripts/dependency-preflight.mjs'], {
        env: { ...process.env, DATABASE_URL: `postgresql://synthetic:${marker}@127.0.0.1:${port}/synthetic`, REDIS_URL: `redis://:${marker}@127.0.0.1:${port}/14` },
        timeout: 20_000, windowsHide: true,
      });
      throw new Error('Preflight unexpectedly accepted stopped dependencies');
    } catch (error) { result = error as typeof result; }
    expect(result.code).toBe(1);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    expect(output).toContain('PostgreSQL auth storage is unavailable');
    expect(output).toContain('Redis queue is unavailable');
    expect(output).toContain('pnpm dev:infra');
    expect(output).not.toMatch(/ECONNREFUSED|Prisma|RateLimit|SELECT|postgresql:\/\/|redis:\/\/|at .+:\d+/);
    expect(output).not.toContain(marker);
  });
});
