import { SupplierHttp, identifier, losslessBody, numericText, record, text } from './http.js';
import { verifyHmac } from './signatures.js';
import { ProviderError, validateConfig, type AdapterConfig } from './types.js';

export interface FundingExpectation { reference:string; amountMinor:string; currency:'NGN'; environment:'test'; ownerId:string }
export interface FundingObservation { transactionId:string;reference:string;amountMinor:string;currency:'NGN';environment:'test';status:'success'|'pending'|'failed'|'reversed';ownerId:string }
function validateFunding(expected:FundingExpectation):void {
  if(!/^[A-Za-z0-9_.=-]{1,100}$/.test(expected.reference)||!expected.ownerId||expected.ownerId.length>128||expected.environment!=='test'||expected.currency!=='NGN'||!/^[1-9][0-9]{0,14}$/.test(expected.amountMinor))throw new ProviderError('invalid-funding-intent');
}
export function parsePaystackTransaction(body:unknown,expected:FundingExpectation,envelope=true):FundingObservation {
  validateFunding(expected);const root=record(body);if(envelope&&root.status!==true)throw new ProviderError('paystack-envelope-failed');
  const data=envelope?record(root.data):root;
  const amountMinor=numericText(data.amount);
  if(!/^(0|[1-9][0-9]*)$/.test(amountMinor)||data.reference!==expected.reference||data.domain!=='test'||data.currency!=='NGN'||amountMinor!==expected.amountMinor)throw new ProviderError('payment-association-mismatch');
  const supplierStatus=text(data.status,32);
  const status=supplierStatus==='success'?'success':supplierStatus==='reversed'?'reversed':['abandoned','failed'].includes(supplierStatus)?'failed':['ongoing','pending','processing','queued'].includes(supplierStatus)?'pending':null;
  if(!status)throw new ProviderError('unknown-payment-status');
  return {transactionId:identifier(data.id),reference:expected.reference,amountMinor,currency:'NGN',environment:'test',status,ownerId:expected.ownerId};
}
export function parsePaystackCallback(raw:Buffer,header:string|undefined,secret:string,expected:FundingExpectation):FundingObservation {
  if(!verifyHmac(raw,header,secret,'sha512',false))throw new ProviderError('invalid-payment-signature');
  const root=record(losslessBody(raw.toString('utf8')));
  if(root.event!=='charge.success')throw new ProviderError('unsupported-payment-event');
  const result=parsePaystackTransaction(root.data,expected,false);
  if(result.status!=='success')throw new ProviderError('payment-event-status-mismatch');
  return result;
}
export class PaystackAdapter {
  private readonly http:SupplierHttp;
  constructor(private readonly config:AdapterConfig){validateConfig('PAYSTACK',config);this.http=new SupplierHttp('PAYSTACK',config);}
  async initialize(expected:FundingExpectation,email:string):Promise<{reference:string;authorizationUrl:string;accessCode:string}>{
    validateFunding(expected);
    if(this.config.mode!=='sandbox')throw new ProviderError('paystack-test-mode-required');
    if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new ProviderError('invalid-payment-email');
    const r=await this.http.request('POST','/transaction/initialize',{reference:expected.reference,amount:expected.amountMinor,currency:'NGN',email});
    const root=record(r.body);if(r.status!==200||root.status!==true)throw new ProviderError('payment-initialize-failed');
    const d=record(root.data);const reference=text(d.reference,100);const authorizationUrl=text(d.authorization_url,2048);
    let url:URL;try{url=new URL(authorizationUrl);}catch{throw new ProviderError('invalid-checkout-url');}
    if(reference!==expected.reference||url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||url.port||url.username||url.password)throw new ProviderError('invalid-checkout-url');
    return {reference,authorizationUrl,accessCode:text(d.access_code,256)};
  }
  async verify(expected:FundingExpectation):Promise<FundingObservation>{validateFunding(expected);if(this.config.mode!=='sandbox')throw new ProviderError('paystack-test-mode-required');const r=await this.http.request('GET',`/transaction/verify/${encodeURIComponent(expected.reference)}`,undefined,true);if(r.status!==200)throw new ProviderError('payment-verification-http-error');return parsePaystackTransaction(r.body,expected);}
}
