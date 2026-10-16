import { SupplierHttp, identifier, integer, money, record, strings, text } from './http.js';
import { FixtureSupplier } from './fixtures.js';
import { ProviderError, unknownOutcome, validateConfig, validateRequest, type AdapterConfig, type BalanceResult, type CatalogResult, type FixtureStore, type SupplierOutcome, type SupplierRequest } from './types.js';

function envelope(body: unknown): Record<string, unknown> {
  const root = record(body);
  if (root.status !== 'success') throw new ProviderError('graml-business-error',true);
  return root;
}
export function parseGramlCatalog(body: unknown): CatalogResult {
  const root = envelope(body);
  if (!Array.isArray(root.data) || root.data.length > 100) throw new ProviderError('invalid-capped-catalog');
  return {completeness:'capped-unknown',products:root.data.map(value=>{
    const d=record(value);
    return {id:identifier(d.id),name:text(d.name,512),unitMinor:money(d.price),currency:'NGN' as const,stock:integer(d.stock),inputType:'opaque-account',minQuantity:1,maxQuantity:1,pricePer:1};
  })};
}
export function parseGramlOutcome(body: unknown, request: SupplierRequest): SupplierOutcome {
  validateRequest('GRAML',request);
  const d=record(envelope(body).data); const product=record(d.product);
  if(identifier(product.id)!==request.productId || integer(d.quantity)!==request.quantity) throw new ProviderError('graml-product-quantity-mismatch',true);
  const chargedMinor=money(d.total); const products=strings(d.accounts,1);
  const common={supplierOrderId:identifier(d.order_id),transactionId:text(d.transaction_id,128),externalOrderId:request.externalOrderId,productId:request.productId,quantity:1,chargedMinor,currency:'NGN' as const};
  if(chargedMinor!==request.expectedMinor) return {...common,kind:'unknown',products:[],reason:'supplier-cost-discrepancy'};
  if(products.length!==1) throw new ProviderError('missing-delivery',true);
  return {...common,kind:'delivered',products};
}
export class GramlAdapter {
  private readonly http:SupplierHttp;
  private readonly fixture?:FixtureSupplier;
  readonly capabilities={referenceLookup:false,replay:false,sandbox:false,historySchema:'undocumented',currency:'NGN'} as const;
  constructor(private readonly config:AdapterConfig, store?:FixtureStore){
    validateConfig('GRAML',config);this.http=new SupplierHttp('GRAML',config);
    if(config.mode==='fixture') {if(!store)throw new ProviderError('persistent-fixture-store-required');this.fixture=new FixtureSupplier('GRAML',config,store);}
  }
  async health():Promise<{healthy:boolean;observedSupplierTime:string}> {
    const r=await this.http.request('GET','/health');if(r.status!==200)throw new ProviderError('graml-health-http-error');
    const d=record(envelope(r.body).data);if(typeof d.healthy!=='boolean')throw new ProviderError('invalid-health');
    return {healthy:d.healthy,observedSupplierTime:text(d.time,64)};
  }
  async catalog():Promise<CatalogResult>{const r=await this.http.request('GET','/products?limit=100');if(r.status!==200)throw new ProviderError('graml-catalog-http-error');return parseGramlCatalog(r.body);}
  async balance():Promise<BalanceResult>{const r=await this.http.request('GET','/my/balance',undefined,true);if(r.status!==200)throw new ProviderError('graml-balance-http-error');const d=record(envelope(r.body).data);if(d.currency!=='NGN')throw new ProviderError('graml-currency-mismatch');return {balanceMinor:money(d.balance),currency:'NGN'};}
  async history(limit=20):Promise<{schema:'unverified';sensitiveReceipt:unknown;authoritativeForOrder:false}>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new ProviderError('invalid-limit');
    const r=await this.http.request('GET',`/my/orders?limit=${limit}`,undefined,true);if(r.status!==200)throw new ProviderError('graml-history-http-error');
    // No history schema was supplied. Caller may encrypt this observation; it cannot settle an order.
    return {schema:'unverified',sensitiveReceipt:r.body,authoritativeForOrder:false};
  }
  async purchase(request:SupplierRequest):Promise<SupplierOutcome>{
    validateRequest('GRAML',request);
    if(this.config.mode!=='fixture'||!this.fixture)throw new ProviderError('graml-purchase-fixture-only');
    // The worker MUST commit its permanent dispatch fence before invoking this method.
    try{return await this.fixture.purchase(request);}catch(error){if(error instanceof ProviderError&&error.code==='graml-dispatch-already-fenced')throw error;return unknownOutcome(request,'fixture-persistence-or-outcome-unknown');}
  }
}
