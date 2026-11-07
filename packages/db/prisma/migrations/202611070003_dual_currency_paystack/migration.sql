-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN "pricingPolicy" TEXT NOT NULL DEFAULT 'legacy-retail';
ALTER TABLE "Product" ADD CONSTRAINT product_pricing_policy_check CHECK ("pricingPolicy" IN ('legacy-retail', 'markup-15'));

-- AlterTable Quote
ALTER TABLE "Quote"
  ADD COLUMN "markupMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "sellingMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "customerCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "payableMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD CONSTRAINT quote_dual_currency_check CHECK ("markupMinor" >= 0 AND "sellingMinor" >= 0 AND "payableMinor" >= 0 AND "customerCurrency" IN ('NGN', 'USD'));

-- AlterTable Order
ALTER TABLE "Order"
  ADD COLUMN "supplierMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "supplierCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "markupMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "sellingMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "customerCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "exchangeRate" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN "exchangeRateSource" TEXT NOT NULL DEFAULT 'par',
  ADD COLUMN "exchangeRateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "payableMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "paymentCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT order_dual_currency_check CHECK ("supplierMinor" >= 0 AND "markupMinor" >= 0 AND "sellingMinor" >= 0 AND "payableMinor" >= 0 AND "supplierCurrency" IN ('NGN', 'USD') AND "customerCurrency" IN ('NGN', 'USD') AND "paymentCurrency" IN ('NGN', 'USD'));

-- AlterTable PaymentIntent
ALTER TABLE "PaymentIntent"
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "authorizationUrl" TEXT,
  ADD COLUMN "accessCode" TEXT,
  ADD COLUMN "processorTransactionId" TEXT,
  ADD COLUMN "failureReason" TEXT;

-- CreateTable ExchangeRate
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "quoteCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "rate" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'seeded-default',
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExchangeRate_currency_check" CHECK ("baseCurrency" = 'USD' AND "quoteCurrency" = 'NGN')
);

CREATE UNIQUE INDEX "ExchangeRate_environment_baseCurrency_quoteCurrency_key" ON "ExchangeRate"("environment", "baseCurrency", "quoteCurrency");

-- Expand Wallet & PaymentIntent currency constraints to NGN and USD
ALTER TABLE "Wallet" DROP CONSTRAINT "wallet_currency_check";
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_currency_check" CHECK (currency IN ('NGN', 'USD'));

ALTER TABLE "PaymentIntent" DROP CONSTRAINT "payment_money_bounds";
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "payment_money_bounds" CHECK (currency IN ('NGN', 'USD') AND "amountMinor" > 0 AND "creditedMinor" >= 0 AND "creditedMinor" <= "amountMinor" AND "reversedMinor" >= 0 AND "reversedMinor" <= "creditedMinor" AND "receivableMinor" >= 0 AND "receivableMinor" <= "reversedMinor");


-- Update wallet reconciliation functions to support both NGN and USD per-currency ledgers
CREATE OR REPLACE FUNCTION goober_assert_wallet_currency(owner_id text, data_environment text, wallet_currency text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cached "Wallet"%ROWTYPE; available numeric; reserved numeric;
BEGIN
  IF owner_id IS NULL THEN RETURN; END IF;
  SELECT * INTO cached FROM "Wallet" WHERE "ownerId"=owner_id AND environment=data_environment AND currency=wallet_currency;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM "LedgerAccount" a JOIN "Posting" p ON p."accountId"=a.id WHERE a."ownerId"=owner_id AND a.environment=data_environment AND a.currency=wallet_currency AND a.purpose IN ('CUSTOMER_AVAILABLE','CUSTOMER_RESERVED')) THEN RAISE EXCEPTION 'customer postings require wallet' USING ERRCODE='23514'; END IF;
    RETURN;
  END IF;
  SELECT coalesce(sum(CASE WHEN a.purpose='CUSTOMER_AVAILABLE' THEN CASE WHEN p.direction='CREDIT' THEN p."amountMinor"::numeric ELSE -p."amountMinor"::numeric END ELSE 0 END),0), coalesce(sum(CASE WHEN a.purpose='CUSTOMER_RESERVED' THEN CASE WHEN p.direction='CREDIT' THEN p."amountMinor"::numeric ELSE -p."amountMinor"::numeric END ELSE 0 END),0)
    INTO available,reserved FROM "LedgerAccount" a JOIN "Posting" p ON p."accountId"=a.id JOIN "Journal" j ON j.id=p."journalId" WHERE a."ownerId"=owner_id AND a.environment=data_environment AND a.currency=wallet_currency AND j."postedAt" IS NOT NULL;
  IF available<>cached."availableMinor" OR reserved<>cached."reservedMinor" THEN RAISE EXCEPTION 'wallet must reconcile to immutable ledger' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION goober_assert_wallet(owner_id text, data_environment text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM goober_assert_wallet_currency(owner_id, data_environment, 'NGN');
  PERFORM goober_assert_wallet_currency(owner_id, data_environment, 'USD');
END $$;

CREATE OR REPLACE FUNCTION goober_wallet_deferred() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account "LedgerAccount"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='Wallet' THEN PERFORM goober_assert_wallet_currency(NEW."ownerId",NEW.environment,NEW.currency);
  ELSE SELECT * INTO STRICT account FROM "LedgerAccount" WHERE id=NEW."accountId"; PERFORM goober_assert_wallet_currency(account."ownerId",account.environment,account.currency); END IF;
  RETURN NULL;
END $$;

-- Protect new Order pricing/currency snapshot fields against mutation
CREATE OR REPLACE FUNCTION goober_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId"<>OLD."ownerId" OR NEW.environment<>OLD.environment OR NEW."quoteId"<>OLD."quoteId" OR NEW."productId"<>OLD."productId" OR NEW.provider<>OLD.provider OR NEW."providerAccount"<>OLD."providerAccount" OR NEW."providerMode"<>OLD."providerMode" OR NEW."paymentMode"<>OLD."paymentMode" OR NEW."providerReference"<>OLD."providerReference" OR NEW."reservedMinor"<>OLD."reservedMinor" OR NEW."createdAt"<>OLD."createdAt" OR NEW."capturedMinor"<OLD."capturedMinor" OR NEW."releasedMinor"<OLD."releasedMinor" OR NEW."refundedMinor"<OLD."refundedMinor" OR NEW."supplierMinor"<>OLD."supplierMinor" OR NEW."supplierCurrency"<>OLD."supplierCurrency" OR NEW."markupMinor"<>OLD."markupMinor" OR NEW."sellingMinor"<>OLD."sellingMinor" OR NEW."customerCurrency"<>OLD."customerCurrency" OR NEW."exchangeRate"<>OLD."exchangeRate" OR NEW."exchangeRateSource"<>OLD."exchangeRateSource" OR NEW."exchangeRateAt"<>OLD."exchangeRateAt" OR NEW."payableMinor"<>OLD."payableMinor" OR NEW."paymentCurrency"<>OLD."paymentCurrency" OR (OLD."paymentReference" IS NOT NULL AND NEW."paymentReference" IS DISTINCT FROM OLD."paymentReference") THEN RAISE EXCEPTION 'order snapshot and economic counters are immutable/monotonic' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
