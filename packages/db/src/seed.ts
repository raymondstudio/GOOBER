import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma, FIXTURE_PROVIDER_CONTRACT_VERSION } from './index.js';
const database = new URL(process.env.DATABASE_URL!);
if (!['local', 'test'].includes(process.env.APP_ENV ?? '') || process.env.DATA_ENV !== 'test' || !['127.0.0.1', 'localhost', 'postgres'].includes(database.hostname) || !['fixture', 'paystack'].includes(process.env.PAYMENT_MODE ?? '')) {
  throw new Error('Seed only accepts explicitly isolated local/test databases');
}
const snapshotPath = resolve(import.meta.dirname, 'live-catalog-snapshot.json');
const hasLiveSnapshot = process.env.APP_ENV === 'local' && existsSync(snapshotPath);
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
  const publishFixture = !hasLiveSnapshot;
  const data = { ...item, apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, providerProductId: item.id, providerAccount: 'fixture', providerMode: 'fixture', environment: 'test', approved: true, published: publishFixture, approvalEvidence: 'Synthetic local fixture approved for engineering tests only; confers no real platform entitlement', entitlement: 'Synthetic local test entitlement. No real account or subscription is sold.', terms: 'Fixture only. Test balance has no cash value. A confirmed failure releases held test purchasing credit.', deliveryType: item.provider === 'PAI' ? 'code' : 'credential', region: 'Synthetic / local test', observedAt: new Date(), stock: 100, catalogCompleteness: 'fixture-complete', inputType: 'quantity' };
  await prisma.product.upsert({ where: { id: item.id }, create: data, update: { retailMinor: item.retailMinor, supplierMinor: item.supplierMinor, supplierCurrency: item.supplierCurrency, pricingPolicy: item.pricingPolicy, published: publishFixture, observedAt: new Date() } });
}
if (hasLiveSnapshot) {
  const cached = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Record<'pai' | 'graml', { completeness: string; products: Array<{ id: string; name: string; description?: string; category?: string; unitMinor: string; stock: number }> }>;
  for (const [provider, cat] of [['PAI', cached.pai], ['GRAML', cached.graml]] as const) {
    for (const item of cat?.products ?? []) {
      const supplierMinor = BigInt(item.unitMinor);
      if (supplierMinor <= 0n) continue;
      const id = `${provider.toLowerCase()}-${item.id}`;
      const description = item.description?.trim() || item.name;
      const category = item.category?.trim() || (provider === 'GRAML' ? 'Social Media Accounts' : 'AI Tools');
      const rowData = {
        id, slug: id.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), name: item.name, description, category, entitlement: description,
        terms: 'Delivered privately to your GOOBER account immediately after payment confirmation.',
        approved: true, published: item.stock > 0, approvalEvidence: `Verified ${provider} catalog offer synced with 15% marketplace markup`,
        deliveryType: provider === 'PAI' ? 'code' : 'credential', region: 'Global', provider, providerProductId: item.id,
        providerAccount: 'fixture', providerMode: 'fixture', environment: 'test', retailMinor: markup15(supplierMinor),
        supplierMinor, supplierCurrency: provider === 'PAI' ? 'USD' : 'NGN', pricingPolicy: 'markup-15',
        stock: item.stock, observedAt: new Date(), catalogCompleteness: cat.completeness, inputType: 'quantity',
        apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION,
      };
      await prisma.product.upsert({ where: { id }, create: rowData, update: rowData });
    }
  }
}
await prisma.supplierBalanceObservation.createMany({ data: [
  { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, provider: 'PAI', providerAccount: 'fixture', environment: 'test', currency: 'USD', mode: 'fixture', amountMinor: 1000000n, source: 'deterministic-fixture', evidence: 'Synthetic supplier balance; no external verification' },
  { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, provider: 'GRAML', providerAccount: 'fixture', environment: 'test', currency: 'NGN', mode: 'fixture', amountMinor: 100000000n, source: 'deterministic-fixture', evidence: 'Synthetic supplier balance; no external verification' },
] });
console.log('Seeded approved synthetic products, initial exchange rate, and separately labeled supplier balance observations.');
} finally { await prisma.$disconnect(); }

