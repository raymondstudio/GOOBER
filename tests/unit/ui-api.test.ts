import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../apps/web/components/api.ts';

describe('UI API cancellation at the response-body boundary', () => {
  it('does not expire the current UI session when an old 401 is aborted during JSON parsing', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(401, { 'content-type': 'application/json' });
      // Send real HTTP headers and an incomplete body. Parsing stays pending
      // until the client aborts; no synthetic successful API response is used.
      response.write('{"error":');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Loopback test listener unavailable');
    const origin = `http://127.0.0.1:${address.port}`;
    const nativeFetch = globalThis.fetch;
    const events = new EventTarget();
    const dispatch = vi.spyOn(events, 'dispatchEvent');
    const controller = new AbortController();
    let parsingStarted!: () => void;
    const parsing = new Promise<void>(resolve => { parsingStarted = resolve; });
    vi.stubGlobal('window', events);
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const response = await nativeFetch(typeof input === 'string' ? new URL(input, origin) : input, init);
      const parseBody = response.json.bind(response);
      // This barrier observes the real Response parser; its body/status/result
      // remain those of the loopback server, with no fake commerce values.
      response.json = () => {
        const pending = parseBody();
        parsingStarted();
        return pending;
      };
      return response;
    });
    try {
      const settled = api('/me', undefined, undefined, controller.signal).then(
        (value: unknown) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
      await parsing;
      controller.abort();
      const result = await settled;
      expect(result.error).toBeTruthy();
      const expired = dispatch.mock.calls.filter(([event]) => event.type === 'goober:session-expired');
      expect(expired, 'A canceled old response must not invalidate a newer UI session').toHaveLength(0);
    } finally {
      controller.abort();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
