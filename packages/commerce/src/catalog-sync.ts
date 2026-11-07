import { prisma, FIXTURE_PROVIDER_CONTRACT_VERSION } from '@goober/db';
import type { CatalogResult, Supplier } from '@goober/providers';
import { applyMarkup15 } from './pricing.js';

export interface CatalogSyncResult {
  provider: Supplier;
  completeness: CatalogResult['completeness'];
  syncedCount: number;
  productIds: string[];
}

/**
 * Synchronizes a supplier catalog observation (P.ai USD or Graml NGN) into
 * PostgreSQL Product records, applying GOOBER's exact 15% markup in the
 * supplier's original currency without auto-publishing unapproved offers.
 */
export async function syncSupplierCatalog(
  provider: Supplier,
  catalog: CatalogResult,
  options?: { providerAccount?: string; providerMode?: 'fixture' | 'sandbox' | 'readonly' },
): Promise<CatalogSyncResult> {
  const environment = 'test';
  const providerAccount = options?.providerAccount ?? 'fixture';
  const providerMode = options?.providerMode ?? 'fixture';
  const expectedCurrency = provider === 'PAI' ? 'USD' : 'NGN';
  const productIds: string[] = [];

  for (const item of catalog.products) {
    if (item.currency !== expectedCurrency) {
      throw new Error(`Supplier currency mismatch for ${provider}: expected ${expectedCurrency}, got ${item.currency}`);
    }
    const supplierMinor = BigInt(item.unitMinor);
    const { sellingMinor } = applyMarkup15(supplierMinor, expectedCurrency);
    const id = `${provider.toLowerCase()}-${item.id}`;
    const slug = `${provider.toLowerCase()}-${item.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const existing = await prisma.product.findUnique({ where: { id } });

    await prisma.product.upsert({
      where: { id },
      create: {
        id,
        slug,
        name: item.name,
        description: `${item.name} (${provider} catalog offer).`,
        category: 'Subscriptions',
        entitlement: 'Requires explicit product approval before publication.',
        terms: 'Standard marketplace terms apply.',
        approved: existing?.approved ?? false,
        published: existing?.published ?? false,
        approvalEvidence: existing?.approvalEvidence ?? null,
        deliveryType: provider === 'PAI' ? 'code' : 'credential',
        region: 'Global',
        provider,
        providerProductId: item.id,
        providerAccount,
        environment,
        providerMode,
        retailMinor: sellingMinor,
        supplierMinor,
        supplierCurrency: expectedCurrency,
        pricingPolicy: 'markup-15',
        stock: item.stock,
        observedAt: new Date(),
        catalogCompleteness: catalog.completeness,
        inputType: item.inputType === 'opaque-account' ? 'quantity' : item.inputType,
        apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION,
      },
      update: {
        name: item.name,
        retailMinor: sellingMinor,
        supplierMinor,
        supplierCurrency: expectedCurrency,
        pricingPolicy: 'markup-15',
        stock: item.stock,
        observedAt: new Date(),
        catalogCompleteness: catalog.completeness,
        version: existing && (existing.supplierMinor !== supplierMinor || existing.retailMinor !== sellingMinor) ? { increment: 1 } : undefined,
      },
    });
    productIds.push(id);
  }

  return {
    provider,
    completeness: catalog.completeness,
    syncedCount: productIds.length,
    productIds,
  };
}
