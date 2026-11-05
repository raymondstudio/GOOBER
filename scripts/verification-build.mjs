import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, execute } from './verify-harness.mjs';

export function applicationSourceDigest() {
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'apps', 'packages', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json'], { cwd: root, windowsHide: true });
  const hash = createHash('sha256');
  for (const path of [...new Set(paths.toString('utf8').split('\0').filter(Boolean))].sort()) {
    hash.update(path).update('\0').update(readFileSync(resolve(root, path))).update('\0');
  }
  return hash.digest('hex');
}

function buildIdentity(env) {
  return { sourceDigest: applicationSourceDigest(), apiOrigin: env.INTERNAL_API_ORIGIN, distDir: env.NEXT_DIST_DIR,
    buildId: readFileSync(resolve(root, 'apps/web', env.NEXT_DIST_DIR, 'BUILD_ID'), 'utf8').trim() };
}

export async function buildVerified(env, directory, { logFile = resolve(directory, 'build.log') } = {}) {
  const sourceDigest = applicationSourceDigest();
  await execute(['scripts/web.mjs', 'build'], env, { logFile });
  const proof = buildIdentity(env);
  assert.equal(proof.sourceDigest, sourceDigest, 'Application sources changed while building; repeat verification');
  writeFileSync(resolve(directory, 'build-proof.json'), JSON.stringify(proof, null, 2));
}

export function assertVerifiedBuild(env, directory) {
  const proof = JSON.parse(readFileSync(resolve(directory, 'build-proof.json'), 'utf8'));
  assert.deepEqual(buildIdentity(env), {
    sourceDigest: proof.sourceDigest, apiOrigin: proof.apiOrigin, distDir: proof.distDir, buildId: proof.buildId,
  }, 'Build/source/origin differs from the recorded verification run; rebuild');
  const manifest = JSON.parse(readFileSync(resolve(root, 'apps/web', env.NEXT_DIST_DIR, 'routes-manifest.json'), 'utf8'));
  assert.ok(JSON.stringify(manifest.rewrites).includes(env.INTERNAL_API_ORIGIN + '/api/v1/'), 'Compiled API origin differs');
}
