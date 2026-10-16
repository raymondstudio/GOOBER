import { createHash } from 'node:crypto';

export type Supplier = 'PAI' | 'GRAML';
export type SupplierCurrency = 'USD' | 'NGN';
export type FixtureScenario = 'delivered' | 'queued' | 'queued-failed' | 'failed' | 'timeout-after-accept' | 'unknown' | 'invalid' | 'quota' | 'price-change';
export interface AdapterConfig {
  appEnvironment: 'local' | 'test' | 'staging' | 'production';
  environment: 'test' | 'live';
  accountId: string;
  mode: 'fixture' | 'sandbox' | 'readonly' | 'disabled';
  apiKey?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** External modes require a distributed per-account budget implementation. */
  budget?: RequestBudget;
  fetch?: typeof fetch;
}
export interface RequestBudget { acquire(scope: string, recovery: boolean): Promise<void>; observe?(scope: string, remaining: number, resetEpoch: number): Promise<void> }
export interface SupplierRequest {
  externalOrderId: string;
  productId: string;
  quantity: 1;
  expectedMinor: string;
  currency: SupplierCurrency;
  scenario?: FixtureScenario;
}
export interface SupplierOutcome {
  kind: 'delivered' | 'queued' | 'failed' | 'unknown' | 'quota' | 'price-change';
  supplierOrderId?: string;
  transactionId?: string;
  externalOrderId: string;
  productId: string;
  quantity: number;
  chargedMinor: string;
  currency: SupplierCurrency;
  /** Sensitive: encrypt before persistence; never ordinary summaries, jobs or logs. */
  products: string[];
  /** Supplier-controlled sensitive text: encrypted evidence only; never operational logs/DTOs. */
  reason?: string;
  replay?: boolean;
}
export interface SupplierProduct { id: string; name: string; unitMinor: string; currency: SupplierCurrency; stock: number; inputType: string; minQuantity: number; maxQuantity: number; pricePer: number }
export interface CatalogResult { products: SupplierProduct[]; completeness: 'unverified' | 'capped-unknown' }
export interface BalanceResult { balanceMinor: string; currency: SupplierCurrency; mode?: string }
export interface FixtureReceipt { requestDigest: string; outcome: SupplierOutcome; scenario: FixtureScenario; lookupCount: number }
/** Implement against encrypted durable PostgreSQL records. In-memory stores are only test doubles. */
export interface FixtureStore {
  get(reference: string): Promise<FixtureReceipt | null>;
  putIfAbsent(reference: string, requestDigest: string, receipt: FixtureReceipt): Promise<FixtureReceipt>;
  update(reference: string, receipt: FixtureReceipt): Promise<void>;
}
export class ProviderError extends Error {
  constructor(public readonly code: string, public readonly uncertain = false, public readonly resetEpoch?: number) { super(code); this.name = 'ProviderError'; }
}
export function validateConfig(provider: Supplier | 'PAYSTACK', config: AdapterConfig): void {
  if (!config.accountId || config.accountId.length > 128) throw new ProviderError('invalid-account');
  if (!['local', 'test', 'staging', 'production'].includes(config.appEnvironment) || !['test', 'live'].includes(config.environment)) throw new ProviderError('invalid-environment');
  if (!['fixture', 'sandbox', 'readonly', 'disabled'].includes(config.mode)) throw new ProviderError('invalid-mode');
  if (config.mode === 'disabled') return;
  if (config.appEnvironment === 'production' || config.environment !== 'test') throw new ProviderError('live-mode-disabled');
  if (config.mode === 'fixture' && !['local', 'test'].includes(config.appEnvironment)) throw new ProviderError('fixture-environment-disabled');
  if (provider === 'GRAML' && config.mode === 'sandbox') throw new ProviderError('graml-sandbox-undocumented');
  if (provider !== 'GRAML' && config.mode === 'readonly') throw new ProviderError('unsupported-readonly-mode');
  if (config.mode !== 'fixture') {
    if ((!config.apiKey && provider !== 'GRAML') || !config.budget) throw new ProviderError('external-key-and-budget-required');
    if (provider !== 'GRAML' && !config.apiKey!.startsWith('sk_test_')) throw new ProviderError('test-key-required');
  }
  if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 10 || config.timeoutMs > 30000)) throw new ProviderError('invalid-timeout');
  if (config.maxResponseBytes !== undefined && (!Number.isInteger(config.maxResponseBytes) || config.maxResponseBytes < 128 || config.maxResponseBytes > 2000000)) throw new ProviderError('invalid-body-cap');
}
export function validateRequest(provider: Supplier, request: SupplierRequest): void {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(request.externalOrderId) || !request.productId || request.productId.length > 128 || request.quantity !== 1) throw new ProviderError('invalid-request');
  if (!/^(0|[1-9][0-9]{0,18})$/.test(request.expectedMinor) || BigInt(request.expectedMinor) > 9223372036854775807n || request.currency !== (provider === 'PAI' ? 'USD' : 'NGN')) throw new ProviderError('invalid-request-money');
  if (request.scenario !== undefined && !['delivered','queued','queued-failed','failed','timeout-after-accept','unknown','invalid','quota','price-change'].includes(request.scenario)) throw new ProviderError('invalid-fixture-scenario');
}
export function supplierRequestDigest(provider: Supplier, request: SupplierRequest): string {
  validateRequest(provider, request);
  // Explicit allowlist/order is canonical and excludes arbitrary caller properties.
  return createHash('sha256').update(JSON.stringify({provider, externalOrderId: request.externalOrderId, productId: request.productId, quantity: request.quantity, expectedMinor: request.expectedMinor, currency: request.currency, scenario: request.scenario ?? 'delivered'})).digest('hex');
}
export function unknownOutcome(request: SupplierRequest, reason: string): SupplierOutcome {
  return {kind: 'unknown', externalOrderId: request.externalOrderId, productId: request.productId, quantity: request.quantity, chargedMinor: '0', currency: request.currency, products: [], reason};
}
