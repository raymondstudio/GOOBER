import { createHash,randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { Queue,Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@goober/db';
import { applyFundingEvent,createFundingIntent,createOrder,createQuote } from '@goober/commerce';
import { FixtureSupplier,supplierRequestDigest,type SupplierRequest } from '@goober/providers';
import { processOutbox,PostgresFixtureStore,RedisRequestBudget,redisConnectionFromUrl } from '../../apps/worker/src/main.js';
const run=randomUUID();let count=0;
async function order(scenario='delivered'){
  const owner=`worker-recovery-${run}-${count++}`;await prisma.user.create({data:{id:owner,email:`${owner}@example.invalid`,name:'Synthetic recovery test'}});
  const product=await prisma.product.create({data:{id:`${owner}-product`,slug:`${owner}-product`,name:'Synthetic recovery product',description:'Synthetic',entitlement:'Synthetic only',terms:'Test credit only',approved:true,published:true,approvalEvidence:'Synthetic approval',deliveryType:'code',region:'Synthetic',provider:'PAI',providerProductId:`${owner}-product`,providerAccount:'fixture',environment:'test',providerMode:'fixture',retailMinor:10000n,supplierMinor:50n,supplierCurrency:'USD',inputType:'quantity',fixtureScenario:scenario}});
  const funding=await createFundingIntent(owner,'20000');await applyFundingEvent({eventId:randomUUID(),type:'payment.succeeded',environment:'test',reference:funding.reference,amountMinor:'20000',currency:'NGN'});
  const quote=await createQuote(owner,product.id);const placed=await createOrder(owner,quote.id,randomUUID());const record=await prisma.order.findUniqueOrThrow({where:{id:placed.id}});
  const outbox=await prisma.outbox.findUniqueOrThrow({where:{environment_eventKey:{environment:'test',eventKey:`fulfill:${placed.id}`}}});
  const request:SupplierRequest={externalOrderId:record.providerReference,productId:product.providerProductId,quantity:1,expectedMinor:'50',currency:'USD',scenario:scenario as SupplierRequest['scenario']};
  return {order:record,outbox,request};
}
async function fence(orderId:string,request:SupplierRequest){return prisma.providerAttempt.create({data:{orderId,provider:'PAI',providerAccount:'fixture',environment:'test',providerMode:'fixture',externalReference:request.externalOrderId,requestDigest:supplierRequestDigest('PAI',request),requestPayload:JSON.parse(JSON.stringify(request)),status:'DISPATCHING',dispatchCount:1,dispatchedAt:new Date()}});}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
describe('actual durable recovery across worker boundaries',()=>{
  beforeAll(()=>{expect(process.env.DATA_ENV).toBe('test');expect(process.env.DISPATCH_PAUSED).toBe('false');});afterAll(async()=>{await prisma.$disconnect();});
  it('recovers P-AI crash after fence before send using fixture-only same-body recovery contract',async()=>{
    const placed=await order();const attempt=await fence(placed.order.id,placed.request);await processOutbox(placed.outbox.id);
    expect((await prisma.order.findUniqueOrThrow({where:{id:placed.order.id}})).fulfillment).toBe('DELIVERED');expect((await prisma.providerAttempt.findUniqueOrThrow({where:{id:attempt.id}})).dispatchCount).toBe(1);
  });
  it('recovers crash after supplier acceptance and before local outcome recording',async()=>{
    const placed=await order();const attempt=await fence(placed.order.id,placed.request);
    const supplier=new FixtureSupplier('PAI',{appEnvironment:'test',environment:'test',accountId:'fixture',mode:'fixture'},new PostgresFixtureStore());
    await supplier.purchase(placed.request); // Encrypted synthetic upstream receipt survives this process boundary.
    await processOutbox(placed.outbox.id);expect((await prisma.order.findUniqueOrThrow({where:{id:placed.order.id}})).moneyStatus).toBe('CAPTURED');
    expect((await prisma.providerAttempt.findUniqueOrThrow({where:{id:attempt.id}})).dispatchCount).toBe(1);expect(await prisma.journal.count({where:{operationId:`capture:${placed.order.id}`}})).toBe(1);
    await prisma.outbox.update({where:{id:placed.outbox.id},data:{status:'PROCESSING',leaseUntil:new Date(Date.now()-1)}}); // Lost job ACK after committed capture.
    await processOutbox(placed.outbox.id);expect(await prisma.journal.count({where:{operationId:`capture:${placed.order.id}`}})).toBe(1);
  });
  it('pauses new dispatch without stranding already queued reconciliation',async()=>{
    const queued=await order('queued');await processOutbox(queued.outbox.id);const fresh=await order();
    const original=process.env.DISPATCH_PAUSED;process.env.DISPATCH_PAUSED='true';
    try{
      await processOutbox(fresh.outbox.id);expect(await prisma.providerAttempt.count({where:{orderId:fresh.order.id}})).toBe(0);expect((await prisma.outbox.findUniqueOrThrow({where:{id:fresh.outbox.id}})).attempts).toBe(0);
      const reconcile=await prisma.outbox.findUniqueOrThrow({where:{environment_eventKey:{environment:'test',eventKey:`reconcile:${queued.order.id}`}}});await processOutbox(reconcile.id);
      expect((await prisma.order.findUniqueOrThrow({where:{id:queued.order.id}})).fulfillment).toBe('DELIVERED');expect((await prisma.order.findUniqueOrThrow({where:{id:fresh.order.id}})).moneyStatus).toBe('RESERVED');
    }finally{process.env.DISPATCH_PAUSED=original;}
  });
  it('exhausts unresolved reconciliation into inspectable failure without releasing a hold',async()=>{
    const placed=await order('unknown');await processOutbox(placed.outbox.id);const row=await prisma.outbox.findUniqueOrThrow({where:{environment_eventKey:{environment:'test',eventKey:`reconcile:${placed.order.id}`}}});
    for(let i=0;i<6;i++){await prisma.outbox.update({where:{id:row.id},data:{leaseUntil:null}});await processOutbox(row.id);}
    expect(await prisma.outbox.findUniqueOrThrow({where:{id:row.id}})).toMatchObject({status:'FAILED',attempts:6});expect(await prisma.order.findUniqueOrThrow({where:{id:placed.order.id}})).toMatchObject({fulfillment:'NEEDS_REVIEW',moneyStatus:'RESERVED',releasedMinor:0n});expect(await prisma.review.count({where:{orderId:placed.order.id,status:'OPEN'}})).toBeGreaterThan(0);
  });
  it('reserves four distributed request slots for recovery even after rejected ordinary calls',async()=>{
    const redis=new Redis(process.env.REDIS_URL!,{maxRetriesPerRequest:1,retryStrategy:()=>null});redis.on('error',()=>undefined);
    const scope=`synthetic-budget-${run}`;const key=`goober:budget:${createHash('sha256').update(scope).digest('hex')}`;
    try{
      const budget=new RedisRequestBudget(redis,6);await budget.acquire(scope,false);await budget.acquire(scope,false);
      for(let i=0;i<3;i++)await expect(budget.acquire(scope,false)).rejects.toThrow('request-budget-exhausted');
      for(let i=0;i<4;i++)await budget.acquire(scope,true);await expect(budget.acquire(scope,true)).rejects.toThrow('request-budget-exhausted');
      await redis.del(key);await budget.observe(scope,0,Math.floor(Date.now()/1000)+5);await expect(budget.acquire(scope,true)).rejects.toThrow('request-budget-exhausted');
    }finally{await redis.del(key,`${key}:blocked`);await redis.quit();}
  });
  it('rebuilds actual BullMQ work after isolated Redis loss using persisted PostgreSQL IDs',async()=>{
    const placed=await order();const redisUrl=new URL(process.env.REDIS_URL!);redisUrl.pathname='/15';
    const redis=new Redis(redisUrl.toString(),{maxRetriesPerRequest:1,retryStrategy:()=>null});redis.on('error',()=>undefined);
    const prefix=`goober-worker-test-${run}`;const connection=redisConnectionFromUrl(redisUrl.toString());let queue:Queue|undefined;let worker:Worker|undefined;
    try{
      await redis.ping();const preexisting=await redis.keys('*');expect(preexisting,'Redis DB15 must be empty before isolated destructive recovery test').toHaveLength(0);
      queue=new Queue('recovery',{connection,prefix});await queue.add('outbox',{id:placed.outbox.id},{jobId:placed.outbox.id});
      const keys=await redis.keys('*');expect(keys.length).toBeGreaterThan(0);expect(keys.every(key=>key.startsWith(prefix+':'))).toBe(true);
      await queue.close();queue=undefined;await redis.flushdb();
      expect((await prisma.outbox.findUniqueOrThrow({where:{id:placed.outbox.id}})).status).toBe('PENDING');expect(await prisma.providerAttempt.count({where:{orderId:placed.order.id}})).toBe(0);
      queue=new Queue('recovery',{connection,prefix});worker=new Worker<{id:string}>('recovery',async job=>{if(job.data.id!==placed.outbox.id)throw new Error('Test ownership violation');await processOutbox(job.data.id);},{connection,prefix,concurrency:2});worker.on('error',()=>undefined);await worker.waitUntilReady();
      const durable=await prisma.outbox.findUniqueOrThrow({where:{id:placed.outbox.id}});await queue.add('outbox',{id:durable.id},{jobId:durable.id,removeOnComplete:true});
      const deadline=Date.now()+15000;while(Date.now()<deadline&&(await prisma.order.findUniqueOrThrow({where:{id:placed.order.id}})).fulfillment!=='DELIVERED')await delay(50);
      expect((await prisma.order.findUniqueOrThrow({where:{id:placed.order.id}})).fulfillment).toBe('DELIVERED');expect((await prisma.providerAttempt.findFirstOrThrow({where:{orderId:placed.order.id}})).dispatchCount).toBe(1);
    }finally{
      await worker?.close();await queue?.close();const remaining=await redis.keys('*');if(remaining.every(key=>key.startsWith(prefix+':')))await redis.flushdb();await redis.quit();
    }
  });
});
