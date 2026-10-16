import { parse, isLosslessNumber } from 'lossless-json';
import { parseMajorToMinor } from './signatures.js';
import { ProviderError, validateConfig, type AdapterConfig } from './types.js';

export function losslessBody(raw: string): unknown {
  try { return parse(raw); } catch { throw new ProviderError('malformed-response', true); }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isLosslessNumber(value)) throw new ProviderError('malformed-response', true);
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new ProviderError('malformed-response', true);
  return value;
}
export function numericText(value: unknown): string {
  if (isLosslessNumber(value)) return value.value;
  if (typeof value === 'string') return value;
  // Callers must use losslessBody; binary floating point money is deliberately rejected.
  throw new ProviderError('lossless-number-required', true);
}
export function integer(value: unknown, max = 1000000000): number {
  const raw = numericText(value);
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || BigInt(raw) > BigInt(max)) throw new ProviderError('invalid-integer', true);
  return Number(raw);
}
export function identifier(value: unknown): string {
  if (typeof value === 'string') return text(value, 128);
  const raw = numericText(value);
  if (!/^[0-9]{1,24}$/.test(raw)) throw new ProviderError('invalid-identifier', true);
  return raw;
}
export function money(value: unknown): string {
  try { return parseMajorToMinor(numericText(value)).toString(); } catch { throw new ProviderError('invalid-supplier-money', true); }
}
export function strings(value: unknown, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new ProviderError('malformed-delivery', true);
  return value.map(v => text(v));
}
export interface TransportResult { status: number; body: unknown; headers: Headers }
export class SupplierHttp {
  private readonly timeout: number;
  private readonly cap: number;
  constructor(private readonly provider: 'PAI' | 'GRAML' | 'PAYSTACK', private readonly config: AdapterConfig) {
    this.timeout = config.timeoutMs ?? 10000;
    this.cap = config.maxResponseBytes ?? 1000000;
  }
  async request(method: 'GET' | 'POST', path: string, body?: unknown, recovery = false): Promise<TransportResult> {
    validateConfig(this.provider, this.config);
    if (this.config.mode === 'fixture' || this.config.mode === 'disabled') throw new ProviderError('external-transport-disabled');
    const allowed = this.provider === 'PAI'
      ? (method === 'GET' && (/^\/products$|^\/me$|^\/quote\?/.test(path) || /^\/order\/[^/?]+$/.test(path))) || (method === 'POST' && path === '/order')
      : this.provider === 'GRAML'
        ? method === 'GET' && /^\/(health|products\?limit=100|my\/balance|my\/orders\?limit=(?:[1-9]|[1-9][0-9]|100))$/.test(path)
        : (method === 'POST' && path === '/transaction/initialize') || (method === 'GET' && /^\/transaction\/verify\/[^/?]+$/.test(path));
    if (!allowed) throw new ProviderError('operation-not-allowlisted');
    if (!this.config.apiKey && !(this.provider === 'GRAML' && path === '/health')) throw new ProviderError('external-api-key-required');
    const scope = `${this.provider}:${this.config.accountId}:${this.config.environment}`;
    await this.config.budget!.acquire(scope, recovery);
    const base = this.provider === 'PAI' ? 'https://p-ai.world/api/v1' : this.provider === 'GRAML' ? 'https://gramlsocial.com/api/v1' : 'https://api.paystack.co';
    const headers: Record<string,string> = this.provider === 'PAYSTACK' ? {Authorization: `Bearer ${this.config.apiKey}`} : this.config.apiKey ? {'X-API-Key': this.config.apiKey} : {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await (this.config.fetch ?? fetch)(base + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(this.timeout)});
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      if (remaining && reset && /^[0-9]+$/.test(remaining) && /^[0-9]{1,12}$/.test(reset)) await this.config.budget?.observe?.(scope, Number(remaining), Number(reset));
      const declared = response.headers.get('content-length');
      if (declared && /^[0-9]+$/.test(declared) && BigInt(declared) > BigInt(this.cap)) { await response.body?.cancel(); throw new ProviderError('response-too-large', method === 'POST'); }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError('empty-response', method === 'POST');
      const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > this.cap) { await reader.cancel(); throw new ProviderError('response-too-large', method === 'POST'); }
        chunks.push(part.value);
      }
      const payload = losslessBody(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));
      return {status: response.status, body: payload, headers: response.headers};
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('transport-error', method === 'POST');
    }
  }
}
