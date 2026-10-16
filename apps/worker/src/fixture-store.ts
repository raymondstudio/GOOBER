import { createHash } from 'node:crypto';
import { prisma,Prisma } from '@goober/db';
import { open,seal,type SealedPayload } from '@goober/commerce';
import { ProviderError,type FixtureReceipt,type FixtureStore } from '@goober/providers';

const provider='fixture-supplier';
const providerAccount='fixture';
const environment='test';
function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function context(reference:string){return {orderId:reference,provider,environment};}
function identity(reference:string){return {provider,providerAccount,environment,eventId:reference};}
/** Synthetic upstream state is encrypted, durable and excluded from the callback processing queue. */
export class PostgresFixtureStore implements FixtureStore {
  async get(reference:string):Promise<FixtureReceipt|null>{
    const row=await prisma.inbox.findUnique({where:{provider_providerAccount_environment_eventId:identity(reference)}});
    if(!row)return null;
    if(row.status!=='FIXTURE_RECEIPT'||row.eventType!=='fixture.receipt'||!row.encryptedPayload)throw new ProviderError('invalid-fixture-storage');
    const receipt=open<FixtureReceipt>(row.encryptedPayload as unknown as SealedPayload,context(reference));
    if(digest(receipt)!==row.payloadDigest)throw new ProviderError('fixture-receipt-digest-mismatch');
    return receipt;
  }
  async putIfAbsent(reference:string,requestDigest:string,receipt:FixtureReceipt):Promise<FixtureReceipt>{
    if(receipt.requestDigest!==requestDigest)throw new ProviderError('fixture-idempotency-conflict');
    await prisma.inbox.createMany({data:[{...identity(reference),eventType:'fixture.receipt',payloadDigest:digest(receipt),payload:{reference},encryptedPayload:seal(receipt,context(reference)) as unknown as Prisma.InputJsonObject,status:'FIXTURE_RECEIPT'}],skipDuplicates:true});
    const saved=await this.get(reference);
    if(!saved||saved.requestDigest!==requestDigest)throw new ProviderError('fixture-idempotency-conflict');
    return saved;
  }
  async update(reference:string,receipt:FixtureReceipt):Promise<void>{
    await prisma.$transaction(async tx=>{
      const key=identity(reference);
      await tx.$queryRaw`SELECT id FROM "Inbox" WHERE provider=${provider} AND "providerAccount"=${providerAccount} AND environment=${environment} AND "eventId"=${reference} FOR UPDATE`;
      const row=await tx.inbox.findUniqueOrThrow({where:{provider_providerAccount_environment_eventId:key}});
      if(!row.encryptedPayload||row.status!=='FIXTURE_RECEIPT')throw new ProviderError('invalid-fixture-storage');
      const previous=open<FixtureReceipt>(row.encryptedPayload as unknown as SealedPayload,context(reference));
      if(previous.requestDigest!==receipt.requestDigest)throw new ProviderError('fixture-idempotency-conflict');
      // Concurrent lookups may repeat a conclusive observation but cannot regress it.
      if(previous.outcome.kind!=='queued'&&previous.outcome.kind!==receipt.outcome.kind)throw new ProviderError('fixture-receipt-regression');
      await tx.inbox.update({where:{id:row.id},data:{encryptedPayload:seal(receipt,context(reference)) as unknown as Prisma.InputJsonObject,payloadDigest:digest(receipt)}});
    });
  }
}
