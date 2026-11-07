import { z } from 'zod';
export const minorSchema=z.string().regex(/^(0|[1-9][0-9]{0,24})$/);
export const idSchema=z.string().min(1).max(128);
export const currencySchema=z.enum(['NGN','USD']);
export type Currency=z.infer<typeof currencySchema>;
export const PAYSTACK_MIN_MINOR:Record<Currency,bigint>={NGN:10000n,USD:100n};
export const quoteInput=z.object({productId:idSchema,quantity:z.literal(1).default(1),currency:currencySchema.optional()}).strict();
export const orderInput=z.object({quoteId:idSchema,currency:currencySchema.optional(),paymentReference:idSchema.optional()}).strict();
export const fundingInput=z.object({
  amountMinor:minorSchema.pipe(z.string().refine(v=>BigInt(v)>=100n && BigInt(v)<=100000000n,'Choose ₦1–₦1,000,000 (or $1–$1,000,000) in test funds')),
  currency:currencySchema.optional(),
  provider:z.enum(['fixture','paystack']).optional(),
  callbackUrl:z.string().url().max(1024).optional(),
  orderId:idSchema.optional(),
}).strict();
export const paystackVerifyInput=z.object({reference:idSchema}).strict();
export const exchangeRateInput=z.object({
  rate:z.string().regex(/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,8})?$/).refine(v=>Number(v)>0,'Exchange rate must be positive'),
  reason:z.string().trim().min(5).max(500),
  operationId:z.string().uuid().optional(),
}).strict();
export const refundOrderInput=z.object({
  amountMinor:minorSchema,
  reason:z.string().trim().min(5).max(500),
  operationId:z.string().uuid(),
}).strict();
export const supportInput=z.object({orderId:idSchema.optional(),message:z.string().trim().min(5).max(2000)}).strict();
export const reviewInput=z.object({operationId:z.string().uuid(),version:z.number().int().nonnegative(),resolution:z.enum(['delivered','failed','merchant-loss']),reason:z.string().trim().min(10).max(1000),delivery:z.array(z.string().min(1).max(4096)).max(1).optional()}).strict();
export const approvalInput=z.object({operationId:z.string().uuid(),version:z.number().int().nonnegative(),published:z.boolean(),reason:z.string().min(10).max(1000)}).strict();
export type Environment='test'|'live';
export type Provider='PAI'|'GRAML';
export type ProviderMode='fixture'|'sandbox'|'readonly'|'disabled';
export type PaymentMode='fixture'|'paystack'|'sandbox';
export interface DualPriceBreakdown {
  NGN:{amountMinor:string;currency:'NGN';formatted:string};
  USD:{amountMinor:string;currency:'USD';formatted:string};
}
export interface ProductDto {
  id:string;
  name:string;
  description:string;
  category:string;
  priceMinor:string;
  currency:Currency;
  supplierMinor?:string;
  supplierCurrency?:Currency;
  markupPercent?:15;
  markupMinor?:string;
  sellingMinor?:string;
  prices?:DualPriceBreakdown;
  exchangeRate?:string;
  exchangeRateUpdatedAt?:string;
  terms:string;
  provider:Provider;
  mode:ProviderMode;
  published:boolean;
  version:number;
}
export interface MeDto {id:string;email:string;name:string;role:string;environment:Environment}
export interface WalletSummaryDto {availableMinor:string;reservedMinor:string;currency:Currency;frozen:boolean}
export interface WalletDto {
  availableMinor:string;
  reservedMinor:string;
  currency:Currency;
  frozen:boolean;
  environment:Environment;
  wallets?:Record<Currency,WalletSummaryDto>;
}
export interface QuoteDto {
  id:string;
  productId:string;
  priceMinor:string;
  currency:Currency;
  supplierMinor?:string;
  supplierCurrency?:Currency;
  markupPercent?:15;
  markupMinor?:string;
  sellingMinor?:string;
  exchangeRate?:string;
  exchangeRateSource?:string;
  exchangeRateAt?:string;
  expiresAt:string;
  terms:string;
}
export interface OrderDto {
  id:string;
  productId:string;
  productName:string;
  fulfillmentState:string;
  moneyState:string;
  totalMinor:string;
  currency:Currency;
  supplierMinor?:string;
  supplierCurrency?:Currency;
  markupPercent?:15;
  markupMinor?:string;
  sellingMinor?:string;
  customerCurrency?:Currency;
  exchangeRate?:string;
  exchangeRateSource?:string;
  exchangeRateAt?:string;
  payableMinor?:string;
  paymentCurrency?:Currency;
  paymentReference?:string|null;
  refundedMinor?:string;
  environment:Environment;
  version:number;
  reviewReason:string|null;
  createdAt:string;
}
export interface TransactionDto {id:string;operationId:string;amountMinor:string;currency?:Currency;direction:string;description:string;createdAt:string}
export interface SupportDto {id:string;orderId:string|null;message:string;status:string;createdAt:string}
export interface FundingDto {
  id:string;
  reference:string;
  amountMinor:string;
  currency:Currency;
  mode:PaymentMode;
  status:string;
  provider?:'fixture'|'paystack';
  authorizationUrl?:string|null;
  accessCode?:string|null;
  orderId?:string|null;
}
export interface ExchangeRateDto {
  baseCurrency:'USD';
  quoteCurrency:'NGN';
  rate:string;
  inverseRate:string;
  source:string;
  isManualOverride:boolean;
  updatedAt:string;
}
export interface DeliveryDto {products:string[];revealedAt:string}
export interface Page<T> {items:T[];nextCursor:string|null}
export function formatNgn(minor:string):string {const n=BigInt(minor);const absolute=n<0n?-n:n;return (n<0n?'-':'')+'\u20a6'+(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(absolute%100n).toString().padStart(2,'0');}
export function formatUsd(minor:string):string {const n=BigInt(minor);const absolute=n<0n?-n:n;return (n<0n?'-':'')+'$'+(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(absolute%100n).toString().padStart(2,'0');}
export function formatMoney(minor:string,currency:Currency='NGN'):string {return currency==='USD'?formatUsd(minor):formatNgn(minor);}
export const API_CONTRACT_VERSION='m1.v1';

