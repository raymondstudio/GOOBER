import { prisma, FIXTURE_PROVIDER_CONTRACT_VERSION } from './index.js';
const database = new URL(process.env.DATABASE_URL!);
if (!['local', 'test'].includes(process.env.APP_ENV ?? '') || process.env.DATA_ENV !== 'test' || !['127.0.0.1', 'localhost', 'postgres'].includes(database.hostname) || process.env.PAYMENT_MODE !== 'fixture') {
  throw new Error('Seed only accepts explicitly isolated local/test fixture databases');
}
const products = [
  { id: 'fixture-studio', slug: 'studio-access', name: 'Studio toolkit', description: 'A synthetic premium creative toolkit for the local purchase journey.', category: 'Creative tools', provider: 'PAI', fixtureScenario: 'delivered', retailMinor: 450000n, supplierMinor: 100n, supplierCurrency: 'USD' },
  { id: 'fixture-failure', slug: 'failure-recovery', name: 'Failure recovery demo', description: 'A synthetic confirmed supplier failure demonstrates automatic reservation release.', category: 'Recovery lab', provider: 'PAI', fixtureScenario: 'failed', retailMinor: 120000n, supplierMinor: 50n, supplierCurrency: 'USD' },
  { id: 'fixture-queued', slug: 'queued-delivery', name: 'Queued toolkit', description: 'A synthetic queued supplier order demonstrates persistent reconciliation.', category: 'Recovery lab', provider: 'PAI', fixtureScenario: 'queued', retailMinor: 200000n, supplierMinor: 70n, supplierCurrency: 'USD' },
  { id: 'fixture-graml-review', slug: 'dispatch-review', name: 'Approved account fixture', description: 'An artificial credential product demonstrates an uncertain non-idempotent supplier dispatch.', category: 'Recovery lab', provider: 'GRAML', fixtureScenario: 'unknown', retailMinor: 300000n, supplierMinor: 180000n, supplierCurrency: 'NGN' },
];
try {
for (const item of products) {
  const data = { ...item, apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, providerProductId: item.id, providerAccount: 'fixture', providerMode: 'fixture', environment: 'test', approved: true, published: true, approvalEvidence: 'Synthetic local fixture approved for engineering tests only; confers no real platform entitlement', entitlement: 'Synthetic local test entitlement. No real account or subscription is sold.', terms: 'Fixture only. Test balance has no cash value. A confirmed failure releases held test purchasing credit.', deliveryType: item.provider === 'PAI' ? 'code' : 'credential', region: 'Synthetic / local test', observedAt: new Date(), stock: 100, catalogCompleteness: 'fixture-complete', inputType: 'quantity' };
  await prisma.product.upsert({ where: { id: item.id }, create: data, update: { observedAt: new Date() } });
}
await prisma.supplierBalanceObservation.createMany({ data: [
  { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, provider: 'PAI', providerAccount: 'fixture', environment: 'test', currency: 'USD', mode: 'fixture', amountMinor: 1000000n, source: 'deterministic-fixture', evidence: 'Synthetic supplier balance; no external verification' },
  { apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION, provider: 'GRAML', providerAccount: 'fixture', environment: 'test', currency: 'NGN', mode: 'fixture', amountMinor: 100000000n, source: 'deterministic-fixture', evidence: 'Synthetic supplier balance; no external verification' },
] });
console.log('Seeded approved synthetic products and separately labeled supplier balance observations.');
} finally { await prisma.$disconnect(); }
