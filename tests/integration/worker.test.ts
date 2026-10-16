import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { prisma } from '@goober/db';
import { applyFundingEvent,createFundingIntent,createOrder,createQuote,getWallet,seal,open } from '@goober/commerce';
import { supplierRequestDigest,type SupplierRequest } from '@goober/providers';
import { processInbox,processOutbox,PostgresFixtureStore } from '../../apps/worker/src/main.js';

const run=randomUUID();let sequence=0;
async function placed(scenario='delivered',provider='PAI'){
  const id=`worker-${run}-${sequence++}`;
  await prisma.user.create({data:{id,email:`${id}@example.invalid`,name:'Synthetic worker customer'}});
  const offer=await prisma.product.create({data:{id:`${id}-product`,slug:`${id}-product`,name:'Synthetic worker product',description:'Local fixture',entitlement:'Synthetic entitlement',terms:'Fixture credit only',approved:true,published:true,approvalEvidence:'Synthetic local-only approval',deliveryType:provider==='PAI'?'code':'credential',region:'Synthetic',provider,providerProductId:`${id}-product`,providerAccount:'fixture',environment:'test',providerMode:'fixture',retailMinor:10000n,supplierMinor:50n,supplierCurrency:provider==='PAI'?'USD':'NGN',inputType:'quantity',fixtureScenario:scenario}});
  const funding=await createFundingIntent(id,'20000');
  await applyFundingEvent({eventId:randomUUID(),type:'payment.succeeded',environment:'test',reference:funding.reference,amountMinor:'20000',currency:'NGN'});
  const quote=await createQuote(id,offer.id);const order=await createOrder(id,quote.id,randomUUID());
  const event=await prisma.outbox.findUniqueOrThrow({where:{environment_eventKey:{environment:'test',eventKey:`fulfill:${order.id}`}}});
  return {ownerId:id,offer,order,event};
}
async function freshOrder(id:string){return prisma.order.findUniqueOrThrow({where:{id}});}
async function attemptFor(orderId:string){return prisma.providerAttempt.findFirstOrThrow({where:{orderId}});}
async function reconcileFor(orderId:string){return prisma.outbox.findUniqueOrThrow({where:{environment_eventKey:{environment:'test',eventKey:`reconcile:${orderId}`}}});}

describe('persistent worker explicit-owned work on PostgreSQL',()=>{
  beforeAll(async()=>{expect(process.env.DATA_ENV).toBe('test');expect(process.env.DISPATCH_PAUSED).toBe('false');await prisma.$queryRaw`SELECT 1`;});
  afterAll(async()=>{await prisma.$disconnect();});
  it('survives duplicate concurrent queue delivery and encrypts supplier receipt before financial capture',async()=>{
    const {ownerId,order,event}=await placed();
    await Promise.all(Array.from({length:8},()=>processOutbox(event.id)));
    expect(await freshOrder(order.id)).toMatchObject({fulfillment:'DELIVERED',moneyStatus:'CAPTURED',capturedMinor:10000n});
    expect(await getWallet(ownerId)).toMatchObject({availableMinor:'10000',reservedMinor:'0'});
    expect(await attemptFor(order.id)).toMatchObject({dispatchCount:1,status:'CLOSED'});
    expect(await prisma.journal.count({where:{operationId:`capture:${order.id}`}})).toBe(1);
    const receipt=await prisma.inbox.findFirstOrThrow({where:{provider:'fixture-supplier',eventId:{endsWith:order.id}}});
    expect(receipt.status).toBe('FIXTURE_RECEIPT');expect(JSON.stringify(receipt.payload)).not.toContain('SECRET');expect(receipt.encryptedPayload).toBeTruthy();
    const delivery=await prisma.delivery.findUniqueOrThrow({where:{orderId:order.id}});
    expect(open<{products:string[]}>(delivery,{orderId:order.id,provider:'PAI',environment:'test'}).products[0]).toContain('GOOBER-FIXTURE-SECRET');
    await processOutbox(event.id);expect((await attemptFor(order.id)).dispatchCount).toBe(1);
  });
  it('recovers P-AI accepted-but-lost response through original-reference lookup with one dispatch',async()=>{
    const {order,event}=await placed('timeout-after-accept');await processOutbox(event.id);
    expect(await freshOrder(order.id)).toMatchObject({fulfillment:'NEEDS_REVIEW',moneyStatus:'RESERVED'});
    const first=await attemptFor(order.id);const reconciliation=await reconcileFor(order.id);await processOutbox(reconciliation.id);
    expect(await freshOrder(order.id)).toMatchObject({fulfillment:'DELIVERED',moneyStatus:'CAPTURED'});
    expect(await attemptFor(order.id)).toMatchObject({dispatchCount:1,externalReference:first.externalReference,requestDigest:first.requestDigest});
    expect(await prisma.journal.count({where:{operationId:`capture:${order.id}`}})).toBe(1);
  });
  it.each(['queued','queued-failed'])('reconciles %s after a fresh processor invocation',async scenario=>{
    const {order,event}=await placed(scenario);await processOutbox(event.id);expect((await freshOrder(order.id)).fulfillment).toBe('QUEUED');
    const reconciliation=await reconcileFor(order.id);await processOutbox(reconciliation.id);
    expect((await freshOrder(order.id)).fulfillment).toBe(scenario==='queued'?'DELIVERED':'FAILED');expect((await attemptFor(order.id)).dispatchCount).toBe(1);
  });
  it('never repeats Graml after timeout, malformed response or expired worker lease',async()=>{
    for(const scenario of ['timeout-after-accept','invalid']){
      const {order,event}=await placed(scenario,'GRAML');await processOutbox(event.id);
      expect(await freshOrder(order.id)).toMatchObject({fulfillment:'NEEDS_REVIEW',moneyStatus:'RESERVED',releasedMinor:0n});
      await prisma.outbox.update({where:{id:event.id},data:{status:'PROCESSING',leaseUntil:new Date(Date.now()-1)}});
      await processOutbox(event.id);
      expect((await attemptFor(order.id)).dispatchCount).toBe(1);expect((await freshOrder(order.id)).moneyStatus).toBe('RESERVED');
      expect(await prisma.journal.count({where:{operationId:`release:${order.id}`}})).toBe(0);
    }
  });
  it('treats Graml crash immediately after its durable fence as uncertain without calling fixture',async()=>{
    const {order,event,offer}=await placed('delivered','GRAML');
    const request:SupplierRequest={externalOrderId:(await freshOrder(order.id)).providerReference,productId:offer.providerProductId,quantity:1,expectedMinor:'50',currency:'NGN',scenario:'delivered'};
    await prisma.providerAttempt.create({data:{orderId:order.id,provider:'GRAML',providerAccount:'fixture',environment:'test',providerMode:'fixture',externalReference:request.externalOrderId,requestDigest:supplierRequestDigest('GRAML',request),requestPayload:JSON.parse(JSON.stringify(request)),status:'DISPATCHING',dispatchCount:1,dispatchedAt:new Date()}});
    await processOutbox(event.id);expect((await freshOrder(order.id)).fulfillment).toBe('NEEDS_REVIEW');
    expect(await new PostgresFixtureStore().get(`GRAML:fixture:test:${request.externalOrderId}`)).toBeNull();expect((await attemptFor(order.id)).dispatchCount).toBe(1);
  });
  it('releases a proven pre-dispatch price change and never creates a dispatch fence',async()=>{
    const {order,event,ownerId}=await placed('price-change');await processOutbox(event.id);
    expect(await freshOrder(order.id)).toMatchObject({fulfillment:'FAILED',moneyStatus:'RELEASED'});expect(await prisma.providerAttempt.count({where:{orderId:order.id}})).toBe(0);expect((await getWallet(ownerId)).availableMinor).toBe('20000');
  });
  it('applies verified payment inbox credit once and ignores a signed probe',async()=>{
    const id=`worker-pay-${run}`;await prisma.user.create({data:{id,email:`${id}@example.invalid`,name:'Synthetic funding worker'}});
    const intent=await createFundingIntent(id,'15000');const eventId=randomUUID();
    const row=await prisma.inbox.create({data:{provider:'fixture',providerAccount:'fixture',environment:'test',eventId,eventType:'payment.succeeded',payloadDigest:'synthetic-already-verified',payload:{eventId,type:'payment.succeeded',environment:'test',reference:intent.reference,amountMinor:'15000',currency:'NGN'}}});
    await Promise.all([processInbox(row.id),processInbox(row.id)]);expect((await getWallet(id)).availableMinor).toBe('15000');expect((await prisma.inbox.findUniqueOrThrow({where:{id:row.id}})).status).toBe('PROCESSED');
    const probe=await prisma.inbox.create({data:{provider:'fixture',environment:'test',eventId:randomUUID(),eventType:'skeleton.probe',payloadDigest:'synthetic-probe'}});await processInbox(probe.id);expect((await prisma.inbox.findUniqueOrThrow({where:{id:probe.id}})).status).toBe('IGNORED');expect((await getWallet(id)).availableMinor).toBe('15000');
  });
  it('processes callback delivery atomically with money and preserves a contradictory review',async()=>{
    const {order,event}=await placed('queued');await processOutbox(event.id);const attempt=await attemptFor(order.id);
    async function callback(kind:'delivered'|'failed'){
      const outcome={kind,externalOrderId:attempt.externalReference,productId:(attempt.requestPayload as {productId:string}).productId,quantity:1,chargedMinor:'50',currency:'USD',supplierOrderId:'GOOBER-FIXTURE-CALLBACK',products:kind==='delivered'?['GOOBER-FIXTURE-CALLBACK-SECRET']:[],reason:kind==='failed'?'Synthetic contradictory failure':undefined};
      return prisma.inbox.create({data:{provider:'PAI',providerAccount:'fixture',environment:'test',eventId:randomUUID(),eventType:`order.${kind}`,payloadDigest:'synthetic-verified',payload:{orderId:order.id,externalOrderId:attempt.externalReference},encryptedPayload:JSON.parse(JSON.stringify(seal({outcome},{orderId:order.id,provider:'PAI',environment:'test'})))}});
    }
    const delivered=await callback('delivered');await processInbox(delivered.id);expect((await freshOrder(order.id)).fulfillment).toBe('DELIVERED');expect((await prisma.inbox.findUniqueOrThrow({where:{id:delivered.id}})).status).toBe('PROCESSED');
    const failed=await callback('failed');await processInbox(failed.id);expect((await freshOrder(order.id)).fulfillment).toBe('DELIVERED');expect(await prisma.review.count({where:{orderId:order.id,status:'OPEN'}})).toBeGreaterThan(0);expect(await prisma.journal.count({where:{operationId:`capture:${order.id}`}})).toBe(1);expect(await prisma.journal.count({where:{operationId:`release:${order.id}`}})).toBe(0);
  });
});
