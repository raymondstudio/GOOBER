import { SupplierHttp, identifier, losslessBody, numericText, record, text } from './http.js';
import { parseMajorToMinor, verifyHmac } from './signatures.js';
import { ProviderError, validateConfig, type AdapterConfig } from './types.js';

export type PaystackCurrency = 'NGN' | 'USD';
export const PAYSTACK_MIN_MINOR: Record<PaystackCurrency, bigint> = { NGN: 10000n, USD: 100n };

export interface FundingExpectation {
  reference: string;
  amountMinor: string;
  currency: PaystackCurrency;
  environment: 'test';
  ownerId: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}
export interface FundingObservation {
  transactionId: string;
  reference: string;
  amountMinor: string;
  currency: PaystackCurrency;
  environment: 'test';
  status: 'success' | 'pending' | 'failed' | 'reversed';
  ownerId: string;
  event?: string;
}
export interface PaystackRefundRequest {
  transaction: string;
  amountMinor: string;
  currency: PaystackCurrency;
  merchantNote?: string;
}
export interface PaystackRefundObservation {
  refundId: string;
  transactionId: string;
  amountMinor: string;
  currency: PaystackCurrency;
  status: 'pending' | 'processing' | 'processed' | 'failed';
}

export function majorToKobo(ngnMajor: string): string {
  const kobo = parseMajorToMinor(ngnMajor);
  if (kobo <= 0n) throw new ProviderError('invalid-kobo-amount');
  return kobo.toString();
}
export function majorToCents(usdMajor: string): string {
  const cents = parseMajorToMinor(usdMajor);
  if (cents <= 0n) throw new ProviderError('invalid-cents-amount');
  return cents.toString();
}
export function majorToPaystackMinor(major: string, currency: PaystackCurrency): string {
  return currency === 'USD' ? majorToCents(major) : majorToKobo(major);
}
export function validatePaystackMinimum(amountMinor: string, currency: PaystackCurrency): void {
  if (!/^[1-9][0-9]{0,14}$/.test(amountMinor)) throw new ProviderError('invalid-funding-intent');
  const val = BigInt(amountMinor);
  if (currency === 'NGN' && val < PAYSTACK_MIN_MINOR.NGN) throw new ProviderError('paystack-minimum-amount-ngn');
  if (currency === 'USD' && val < PAYSTACK_MIN_MINOR.USD) throw new ProviderError('paystack-minimum-amount-usd');
}

function validateFunding(expected: FundingExpectation, checkMinimum = false): void {
  if (!/^[A-Za-z0-9_.=-]{1,100}$/.test(expected.reference) || !expected.ownerId || expected.ownerId.length > 128 || expected.environment !== 'test' || !['NGN', 'USD'].includes(expected.currency) || !/^[1-9][0-9]{0,14}$/.test(expected.amountMinor)) {
    throw new ProviderError('invalid-funding-intent');
  }
  if (checkMinimum) validatePaystackMinimum(expected.amountMinor, expected.currency);
}

export function parsePaystackTransaction(body: unknown, expected: FundingExpectation, envelope = true): FundingObservation {
  validateFunding(expected);
  const root = record(body);
  if (envelope && root.status !== true) throw new ProviderError('paystack-envelope-failed');
  const data = envelope ? record(root.data) : root;
  const amountMinor = numericText(data.amount);
  if (!/^(0|[1-9][0-9]*)$/.test(amountMinor) || data.reference !== expected.reference || data.domain !== 'test' || data.currency !== expected.currency || amountMinor !== expected.amountMinor) {
    throw new ProviderError('payment-association-mismatch');
  }
  const supplierStatus = text(data.status, 32);
  const status = supplierStatus === 'success' ? 'success' : supplierStatus === 'reversed' ? 'reversed' : ['abandoned', 'failed'].includes(supplierStatus) ? 'failed' : ['ongoing', 'pending', 'processing', 'queued'].includes(supplierStatus) ? 'pending' : null;
  if (!status) throw new ProviderError('unknown-payment-status');
  return { transactionId: identifier(data.id), reference: expected.reference, amountMinor, currency: expected.currency, environment: 'test', status, ownerId: expected.ownerId };
}

export function parsePaystackCallback(raw: Buffer, header: string | undefined, secret: string, expected: FundingExpectation): FundingObservation {
  if (!verifyHmac(raw, header, secret, 'sha512', false)) throw new ProviderError('invalid-payment-signature');
  const root = record(losslessBody(raw.toString('utf8')));
  const event = typeof root.event === 'string' ? root.event : '';
  if (!['charge.success', 'charge.failed', 'refund.processed', 'charge.dispute.create'].includes(event)) {
    throw new ProviderError('unsupported-payment-event');
  }
  const result = parsePaystackTransaction(root.data, expected, false);
  if (event === 'charge.success' && result.status !== 'success') throw new ProviderError('payment-event-status-mismatch');
  if (event === 'charge.failed' && result.status !== 'failed') throw new ProviderError('payment-event-status-mismatch');
  if (['refund.processed', 'charge.dispute.create'].includes(event) && result.status !== 'reversed') {
    return { ...result, status: 'reversed', event };
  }
  return { ...result, event };
}

export class PaystackAdapter {
  private readonly http: SupplierHttp;
  constructor(private readonly config: AdapterConfig) {
    validateConfig('PAYSTACK', config);
    this.http = new SupplierHttp('PAYSTACK', config);
  }
  async initialize(expected: FundingExpectation, email: string): Promise<{ reference: string; authorizationUrl: string; accessCode: string }> {
    validateFunding(expected, true);
    if (this.config.mode !== 'sandbox') throw new ProviderError('paystack-test-mode-required');
    if (expected.currency === 'USD' && this.config.usdEnabled === false) throw new ProviderError('paystack-usd-not-enabled');
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new ProviderError('invalid-payment-email');
    const payload: Record<string, unknown> = {
      reference: expected.reference,
      amount: expected.amountMinor,
      currency: expected.currency,
      email,
    };
    if (expected.callbackUrl) {
      let cb: URL;
      try { cb = new URL(expected.callbackUrl); } catch { throw new ProviderError('invalid-callback-url'); }
      if (!['http:', 'https:'].includes(cb.protocol)) throw new ProviderError('invalid-callback-url');
      payload.callback_url = expected.callbackUrl;
    }
    if (expected.metadata) payload.metadata = expected.metadata;
    const r = await this.http.request('POST', '/transaction/initialize', payload);
    const root = record(r.body);
    if (r.status !== 200 || root.status !== true) throw new ProviderError('payment-initialize-failed');
    const d = record(root.data);
    const reference = text(d.reference, 100);
    const authorizationUrl = text(d.authorization_url, 2048);
    let url: URL;
    try { url = new URL(authorizationUrl); } catch { throw new ProviderError('invalid-checkout-url'); }
    if (reference !== expected.reference || url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || url.port || url.username || url.password) {
      throw new ProviderError('invalid-checkout-url');
    }
    return { reference, authorizationUrl, accessCode: text(d.access_code, 256) };
  }
  async verify(expected: FundingExpectation): Promise<FundingObservation> {
    validateFunding(expected);
    if (this.config.mode !== 'sandbox') throw new ProviderError('paystack-test-mode-required');
    const r = await this.http.request('GET', `/transaction/verify/${encodeURIComponent(expected.reference)}`, undefined, true);
    if (r.status !== 200) throw new ProviderError('payment-verification-http-error');
    return parsePaystackTransaction(r.body, expected);
  }
  async refund(req: PaystackRefundRequest): Promise<PaystackRefundObservation> {
    if (this.config.mode !== 'sandbox') throw new ProviderError('paystack-test-mode-required');
    if (!req.transaction || req.transaction.length > 128 || !['NGN', 'USD'].includes(req.currency) || !/^[1-9][0-9]{0,14}$/.test(req.amountMinor)) {
      throw new ProviderError('invalid-refund-request');
    }
    const r = await this.http.request('POST', '/refund', {
      transaction: req.transaction,
      amount: req.amountMinor,
      currency: req.currency,
      ...(req.merchantNote ? { merchant_note: req.merchantNote } : {}),
    });
    const root = record(r.body);
    if ((r.status !== 200 && r.status !== 201) || root.status !== true) throw new ProviderError('payment-refund-failed');
    const d = record(root.data);
    const amountMinor = numericText(d.amount);
    if (d.currency !== req.currency || amountMinor !== req.amountMinor) throw new ProviderError('refund-association-mismatch');
    const rawStatus = text(d.status, 32);
    const status = (['pending', 'processing', 'processed', 'failed'].includes(rawStatus) ? rawStatus : 'pending') as PaystackRefundObservation['status'];
    return {
      refundId: identifier(d.id),
      transactionId: req.transaction,
      amountMinor,
      currency: req.currency,
      status,
    };
  }
}

