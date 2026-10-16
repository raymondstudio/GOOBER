import {BadRequestException,Controller,Post,Req,HttpCode,UnauthorizedException,ServiceUnavailableException} from '@nestjs/common';
import type {RawBodyRequest} from '@nestjs/common';
import type {Request} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {prisma,Prisma} from '@goober/db';
import {seal} from '@goober/commerce';
import {verifyHmac,parsePaiCallback,parsePaystackCallback,losslessBody} from '@goober/providers';
import {environment} from './env.js';
const funding=z.object({eventId:z.string().min(1).max(128),type:z.enum(['payment.succeeded','payment.reversed']),environment:z.literal('test'),reference:z.string().min(1).max(128),amountMinor:z.string().regex(/^[1-9][0-9]{0,18}$/),currency:z.literal('NGN'),provider:z.literal('fixture').optional(),providerAccount:z.literal('fixture').optional()}).strict();
const probe=z.object({eventId:z.string().min(1).max(128),type:z.literal('skeleton.probe'),environment:z.literal('test')}).strict();
export async function saveInbox(data:Prisma.InboxCreateInput){const key={provider:data.provider,providerAccount:data.providerAccount??'fixture',environment:data.environment,eventId:data.eventId};
try{return await prisma.inbox.create({data});}catch(error){if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002')throw error;const row=await prisma.inbox.findUniqueOrThrow({where:{provider_providerAccount_environment_eventId:key}});if(row.payloadDigest!==data.payloadDigest)throw new BadRequestException('Event identity body mismatch');return row;}}
export async function acceptFixture(raw:Buffer,signature:string|undefined){if(environment.paymentMode!=='fixture'||environment.environment!=='test'||!['local','test'].includes(environment.appEnv))throw new ServiceUnavailableException('Fixture events are unavailable');if(!verifyHmac(raw,signature,process.env.FIXTURE_WEBHOOK_SECRET!))throw new UnauthorizedException('Invalid signature');let value:unknown;try{value=JSON.parse(raw.toString('utf8'));}catch{throw new BadRequestException('Invalid event');}
const digest=createHash('sha256').update(raw).digest('hex');const skeleton=probe.safeParse(value);
if(skeleton.success){await saveInbox({provider:'fixture',providerAccount:'fixture',environment:'test',eventId:skeleton.data.eventId,eventType:skeleton.data.type,payloadDigest:digest,payload:skeleton.data});return;}
const parsed=funding.safeParse(value);if(!parsed.success)throw new BadRequestException('Invalid fixture event');
const event=parsed.data;const intent=await prisma.paymentIntent.findUnique({where:{reference:event.reference}});
if(!intent||intent.environment!=='test'||intent.paymentMode!=='fixture'||intent.provider!=='fixture'||intent.amountMinor.toString()!==event.amountMinor||intent.currency!==event.currency)throw new BadRequestException('Payment does not match the server intent');
await saveInbox({provider:'fixture',providerAccount:'fixture',environment:'test',eventId:event.eventId,eventType:event.type,payloadDigest:digest,payload:event});}
function header(req:Request,name:string){const value=req.headers[name];return typeof value==='string'?value:undefined;}
@Controller('api/v1/webhooks')
export class WebhooksController {
@Post('fixture') @HttpCode(202) async fixture(@Req()req:RawBodyRequest<Request>){if(!req.rawBody)throw new BadRequestException('Original bytes required');await acceptFixture(req.rawBody,header(req,'x-goober-signature'));return {accepted:true};}
@Post('pai') @HttpCode(202) async pai(@Req()req:RawBodyRequest<Request>){const secret=environment.paiMode==='fixture'?process.env.PAI_FIXTURE_WEBHOOK_SECRET:process.env.PAI_WEBHOOK_SECRET;const raw=req.rawBody;if(!secret)throw new ServiceUnavailableException('Callback verification is not configured');if(!raw||!verifyHmac(raw,header(req,'x-webhook-signature'),secret,'sha256',true))throw new UnauthorizedException('Invalid signature');
let body:any;try{body=losslessBody(raw.toString('utf8'));}catch{throw new BadRequestException('Invalid callback');}
const eventId=String(body?.delivery_id??'');const external=body?.data?.external_order_id;const event=body?.event;
if(!eventId||eventId.length>128||typeof external!=='string'||external.length>128||!['order.delivered','order.queued','order.failed'].includes(event)||header(req,'x-webhook-delivery')!==eventId||header(req,'x-webhook-event')!==event)throw new BadRequestException('Callback identity mismatch');
const order=await prisma.order.findFirst({where:{providerReference:external,provider:'PAI',environment:'test'},include:{product:true,quote:true}});const digest=createHash('sha256').update(raw).digest('hex');
if(!order){const context={orderId:'unmatched:'+external,provider:'PAI',environment:'test'};await saveInbox({provider:'PAI',providerAccount:environment.paiMode==='fixture'?'fixture':'sandbox',environment:'test',eventId,eventType:event,payloadDigest:digest,payload:{externalOrderId:external},encryptedPayload:seal({raw:raw.toString('utf8')},context) as unknown as Prisma.InputJsonObject,status:'QUARANTINED',lastError:'Unknown supplier reference'});return {accepted:true};}
if(order.providerMode!==environment.paiMode)throw new BadRequestException('Callback mode mismatch');
let parsed;try{parsed=parsePaiCallback(raw,header(req,'x-webhook-signature'),secret,header(req,'x-webhook-event'),header(req,'x-webhook-delivery'),{externalOrderId:order.providerReference,productId:order.product.providerProductId,quantity:1,expectedMinor:order.quote.supplierMinor.toString(),currency:'USD'});}catch{throw new BadRequestException('Callback does not match the order');}
await saveInbox({provider:'PAI',providerAccount:order.providerAccount,environment:'test',eventId:parsed.identity,eventType:parsed.event,payloadDigest:digest,payload:{orderId:order.id,externalOrderId:external},encryptedPayload:seal({outcome:parsed.outcome},{orderId:order.id,provider:'PAI',environment:'test'}) as unknown as Prisma.InputJsonObject});return {accepted:true};}
@Post('paystack') @HttpCode(202) async paystack(@Req()req:RawBodyRequest<Request>){const secret=process.env.PAYSTACK_TEST_SECRET;if(!secret?.startsWith('sk_test_')||!req.rawBody)throw new ServiceUnavailableException('Paystack test verification is not configured');if(!verifyHmac(req.rawBody,header(req,'x-paystack-signature'),secret,'sha512'))throw new UnauthorizedException('Invalid signature');
const body=losslessBody(req.rawBody.toString('utf8')) as any;const reference=body?.data?.reference;if(typeof reference!=='string'||reference.length>128)throw new BadRequestException('Invalid payment reference');const intent=await prisma.paymentIntent.findUnique({where:{reference}});if(!intent||intent.provider!=='paystack'||intent.paymentMode!=='sandbox'||intent.environment!=='test')throw new BadRequestException('No matching Paystack test intent');
const observed=parsePaystackCallback(req.rawBody,header(req,'x-paystack-signature'),secret,{reference,ownerId:intent.ownerId,amountMinor:intent.amountMinor.toString(),currency:'NGN',environment:'test'});
await saveInbox({provider:'paystack',providerAccount:'sandbox',environment:'test',eventId:observed.transactionId,eventType:'charge.success',payloadDigest:createHash('sha256').update(req.rawBody).digest('hex'),payload:{reference,transactionId:observed.transactionId},encryptedPayload:seal(observed,{orderId:intent.id,provider:'paystack',environment:'test'}) as unknown as Prisma.InputJsonObject,status:'QUARANTINED',lastError:'Processor extension requires test-mode activation; no customer credit applied'});return {accepted:true};}
}
