import { formatMoney, type Currency, type DualPriceBreakdown } from '@goober/contracts';
import { MAX_MINOR } from './money.js';

export const MARKUP_PERCENT = 15n;

export interface MarkupCalculation {
  supplierMinor: bigint;
  supplierCurrency: Currency;
  markupPercent: 15;
  markupMinor: bigint;
  sellingMinor: bigint;
}

export interface DualPricingResult extends MarkupCalculation {
  targetCurrency: Currency;
  payableMinor: bigint;
  exchangeRate: string;
  exchangeRateSource: string;
  exchangeRateUpdatedAt: string;
  prices: DualPriceBreakdown;
}

/**
 * Step 1-3 of GOOBER pricing architecture:
 * Retrieve actual supplier base price in supplier's original currency and apply
 * exactly 15% markup (Selling price = Supplier base price × 1.15) with half-up
 * minor-unit rounding. Never apply a second markup after currency conversion.
 */
export function applyMarkup15(supplierMinor: bigint, supplierCurrency: Currency): MarkupCalculation {
  if (supplierMinor < 0n || supplierMinor > MAX_MINOR) {
    throw new Error('Supplier base price is outside supported minor-unit bounds');
  }
  if (supplierCurrency !== 'USD' && supplierCurrency !== 'NGN') {
    throw new Error('Unsupported supplier currency');
  }
  const markupMinor = (supplierMinor * MARKUP_PERCENT + 50n) / 100n;
  const sellingMinor = supplierMinor + markupMinor;
  if (sellingMinor > MAX_MINOR) {
    throw new Error('Marked-up selling price exceeds supported minor-unit bounds');
  }
  return {
    supplierMinor,
    supplierCurrency,
    markupPercent: 15,
    markupMinor,
    sellingMinor,
  };
}

export function parseExchangeRate(rate: string): {
  numerator: bigint;
  denominator: bigint;
  normalized: string;
  inverseRate: string;
} {
  if (typeof rate !== 'string' || !/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,12})?$/.test(rate)) {
    throw new Error('Invalid exchange rate format');
  }
  const [whole, fraction = ''] = rate.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) {
    throw new Error('Exchange rate must be positive');
  }
  // Compute 8-decimal inverse rate (1 NGN in USD) using integer scaling
  const scale = 100_000_000n;
  const invScaled = (denominator * scale + numerator / 2n) / numerator;
  const invWhole = invScaled / scale;
  const invFrac = (invScaled % scale).toString().padStart(8, '0');
  return {
    numerator,
    denominator,
    normalized: rate,
    inverseRate: `${invWhole}.${invFrac}`,
  };
}

/**
 * Step 4-6 of GOOBER pricing architecture:
 * Convert the 15%-marked-up selling price into the target display/checkout currency
 * using the approved USD/NGN exchange rate and documented half-up minor-unit rounding.
 */
export function convertSellingMinor(
  sellingMinor: bigint,
  fromCurrency: Currency,
  toCurrency: Currency,
  usdToNgnRate: string,
): { payableMinor: bigint; appliedRate: string } {
  if (sellingMinor < 0n || sellingMinor > MAX_MINOR) {
    throw new Error('Selling price is outside supported minor-unit bounds');
  }
  const parsed = parseExchangeRate(usdToNgnRate);
  if (fromCurrency === toCurrency) {
    return { payableMinor: sellingMinor, appliedRate: '1' };
  }
  if (fromCurrency === 'USD' && toCurrency === 'NGN') {
    // Convert USD cents to NGN kobo: sellingMinor (cents) * rate (NGN/USD) = kobo
    const raw = (sellingMinor * parsed.numerator + parsed.denominator / 2n) / parsed.denominator;
    const payableMinor = sellingMinor > 0n && raw === 0n ? 1n : raw;
    if (payableMinor > MAX_MINOR) throw new Error('Converted NGN amount exceeds bounds');
    return { payableMinor, appliedRate: parsed.normalized };
  }
  if (fromCurrency === 'NGN' && toCurrency === 'USD') {
    // Convert NGN kobo to USD cents: sellingMinor (kobo) / rate (NGN/USD) = cents
    const raw = (sellingMinor * parsed.denominator + parsed.numerator / 2n) / parsed.numerator;
    const payableMinor = sellingMinor > 0n && raw === 0n ? 1n : raw;
    if (payableMinor > MAX_MINOR) throw new Error('Converted USD amount exceeds bounds');
    return { payableMinor, appliedRate: parsed.normalized };
  }
  throw new Error('Unsupported currency conversion pair');
}

export function calculateDualCurrencyPricing(
  product: { supplierMinor: bigint; supplierCurrency: string },
  targetCurrency: Currency,
  rateSnapshot: { rate: string; source: string; updatedAt: Date },
): DualPricingResult {
  const supplierCurrency = (product.supplierCurrency === 'USD' ? 'USD' : 'NGN') as Currency;
  const base = applyMarkup15(product.supplierMinor, supplierCurrency);
  const ngnConv = convertSellingMinor(base.sellingMinor, supplierCurrency, 'NGN', rateSnapshot.rate);
  const usdConv = convertSellingMinor(base.sellingMinor, supplierCurrency, 'USD', rateSnapshot.rate);
  const selected = targetCurrency === 'USD' ? usdConv : ngnConv;
  const ngnMinorStr = ngnConv.payableMinor.toString();
  const usdMinorStr = usdConv.payableMinor.toString();
  return {
    ...base,
    targetCurrency,
    payableMinor: selected.payableMinor,
    exchangeRate: selected.appliedRate,
    exchangeRateSource: supplierCurrency === targetCurrency ? 'par' : rateSnapshot.source,
    exchangeRateUpdatedAt: rateSnapshot.updatedAt.toISOString(),
    prices: {
      NGN: { amountMinor: ngnMinorStr, currency: 'NGN', formatted: formatMoney(ngnMinorStr, 'NGN') },
      USD: { amountMinor: usdMinorStr, currency: 'USD', formatted: formatMoney(usdMinorStr, 'USD') },
    },
  };
}
