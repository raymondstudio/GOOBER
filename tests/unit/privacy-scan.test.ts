import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_SCAN_CHUNK_BYTES, scanPrivateArtifacts } from '../helpers/privacy-scan.ts';

async function withFiles(contents: (string | Buffer)[], run: (files: string[]) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'goober-privacy-unit-'));
  const files = contents.map((_content, index) => join(directory, `synthetic-${index}.bin`));
  try {
    await Promise.all(files.map((file, index) => writeFile(file, contents[index])));
    await run(files);
  } finally {
    for (const file of files) await unlink(file).catch(() => undefined);
    await rmdir(directory);
  }
}

describe('bounded exact-byte artifact privacy scan', () => {
  it('finds a secret spanning a 64KB boundary and returns only its safe label', async () => {
    const secret = 'SYNTHETIC-BOUNDARY-SECRET';
    const content = Buffer.concat([Buffer.alloc(PRIVACY_SCAN_CHUNK_BYTES - 3, 97), Buffer.from(secret), Buffer.alloc(10, 98)]);
    await withFiles([content], async files => {
      const result = await scanPrivateArtifacts(files, { boundary: secret, absent: 'different-secret' });
      expect(result.matches).toEqual(['boundary']);
      expect(result.bytes).toBe(content.length);
      expect(result.files).toBe(1);
      expect(JSON.stringify(result)).not.toContain(secret);
    });
  });

  it('matches UTF-8 content even when a multibyte character crosses the read boundary', async () => {
    const secret = 'é\u20a6-private';
    const content = Buffer.concat([Buffer.alloc(PRIVACY_SCAN_CHUNK_BYTES - 1, 97), Buffer.from(secret, 'utf8')]);
    await withFiles([content], async files => {
      expect((await scanPrivateArtifacts(files, { utf8: secret })).matches).toEqual(['utf8']);
    });
  });

  it('checks all files and all needles, including empty/small files and later matches', async () => {
    const contents = ['', 'x', 'synthetic-one synthetic-two synthetic-one'];
    await withFiles(contents, async files => {
      const result = await scanPrivateArtifacts(files, { first: 'synthetic-one', second: 'synthetic-two', longerThanSmallFile: 'this value does not occur' });
      expect(result.matches).toEqual(['first', 'second']);
      expect(result.files).toBe(3);
      expect(result.bytes).toBe(contents.reduce((size, content) => size + Buffer.byteLength(content), 0));
    });
  });

  it('does not mistake near matches or a partial suffix for a complete secret', async () => {
    const secret = 'synthetic-exact-secret';
    const content = Buffer.concat([Buffer.alloc(PRIVACY_SCAN_CHUNK_BYTES - 4, 97), Buffer.from(secret.slice(0, -1) + 'X'), Buffer.from(secret.slice(0, -2))]);
    await withFiles([content, 'short'], async files => {
      expect((await scanPrivateArtifacts(files, { exact: secret })).matches).toEqual([]);
    });
  });

  it('rejects missing or empty secret configuration instead of claiming a privacy pass', async () => {
    for (const values of [{}, { missing: undefined }, { empty: '' }]) {
      await expect(scanPrivateArtifacts([], values)).rejects.toThrow(/configured needle/);
    }
  });
});
