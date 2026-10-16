import { z } from 'zod';
export const minorSchema=z.string().regex(/^(0|[1-9][0-9]{0,24})$/);
export const idSchema=z.string().min(1).max(128);
export const quoteInput=z.object({productId:idSchema,quantity:z.literal(1).default(1)}).strict();
export const orderInput=z.object({quoteId:idSchema}).strict();
export const fundingInput=z.object({amountMinor:minorSchema.pipe(z.string().refine(v=>BigInt(v)>=100n && BigInt(v)<=100000000n,'Choose â‚¦1â€“â‚¦1,000,000 in test funds'))}).strict();
export const supportInput=z.object({orderId:idSchema.optional(),message:z.string().trim().min(5).max(2000)}).strict();
export const reviewInput=z.object({operationId:z.string().uuid(),version:z.number().int().nonnegative(),resolution:z.enum(['delivered','failed','merchant-loss']),reason:z.string().trim().min(10).max(1000),delivery:z.array(z.string().min(1).max(4096)).max(1).optional()}).strict();
export const approvalInput=z.object({operationId:z.string().uuid(),version:z.number().int().nonnegative(),published:z.boolean(),reason:z.string().min(10).max(1000)}).strict();
export type Environment='test'|'live';
export type Provider='PAI'|'GRAML';
export type ProviderMode='fixture'|'sandbox'|'readonly'|'disabled';
export interface ProductDto {id:string;name:string;description:string;category:string;priceMinor:string;currency:'NGN';terms:string;provider:Provider;mode:ProviderMode;published:boolean;version:number}
export interface MeDto {id:string;email:string;name:string;role:string;environment:Environment}
export interface WalletDto {availableMinor:string;reservedMinor:string;currency:'NGN';frozen:boolean;environment:Environment}
export interface QuoteDto {id:string;productId:string;priceMinor:string;currency:'NGN';expiresAt:string;terms:string}
export interface OrderDto {id:string;productId:string;productName:string;fulfillmentState:string;moneyState:string;totalMinor:string;currency:'NGN';environment:Environment;version:number;reviewReason:string|null;createdAt:string}
export interface TransactionDto {id:string;operationId:string;amountMinor:string;direction:string;description:string;createdAt:string}
export interface SupportDto {id:string;orderId:string|null;message:string;status:string;createdAt:string}
export interface FundingDto {id:string;reference:string;amountMinor:string;currency:'NGN';mode:'fixture';status:string}
export interface DeliveryDto {products:string[];revealedAt:string}
export interface Page<T> {items:T[];nextCursor:string|null}
export function formatNgn(minor:string):string {const n=BigInt(minor);const absolute=n<0n?-n:n;return (n<0n?'-':'')+'â‚¦'+(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(absolute%100n).toString().padStart(2,'0');}
export const API_CONTRACT_VERSION='m1.v1';
