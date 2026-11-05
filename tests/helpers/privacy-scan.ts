import { createReadStream } from 'node:fs';

export const PRIVACY_SCAN_CHUNK_BYTES = 64 * 1024;

/** Exact UTF-8 byte matching without decoding entire browser bundles to strings.
 * Reports fixed caller-supplied labels only, never the configured secret values.
 */
export async function scanPrivateArtifacts(files: readonly string[], values: Readonly<Record<string, string | undefined>>) {
  const needles = Object.entries(values).map(([label, value]) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(label) || typeof value !== 'string' || value.length === 0) {
      throw new Error('Privacy scan requires fixed labels and nonempty configured needles');
    }
    return { label, bytes: Buffer.from(value, 'utf8') };
  });
  if (needles.length === 0) throw new Error('Privacy scan requires configured needles');
  const overlap = Math.max(...needles.map(needle => needle.bytes.length)) - 1;
  const found = new Set<string>();
  let bytes = 0;
  const started = performance.now();
  for (const file of files) {
    let carry: Buffer = Buffer.alloc(0);
    for await (const chunk of createReadStream(file, { highWaterMark: PRIVACY_SCAN_CHUNK_BYTES })) {
      bytes += chunk.length;
      const window = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      // Keep checking every configured needle in every file/chunk, including
      // after a match. The report omits the sensitive matched content itself.
      for (const needle of needles) if (window.indexOf(needle.bytes) !== -1) found.add(needle.label);
      carry = overlap ? window.subarray(Math.max(0, window.length - overlap)) : Buffer.alloc(0);
    }
  }
  return { files: files.length, bytes, matches: [...found].sort(), elapsedMs: Math.round(performance.now() - started) };
}
