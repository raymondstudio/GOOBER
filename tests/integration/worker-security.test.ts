import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { Redis } from 'ioredis';
import { prisma } from '@goober/db';
import { applyFundingEvent,createFundingIntent,createOrder,createQuote,open,seal,type SealedPayload } from '@goober/commerce';
import { parsePaiCallback,signHmac,type SupplierRequest,type SupplierOutcome } from '@goober/providers';
import { processInbox,processOutbox,startWorker,redisConnectionFromUrl } from '../../apps/worker/src/main.js';
const run=randomUUID();let counter=0;
async function placed(scenario='queued'){
  const owner=`worker-security-${run}-${counter++}`;await prisma.user.create({data:{id:owner,email:`${owner}@example.invalid`,name:'Synthetic security regression'}});
  const product=await prisma.product.create({data:{id:`${owner}-product`,slug:`${owner}-product`,name:'Synthetic security product',description:'Synthetic fixture',entitlement:'Synthetic only',terms:'Test credit only',approved:true,published:true,approvalEvidence:'Synthetic approval',deliveryType:'code',region:'Synthetic',provider:'PAI',providerProductId:`${owner}-product`,providerAccount:'fixture',environment:'test',providerMode:'fixture',retailMinor:10000n,supplierMinor:50n,supplierCurrency:'USD',inputType:'quantity',fixtureScenario:scenario}});
  const funding=await createFundingIntent(owner,'20000');await applyFundingEvent({eventId:randomUUID(),type:'payment.succeeded',environment:'test',reference:funding.reference,amountMinor:'20000',currency:'NGN'});
  const quote=await createQuote(owner,product.id);const result=await createOrder(owner,quote.id,randomUUID());const order=await prisma.order.findUniqueOrThrow({where:{id:result.id}});
  const outbox=await prisma.outbox.findUniqueOrThrow({where:{environment_eventKey:{environment:'test',eventKey:`fulfill:${order.id}`}}});
  return {order,outbox,request:{externalOrderId:order.providerReference,productId:product.providerProductId,quantity:1,expectedMinor:'50',currency:'USD'} as SupplierRequest};
}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
describe('worker security regressions on actual PostgreSQL and Redis',()=>{
  beforeAll(()=>{expect(process.env.DATA_ENV).toBe('test');expect(process.env.DISPATCH_PAUSED).toBe('false');});afterAll(async()=>{await prisma.$disconnect();});
  it.each(['queued','delivered'])('SEC003 keeps signed failed_reason canary encrypted after %s outcome',async scenario=>{
    const fixture=await placed(scenario);await processOutbox(fixture.outbox.id);
    const canary=`GOOBER-CREDENTIAL-CANARY-${randomUUID()}`;const deliveryId=`security-${randomUUID()}`;const secret='GOOBER-synthetic-callback-regression-only';
    const raw=Buffer.from(JSON.stringify({event:'order.failed',delivery_id:deliveryId,data:{order_id:'GOOBER-FIXTURE-SECURITY',external_order_id:fixture.request.externalOrderId,service_id:fixture.request.productId,status:'failed',quantity:1,total_cost:0.50,currency:'USD',products:[],failed_reason:canary}}));
    const verified=parsePaiCallback(raw,signHmac(raw,secret,'sha256',true),secret,'order.failed',deliveryId,fixture.request);
    const inbox=await prisma.inbox.create({data:{provider:'PAI',providerAccount:'fixture',environment:'test',eventId:deliveryId,eventType:'order.failed',payloadDigest:'synthetic-authenticated-regression',payload:{orderId:fixture.order.id,externalOrderId:fixture.order.providerReference},encryptedPayload:JSON.parse(JSON.stringify(seal({outcome:verified.outcome},{orderId:fixture.order.id,provider:'PAI',environment:'test'})))}});
    const captures:unknown[][]=[];const spies=['log','warn','error'].map(method=>vi.spyOn(console,method as 'log').mockImplementation((...args:unknown[])=>{captures.push(args);}));
    try{await processInbox(inbox.id);}finally{spies.forEach(spy=>spy.mockRestore());}
    const [attempts,order,reviews,outboxes,audits,storedInbox]=await Promise.all([
      prisma.providerAttempt.findMany({where:{orderId:fixture.order.id},select:{lastError:true}}),
      prisma.order.findUniqueOrThrow({where:{id:fixture.order.id},select:{reviewReason:true,fulfillment:true}}),
      prisma.review.findMany({where:{orderId:fixture.order.id},select:{reason:true,evidence:true}}),
      prisma.outbox.findMany({where:{aggregateId:fixture.order.id},select:{lastError:true,payload:true}}),
      prisma.auditEvent.findMany({where:{aggregateId:fixture.order.id},select:{reason:true,metadata:true}}),
      prisma.inbox.findUniqueOrThrow({where:{id:inbox.id}}),
    ]);
    expect(attempts[0]?.lastError).toBe('supplier-confirmed-failure');
    expect(JSON.stringify({attempts,order,reviews,outboxes,audits,inboxPayload:storedInbox.payload,inboxError:storedInbox.lastError,logs:captures})).not.toContain(canary);
    expect(JSON.stringify(storedInbox.encryptedPayload)).not.toContain(canary);
    expect(open<{outcome:SupplierOutcome}>(storedInbox.encryptedPayload as unknown as SealedPayload,{orderId:fixture.order.id,provider:'PAI',environment:'test'}).outcome.reason).toBe(canary);
    expect(storedInbox.status).toBe('PROCESSED');
    if(scenario==='delivered'){expect(order.fulfillment).toBe('DELIVERED');expect(reviews.length).toBeGreaterThan(0);}else expect(order.fulfillment).toBe('FAILED');
  });
  it('parses Redis endpoint explicitly and rejects ambiguous unsafe connection URLs',()=>{
    expect(redisConnectionFromUrl('redis://127.0.0.1:6389/11')).toMatchObject({host:'127.0.0.1',port:6389,db:11});
    expect(redisConnectionFromUrl('rediss://synthetic:encoded%3Apass@example.invalid:6380/2')).toMatchObject({host:'example.invalid',port:6380,db:2,username:'synthetic',password:'encoded:pass',tls:{}});
    for(const url of ['http://127.0.0.1:6389/0','redis://127.0.0.1:6389/16','redis://127.0.0.1:6389/0?db=15','redis://127.0.0.1:6389/not-a-db'])expect(()=>redisConnectionFromUrl(url)).toThrow('Invalid Redis connection configuration');
  });
  it('actual startWorker uses configured isolated Redis DB15 and never polls unrelated work',async()=>{
    const fixture=await placed('delivered');const original=process.env.REDIS_URL!;const isolated=new URL(original);isolated.pathname='/15';const prefix=`goober-startworker-security-${run}`;
    const target=new Redis(isolated.toString(),{maxRetriesPerRequest:1,retryStrategy:()=>null});const control=new Redis(original,{maxRetriesPerRequest:1,retryStrategy:()=>null});target.on('error',()=>undefined);control.on('error',()=>undefined);
    let runtime:Awaited<ReturnType<typeof startWorker>>|undefined;
    try{
      expect(await target.keys('*'),'DB15 must be empty before isolated runtime test').toHaveLength(0);
      process.env.REDIS_URL=isolated.toString();runtime=await startWorker({queueName:'security-isolated',prefix,poll:false});
      expect((await target.keys(prefix+':*')).length).toBeGreaterThan(0);expect(await control.keys(prefix+':*')).toHaveLength(0);
      expect((await prisma.outbox.findUniqueOrThrow({where:{id:fixture.outbox.id}})).status).toBe('PENDING'); // poll:false never fetched it.
      await runtime.queue.add('owned-outbox',{kind:'outbox',id:fixture.outbox.id},{jobId:fixture.outbox.id,removeOnComplete:true});
      const deadline=Date.now()+15000;while(Date.now()<deadline&&(await prisma.order.findUniqueOrThrow({where:{id:fixture.order.id}})).fulfillment!=='DELIVERED')await delay(50);
      expect((await prisma.order.findUniqueOrThrow({where:{id:fixture.order.id}})).fulfillment).toBe('DELIVERED');
      expect((await prisma.providerAttempt.findFirstOrThrow({where:{orderId:fixture.order.id}})).dispatchCount).toBe(1);
    }finally{
      await runtime?.close();process.env.REDIS_URL=original;
      const keys=await target.keys('*');if(keys.every(key=>key.startsWith(prefix+':')))await target.flushdb();await target.quit();await control.quit();
    }
  });
});
