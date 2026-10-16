import { createHash } from 'node:crypto';
import { prisma,Prisma,FIXTURE_PROVIDER_CONTRACT_VERSION,type ProviderAttempt,type Order,type Product,type Quote } from '@goober/db';
import { applyFundingEvent,completeOrder,open,type FundingEvent,type SealedPayload } from '@goober/commerce';
import { FixtureSupplier,ProviderError,supplierRequestDigest,type AdapterConfig,type FixtureScenario,type Supplier,type SupplierOutcome,type SupplierRequest } from '@goober/providers';
import { loadEnvironment } from '../../api/src/env.js';
import { PostgresFixtureStore } from './fixture-store.js';

export const LEASE_MS=60000;
export const MAX_ATTEMPTS=6;
const store=new PostgresFixtureStore();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const final=(state:string)=>['DELIVERED','FAILED'].includes(state);
const asJson=(value:unknown)=>value as Prisma.InputJsonObject;
function settings(){return loadEnvironment();}
// Supplier messages and even vendor-supplied error codes may contain delivered credentials.
// Only these compile-time internal values may cross into ordinary operational records.
const OPERATIONAL_CODES=new Set([
  'worker-operation-failed','new-dispatch-paused','attempt-request-digest-mismatch',
  'supplier-outcome-association-mismatch','order-environment-mismatch','attempt-mode-mismatch',
  'reconcile-mode-disabled','invalid-pai-recovery-fence','unsupported-outbox-event',
  'reconciliation-unresolved','invalid-funding-inbox','invalid-supplier-inbox',
  'callback-order-association-mismatch','callback-outcome-event-mismatch',
  'exhausted-outbox-lease','fixture-idempotency-conflict','invalid-fixture-storage',
  'fixture-receipt-digest-mismatch','fixture-receipt-regression',
  'PAYMENT_NOT_CREDITED','PAYMENT_MISMATCH','MODE_DISABLED','P2034','P2028',
]);
function safeCode(error:unknown):string{
  const code=(error as {code?:unknown})?.code;
  return typeof code==='string'&&OPERATIONAL_CODES.has(code)?code:'worker-operation-failed';
}
function outcomeCode(outcome:SupplierOutcome):string|null{
  if(!outcome.reason)return null;
  switch(outcome.kind){
    case 'delivered':return 'supplier-delivered-review';
    case 'queued':return 'supplier-queued';
    case 'failed':return 'supplier-confirmed-failure';
    case 'quota':return 'supplier-rate-limited';
    case 'price-change':return 'supplier-price-change';
    default:return 'supplier-outcome-unknown';
  }
}
function config(provider:Supplier):AdapterConfig{
  const env=settings();return {appEnvironment:env.appEnv,environment:env.environment,accountId:'fixture',mode:provider==='PAI'?env.paiMode:env.gramlMode};
}
function requestFor(order:Order&{quote:Quote;product:Product}):SupplierRequest{
  return {externalOrderId:order.providerReference,productId:order.product.providerProductId,quantity:1,expectedMinor:order.quote.supplierMinor.toString(),currency:order.quote.supplierCurrency as 'USD'|'NGN',scenario:order.product.fixtureScenario as FixtureScenario};
}
function storedRequest(attempt:ProviderAttempt):SupplierRequest{
  const value=attempt.requestPayload as unknown as SupplierRequest;
  if(supplierRequestDigest(attempt.provider as Supplier,value)!==attempt.requestDigest||value.externalOrderId!==attempt.externalReference)throw new ProviderError('attempt-request-digest-mismatch',true);
  return value;
}
async function conclude(orderId:string,attempt:ProviderAttempt,outcome:SupplierOutcome,inboxId?:string){
  if(outcome.externalOrderId!==attempt.externalReference||outcome.productId!==storedRequest(attempt).productId||outcome.quantity!==1||outcome.currency!==storedRequest(attempt).currency)throw new ProviderError('supplier-outcome-association-mismatch',true);
  const reason=outcomeCode(outcome);
  const status=['delivered','queued','failed'].includes(outcome.kind)?outcome.kind as 'delivered'|'queued'|'failed':'unknown';
  await prisma.providerAttempt.updateMany({where:{id:attempt.id,...(status==='queued'||status==='unknown'?{status:{not:'CLOSED'}}:{})},data:{status:status==='delivered'||status==='failed'?'CLOSED':status==='queued'?'ACKNOWLEDGED':'UNKNOWN',acknowledgedAt:new Date(),responseDigest:hash(outcome),lastError:reason}});
  const result=await completeOrder(orderId,{status,products:status==='delivered'?outcome.products:undefined,reason:reason??undefined,supplierMinor:status==='delivered'?outcome.chargedMinor:undefined,supplierCurrency:outcome.currency,inboxId},`supplier:${attempt.id}:${status}`);
  if((status==='delivered'||status==='failed')&&result.fulfillmentState===status.toUpperCase()&&!result.reviewReason)await prisma.review.updateMany({where:{orderId,status:'OPEN'},data:{status:'RESOLVED',resolvedAt:new Date(),version:{increment:1}}});
  return status;
}
async function scheduleReconcile(orderId:string){
  await prisma.outbox.createMany({data:[{environment:'test',eventKey:`reconcile:${orderId}`,eventType:'ORDER_RECONCILE',aggregateId:orderId,payload:{orderId,environment:'test'}}],skipDuplicates:true});
}
async function prepare(orderId:string):Promise<{attempt:ProviderAttempt;fenced:boolean}|{reject:string}|null>{
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const order=await tx.order.findUnique({where:{id:orderId},include:{product:true,quote:true}});
    if(!order||order.environment!=='test')throw new ProviderError('order-environment-mismatch');
    if(final(order.fulfillment))return null;
    const identity={orderId,provider:order.provider,providerAccount:order.providerAccount,environment:order.environment};
    let attempt=await tx.providerAttempt.findUnique({where:{orderId_provider_providerAccount_environment:identity}});
    if(attempt?.dispatchCount)return {attempt,fenced:false};
    if(process.env.DISPATCH_PAUSED!=='false')throw new ProviderError('new-dispatch-paused');
    const product=order.product;const quote=order.quote;
    if(!['PAI','GRAML'].includes(order.provider)||order.providerMode!=='fixture'||order.paymentMode!=='fixture'||order.providerAccount!=='fixture'||process.env[`${order.provider}_MODE`]!=='fixture')return {reject:'supplier-mode-disabled'};
    if(!product.approved||!product.published||!product.approvalEvidence||product.stock<1||Date.now()-product.observedAt.getTime()>86400000||product.observedAt.getTime()>Date.now()+60000)return {reject:'offer-not-ready'};
    if(quote.apiContractVersion!==FIXTURE_PROVIDER_CONTRACT_VERSION||product.apiContractVersion!==quote.apiContractVersion||product.environment!=='test'||product.provider!==order.provider||product.providerAccount!==order.providerAccount||product.providerMode!==order.providerMode||quote.provider!==order.provider||quote.providerMode!==order.providerMode||quote.paymentMode!==order.paymentMode||product.version!==quote.productVersion||product.supplierMinor!==quote.supplierMinor||product.supplierCurrency!==quote.supplierCurrency||product.entitlement!==quote.entitlement||product.terms!==quote.terms||!['quantity','none'].includes(product.inputType)||!['code','credential'].includes(product.deliveryType))return {reject:'accepted-snapshot-changed'};
    if(product.fixtureScenario==='price-change')return {reject:'supplier-price-changed-before-dispatch'};
    const request=requestFor(order);const digest=supplierRequestDigest(order.provider as Supplier,request);
    if(!attempt){attempt=await tx.providerAttempt.create({data:{...identity,apiContractVersion:quote.apiContractVersion,providerMode:order.providerMode,externalReference:order.providerReference,requestDigest:digest,requestPayload:asJson(request)}});}
    if(attempt.requestDigest!==digest)return {reject:'prepared-request-changed'};
    const fenced=await tx.providerAttempt.updateMany({where:{id:attempt.id,status:'PREPARED',dispatchCount:0,dispatchedAt:null},data:{status:'DISPATCHING',dispatchCount:{increment:1},dispatchedAt:new Date()}});
    if(fenced.count===1)await tx.order.update({where:{id:orderId},data:{fulfillment:'PROCESSING',version:{increment:1}}});
    return {attempt:await tx.providerAttempt.findUniqueOrThrow({where:{id:attempt.id}}),fenced:fenced.count===1};
  });
}
async function fulfill(orderId:string):Promise<'done'|'defer'>{
  const prepared=await prepare(orderId);if(!prepared)return 'done';
  if('reject'in prepared){await completeOrder(orderId,{status:'failed',reason:prepared.reject},`pre-dispatch:${orderId}`);return 'done';}
  const {attempt,fenced}=prepared;const request=storedRequest(attempt);const supplier=attempt.provider as Supplier;
  if(attempt.environment!=='test'||attempt.providerMode!=='fixture'||attempt.providerAccount!=='fixture')throw new ProviderError('attempt-mode-mismatch');
  if(!fenced&&supplier==='GRAML'){
    await conclude(orderId,attempt,{kind:'unknown',externalOrderId:request.externalOrderId,productId:request.productId,quantity:1,chargedMinor:'0',currency:request.currency,products:[],reason:'graml-fenced-outcome-unknown'});return 'done';
  }
  const adapter=new FixtureSupplier(supplier,{...config(supplier),mode:'fixture'},store);
  let outcome:SupplierOutcome;
  if(fenced)outcome=await adapter.purchase(request);
  else{
    try{outcome=await adapter.lookup(request.externalOrderId);}catch(error){
      // Only our simulated upstream has a verified indefinite same-body replay contract.
      if(error instanceof ProviderError&&error.code==='unknown-order')outcome=await adapter.purchase(request);else throw error;
    }
  }
  const status=await conclude(orderId,attempt,outcome);
  if(supplier==='PAI'&&(status==='queued'||status==='unknown'))await scheduleReconcile(orderId);
  return 'done';
}
async function reconcile(orderId:string):Promise<'done'|'defer'>{
  const order=await prisma.order.findUnique({where:{id:orderId}});if(!order||final(order.fulfillment))return 'done';
  if(order.environment!=='test'||order.provider!=='PAI'||order.providerMode!=='fixture'||order.providerAccount!=='fixture')throw new ProviderError('reconcile-mode-disabled');
  const attempt=await prisma.providerAttempt.findUniqueOrThrow({where:{orderId_provider_providerAccount_environment:{orderId,provider:'PAI',providerAccount:'fixture',environment:'test'}}});
  const request=storedRequest(attempt);
  // Dispatch pause applies only to new requests; lookups use the already persisted fixture mode.
  const adapter=new FixtureSupplier('PAI',{...config('PAI'),mode:'fixture'},store);
  let outcome:SupplierOutcome;
  try{outcome=await adapter.lookup(request.externalOrderId);}catch(error){
    if(!(error instanceof ProviderError)||error.code!=='unknown-order')throw error;
    if(attempt.dispatchCount!==1)throw new ProviderError('invalid-pai-recovery-fence');
    outcome=await adapter.purchase(request);
  }
  const status=await conclude(orderId,attempt,outcome);
  return status==='queued'||status==='unknown'?'defer':'done';
}
async function outboxFailure(id:string,error:unknown){
  const row=await prisma.outbox.findUnique({where:{id}});if(!row)return;
  const paused=safeCode(error)==='new-dispatch-paused';const exhausted=!paused&&row.attempts>=MAX_ATTEMPTS;
  await prisma.outbox.update({where:{id},data:{status:exhausted?'FAILED':'PENDING',leaseUntil:exhausted?null:new Date(Date.now()+(paused?1000:Math.min(1000*2**row.attempts,30000))),lastError:safeCode(error),...(paused?{attempts:{decrement:1}}:{})}});
  if(exhausted&&['ORDER_FULFILL','ORDER_RECONCILE'].includes(row.eventType))await completeOrder(row.aggregateId,{status:'unknown',reason:'durable-work-retries-exhausted'},`exhausted:${row.id}`);
}
export async function processOutbox(id:string):Promise<void>{
  settings();const now=new Date();
  const claimed=await prisma.outbox.updateMany({where:{id,environment:'test',attempts:{lt:MAX_ATTEMPTS},OR:[{status:'PENDING',OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},{status:'PROCESSING',leaseUntil:{lte:now}}]},data:{status:'PROCESSING',leaseUntil:new Date(Date.now()+LEASE_MS),attempts:{increment:1}}});
  if(!claimed.count)return;
  try{
    const row=await prisma.outbox.findUniqueOrThrow({where:{id}});
    if(!['ORDER_FULFILL','ORDER_RECONCILE'].includes(row.eventType))throw new ProviderError('unsupported-outbox-event');
    const result=row.eventType==='ORDER_FULFILL'?await fulfill(row.aggregateId):await reconcile(row.aggregateId);
    if(result==='defer'){
      if(row.attempts>=MAX_ATTEMPTS)throw new ProviderError('reconciliation-unresolved');
      await prisma.outbox.update({where:{id},data:{status:'PENDING',leaseUntil:new Date(Date.now()+1000*Math.min(row.attempts,5)),lastError:'awaiting-conclusive-supplier-outcome'}});
    }else await prisma.outbox.update({where:{id},data:{status:'PROCESSED',processedAt:new Date(),leaseUntil:null,lastError:null}});
  }catch(error){await outboxFailure(id,error);}
}
export async function processInbox(id:string):Promise<void>{
  settings();
  // Inbox has no lease column: while PROCESSING, processedAt records claim time, replaced at final commit.
  const claimed=await prisma.inbox.updateMany({where:{id,environment:'test',status:'PENDING',attempts:{lt:MAX_ATTEMPTS}},data:{status:'PROCESSING',processedAt:new Date(),attempts:{increment:1}}});
  if(!claimed.count)return;
  try{
    const row=await prisma.inbox.findUniqueOrThrow({where:{id}});
    if(row.provider==='fixture'&&row.providerAccount==='fixture'&&['payment.succeeded','payment.reversed'].includes(row.eventType)){
      const event=row.payload as unknown as FundingEvent;
      if(event.eventId!==row.eventId||event.type!==row.eventType||event.environment!=='test'||event.currency!=='NGN'||typeof event.amountMinor!=='string'||typeof event.reference!=='string')throw new ProviderError('invalid-funding-inbox');
      await applyFundingEvent({...event,provider:'fixture',providerAccount:'fixture',inboxId:id});return;
    }
    if(row.provider==='PAI'&&['order.delivered','order.queued','order.failed'].includes(row.eventType)){
      const metadata=row.payload as {orderId?:string};if(!metadata.orderId||!row.encryptedPayload)throw new ProviderError('invalid-supplier-inbox');
      const protectedValue=open<{outcome:SupplierOutcome}>(row.encryptedPayload as unknown as SealedPayload,{orderId:metadata.orderId,provider:'PAI',environment:'test'});
      const order=await prisma.order.findUniqueOrThrow({where:{id:metadata.orderId}});
      if(order.provider!=='PAI'||order.environment!=='test'||order.providerAccount!==row.providerAccount)throw new ProviderError('callback-order-association-mismatch');
      const attempt=await prisma.providerAttempt.findUniqueOrThrow({where:{orderId_provider_providerAccount_environment:{orderId:order.id,provider:'PAI',providerAccount:row.providerAccount,environment:'test'}}});
      if(`order.${protectedValue.outcome.kind}`!==row.eventType)throw new ProviderError('callback-outcome-event-mismatch');
      const state=await conclude(order.id,attempt,protectedValue.outcome,id);if(state==='queued')await scheduleReconcile(order.id);return;
    }
    // Test pings and unsupported events are quarantined and can never grant funds.
    await prisma.inbox.update({where:{id},data:{status:row.eventType==='skeleton.probe'?'IGNORED':'QUARANTINED',processedAt:new Date(),lastError:'non-economic-or-unsupported-event'}});
  }catch(error){
    const row=await prisma.inbox.findUniqueOrThrow({where:{id}});
    await prisma.inbox.update({where:{id},data:{status:row.attempts>=MAX_ATTEMPTS?'FAILED':'PENDING',processedAt:null,lastError:safeCode(error)}});
  }
}
export interface DurableQueue {add(name:string,data:{kind:'inbox'|'outbox';id:string},options:{jobId:string;removeOnComplete:boolean;removeOnFail:number}):Promise<unknown>}
export async function tick(queue?:DurableQueue):Promise<void>{
  settings();const now=new Date();
  await prisma.inbox.updateMany({where:{environment:'test',status:'PROCESSING',attempts:{lt:MAX_ATTEMPTS},processedAt:{lt:new Date(Date.now()-LEASE_MS)}},data:{status:'PENDING',processedAt:null,lastError:'expired-inbox-lease'}});
  await prisma.inbox.updateMany({where:{environment:'test',status:'PROCESSING',attempts:{gte:MAX_ATTEMPTS},processedAt:{lt:new Date(Date.now()-LEASE_MS)}},data:{status:'FAILED',processedAt:new Date(),lastError:'exhausted-inbox-lease'}});
  const exhausted=await prisma.outbox.findMany({where:{environment:'test',status:'PROCESSING',attempts:{gte:MAX_ATTEMPTS},leaseUntil:{lte:now}},select:{id:true},take:50});
  for(const row of exhausted)await outboxFailure(row.id,new ProviderError('exhausted-outbox-lease'));
  // Discover recovery work even if the worker crashed between outcome persistence and scheduling.
  const pending=await prisma.providerAttempt.findMany({where:{environment:'test',provider:'PAI',providerMode:'fixture',dispatchCount:{gt:0},order:{fulfillment:{notIn:['DELIVERED','FAILED']}}},select:{orderId:true},take:100});
  for(const attempt of pending)await scheduleReconcile(attempt.orderId);
  const [inbox,outbox]=await Promise.all([
    prisma.inbox.findMany({where:{environment:'test',status:'PENDING',attempts:{lt:MAX_ATTEMPTS}},select:{id:true},orderBy:{createdAt:'asc'},take:50}),
    prisma.outbox.findMany({where:{environment:'test',attempts:{lt:MAX_ATTEMPTS},OR:[{status:'PENDING',OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},{status:'PROCESSING',leaseUntil:{lte:now}}]},select:{id:true},orderBy:{createdAt:'asc'},take:50}),
  ]);
  for(const item of inbox)if(queue)await queue.add('durable-inbox',{kind:'inbox',id:item.id},{jobId:`in-${item.id}`,removeOnComplete:true,removeOnFail:100});else await processInbox(item.id);
  for(const item of outbox)if(queue)await queue.add('durable-outbox',{kind:'outbox',id:item.id},{jobId:`out-${item.id}`,removeOnComplete:true,removeOnFail:100});else await processOutbox(item.id);
}
