import { createHash } from 'node:crypto';
import { ProviderError, supplierRequestDigest, unknownOutcome, validateConfig, validateRequest, type AdapterConfig, type FixtureReceipt, type FixtureStore, type Supplier, type SupplierOutcome, type SupplierRequest } from './types.js';

/** A simulated upstream with injectable durable encrypted storage, never a fake wallet. */
export class FixtureSupplier {
  constructor(private readonly provider: Supplier, private readonly config: AdapterConfig, private readonly store: FixtureStore) {
    validateConfig(provider, config);
    if (config.mode !== 'fixture') throw new ProviderError('fixture-mode-required');
  }
  private key(reference: string): string { return `${this.provider}:${this.config.accountId}:${this.config.environment}:${reference}`; }
  async purchase(request: SupplierRequest): Promise<SupplierOutcome> {
    validateConfig(this.provider, this.config);
    if (this.config.mode !== 'fixture') throw new ProviderError('fixture-mode-required');
    validateRequest(this.provider, request);
    const digest = supplierRequestDigest(this.provider, request);
    const key = this.key(request.externalOrderId);
    const existing = await this.store.get(key);
    if (existing) return this.replay(existing, digest);
    const scenario = request.scenario ?? 'delivered';
    const orderId = 'GOOBER-FIXTURE-' + createHash('sha256').update(key).digest('hex').slice(0, 20);
    let outcome: SupplierOutcome = {kind: 'delivered', supplierOrderId: orderId, transactionId: this.provider === 'GRAML' ? `${orderId}-TX` : undefined, externalOrderId: request.externalOrderId, productId: request.productId, quantity: 1, chargedMinor: request.expectedMinor, currency: request.currency, products: [`GOOBER-FIXTURE-SECRET-${orderId}`], replay: false};
    if (scenario === 'queued' || scenario === 'queued-failed') outcome = {...outcome, kind: 'queued', products: []};
    if (scenario === 'failed') outcome = {...outcome, kind: 'failed', chargedMinor: '0', products: [], reason: 'fixture-confirmed-failure'};
    if (scenario === 'unknown' || scenario === 'invalid') outcome = unknownOutcome(request, scenario === 'invalid' ? 'malformed-response' : 'unresolved-outcome');
    if (scenario === 'quota') outcome = {...outcome, kind: 'quota', chargedMinor: '0', products: [], reason: 'rate-limited'};
    if (scenario === 'price-change') outcome = {...outcome, kind: 'price-change', chargedMinor: '0', products: [], reason: 'price-changed-before-dispatch'};
    const receipt: FixtureReceipt = {requestDigest: digest, outcome, scenario, lookupCount: 0};
    const saved = await this.store.putIfAbsent(key, digest, receipt);
    // Implementations return the inserted or concurrently existing value. Immutable digest checks close races.
    if (saved.requestDigest !== digest) throw new ProviderError('fixture-idempotency-conflict');
    if (scenario === 'timeout-after-accept') return unknownOutcome(request, 'accepted-response-lost');
    return structuredClone(saved.outcome);
  }
  private replay(receipt: FixtureReceipt, digest: string): SupplierOutcome {
    if (receipt.requestDigest !== digest) throw new ProviderError('fixture-idempotency-conflict');
    if (this.provider === 'GRAML') throw new ProviderError('graml-dispatch-already-fenced', true);
    return {...structuredClone(receipt.outcome), replay: true};
  }
  async lookup(reference: string): Promise<SupplierOutcome> {
    if (this.provider === 'GRAML') throw new ProviderError('graml-reference-lookup-undocumented');
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(reference)) throw new ProviderError('invalid-reference');
    const key = this.key(reference);
    const receipt = await this.store.get(key);
    if (!receipt) throw new ProviderError('unknown-order', true);
    if (receipt.outcome.kind === 'queued') {
      const outcome: SupplierOutcome = receipt.scenario === 'queued-failed'
        ? {...receipt.outcome, kind: 'failed', chargedMinor: '0', products: [], reason: 'fixture-confirmed-upstream-refund'}
        : {...receipt.outcome, kind: 'delivered', products: [`GOOBER-FIXTURE-SECRET-${receipt.outcome.supplierOrderId}`]};
      const next = {...receipt, outcome, lookupCount: receipt.lookupCount + 1};
      await this.store.update(key, next);
      return structuredClone(outcome);
    }
    return structuredClone(receipt.outcome);
  }
}
