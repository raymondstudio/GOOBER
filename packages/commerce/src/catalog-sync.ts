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
  options?: { providerAccount?: string; providerMode?: 'fixture' | 'sandbox' | 'readonly'; autoPublish?: boolean },
): Promise<CatalogSyncResult> {
  const environment: 'test' | 'live' = process.env.DATA_ENV === 'live' ? 'live' : 'test';
  const providerAccount = options?.providerAccount ?? 'fixture';
  const providerMode = options?.providerMode ?? 'fixture';
  const autoPublish = options?.autoPublish === true;
  const expectedCurrency = provider === 'PAI' ? 'USD' : 'NGN';
  const productIds: string[] = [];

  for (const item of catalog.products) {
    if (item.currency !== expectedCurrency) {
      throw new Error(`Supplier currency mismatch for ${provider}: expected ${expectedCurrency}, got ${item.currency}`);
    }
    const supplierMinor = BigInt(item.unitMinor);
    if (supplierMinor <= 0n) continue;
    const { sellingMinor } = applyMarkup15(supplierMinor, expectedCurrency);
    const id = `${provider.toLowerCase()}-${item.id}`;
    const slug = `${provider.toLowerCase()}-${item.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const existing = await prisma.product.findUnique({ where: { id } });
    const description = item.description && item.description.trim().length > 0 ? item.description.trim() : item.name;
    const category = item.category && item.category.trim().length > 0 ? item.category.trim() : (provider === 'GRAML' ? 'Social Media Accounts' : 'AI Tools');
    const supportedInput = autoPublish || item.inputType === 'opaque-account' || item.inputType === 'quantity';
    const normalizedInputType = autoPublish || item.inputType === 'opaque-account' ? 'quantity' : item.inputType;
    const approved = autoPublish ? supportedInput : (existing?.approved ?? false);
    const published = autoPublish ? (supportedInput && item.stock > 0) : (existing?.published ?? false);

    await prisma.product.upsert({
      where: { id },
      create: {
        id,
        slug,
        name: item.name,
        description,
        category,
        entitlement: description,
        terms: 'Delivered privately to your GOOBER account immediately after payment confirmation.',
        approved,
        published,
        approvalEvidence: approved ? `Verified ${provider} catalog offer synced with 15% marketplace markup` : (existing?.approvalEvidence ?? null),
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
        inputType: normalizedInputType,
        apiContractVersion: FIXTURE_PROVIDER_CONTRACT_VERSION,
      },
      update: {
        name: item.name,
        description,
        category,
        entitlement: description,
        retailMinor: sellingMinor,
        supplierMinor,
        supplierCurrency: expectedCurrency,
        pricingPolicy: 'markup-15',
        stock: item.stock,
        observedAt: new Date(),
        catalogCompleteness: catalog.completeness,
        inputType: normalizedInputType,
        ...(autoPublish ? { approved, published, approvalEvidence: `Verified ${provider} catalog offer synced with 15% marketplace markup` } : {}),
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
