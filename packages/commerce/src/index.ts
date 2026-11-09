import { createHash, randomUUID } from 'node:crypto';
import { prisma, Prisma, FIXTURE_PROVIDER_CONTRACT_VERSION, type Order, type Product, type Wallet } from '@goober/db';
import { type Currency, type FundingDto, type OrderDto, type QuoteDto, type WalletDto } from '@goober/contracts';
import { seal } from './encryption.js';
import { CommerceError } from './errors.js';
import { parseMinor } from './money.js';
import { calculateDualCurrencyPricing } from './pricing.js';
import { getExchangeRate, type ExchangeRateSnapshot } from './exchange-rate.js';
import { initializePaystackFunding, verifyPaystackPaymentInternal, type CreateFundingOptions } from './paystack-funding.js';

export { CommerceError } from './errors.js';
export { seal, open } from './encryption.js';
export type { EncryptionContext, SealedPayload } from './encryption.js';
export { parseMinor, convertMinorCeil, MAX_MINOR } from './money.js';
export { applyMarkup15, calculateDualCurrencyPricing, convertSellingMinor, MARKUP_PERCENT, parseExchangeRate } from './pricing.js';
export type { MarkupCalculation, DualPricingResult } from './pricing.js';
export { clearExchangeRateCache, exchangeRateDto, getExchangeRate, setManualExchangeRate } from './exchange-rate.js';
export type { ExchangeRateSnapshot } from './exchange-rate.js';
export { syncSupplierCatalog } from './catalog-sync.js';
export type { CatalogSyncResult } from './catalog-sync.js';
export type { CreateFundingOptions } from './paystack-funding.js';
export type Transaction = Prisma.TransactionClient;
export interface FundingEvent {
  eventId: string;
  type: 'payment.succeeded' | 'payment.reversed' | 'payment.failed';
  environment: 'test';
  reference: string;
  amountMinor: string;
  currency: Currency;
  provider?: 'fixture' | 'paystack';
  providerAccount?: 'fixture' | 'sandbox';
  processorTransactionId?: string;
  inboxId?: string;
}
export interface CommerceOutcome {
  status: 'delivered' | 'failed' | 'queued' | 'unknown'; products?: string[]; reason?: string;
  supplierMinor?: string; supplierCurrency?: 'NGN' | 'USD'; inboxId?: string;
}
export interface ReviewResolution {
  operationId: string; version: number; resolution: 'delivered' | 'failed' | 'merchant-loss'; reason: string; delivery?: string[];
}
const environment = 'test';
const accountKey = (ownerId: string | null, purpose: string, currency: string) => `${ownerId ?? 'system'}:${purpose}:${currency}`;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assertLocal() {
  if (!['local', 'test'].includes(process.env.APP_ENV ?? '') || process.env.DATA_ENV !== 'test' || !['fixture', 'paystack'].includes(process.env.PAYMENT_MODE ?? '')) {
    throw new CommerceError('MODE_DISABLED', 'This commerce slice requires isolated local/test funding', 503);
  }
}
function amount(value: string, allowZero = false) {
  try { return parseMinor(value, allowZero); } catch { throw new CommerceError('INVALID_AMOUNT', 'Use an exact supported minor-unit string'); }
}
function operation(value: string) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new CommerceError('INVALID_OPERATION', 'A bounded operation identifier is required');
  return value;
}
function retryable(error: unknown) {
  // The pg driver adapter nests original SQLSTATE under meta.driverAdapterError.cause.
  // Raw-query conflicts use P2010 rather than the ORM's P2034 wrapper.
  const inspect = (value: unknown, depth: number): boolean => {
    if (!value || typeof value !== 'object' || depth > 5) return false;
    const e = value as { code?: string; originalCode?: string; meta?: unknown; cause?: unknown; driverAdapterError?: unknown };
    if (e.code === 'P2034' || [e.code, e.originalCode].some(code => code === '40001' || code === '40P01')) return true;
    return [e.meta, e.cause, e.driverAdapterError].some(nested => inspect(nested, depth + 1));
  };
  return inspect(error, 0);
}
export async function withSerializable<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 }); }
    catch (error) {
      if (!retryable(error) || attempt >= 12) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(5 * 2 ** attempt, 120) + Math.floor(Math.random() * 10)));
    }
  }
}

async function walletLock(tx: Transaction, ownerId: string, currency: Currency = 'NGN'): Promise<Wallet> {
  await tx.wallet.upsert({ where: { ownerId_environment_currency: { ownerId, environment, currency } }, create: { ownerId, environment, currency }, update: {} });
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "ownerId"=${ownerId} AND environment=${environment} AND currency=${currency} FOR UPDATE`;
  return tx.wallet.findUniqueOrThrow({ where: { ownerId_environment_currency: { ownerId, environment, currency } } });
}
async function orderLock(tx: Transaction, orderId: string) {
  const identity = await tx.order.findUnique({ where: { id: orderId }, select: { ownerId: true, environment: true, customerCurrency: true } });
  if (!identity || identity.environment !== environment) throw new CommerceError('NOT_FOUND', 'Order was not found', 404);
  const currency = (identity.customerCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  const wallet = await walletLock(tx, identity.ownerId, currency);
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { product: true, quote: true } });
  return { wallet, order };
}
async function account(tx: Transaction, ownerId: string | null, purpose: string, currency = 'NGN', normalDirection = 'CREDIT') {
  const code = accountKey(ownerId, purpose, currency);
  // ON CONFLICT DO NOTHING avoids mutating immutable account rows.
  await tx.ledgerAccount.createMany({ data: [{ code, ownerId, environment, currency, normalDirection, purpose }], skipDuplicates: true });
  return tx.ledgerAccount.findUniqueOrThrow({ where: { environment_code: { environment, code } } });
}
type Entry = { accountId: string; direction: 'DEBIT' | 'CREDIT'; amountMinor: bigint };
async function journal(tx: Transaction, operationId: string, currency: string, entries: Entry[], metadata: Prisma.InputJsonValue, reversalOfId?: string) {
  const existing = await tx.journal.findUnique({ where: { environment_operationId: { environment, operationId } } });
  if (existing) return existing;
  const record = await tx.journal.create({ data: { environment, operationId, currency, metadata, reversalOfId } });
  await tx.posting.createMany({ data: entries.filter(entry => entry.amountMinor > 0n).map(entry => ({ ...entry, journalId: record.id, currency })) });
  return tx.journal.update({ where: { id: record.id }, data: { postedAt: new Date() } });
}
async function customerAccounts(tx: Transaction, ownerId: string, currency: Currency = 'NGN') {
  const available = await account(tx, ownerId, 'CUSTOMER_AVAILABLE', currency);
  const reserved = await account(tx, ownerId, 'CUSTOMER_RESERVED', currency);
  return { available, reserved };
}
async function markInbox(tx: Transaction, inboxId?: string) {
  if (inboxId) await tx.inbox.updateMany({ where: { id: inboxId, status: { not: 'PROCESSED' } }, data: { status: 'PROCESSED', processedAt: new Date(), lastError: null } });
}
function walletDto(wallet: Wallet): WalletDto {
  return { availableMinor: wallet.availableMinor.toString(), reservedMinor: wallet.reservedMinor.toString(), currency: (wallet.currency === 'USD' ? 'USD' : 'NGN') as Currency, frozen: wallet.frozen, environment: 'test' };
}
export function orderDto(order: Order & { product?: Pick<Product, 'name' | 'description' | 'category'> }): OrderDto {
  const currency = (order.customerCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  const paymentCurrency = (order.paymentCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  const supplierCurrency = (order.supplierCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  return {
    id: order.id,
    productId: order.productId,
    productName: order.product?.name ?? 'Digital product',
    productDescription: order.product?.description,
    productCategory: order.product?.category,
    provider: (order.provider === 'GRAML' ? 'GRAML' : 'PAI'),
    fulfillmentState: order.fulfillment,
    moneyState: order.moneyStatus,
    totalMinor: order.reservedMinor.toString(),
    currency,
    supplierMinor: order.supplierMinor.toString(),
    supplierCurrency,
    markupPercent: 15,
    markupMinor: order.markupMinor.toString(),
    sellingMinor: order.sellingMinor.toString(),
    customerCurrency: currency,
    exchangeRate: order.exchangeRate,
    exchangeRateSource: order.exchangeRateSource,
    exchangeRateAt: order.exchangeRateAt.toISOString(),
    payableMinor: (order.payableMinor > 0n ? order.payableMinor : order.reservedMinor).toString(),
    paymentCurrency,
    paymentReference: order.paymentReference ?? null,
    refundedMinor: order.refundedMinor.toString(),
    environment: order.environment as 'test' | 'live',
    version: order.version,
    reviewReason: order.reviewReason,
    createdAt: order.createdAt.toISOString(),
  };
}
export async function getWallet(ownerId: string, currency: Currency = 'NGN'): Promise<WalletDto> {
  assertLocal();
  return withSerializable(async tx => walletDto(await walletLock(tx, ownerId, currency)));
}

function assertProduct(product: Product) {
  if (!product.approved || !product.published || !product.approvalEvidence || product.environment !== environment) throw new CommerceError('PRODUCT_UNAVAILABLE', 'This product is unavailable', 409);
  if (!['PAI', 'GRAML'].includes(product.provider) || product.providerMode !== 'fixture' || process.env[`${product.provider}_MODE`] !== 'fixture' || product.providerAccount !== 'fixture') throw new CommerceError('PROVIDER_DISABLED', 'This product is unavailable in the current supplier mode', 409);
  if (!['quantity', 'none'].includes(product.inputType) || !['code', 'credential'].includes(product.deliveryType)) throw new CommerceError('UNSUPPORTED_PRODUCT', 'This delivery or input mode is not supported', 409);
  if (product.stock < 1) throw new CommerceError('OUT_OF_STOCK', 'This product is out of stock', 409);
  if (Date.now() - product.observedAt.getTime() > 24 * 60 * 60 * 1000 || product.observedAt.getTime() > Date.now() + 60_000) throw new CommerceError('STALE_OFFER', 'Product availability needs a fresh observation', 409);
  if (product.apiContractVersion !== FIXTURE_PROVIDER_CONTRACT_VERSION) throw new CommerceError('UNSUPPORTED_PROVIDER_CONTRACT', 'The provider contract requires review', 409);
  if (product.retailMinor <= 0n || product.supplierMinor < 0n || (product.provider === 'PAI' ? product.supplierCurrency !== 'USD' : product.supplierCurrency !== 'NGN')) throw new CommerceError('INVALID_PRICE', 'Product pricing is unavailable', 409);
}

export async function createQuote(ownerId: string, productId: string, quantity = 1, customerCurrency?: Currency): Promise<QuoteDto> {
  assertLocal();
  if (quantity !== 1) throw new CommerceError('UNSUPPORTED_QUANTITY', 'M1 supports one product per order');
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new CommerceError('NOT_FOUND', 'Product was not found', 404);
  assertProduct(product);
  const targetCurrency: Currency = customerCurrency === 'USD' ? 'USD' : 'NGN';
  let rateSnapshot: ExchangeRateSnapshot;
  try {
    rateSnapshot = await getExchangeRate();
  } catch (err) {
    throw new CommerceError('EXCHANGE_RATE_UNAVAILABLE', err instanceof Error ? err.message : 'Exchange rate unavailable', 503);
  }
  const pricing = calculateDualCurrencyPricing(product, targetCurrency, rateSnapshot);
  const useLegacyRetail = product.pricingPolicy === 'legacy-retail' && customerCurrency === undefined;
  const payableMinor = useLegacyRetail ? product.retailMinor : pricing.payableMinor;
  const quote = await prisma.quote.create({
    data: {
      ownerId,
      environment,
      productId,
      productVersion: product.version,
      quantity,
      retailMinor: payableMinor,
      supplierMinor: product.supplierMinor,
      supplierCurrency: product.supplierCurrency,
      markupMinor: pricing.markupMinor,
      sellingMinor: pricing.sellingMinor,
      customerCurrency: targetCurrency,
      payableMinor,
      apiContractVersion: product.apiContractVersion,
      fxRate: pricing.exchangeRate,
      fxSource: pricing.exchangeRateSource,
      fxObservedAt: rateSnapshot.updatedAt,
      pricingVersion: useLegacyRetail ? 'fixture-fixed-retail-v1' : 'markup-15-dual-currency-v1',
      entitlement: product.entitlement,
      terms: product.terms,
      provider: product.provider,
      providerMode: product.providerMode,
      paymentMode: 'fixture',
      expiresAt: new Date(Date.now() + 120_000),
    },
  });
  return {
    id: quote.id,
    productId,
    priceMinor: quote.retailMinor.toString(),
    currency: targetCurrency,
    supplierMinor: quote.supplierMinor.toString(),
    supplierCurrency: (quote.supplierCurrency === 'USD' ? 'USD' : 'NGN') as Currency,
    markupPercent: 15,
    markupMinor: quote.markupMinor.toString(),
    sellingMinor: quote.sellingMinor.toString(),
    exchangeRate: quote.fxRate ?? '1',
    exchangeRateSource: quote.fxSource ?? 'par',
    exchangeRateAt: (quote.fxObservedAt ?? quote.createdAt).toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
    terms: quote.terms,
  };
}

export async function createOrder(
  ownerId: string,
  quoteId: string,
  idempotencyKey: string,
  options?: { currency?: Currency; paymentReference?: string },
): Promise<OrderDto> {
  assertLocal(); operation(idempotencyKey);
  const requestHash = hash({ quoteId, ...(options?.currency ? { currency: options.currency } : {}), ...(options?.paymentReference ? { paymentReference: options.paymentReference } : {}) });
  return withSerializable(async tx => {
    const quotePeek = await tx.quote.findUnique({ where: { id: quoteId }, select: { customerCurrency: true } });
    const quoteCurrency = (quotePeek?.customerCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
    const wallet = await walletLock(tx, ownerId, quoteCurrency);
    const key = { ownerId, operation: 'create-order', environment, key: idempotencyKey };
    const replay = await tx.idempotencyRecord.findUnique({ where: { ownerId_operation_environment_key: key } });
    if (replay) {
      if (replay.requestHash !== requestHash) throw new CommerceError('IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request', 409);
      const order = await tx.order.findUniqueOrThrow({ where: { id: replay.resultId }, include: { product: true } });
      if (order.ownerId !== ownerId || order.environment !== environment) throw new CommerceError('NOT_FOUND', 'Order was not found', 404);
      return orderDto(order);
    }
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id=${quoteId} FOR UPDATE`;
    const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { order: { include: { product: true } } } });
    if (!quote || quote.ownerId !== ownerId || quote.environment !== environment) throw new CommerceError('NOT_FOUND', 'Quote was not found', 404);
    if (options?.currency && options.currency !== quoteCurrency) {
      throw new CommerceError('CURRENCY_MISMATCH', 'Customer-selected currency does not match the quote currency', 409);
    }
    if (quote.order) {
      await tx.idempotencyRecord.create({ data: { ...key, requestHash, resultId: quote.order.id } });
      return orderDto(quote.order);
    }
    if (quote.acceptedAt || quote.expiresAt.getTime() <= Date.now()) throw new CommerceError('QUOTE_EXPIRED', 'Request and accept a fresh quote', 409);
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${quote.productId} FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: quote.productId } });
    assertProduct(product);
    const legacyPriceChanged = product.pricingPolicy === 'legacy-retail' && quote.pricingVersion === 'fixture-fixed-retail-v1' && product.retailMinor !== quote.retailMinor;
    if (product.apiContractVersion !== quote.apiContractVersion || product.version !== quote.productVersion || legacyPriceChanged || product.supplierMinor !== quote.supplierMinor || product.supplierCurrency !== quote.supplierCurrency || product.provider !== quote.provider || product.providerMode !== quote.providerMode || product.terms !== quote.terms || product.entitlement !== quote.entitlement || quote.paymentMode !== 'fixture') {
      throw new CommerceError('QUOTE_CHANGED', 'Product terms changed; accept a fresh quote', 409);
    }
    if (options?.paymentReference) {
      await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE reference=${options.paymentReference} FOR UPDATE`;
      const intent = await tx.paymentIntent.findUnique({ where: { reference: options.paymentReference } });
      const existingOrder = await tx.order.findFirst({ where: { paymentReference: options.paymentReference }, select: { id: true } });
      const isDirectPaystack = options.paymentReference.startsWith('paystack-chk-');
      const amountValid = isDirectPaystack ? (intent && intent.amountMinor >= quote.retailMinor && intent.creditedMinor >= quote.retailMinor) : (intent && intent.amountMinor === quote.retailMinor && intent.creditedMinor === quote.retailMinor);
      if (!intent || intent.ownerId !== ownerId || intent.environment !== environment || intent.currency !== quoteCurrency || !amountValid || intent.status !== 'CREDITED' || existingOrder) {
        throw new CommerceError('PAYMENT_MISMATCH', 'Payment reference currency, credited status, or amount does not match the quote', 409);
      }
    }
    if (wallet.frozen) throw new CommerceError('WALLET_FROZEN', 'Purchasing is paused while a funding issue is reviewed', 409);
    if (wallet.availableMinor < quote.retailMinor) throw new CommerceError('INSUFFICIENT_FUNDS', 'Add enough purchasing credit in the selected currency before checkout', 409);
    await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: 1 } } });
    const id = randomUUID();
    const order = await tx.order.create({
      data: {
        id,
        ownerId,
        environment,
        quoteId,
        productId: product.id,
        reservedMinor: quote.retailMinor,
        supplierMinor: quote.supplierMinor,
        supplierCurrency: quote.supplierCurrency,
        markupMinor: quote.markupMinor,
        sellingMinor: quote.sellingMinor,
        customerCurrency: quoteCurrency,
        exchangeRate: quote.fxRate ?? '1',
        exchangeRateSource: quote.fxSource ?? 'par',
        exchangeRateAt: quote.fxObservedAt ?? quote.createdAt,
        payableMinor: quote.payableMinor > 0n ? quote.payableMinor : quote.retailMinor,
        paymentCurrency: quoteCurrency,
        paymentReference: options?.paymentReference ?? null,
        provider: product.provider,
        providerAccount: product.providerAccount,
        providerMode: quote.providerMode,
        paymentMode: 'fixture',
        providerReference: `goober-test-${id}`,
      },
      include: { product: true },
    });
    const { available, reserved } = await customerAccounts(tx, ownerId, quoteCurrency);
    await journal(tx, `reserve:${id}`, quoteCurrency, [{ accountId: available.id, direction: 'DEBIT', amountMinor: quote.retailMinor }, { accountId: reserved.id, direction: 'CREDIT', amountMinor: quote.retailMinor }], { kind: 'reservation', orderId: id, currency: quoteCurrency });
    await tx.wallet.update({ where: { id: wallet.id }, data: { availableMinor: { decrement: quote.retailMinor }, reservedMinor: { increment: quote.retailMinor } } });
    await tx.quote.update({ where: { id: quoteId }, data: { acceptedAt: new Date() } });
    await tx.idempotencyRecord.create({ data: { ...key, requestHash, resultId: id } });
    await tx.outbox.create({ data: { environment, eventKey: `fulfill:${id}`, eventType: 'ORDER_FULFILL', aggregateId: id, payload: { orderId: id, environment, providerMode: product.providerMode, paymentMode: 'fixture' } } });
    return orderDto(order);
  });
}


export async function createFundingIntent(ownerId: string, amountMinor: string, options?: CreateFundingOptions): Promise<FundingDto> {
  assertLocal();
  const value = amount(amountMinor);
  const currency: Currency = options?.currency === 'USD' ? 'USD' : 'NGN';
  const provider = options?.provider ?? (process.env.PAYMENT_MODE === 'paystack' ? 'paystack' : 'fixture');
  if (provider === 'paystack') {
    return initializePaystackFunding(ownerId, value, currency, options);
  }
  if (value < 100n || value > 100_000_000n) throw new CommerceError('INVALID_AMOUNT', 'Test funding must be between 100 and 100000000 minor units');
  const intent = await prisma.paymentIntent.create({ data: { ownerId, environment, reference: `fixture-${randomUUID()}`, amountMinor: value, currency, provider: 'fixture', providerAccount: 'fixture', paymentMode: 'fixture', orderId: options?.orderId ?? null } });
  return { id: intent.id, reference: intent.reference, amountMinor: intent.amountMinor.toString(), currency, mode: 'fixture', status: intent.status };
}

export async function verifyPaystackPayment(reference: string, options?: { customAdapter?: import('@goober/providers').PaystackAdapter; expectedOwnerId?: string }): Promise<FundingDto> {
  assertLocal();
  return verifyPaystackPaymentInternal(reference, applyFundingEvent, options);
}

export async function applyFundingEvent(event: FundingEvent): Promise<void> {
  assertLocal();
  if (event.environment !== environment || !['NGN', 'USD'].includes(event.currency) || !['payment.succeeded', 'payment.reversed', 'payment.failed'].includes(event.type) || (event.provider && !['fixture', 'paystack'].includes(event.provider)) || (event.providerAccount && !['fixture', 'sandbox'].includes(event.providerAccount))) throw new CommerceError('PAYMENT_MISMATCH', 'Payment evidence does not match this environment');
  const eventAmount = amount(event.amountMinor);
  const identity = await prisma.paymentIntent.findUnique({ where: { reference: event.reference }, select: { ownerId: true, currency: true, provider: true, providerAccount: true } });
  if (!identity) throw new CommerceError('PAYMENT_MISMATCH', 'Payment reference was not found');
  const expectedProvider = event.provider ?? identity.provider;
  const expectedAccount = event.providerAccount ?? identity.providerAccount;
  const intentCurrency = (identity.currency === 'USD' ? 'USD' : 'NGN') as Currency;
  await withSerializable(async tx => {
    const wallet = await walletLock(tx, identity.ownerId, intentCurrency);
    await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE reference=${event.reference} FOR UPDATE`;
    const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { reference: event.reference } });
    if (intent.environment !== environment || intent.currency !== event.currency || intent.amountMinor !== eventAmount || intent.provider !== expectedProvider || intent.providerAccount !== expectedAccount) throw new CommerceError('PAYMENT_MISMATCH', 'Payment amount, currency, provider or environment does not match');
    if (event.type === 'payment.failed') {
      if (intent.creditedMinor === 0n && intent.status === 'PENDING') await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', processorTransactionId: event.processorTransactionId ?? intent.processorTransactionId, failureReason: 'payment-failed' } });
      await markInbox(tx, event.inboxId);
      return;
    }
    const pendingReversalId = `pending-reverse-fund:${intent.id}`;
    const pendingReversal = intent.status === 'REVERSAL_PENDING' || !!await tx.auditEvent.findUnique({ where: { operationId: pendingReversalId }, select: { id: true } });
    if (event.type === 'payment.reversed' && intent.creditedMinor === 0n) {
      await tx.auditEvent.createMany({ data: [{ environment, action: 'PAYMENT_REVERSAL_PENDING', aggregateId: intent.id, operationId: pendingReversalId, reason: 'Verified fixture reversal arrived before original funding evidence', metadata: { amountMinor: eventAmount.toString(), currency: intentCurrency, awaitingOriginalCredit: true } }], skipDuplicates: true });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'REVERSAL_PENDING' } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { frozen: true, freezeReason: wallet.frozen ? wallet.freezeReason : 'Verified funding reversal awaits original payment reconciliation' } });
      await markInbox(tx, event.inboxId);
      return;
    }
    const { available } = await customerAccounts(tx, intent.ownerId, intentCurrency);
    const clearingPurpose = intent.provider === 'paystack' ? 'PAYMENT_CLEARING_PAYSTACK' : 'PAYMENT_CLEARING_FIXTURE';
    const clearing = await account(tx, null, clearingPurpose, intentCurrency, 'DEBIT');
    let availableMinor = wallet.availableMinor;
    if (event.type === 'payment.succeeded' && intent.creditedMinor === 0n) {
      await journal(tx, `fund:${intent.id}`, intentCurrency, [{ accountId: clearing.id, direction: 'DEBIT', amountMinor: eventAmount }, { accountId: available.id, direction: 'CREDIT', amountMinor: eventAmount }], { kind: intent.provider === 'paystack' ? 'verified-paystack-funding' : 'verified-fixture-funding', paymentId: intent.id, currency: intentCurrency });
      await tx.wallet.update({ where: { id: wallet.id }, data: { availableMinor: { increment: eventAmount } } });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { creditedMinor: eventAmount, status: 'CREDITED', processorTransactionId: event.processorTransactionId ?? intent.processorTransactionId } });
      if (intent.orderId) await tx.order.updateMany({ where: { id: intent.orderId, ownerId: intent.ownerId, paymentReference: null }, data: { paymentReference: intent.reference } });
      availableMinor += eventAmount;
    }
    if ((event.type === 'payment.reversed' || pendingReversal) && intent.reversedMinor === 0n) {
      const recoverable = availableMinor < eventAmount ? availableMinor : eventAmount;
      const debt = eventAmount - recoverable;
      const receivable = await account(tx, intent.ownerId, 'CUSTOMER_RECEIVABLE', intentCurrency, 'DEBIT');
      const original = await tx.journal.findUniqueOrThrow({ where: { environment_operationId: { environment, operationId: `fund:${intent.id}` } } });
      await journal(tx, `reverse-fund:${intent.id}`, intentCurrency, [{ accountId: available.id, direction: 'DEBIT', amountMinor: recoverable }, { accountId: receivable.id, direction: 'DEBIT', amountMinor: debt }, { accountId: clearing.id, direction: 'CREDIT', amountMinor: eventAmount }], { kind: 'funding-reversal', paymentId: intent.id, receivableMinor: debt.toString(), currency: intentCurrency }, original.id);
      await tx.wallet.update({ where: { id: wallet.id }, data: { availableMinor: { decrement: recoverable }, ...(debt > 0n ? { frozen: true, freezeReason: 'Unresolved reversed funding obligation' } : pendingReversal ? { frozen: true, freezeReason: wallet.freezeReason === 'Verified funding reversal awaits original payment reconciliation' ? 'Funding reversal reconciled; operations review is required before unfreezing' : wallet.freezeReason ?? 'Funding reversal reconciled; operations review is required before unfreezing' } : {}) } });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { reversedMinor: eventAmount, receivableMinor: debt, status: debt > 0n ? 'DISPUTED' : 'REVERSED' } });
      await tx.auditEvent.create({ data: { environment, action: 'PAYMENT_REVERSED', aggregateId: intent.id, operationId: `reverse-fund:${intent.id}`, reason: 'Verified fixture payment reversal', metadata: { receivableMinor: debt.toString(), currency: intentCurrency } } });
    }
    await markInbox(tx, event.inboxId);
  });
  if (event.type === 'payment.succeeded' && event.reference.startsWith('paystack-chk-')) {
    const quoteId = event.reference.slice('paystack-chk-'.length);
    const currentIntent = await prisma.paymentIntent.findUnique({ where: { reference: event.reference } });
    if (currentIntent && currentIntent.status === 'CREDITED' && !currentIntent.orderId) {
      await prisma.quote.updateMany({
        where: { id: quoteId, ownerId: currentIntent.ownerId, acceptedAt: null },
        data: { expiresAt: new Date(Date.now() + 120_000) },
      });
      const digest = createHash('sha256').update(`auto-order:${event.reference}`).digest('hex');
      const autoKey = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      const created = await createOrder(currentIntent.ownerId, quoteId, autoKey, { currency: intentCurrency, paymentReference: event.reference });
      await prisma.paymentIntent.update({ where: { id: currentIntent.id }, data: { orderId: created.id } });
    }
  }
}

export async function checkoutDirect(
  ownerId: string,
  input: { productId: string; quantity?: number; currency?: Currency; paymentMethod?: 'paystack' | 'wallet'; callbackUrl?: string },
  idempotencyKey: string,
): Promise<import('@goober/contracts').DirectCheckoutDto> {
  assertLocal();
  operation(idempotencyKey);
  const currency: Currency = input.currency === 'USD' ? 'USD' : 'NGN';
  const paymentMethod = input.paymentMethod ?? 'paystack';
  const quote = await createQuote(ownerId, input.productId, input.quantity ?? 1, currency);
  if (paymentMethod === 'wallet') {
    const order = await createOrder(ownerId, quote.id, idempotencyKey, { currency });
    return { paymentMethod: 'wallet', currency, order };
  }
  const quoteMinor = BigInt(quote.priceMinor);
  const minMinor = currency === 'NGN' ? 10000n : 100n;
  const chargeMinor = quoteMinor < minMinor ? minMinor : quoteMinor;
  const paystack = await createFundingIntent(ownerId, chargeMinor.toString(), {
    currency,
    provider: 'paystack',
    customReference: `paystack-chk-${quote.id}`,
    callbackUrl: input.callbackUrl,
  });
  return {
    paymentMethod: 'paystack',
    currency,
    paystack,
  };
}

async function openReview(tx: Transaction, order: Order, operationId: string, reason: string) {
  await tx.review.createMany({ data: [{ orderId: order.id, environment, reason, evidence: 'Normalized supplier outcome or contradiction; no secret payload', operationId: `review:${order.id}:${operationId}` }], skipDuplicates: true });
  return tx.order.update({ where: { id: order.id }, data: { ...(order.fulfillment === 'DELIVERED' || order.fulfillment === 'FAILED' ? {} : { fulfillment: 'NEEDS_REVIEW' }), reviewReason: reason, version: { increment: 1 } }, include: { product: true } });
}

async function supplierExpense(tx: Transaction, order: Order & { quote: { supplierMinor: bigint; supplierCurrency: string; apiContractVersion: string } }, value: bigint, currency: string) {
  if (value === 0n) return;
  const asset = await account(tx, null, `SUPPLIER_PREPAYMENT_${order.provider}_FIXTURE`, currency, 'DEBIT');
  const equity = await account(tx, null, `SYNTHETIC_TREASURY_${order.provider}`, currency);
  const openingId = `fixture-treasury:${order.provider}:${currency}`;
  if (!await tx.journal.findUnique({ where: { environment_operationId: { environment, operationId: openingId } } })) {
    const syntheticOpening = 1_000_000_000_000n;
    await journal(tx, openingId, currency, [{ accountId: asset.id, direction: 'DEBIT', amountMinor: syntheticOpening }, { accountId: equity.id, direction: 'CREDIT', amountMinor: syntheticOpening }], { kind: 'synthetic-fixture-treasury-opening', provider: order.provider, apiContractVersion: order.quote.apiContractVersion, noRealFunds: true });
  }
  const expense = await account(tx, null, `SUPPLIER_COST_${order.provider}`, currency, 'DEBIT');
  await journal(tx, `supplier-cost:${order.id}`, currency, [{ accountId: expense.id, direction: 'DEBIT', amountMinor: value }, { accountId: asset.id, direction: 'CREDIT', amountMinor: value }], { kind: 'supplier-cost', apiContractVersion: order.quote.apiContractVersion, orderId: order.id, provider: order.provider, acceptedSupplierMinor: order.quote.supplierMinor.toString(), actualSupplierMinor: value.toString(), mode: 'fixture' });
}

async function finish(tx: Transaction, wallet: Wallet, order: Awaited<ReturnType<typeof orderLock>>['order'], outcome: CommerceOutcome, operationId: string) {
  if (outcome.status === 'delivered' && order.fulfillment === 'DELIVERED' || outcome.status === 'failed' && order.fulfillment === 'FAILED') return order;
  if (order.fulfillment === 'DELIVERED' || order.fulfillment === 'FAILED') {
    if (outcome.status === 'queued' || outcome.status === 'unknown') return order;
    return openReview(tx, order, operationId, 'Contradictory supplier final outcome requires operations review');
  }
  if (outcome.status === 'unknown') return openReview(tx, order, operationId, 'Supplier purchase outcome is uncertain; purchasing credit remains held');
  if (outcome.status === 'queued') return tx.order.update({ where: { id: order.id }, data: { fulfillment: 'QUEUED', version: { increment: 1 } }, include: { product: true } });
  const orderCurrency = (order.customerCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  const remaining = order.reservedMinor - order.capturedMinor - order.releasedMinor;
  const { available, reserved } = await customerAccounts(tx, order.ownerId, orderCurrency);
  if (outcome.status === 'failed') {
    if (remaining > 0n) {
      await journal(tx, `release:${order.id}`, orderCurrency, [{ accountId: reserved.id, direction: 'DEBIT', amountMinor: remaining }, { accountId: available.id, direction: 'CREDIT', amountMinor: remaining }], { kind: 'confirmed-failure-release', orderId: order.id, currency: orderCurrency });
      await tx.wallet.update({ where: { id: wallet.id }, data: { availableMinor: { increment: remaining }, reservedMinor: { decrement: remaining } } });
      await tx.product.update({ where: { id: order.productId }, data: { stock: { increment: 1 } } });
    }
    return tx.order.update({ where: { id: order.id }, data: { fulfillment: 'FAILED', moneyStatus: 'RELEASED', releasedMinor: { increment: remaining }, reviewReason: null, version: { increment: 1 } }, include: { product: true } });
  }
  if (!outcome.products || outcome.products.length !== 1 || outcome.products.some(value => typeof value !== 'string' || value.length < 1 || value.length > 4096)) return openReview(tx, order, operationId, 'Supplier delivery did not match the approved product contract');
  if (outcome.supplierCurrency && outcome.supplierCurrency !== order.quote.supplierCurrency) return openReview(tx, order, operationId, 'Supplier charge currency did not match the accepted supplier snapshot');
  const supplierMinor = outcome.supplierMinor === undefined ? order.quote.supplierMinor : amount(outcome.supplierMinor, true);
  if (remaining !== order.reservedMinor) return openReview(tx, order, operationId, 'Delivery requires reconciliation of previously applied financial outcomes');
  const protectedDelivery = seal({ products: outcome.products }, { orderId: order.id, provider: order.provider, environment });
  await tx.delivery.create({ data: { orderId: order.id, provider: order.provider, environment, ...protectedDelivery } });
  const revenue = await account(tx, null, 'SALES_REVENUE', orderCurrency);
  await journal(tx, `capture:${order.id}`, orderCurrency, [{ accountId: reserved.id, direction: 'DEBIT', amountMinor: remaining }, { accountId: revenue.id, direction: 'CREDIT', amountMinor: remaining }], { kind: 'sale-capture', orderId: order.id, currency: orderCurrency });
  await supplierExpense(tx, order, supplierMinor, order.quote.supplierCurrency);
  await tx.wallet.update({ where: { id: wallet.id }, data: { reservedMinor: { decrement: remaining } } });
  return tx.order.update({ where: { id: order.id }, data: { fulfillment: 'DELIVERED', moneyStatus: 'CAPTURED', capturedMinor: { increment: remaining }, reviewReason: supplierMinor !== order.quote.supplierMinor ? 'Supplier charge differs from accepted supplier cost; merchant absorbs local fixture discrepancy' : null, version: { increment: 1 } }, include: { product: true } });
}

export async function completeOrder(orderId: string, outcome: CommerceOutcome, operationId: string): Promise<OrderDto> {
  assertLocal(); operation(operationId);
  if (!['delivered', 'failed', 'queued', 'unknown'].includes(outcome.status)) throw new CommerceError('INVALID_OUTCOME', 'Supplier outcome is invalid');
  return withSerializable(async tx => {
    const { wallet, order } = await orderLock(tx, orderId);
    if (order.environment !== environment || order.providerMode !== 'fixture' || !['fixture', 'paystack', 'sandbox'].includes(order.paymentMode)) throw new CommerceError('MODE_DISABLED', 'Order mode is not enabled', 409);
    const result = await finish(tx, wallet, order, outcome, operationId);
    await markInbox(tx, outcome.inboxId);
    return orderDto(result);
  });
}

async function refund(tx: Transaction, wallet: Wallet, order: Order & { product: Product }, value: bigint, operationId: string) {
  const orderCurrency = (order.paymentCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  const economicId = `refund:${order.id}:${operationId}`;
  const replay = await tx.journal.findUnique({ where: { environment_operationId: { environment, operationId: economicId } } });
  if (replay) {
    if ((replay.metadata as { amountMinor?: string }).amountMinor !== value.toString()) throw new CommerceError('IDEMPOTENCY_CONFLICT', 'Refund operation was used for a different amount', 409);
    return order;
  }
  if (value > order.capturedMinor - order.refundedMinor) throw new CommerceError('REFUND_LIMIT', 'Refund exceeds the captured refundable purchasing credit', 409);
  const { available } = await customerAccounts(tx, order.ownerId, orderCurrency);
  const returns = await account(tx, null, 'SALES_RETURNS', orderCurrency, 'DEBIT');
  const original = await tx.journal.findUniqueOrThrow({ where: { environment_operationId: { environment, operationId: `capture:${order.id}` } } });
  await journal(tx, economicId, orderCurrency, [{ accountId: returns.id, direction: 'DEBIT', amountMinor: value }, { accountId: available.id, direction: 'CREDIT', amountMinor: value }], { kind: 'goober-purchasing-credit-refund', orderId: order.id, amountMinor: value.toString(), currency: orderCurrency, exchangeRateSnapshot: order.exchangeRate }, original.id);
  await tx.wallet.update({ where: { id: wallet.id }, data: { availableMinor: { increment: value } } });
  const refundedMinor = order.refundedMinor + value;
  return tx.order.update({ where: { id: order.id }, data: { refundedMinor, moneyStatus: refundedMinor === order.capturedMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED', version: { increment: 1 } }, include: { product: true } });
}
export async function refundOrder(orderId: string, amountMinor: string, operationId: string): Promise<OrderDto> {
  assertLocal(); operation(operationId); const value = amount(amountMinor);
  return withSerializable(async tx => { const { wallet, order } = await orderLock(tx, orderId); return orderDto(await refund(tx, wallet, order, value, operationId)); });
}

export async function resolveReview(actorId: string, orderId: string, input: ReviewResolution): Promise<OrderDto> {
  assertLocal(); operation(input.operationId);
  if (!Number.isSafeInteger(input.version) || input.version < 0 || typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000 || !['delivered', 'failed', 'merchant-loss'].includes(input.resolution)) throw new CommerceError('INVALID_REVIEW', 'Provide current version, explicit resolution and review evidence');
  return withSerializable(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (actor?.role !== 'ADMIN') throw new CommerceError('FORBIDDEN', 'Operations role is required', 403);
    const { wallet, order } = await orderLock(tx, orderId);
    const auditId = `resolve:${input.operationId}`;
    const requestHash = hash({ orderId, ...input });
    const replay = await tx.auditEvent.findUnique({ where: { operationId: auditId } });
    if (replay) {
      if (replay.aggregateId !== orderId || (replay.metadata as { requestHash?: string }).requestHash !== requestHash) throw new CommerceError('IDEMPOTENCY_CONFLICT', 'Review operation was used for a different request', 409);
      return orderDto(order);
    }
    if (order.version !== input.version) throw new CommerceError('VERSION_CONFLICT', 'Order changed; refresh before resolving', 409);
    if (order.providerMode !== 'fixture' || order.paymentMode !== 'fixture') throw new CommerceError('REVIEW_EVIDENCE_REQUIRED', 'External supplier outcomes require verified reconciliation evidence', 409);
    let result: Order & { product: Product };
    if (input.resolution === 'merchant-loss') {
      const orderCurrency = (order.customerCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
      const held = order.reservedMinor - order.capturedMinor - order.releasedMinor;
      if (held > 0n) {
        const { available, reserved } = await customerAccounts(tx, order.ownerId, orderCurrency);
        await journal(tx, `merchant-loss:${order.id}`, orderCurrency, [{ accountId: reserved.id, direction: 'DEBIT', amountMinor: held }, { accountId: available.id, direction: 'CREDIT', amountMinor: held }], { kind: 'explicit-merchant-loss-credit-release', orderId, currency: orderCurrency, evidence: 'Owner-authorized fixture operations decision; supplier outcome remains uncertain' });
        await tx.wallet.update({ where: { id: wallet.id }, data: { availableMinor: { increment: held }, reservedMinor: { decrement: held } } });
        result = await tx.order.update({ where: { id: orderId }, data: { releasedMinor: { increment: held }, moneyStatus: 'RELEASED', fulfillment: 'NEEDS_REVIEW', reviewReason: 'Merchant-funded credit resolution; supplier outcome remains uncertain and purchase must not repeat', version: { increment: 1 } }, include: { product: true } });
      } else if (order.capturedMinor > order.refundedMinor) result = await refund(tx, wallet, order, order.capturedMinor - order.refundedMinor, input.operationId);
      else throw new CommerceError('NO_REFUNDABLE_AMOUNT', 'No held or refundable purchasing credit remains', 409);
    } else {
      result = await finish(tx, wallet, order, { status: input.resolution, products: input.delivery }, input.operationId);
      if (result.fulfillment !== (input.resolution === 'delivered' ? 'DELIVERED' : 'FAILED')) throw new CommerceError('REVIEW_EVIDENCE_REQUIRED', 'Resolution did not establish a consistent final outcome', 409);
      if (result.reviewReason !== null) result = await tx.order.update({ where: { id: orderId }, data: { reviewReason: null, version: { increment: 1 } }, include: { product: true } });
    }
    await tx.review.updateMany({ where: { orderId, status: 'OPEN' }, data: { status: input.resolution === 'merchant-loss' ? 'LOSS_DECISION' : 'RESOLVED', actorId, resolvedAt: new Date(), version: { increment: 1 } } });
    await tx.auditEvent.create({ data: { actorId, environment, action: `ORDER_REVIEW_${input.resolution.toUpperCase()}`, aggregateId: orderId, operationId: auditId, reason: input.reason, metadata: { requestHash, purchasingCreditOnly: true, noSupplierRetry: true } } });
    return orderDto(result);
  });
}
