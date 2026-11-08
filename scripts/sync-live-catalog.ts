import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@goober/db';
import { losslessBody, parseGramlCatalog, parsePaiCatalog, type CatalogResult } from '@goober/providers';
import { syncSupplierCatalog } from '@goober/commerce';

const SNAPSHOT_PATH = resolve(import.meta.dirname, '../packages/db/src/live-catalog-snapshot.json');

async function fetchPaiCategories(): Promise<Record<string, string>> {
  const url = process.env.PAI_DHRU_API_URL;
  const username = process.env.PAI_DHRU_USERNAME;
  const key = process.env.PAI_API_KEY;
  if (!url || !username || !key) return {};
  try {
    const body = new URLSearchParams({ username, apiaccesskey: key, action: 'serverservicelist' });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Goober/1.0' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { SUCCESS?: Array<{ LIST?: Record<string, { SERVICES?: Record<string, { SERVICEID?: string | number }> }> }> };
    const list = json.SUCCESS?.[0]?.LIST ?? {};
    const map: Record<string, string> = {};
    for (const [groupName, groupData] of Object.entries(list)) {
      const services = groupData?.SERVICES ?? {};
      for (const svc of Object.values(services)) {
        if (svc?.SERVICEID !== undefined) {
          map[String(svc.SERVICEID)] = groupName;
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchLivePaiCatalog(): Promise<CatalogResult | null> {
  const key = process.env.PAI_API_KEY;
  if (!key) return null;
  const [catMap, res] = await Promise.all([
    fetchPaiCategories(),
    fetch('https://p-ai.world/api/v1/products', {
      headers: { 'X-API-Key': key, 'User-Agent': 'Goober/1.0' },
      signal: AbortSignal.timeout(15000),
    }),
  ]);
  if (!res.ok) throw new Error(`P-AI catalog HTTP ${res.status}`);
  const raw = await res.text();
  return parsePaiCatalog(losslessBody(raw), catMap);
}

async function fetchLiveGramlCatalog(): Promise<CatalogResult | null> {
  const key = process.env.GRAML_API_KEY;
  if (!key) return null;
  const base = (process.env.GRAML_BASE_API_URL ?? 'https://gramlsocial.com/api/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/products?limit=100`, {
    headers: { 'X-API-Key': key, 'User-Agent': 'Goober/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Graml catalog HTTP ${res.status}`);
  const raw = await res.text();
  return parseGramlCatalog(losslessBody(raw));
}

async function main() {
  let paiCatalog: CatalogResult | null = null;
  let gramlCatalog: CatalogResult | null = null;
  let usedOfflineSnapshot = false;

  try {
    [paiCatalog, gramlCatalog] = await Promise.all([fetchLivePaiCatalog(), fetchLiveGramlCatalog()]);
  } catch (err) {
    console.warn('Live supplier fetch failed; falling back to local snapshot if available:', err instanceof Error ? err.message : err);
  }

  if ((!paiCatalog || !gramlCatalog) && existsSync(SNAPSHOT_PATH)) {
    const cached = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as { pai?: CatalogResult; graml?: CatalogResult };
    if (!paiCatalog && cached.pai) { paiCatalog = cached.pai; usedOfflineSnapshot = true; }
    if (!gramlCatalog && cached.graml) { gramlCatalog = cached.graml; usedOfflineSnapshot = true; }
  }

  if (paiCatalog && gramlCatalog && !usedOfflineSnapshot) {
    writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify({ updatedAt: new Date().toISOString(), pai: paiCatalog, graml: gramlCatalog }, null, 2),
      'utf8',
    );
    console.log(`Saved offline catalog snapshot to ${SNAPSHOT_PATH}`);
  }

  // Unpublish any synthetic or test-run rows so only real supplier products appear in the storefront
  await prisma.product.updateMany({
    where: {
      OR: [
        { id: { startsWith: 'fixture-' } },
        { id: { startsWith: 'commerce-product-' } },
        { id: { startsWith: 'worker-' } },
        { id: { startsWith: 'independent-' } },
        { id: { startsWith: 'contract-' } },
        { id: { in: ['pai-workspace-pro', 'graml-social-suite', 'pai-sync-pai-1', 'graml-sync-graml-1'] } },
      ],
    },
    data: { published: false },
  });

  const paiRes = paiCatalog ? await syncSupplierCatalog('PAI', paiCatalog, { autoPublish: true }) : { syncedCount: 0 };
  const gramlRes = gramlCatalog ? await syncSupplierCatalog('GRAML', gramlCatalog, { autoPublish: true }) : { syncedCount: 0 };
  const publishedCount = await prisma.product.count({ where: { published: true } });

  console.log(
    JSON.stringify(
      {
        status: 'OK',
        source: usedOfflineSnapshot ? 'offline-snapshot' : 'live-suppliers',
        paiSynced: paiRes.syncedCount,
        gramlSynced: gramlRes.syncedCount,
        publishedInStore: publishedCount,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
