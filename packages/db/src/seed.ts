import { prisma, FIXTURE_PROVIDER_CONTRACT_VERSION } from './index.js';
const database = new URL(process.env.DATABASE_URL!);
if (!['local', 'test'].includes(process.env.APP_ENV ?? '') || process.env.DATA_ENV !== 'test' || !['127.0.0.1', 'localhost', 'postgres'].includes(database.hostname) || !['fixture', 'paystack'].includes(process.env.PAYMENT_MODE ?? '')) {
  throw new Error('Seed only accepts explicitly isolated local/test databases');
}
// Selling price in supplierCurrency = supplierMinor * 1.15 (half-up minor unit rounding)
const markup15 = (minor: bigint) => minor + (minor * 15n + 50n) / 100n;
const products = [
  { id: 'fixture-studio', slug: 'studio-access', name: 'Studio toolkit', description: 'A synthetic creative toolkit for the local purchase journey.', category: 'Creative tools', provider: 'PAI', fixtureScenario: 'delivered', supplierMinor: 100n, supplierCurrency: 'USD', retailMinor: markup15(100n), pricingPolicy: 'markup-15' },
  { id: 'fixture-failure', slug: 'failure-recovery', name: 'Failure recovery demo', description: 'A synthetic confirmed supplier failure demonstrates automatic reservation release.', category: 'Recovery lab', provider: 'PAI', fixtureScenario: 'failed', supplierMinor: 50n, supplierCurrency: 'USD', retailMinor: markup15(50n), pricingPolicy: 'markup-15' },
  { id: 'fixture-queued', slug: 'queued-delivery', name: 'Queued toolkit', description: 'A synthetic queued supplier order demonstrates persistent reconciliation.', category: 'Recovery lab', provider: 'PAI', fixtureScenario: 'queued', supplierMinor: 70n, supplierCurrency: 'USD', retailMinor: markup15(70n), pricingPolicy: 'markup-15' },
  { id: 'fixture-graml-review', slug: 'dispatch-review', name: 'Approved account fixture', description: 'An artificial credential product demonstrates an uncertain non-idempotent supplier dispatch.', category: 'Recovery lab', provider: 'GRAML', fixtureScenario: 'unknown', supplierMinor: 180000n, supplierCurrency: 'NGN', retailMinor: markup15(180000n), pricingPolicy: 'markup-15' },
  { id: 'pai-workspace-pro', slug: 'workspace-pro', name: 'Workspace Pro plan', description: 'Professional productivity workspace access sourced in USD with fixed 15% marketplace markup.', category: 'Productivity', provider: 'PAI', fixtureScenario: 'delivered', supplierMinor: 1000n, supplierCurrency: 'USD', retailMinor: markup15(1000n), pricingPolicy: 'markup-15' },
  { id: 'graml-social-suite', slug: 'creator-social-suite', name: 'Creator social suite', description: 'Dedicated social publishing credential package sourced in NGN with fixed 15% marketplace markup.', category: 'Publishing', provider: 'GRAML', fixtureScenario: 'delivered', supplierMinor: 1000000n, supplierCurrency: 'NGN', retailMinor: markup15(1000000n), pricingPolicy: 'markup-15' },
];
try {
await prisma.exchangeRate.upsert({
  where: { environment_baseCurrency_quoteCurrency: { environment: 'test', baseCurrency: 'USD', quoteCurrency: 'NGN' } },
  create: { environment: 'test', baseCurrency: 'USD', quoteCurrency: 'NGN', rate: '1500.00', source: 'seeded-default', isManualOverride: false, fetchedAt: new Date() },
  update: { fetchedAt: new Date() },
});
for (const item of products) {
  const data = { ...item, apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, providerProductId: item.id, providerAccount: 'fixture', providerMode: 'fixture', environment: 'test', approved: true, published: true, approvalEvidence: 'Synthetic local fixture approved for engineering tests only; confers no real platform entitlement', entitlement: 'Synthetic local test entitlement. No real account or subscription is sold.', terms: 'Fixture only. Test balance has no cash value. A confirmed failure releases held test purchasing credit.', deliveryType: item.provider === 'PAI' ? 'code' : 'credential', region: 'Synthetic / local test', observedAt: new Date(), stock: 100, catalogCompleteness: 'fixture-complete', inputType: 'quantity' };
  await prisma.product.upsert({ where: { id: item.id }, create: data, update: { retailMinor: item.retailMinor, supplierMinor: item.supplierMinor, supplierCurrency: item.supplierCurrency, pricingPolicy: item.pricingPolicy, observedAt: new Date() } });
}
await prisma.supplierBalanceObservation.createMany({ data: [
  { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, provider: 'PAI', providerAccount: 'fixture', environment: 'test', currency: 'USD', mode: 'fixture', amountMinor: 1000000n, source: 'deterministic-fixture', evidence: 'Synthetic supplier balance; no external verification' },
  { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, provider: 'GRAML', providerAccount: 'fixture', environment: 'test', currency: 'NGN', mode: 'fixture', amountMinor: 100000000n, source: 'deterministic-fixture', evidence: 'Synthetic supplier balance; no external verification' },
] });
console.log('Seeded approved synthetic products, initial exchange rate, and separately labeled supplier balance observations.');
} finally { await prisma.$disconnect(); }

