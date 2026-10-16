-- Additive fixture-contract provenance. No financial history is rewritten.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Product" WHERE "providerMode" <> 'fixture')
     OR EXISTS (SELECT 1 FROM "Quote" WHERE "providerMode" <> 'fixture')
     OR EXISTS (SELECT 1 FROM "ProviderAttempt" WHERE "providerMode" <> 'fixture')
     OR EXISTS (SELECT 1 FROM "SupplierBalanceObservation" WHERE "mode" <> 'fixture') THEN
    RAISE EXCEPTION 'Provider contract backfill requires explicit verified labels for nonfixture records';
  END IF;
END $$;
ALTER TABLE "Product" ADD COLUMN "apiContractVersion" TEXT NOT NULL DEFAULT 'goober.fixture.m1.v1';
ALTER TABLE "Quote" ADD COLUMN "apiContractVersion" TEXT NOT NULL DEFAULT 'goober.fixture.m1.v1';
ALTER TABLE "ProviderAttempt" ADD COLUMN "apiContractVersion" TEXT NOT NULL DEFAULT 'goober.fixture.m1.v1';
ALTER TABLE "SupplierBalanceObservation" ADD COLUMN "apiContractVersion" TEXT NOT NULL DEFAULT 'goober.fixture.m1.v1';
ALTER TABLE "Product" ADD CONSTRAINT "product_contract_version_present" CHECK (length("apiContractVersion") BETWEEN 1 AND 128);
ALTER TABLE "Quote" ADD CONSTRAINT "quote_contract_version_present" CHECK (length("apiContractVersion") BETWEEN 1 AND 128);
ALTER TABLE "ProviderAttempt" ADD CONSTRAINT "attempt_contract_version_present" CHECK (length("apiContractVersion") BETWEEN 1 AND 128);
ALTER TABLE "SupplierBalanceObservation" ADD CONSTRAINT "observation_contract_version_present" CHECK (length("apiContractVersion") BETWEEN 1 AND 128);
CREATE FUNCTION guard_provider_contract_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE accepted_contract TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."apiContractVersion" IS DISTINCT FROM OLD."apiContractVersion" THEN
    RAISE EXCEPTION 'Provider attempt contract identity is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT q."apiContractVersion" INTO accepted_contract FROM "Order" o JOIN "Quote" q ON q.id=o."quoteId" WHERE o.id=NEW."orderId";
    IF NEW."apiContractVersion" IS DISTINCT FROM accepted_contract THEN
      RAISE EXCEPTION 'Provider attempt contract must match accepted quote';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_contract_identity BEFORE INSERT OR UPDATE ON "ProviderAttempt" FOR EACH ROW EXECUTE FUNCTION guard_provider_contract_identity();
