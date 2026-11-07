import { randomUUID } from 'node:crypto';
import { prisma } from '@goober/db';
import type { Currency, FundingDto } from '@goober/contracts';
import { PaystackAdapter, ProviderError, validatePaystackMinimum, type AdapterConfig } from '@goober/providers';
import { applyFundingEvent, CommerceError } from './index.js';

export interface CreateFundingOptions {
  currency?: Currency;
  provider?: 'fixture' | 'paystack';
  email?: string;
  callbackUrl?: string;
  orderId?: string;
  customAdapter?: PaystackAdapter;
}

export function defaultPaystackAdapter(): PaystackAdapter {
  const apiKey = process.env.PAYSTACK_SECRET_KEY ?? process.env.PAYSTACK_TEST_SECRET ?? 'sk_test_local_sandbox';
  const usdEnabled = process.env.PAYSTACK_USD_ENABLED !== 'false';
  const cfg: AdapterConfig = {
    appEnvironment: process.env.APP_ENV === 'test' ? 'test' : 'local',
    environment: 'test',
    accountId: 'sandbox',
    mode: 'sandbox',
    apiKey,
    usdEnabled,
    budget: { acquire: async () => undefined },
  };
  return new PaystackAdapter(cfg);
}

export async function initializePaystackFunding(
  ownerId: string,
  value: bigint,
  currency: Currency,
  options?: CreateFundingOptions,
): Promise<FundingDto> {
  const environment = 'test';
  try {
    validatePaystackMinimum(value.toString(), currency);
  } catch (err) {
    const code = err instanceof ProviderError ? err.code : 'MINIMUM_TRANSACTION_AMOUNT';
    throw new CommerceError(
      code === 'paystack-minimum-amount-ngn' ? 'MINIMUM_AMOUNT_NGN' : code === 'paystack-minimum-amount-usd' ? 'MINIMUM_AMOUNT_USD' : 'MINIMUM_TRANSACTION_AMOUNT',
      currency === 'NGN' ? 'Minimum NGN Paystack transaction is ₦100.00 (10,000 kobo)' : 'Minimum USD Paystack transaction is $1.00 (100 cents)',
      400,
    );
  }
  if (options?.orderId) {
    const order = await prisma.order.findFirst({ where: { id: options.orderId, ownerId, environment } });
    if (!order) throw new CommerceError('NOT_FOUND', 'Order was not found', 404);
    if (order.customerCurrency !== currency) {
      throw new CommerceError('CURRENCY_MISMATCH', 'Paystack transaction currency must match customer-selected order currency', 409);
    }
    const expectedPayable = order.payableMinor > 0n ? order.payableMinor : order.reservedMinor;
    if (expectedPayable !== value) {
      throw new CommerceError('AMOUNT_MISMATCH', 'Paystack transaction amount must match backend-calculated order payable amount', 409);
    }
  }
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  const email = options?.email ?? user?.email ?? 'customer@example.test';
  const reference = `paystack-${randomUUID()}`;
  const intent = await prisma.paymentIntent.create({
    data: { ownerId, environment, reference, amountMinor: value, currency, provider: 'paystack', providerAccount: 'sandbox', paymentMode: 'sandbox', orderId: options?.orderId ?? null },
  });
  const adapter = options?.customAdapter ?? defaultPaystackAdapter();
  try {
    const initialized = await adapter.initialize(
      {
        reference,
        amountMinor: value.toString(),
        currency,
        environment: 'test',
        ownerId,
        callbackUrl: options?.callbackUrl ?? process.env.PAYSTACK_CALLBACK_URL,
        metadata: { ownerId, intentId: intent.id, currency, amountMinor: value.toString(), ...(options?.orderId ? { orderId: options.orderId } : {}) },
      },
      email,
    );
    const updated = await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { authorizationUrl: initialized.authorizationUrl, accessCode: initialized.accessCode },
    });
    return {
      id: updated.id,
      reference: updated.reference,
      amountMinor: updated.amountMinor.toString(),
      currency,
      mode: 'paystack',
      status: updated.status,
      provider: 'paystack',
      authorizationUrl: updated.authorizationUrl,
      accessCode: updated.accessCode,
      orderId: updated.orderId,
    };
  } catch (err) {
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', failureReason: err instanceof ProviderError ? err.code : 'initialize-failed' } });
    throw new CommerceError(err instanceof ProviderError ? err.code.toUpperCase().replaceAll('-', '_') : 'PAYMENT_INITIALIZE_FAILED', 'Unable to initialize Paystack transaction', 502);
  }
}


export async function verifyPaystackPayment(reference: string, options?: { customAdapter?: PaystackAdapter }): Promise<FundingDto> {
  const environment = 'test';
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent || intent.environment !== environment || intent.provider !== 'paystack') {
    throw new CommerceError('NOT_FOUND', 'Paystack payment intent was not found', 404);
  }
  const currency = (intent.currency === 'USD' ? 'USD' : 'NGN') as Currency;
  const adapter = options?.customAdapter ?? defaultPaystackAdapter();
  let observed;
  try {
    observed = await adapter.verify({ reference: intent.reference, amountMinor: intent.amountMinor.toString(), currency, environment: 'test', ownerId: intent.ownerId });
  } catch (err) {
    const reason = err instanceof ProviderError ? err.code : 'verification-error';
    if (reason === 'payment-association-mismatch') {
      await prisma.paymentIntent.update({ where: { id: intent.id }, data: { failureReason: 'payment-association-mismatch' } });
      throw new CommerceError('PAYMENT_MISMATCH', 'Paystack verification rejected currency or amount mismatch', 409);
    }
    throw new CommerceError('PAYMENT_VERIFICATION_FAILED', 'Unable to verify Paystack transaction', 502);
  }
  if (observed.status === 'failed') {
    const failed = await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { ...(intent.creditedMinor === 0n ? { status: 'FAILED' } : {}), processorTransactionId: observed.transactionId, failureReason: 'processor-reported-failed' },
    });
    return { id: failed.id, reference: failed.reference, amountMinor: failed.amountMinor.toString(), currency, mode: 'paystack', status: failed.status, provider: 'paystack', orderId: failed.orderId };
  }
  if (observed.status === 'success' || observed.status === 'reversed') {
    await applyFundingEvent({
      eventId: `paystack-${observed.status}:${observed.transactionId}`,
      type: observed.status === 'success' ? 'payment.succeeded' : 'payment.reversed',
      environment: 'test',
      reference: intent.reference,
      amountMinor: observed.amountMinor,
      currency: observed.currency,
      provider: 'paystack',
      providerAccount: 'sandbox',
      processorTransactionId: observed.transactionId,
    });
  }
  const latest = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
  return { id: latest.id, reference: latest.reference, amountMinor: latest.amountMinor.toString(), currency, mode: 'paystack', status: latest.status, provider: 'paystack', authorizationUrl: latest.authorizationUrl, accessCode: latest.accessCode, orderId: latest.orderId };
}
