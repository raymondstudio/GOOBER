import { SupplierHttp, identifier, integer, losslessBody, money, record, strings, text } from './http.js';
import { verifyHmac } from './signatures.js';
import { ProviderError, unknownOutcome, validateConfig, validateRequest, type AdapterConfig, type BalanceResult, type CatalogResult, type SupplierOutcome, type SupplierRequest } from './types.js';

function successful(status: number): void { if (status < 200 || status >= 300) throw new ProviderError('supplier-http-error'); }
export function parsePaiCatalog(body: unknown): CatalogResult {
  const data = record(body);
  if (data.currency !== 'USD' || !Array.isArray(data.products) || data.products.length > 10000) throw new ProviderError('malformed-catalog');
  return {completeness: 'unverified', products: data.products.map(value => {
    const item = record(value);
    const inputType = text(item.input_type, 32);
    if (!['quantity', 'accounts', 'link'].includes(inputType)) throw new ProviderError('unsupported-input-type');
    const minQuantity = integer(item.min_quantity); const maxQuantity = integer(item.max_quantity);
    const pricePer = integer(item.price_per);
    if (minQuantity < 1 || maxQuantity < minQuantity || pricePer < 1) throw new ProviderError('invalid-catalog-bounds');
    return {id: text(item.service_id, 128), name: text(item.name, 512), inputType, stock: integer(item.stock), unitMinor: money(item.unit_price), currency: 'USD' as const, minQuantity, maxQuantity, pricePer};
  })};
}
export function parsePaiOutcome(body: unknown, request: SupplierRequest, purchase = true): SupplierOutcome {
  validateRequest('PAI', request);
  const data = record(body);
  if ((purchase && data.success !== true) || data.external_order_id !== request.externalOrderId || data.service_id !== request.productId || data.currency !== 'USD') throw new ProviderError('reference-or-envelope-mismatch', true);
  const quantity = integer(data.quantity);
  if (quantity !== request.quantity) throw new ProviderError('unsupported-partial-outcome', true);
  const supplierOrderId = text(data.order_id, 128);
  const chargedMinor = money(data.total_cost);
  const products = strings(data.products, request.quantity);
  const common = {supplierOrderId, externalOrderId: request.externalOrderId, productId: request.productId, quantity, chargedMinor, currency: 'USD' as const, products, replay: data.idempotent_replay === true};
  if (!['delivered','queued','failed'].includes(String(data.status))) throw new ProviderError('unknown-supplier-status', true);
  if (data.status === 'failed') {
    if (products.length) throw new ProviderError('contradictory-failure', true);
    return {...common, kind: 'failed', reason: text(data.failed_reason, 1024)};
  }
  if (chargedMinor !== request.expectedMinor) return {...common, products: [], kind: 'unknown', reason: 'supplier-cost-discrepancy'};
  if (data.status === 'queued' && products.length === 0) return {...common, kind: 'queued'};
  if (data.status === 'delivered' && products.length === quantity) return {...common, kind: 'delivered'};
  throw new ProviderError('missing-or-contradictory-delivery', true);
}

export class PaiAdapter {
  private readonly http: SupplierHttp;
  private sandboxChecked = false;
  readonly capabilities = {referenceLookup: 'documented', replay: 'retention-unverified', priceCommitment: false, callbacks: 'documented', currency: 'USD'} as const;
  constructor(private readonly config: AdapterConfig) { validateConfig('PAI', config); this.http = new SupplierHttp('PAI', config); }
  async catalog(): Promise<CatalogResult> { const r = await this.http.request('GET','/products'); successful(r.status); return parsePaiCatalog(r.body); }
  async balance(): Promise<BalanceResult> {
    const r = await this.http.request('GET','/me', undefined, true); successful(r.status); const data = record(r.body);
    if (data.currency !== 'USD' || data.mode !== 'sandbox' && data.mode !== 'test') throw new ProviderError('sandbox-response-mode-mismatch');
    this.sandboxChecked = true;
    return {balanceMinor: money(data.balance), currency: 'USD', mode: String(data.mode)};
  }
  async quote(productId: string): Promise<{costMinor: string; currency: 'USD'; committed: false}> {
    if (!productId || productId.length > 128) throw new ProviderError('invalid-product');
    const r = await this.http.request('GET',`/quote?service_id=${encodeURIComponent(productId)}&quantity=1`); successful(r.status);
    const d = record(r.body);
    if (d.service_id !== productId || integer(d.quantity) !== 1 || d.currency !== 'USD') throw new ProviderError('quote-mismatch');
    return {costMinor: money(record(d.pricing).final_total), currency: 'USD', committed: false};
  }
  async purchase(request: SupplierRequest): Promise<SupplierOutcome> {
    validateRequest('PAI', request);
    if (this.config.mode !== 'sandbox') throw new ProviderError('sandbox-purchase-required');
    if (!this.sandboxChecked) await this.balance();
    try {
      const r = await this.http.request('POST','/order',{service_id: request.productId, quantity: 1, external_order_id: request.externalOrderId, accept_normal_price: false});
      if (r.status === 200 || r.status === 201) return parsePaiOutcome(r.body, request);
      const code = text(record(r.body).error, 128);
      const known: Record<string,number> = {invalid_json:400,missing_parameter:400,invalid_parameter:400,missing_api_key:401,invalid_api_key:401,insufficient_balance:402,unknown_service:404,service_unavailable:409,buffer_stock_conflict:409,rate_limited:429};
      if (known[code] !== r.status) return unknownOutcome(request, 'unrecognized-purchase-error');
      if (code === 'rate_limited') return {...unknownOutcome(request,code),kind:'quota'};
      if (code === 'buffer_stock_conflict') return {...unknownOutcome(request,code),kind:'price-change'};
      return {...unknownOutcome(request,code),kind:'failed'};
    } catch (error) {
      return unknownOutcome(request, error instanceof ProviderError ? error.code : 'unrecognized-response');
    }
  }
  async lookup(request: SupplierRequest): Promise<SupplierOutcome> {
    validateRequest('PAI', request);
    const r = await this.http.request('GET',`/order/${encodeURIComponent(request.externalOrderId)}`,undefined,true);
    if (r.status === 404) return unknownOutcome(request,'lookup-not-yet-visible');
    successful(r.status);
    try { return parsePaiOutcome(r.body,request,false); } catch(error) { return unknownOutcome(request,error instanceof ProviderError?error.code:'malformed-lookup'); }
  }
  async replay(): Promise<never> { throw new ProviderError('external-idempotency-retention-unverified'); }
}

export function parsePaiCallback(raw: Buffer, signature: string | undefined, secret: string, eventHeader: string | undefined, deliveryHeader: string | undefined, request: SupplierRequest): {identity: string; event: string; outcome: SupplierOutcome} {
  if (!verifyHmac(raw,signature,secret,'sha256',true)) throw new ProviderError('invalid-signature');
  const envelope = record(losslessBody(raw.toString('utf8')));
  const event = text(envelope.event,64); const identity = identifier(envelope.delivery_id);
  if (!['order.delivered','order.queued','order.failed'].includes(event) || eventHeader !== event || deliveryHeader !== identity) throw new ProviderError('callback-identity-mismatch');
  const data = record(envelope.data);
  if (`order.${String(data.status)}` !== event) throw new ProviderError('callback-status-mismatch');
  // Callback's documented minimal payload omits service_id/currency. Expected immutable request supplies them.
  const outcome = parsePaiOutcome({...data, service_id: data.service_id ?? request.productId, currency: data.currency ?? 'USD'},request,false);
  return {identity,event,outcome};
}
