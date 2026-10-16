import { describe,expect,it } from 'vitest';
import { FixtureSupplier,GramlAdapter,PaiAdapter,PaystackAdapter,losslessBody,parseGramlCatalog,parseGramlOutcome,parsePaiCallback,parsePaiCatalog,parsePaiOutcome,parsePaystackCallback,parsePaystackTransaction,signHmac,type AdapterConfig,type FixtureReceipt,type FixtureStore,type FundingExpectation,type SupplierRequest } from '../../packages/providers/src/index.js';

const fixtureConfig:AdapterConfig={appEnvironment:'test',environment:'test',accountId:'synthetic-account',mode:'fixture'};
const request:SupplierRequest={externalOrderId:'fixture-order-1',productId:'fictional-product',quantity:1,expectedMinor:'50',currency:'USD'};
class MemoryTestStore implements FixtureStore {
  readonly values=new Map<string,FixtureReceipt>();
  async get(key:string){return structuredClone(this.values.get(key)??null);}
  async putIfAbsent(key:string,_digest:string,value:FixtureReceipt){if(!this.values.has(key))this.values.set(key,structuredClone(value));return structuredClone(this.values.get(key)!);}
  async update(key:string,value:FixtureReceipt){this.values.set(key,structuredClone(value));}
}
const budget={acquire:async()=>{}};
function remoteConfig(provider:'PAI'|'GRAML'|'PAYSTACK',response:(url:string,init?:RequestInit)=>Response):AdapterConfig {
  return {...fixtureConfig,mode:provider==='GRAML'?'readonly':'sandbox',apiKey:'sk_test_synthetic',budget,fetch:(async(url,init)=>response(String(url),init)) as typeof fetch};
}
function paiBody(extra:Record<string,unknown>={}){return {success:true,order_id:'SUPPLIER-1',external_order_id:request.externalOrderId,service_id:request.productId,currency:'USD',quantity:1,status:'delivered',total_cost:0.50,products:['GOOBER-FIXTURE-CODE'],...extra};}
function paiResponse(extra:Record<string,unknown>={}){return losslessBody(JSON.stringify(paiBody(extra)));}

describe('lossless provider contracts',()=>{
  it('preserves amounts beyond JS safe integer from raw JSON',()=>{
    const catalog=parseGramlCatalog(losslessBody('{"status":"success","data":[{"id":9007199254740993,"name":"Fictional","price":90071992547409.93,"stock":1}]}'));
    expect(catalog.products[0]?.unitMinor).toBe('9007199254740993');
    expect(catalog.products[0]?.id).toBe('9007199254740993');
    expect(catalog.completeness).toBe('capped-unknown');
  });
  it('rejects fractional minor units and binary float input',()=>{
    expect(()=>parseGramlCatalog(losslessBody('{"status":"success","data":[{"id":1,"name":"Fictional","price":1.001,"stock":1}]}'))).toThrow();
    expect(()=>parseGramlCatalog({status:'success',data:[{id:'1',name:'Fictional',price:0.1,stock:'1'}]})).toThrow();
  });
  it('normalizes approved input metadata without silently converting link products into codes',()=>{
    const result=parsePaiCatalog(losslessBody('{"currency":"USD","products":[{"service_id":"1","name":"Unpublished fixture","input_type":"link","stock":100,"unit_price":1.08,"price_per":1000,"min_quantity":50,"max_quantity":10000}]}'));
    expect(result.products[0]).toMatchObject({inputType:'link',pricePer:1000,minQuantity:50,unitMinor:'108'});
  });
  it('retains opaque Graml credential lines and both upstream IDs',()=>{
    const req={...request,productId:'1',currency:'NGN' as const,expectedMinor:'50000'};
    const result=parseGramlOutcome(losslessBody('{"status":"success","data":{"order_id":42,"transaction_id":"API-42","product":{"id":1},"quantity":1,"total":500,"accounts":["synthetic:name:password@email:opaque"]}}'),req);
    expect(result.products).toEqual(['synthetic:name:password@email:opaque']);expect(result).toMatchObject({supplierOrderId:'42',transactionId:'API-42',chargedMinor:'50000'});
  });
  it('rejects wrong P-AI reference, partial delivery and missing delivery',()=>{
    for(const extra of [{external_order_id:'other'},{quantity:0},{products:[]},{currency:'NGN'},{success:false}])expect(()=>parsePaiOutcome(paiResponse(extra),request)).toThrow();
    expect(parsePaiOutcome(paiResponse({status:'queued',products:[]}),request).kind).toBe('queued');
    expect(parsePaiOutcome(paiResponse({total_cost:0.51}),request)).toMatchObject({kind:'unknown',reason:'supplier-cost-discrepancy',products:[]});
  });
});

describe('durable fixture recovery hooks',()=>{
  it('persists supplier acceptance before losing response; new adapter recovers original reference',async()=>{
    const store=new MemoryTestStore();const req={...request,scenario:'timeout-after-accept' as const};
    expect((await new FixtureSupplier('PAI',fixtureConfig,store).purchase(req)).kind).toBe('unknown');
    expect(store.values.size).toBe(1);
    expect((await new FixtureSupplier('PAI',fixtureConfig,store).lookup(req.externalOrderId)).kind).toBe('delivered');
    expect((await new FixtureSupplier('PAI',fixtureConfig,store).purchase(req)).replay).toBe(true);
  });
  it('uses original canonical body and rejects changed-body replay',async()=>{
    const supplier=new FixtureSupplier('PAI',fixtureConfig,new MemoryTestStore());await supplier.purchase(request);
    await expect(supplier.purchase({...request,expectedMinor:'51'})).rejects.toMatchObject({code:'fixture-idempotency-conflict'});
  });
  it.each(['queued','queued-failed'] as const)('recovers persisted %s through lookup without repurchase',async scenario=>{
    const store=new MemoryTestStore();const supplier=new FixtureSupplier('PAI',fixtureConfig,store);
    expect((await supplier.purchase({...request,scenario})).kind).toBe('queued');
    const restarted=new FixtureSupplier('PAI',fixtureConfig,store);
    const outcome=await restarted.lookup(request.externalOrderId);expect(outcome.kind).toBe(scenario==='queued'?'delivered':'failed');
    expect((await restarted.lookup(request.externalOrderId)).kind).toBe(outcome.kind);expect(store.values.size).toBe(1);
  });
  it('never permits Graml reference recovery or automatic repeat after timeout',async()=>{
    const store=new MemoryTestStore();const req={...request,currency:'NGN' as const,scenario:'timeout-after-accept' as const};
    const adapter=new GramlAdapter(fixtureConfig,store);expect((await adapter.purchase(req)).kind).toBe('unknown');
    await expect(new GramlAdapter(fixtureConfig,store).purchase(req)).rejects.toMatchObject({code:'graml-dispatch-already-fenced'});
    await expect(new FixtureSupplier('GRAML',fixtureConfig,store).lookup(req.externalOrderId)).rejects.toMatchObject({code:'graml-reference-lookup-undocumented'});
  });
  it.each([['failed','failed'],['unknown','unknown'],['invalid','unknown'],['quota','quota'],['price-change','price-change']] as const)('records deterministic %s outcome',async(scenario,kind)=>{
    const outcome=await new FixtureSupplier('PAI',fixtureConfig,new MemoryTestStore()).purchase({...request,scenario});expect(outcome.kind).toBe(kind);expect(outcome.products).toEqual([]);
  });
});

describe('mode and transport boundaries',()=>{
  it('rejects conflicting environment flags and live keys before any request',()=>{
    expect(()=>new PaiAdapter({...fixtureConfig,environment:'live'})).toThrow('live-mode-disabled');
    expect(()=>new GramlAdapter({...fixtureConfig,mode:'sandbox'})).toThrow('graml-sandbox-undocumented');
    expect(()=>new PaiAdapter({...fixtureConfig,appEnvironment:'production'})).toThrow('live-mode-disabled');
    expect(()=>new PaiAdapter({...fixtureConfig,mode:'sandbox',apiKey:'sk_live_forbidden',budget})).toThrow('test-key-required');
    expect(()=>new PaiAdapter({...fixtureConfig,mode:'sandbox',apiKey:'sk_test_synthetic'})).toThrow('external-key-and-budget-required');
  });
  it('Graml read-only mode can never issue POST and returns history schema honestly',async()=>{
    const calls:string[]=[];const adapter=new GramlAdapter(remoteConfig('GRAML',(url,init)=>{calls.push(`${init?.method} ${url}`);return new Response('{"upstream":"undocumented-shape"}');}));
    await expect(adapter.purchase({...request,currency:'NGN'})).rejects.toThrow('graml-purchase-fixture-only');
    expect(calls).toHaveLength(0);expect(await adapter.history()).toMatchObject({schema:'unverified',authoritativeForOrder:false});expect(calls[0]).toContain('GET https://gramlsocial.com/api/v1/my/orders?limit=20');
  });
  it('P-AI makes one POST, preserves reference and disables normal-price override',async()=>{
    const calls:{url:string;init?:RequestInit}[]=[];const adapter=new PaiAdapter(remoteConfig('PAI',(url,init)=>{
      calls.push({url,init});if(url.endsWith('/me'))return new Response('{"mode":"test","currency":"USD","balance":50}');
      expect(init?.redirect).toBe('error');return new Response(JSON.stringify(paiBody()),{status:201});
    }));
    expect((await adapter.purchase(request)).kind).toBe('delivered');
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({service_id:request.productId,quantity:1,external_order_id:request.externalOrderId,accept_normal_price:false});
    expect(calls.filter(c=>c.init?.method==='POST')).toHaveLength(1);
    await expect(adapter.replay()).rejects.toThrow('external-idempotency-retention-unverified');
  });
  it('malformed or timed-out POST returns unknown after one attempt',async()=>{
    for(const bad of ['malformed','timeout']){
      let posts=0;const adapter=new PaiAdapter(remoteConfig('PAI',(url)=>{
        if(url.endsWith('/me'))return new Response('{"mode":"test","currency":"USD","balance":50}');
        posts++;if(bad==='timeout')throw new Error('synthetic network fault');return new Response('{bad json');
      }));expect((await adapter.purchase(request)).kind).toBe('unknown');expect(posts).toBe(1);
    }
  });
  it('enforces streamed body caps and preserves unknown lookup semantics',async()=>{
    const capped=new PaiAdapter({...remoteConfig('PAI',()=>new Response('x'.repeat(200))),maxResponseBytes:128});await expect(capped.catalog()).rejects.toThrow('response-too-large');
    const missing=new PaiAdapter(remoteConfig('PAI',()=>new Response('{"error":"unknown_order"}',{status:404})));expect((await missing.lookup(request)).kind).toBe('unknown');
  });
  it('does not dispatch sandbox purchase when observed wallet belongs to live mode',async()=>{
    let calls=0;const adapter=new PaiAdapter(remoteConfig('PAI',()=>{calls++;return new Response('{"mode":"live","currency":"USD","balance":50}');}));await expect(adapter.purchase(request)).rejects.toThrow('sandbox-response-mode-mismatch');expect(calls).toBe(1);
  });
});

describe('authenticated callback identity',()=>{
  it('requires matching signed P-AI payload identity, header identity and immutable order reference',()=>{
    const secret='synthetic-pai-callback';const raw=Buffer.from(JSON.stringify({event:'order.delivered',delivery_id:41,data:paiBody()}));const signature=signHmac(raw,secret,'sha256',true);
    expect(parsePaiCallback(raw,signature,secret,'order.delivered','41',request)).toMatchObject({identity:'41',outcome:{kind:'delivered'}});
    expect(()=>parsePaiCallback(raw,signature,secret,'order.delivered','42',request)).toThrow('callback-identity-mismatch');
    expect(()=>parsePaiCallback(raw,signature,secret,'order.delivered','41',{...request,externalOrderId:'other'})).toThrow();
    expect(()=>parsePaiCallback(raw,signature+'0',secret,'order.delivered','41',request)).toThrow('invalid-signature');
  });
});

const funding:FundingExpectation={reference:'goober-test-funding',amountMinor:'50000',currency:'NGN',environment:'test',ownerId:'synthetic-owner'};
function paymentBody(extra:Record<string,unknown>={}) {return {status:true,data:{id:9001,domain:'test',status:'success',reference:funding.reference,amount:50000,currency:'NGN',...extra}};}
describe('proposed Paystack test integration',()=>{
  it('distinguishes API envelope status from actual transaction status',()=>{
    expect(parsePaystackTransaction(losslessBody(JSON.stringify(paymentBody({status:'pending'}))),funding).status).toBe('pending');
    expect(parsePaystackTransaction(losslessBody(JSON.stringify(paymentBody({status:'reversed'}))),funding).status).toBe('reversed');
    for(const extra of [{domain:'live'},{amount:50001},{currency:'USD'},{reference:'other'}])expect(()=>parsePaystackTransaction(losslessBody(JSON.stringify(paymentBody(extra))),funding)).toThrow('payment-association-mismatch');
  });
  it('requires original signed bytes and successful matching payment data',()=>{
    const raw=Buffer.from(JSON.stringify({event:'charge.success',data:paymentBody().data}));const secret='synthetic-paystack-secret';
    expect(parsePaystackCallback(raw,signHmac(raw,secret,'sha512'),secret,funding)).toMatchObject({status:'success',transactionId:'9001'});
    expect(()=>parsePaystackCallback(Buffer.concat([raw,Buffer.from(' ')]),signHmac(raw,secret,'sha512'),secret,funding)).toThrow('invalid-payment-signature');
  });
  it('initializes server-owned reference with exact minor string and safe checkout host',async()=>{
    const adapter=new PaystackAdapter(remoteConfig('PAYSTACK',(_url,init)=>{expect(JSON.parse(String(init?.body))).toMatchObject({reference:funding.reference,amount:'50000',currency:'NGN'});return new Response(JSON.stringify({status:true,data:{reference:funding.reference,authorization_url:'https://checkout.paystack.com/synthetic',access_code:'synthetic-code'}}));}));
    expect((await adapter.initialize(funding,'synthetic@example.test')).reference).toBe(funding.reference);
    const malicious=new PaystackAdapter(remoteConfig('PAYSTACK',()=>new Response(JSON.stringify({status:true,data:{reference:funding.reference,authorization_url:'https://checkout.paystack.com.evil.test/synthetic',access_code:'synthetic-code'}}))));
    await expect(malicious.initialize(funding,'synthetic@example.test')).rejects.toThrow('invalid-checkout-url');
  });
});
