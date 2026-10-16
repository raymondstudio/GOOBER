-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Subscriptions',
    "entitlement" TEXT NOT NULL,
    "terms" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "approvalEvidence" TEXT,
    "deliveryType" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "providerAccount" TEXT NOT NULL DEFAULT 'fixture',
    "environment" TEXT NOT NULL DEFAULT 'test',
    "providerMode" TEXT NOT NULL DEFAULT 'fixture',
    "retailMinor" BIGINT NOT NULL,
    "supplierMinor" BIGINT NOT NULL,
    "supplierCurrency" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fixtureScenario" TEXT NOT NULL DEFAULT 'delivered',
    "stock" INTEGER NOT NULL DEFAULT 100,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "catalogCompleteness" TEXT NOT NULL DEFAULT 'fixture-complete',
    "inputType" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "availableMinor" BIGINT NOT NULL DEFAULT 0,
    "reservedMinor" BIGINT NOT NULL DEFAULT 0,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "freezeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" TEXT,
    "environment" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "normalDirection" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVersion" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "retailMinor" BIGINT NOT NULL,
    "supplierMinor" BIGINT NOT NULL,
    "supplierCurrency" TEXT NOT NULL,
    "fxRate" TEXT,
    "fxSource" TEXT,
    "fxObservedAt" TIMESTAMP(3),
    "pricingVersion" TEXT NOT NULL,
    "entitlement" TEXT NOT NULL,
    "terms" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fulfillment" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "moneyStatus" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedMinor" BIGINT NOT NULL,
    "capturedMinor" BIGINT NOT NULL DEFAULT 0,
    "releasedMinor" BIGINT NOT NULL DEFAULT 0,
    "refundedMinor" BIGINT NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "providerAccount" TEXT NOT NULL DEFAULT 'fixture',
    "providerMode" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'fixture',
    "providerAccount" TEXT NOT NULL DEFAULT 'fixture',
    "paymentMode" TEXT NOT NULL DEFAULT 'fixture',
    "reference" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "creditedMinor" BIGINT NOT NULL DEFAULT 0,
    "reversedMinor" BIGINT NOT NULL DEFAULT 0,
    "receivableMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccount" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "dispatchCount" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "responseDigest" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccount" TEXT NOT NULL DEFAULT 'fixture',
    "environment" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "encryptedPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL DEFAULT 'Order support',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "environment" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "aggregateId" TEXT,
    "operationId" TEXT,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "actorId" TEXT,
    "operationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBalanceObservation" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccount" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,

    CONSTRAINT "SupplierBalanceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_ownerId_environment_currency_key" ON "Wallet"("ownerId", "environment", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_environment_code_key" ON "LedgerAccount"("environment", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_id_currency_key" ON "LedgerAccount"("id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_environment_operationId_key" ON "Journal"("environment", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_id_currency_key" ON "Journal"("id", "currency");

-- CreateIndex
CREATE INDEX "Posting_accountId_idx" ON "Posting"("accountId");

-- CreateIndex
CREATE INDEX "Quote_ownerId_createdAt_idx" ON "Quote"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_providerReference_key" ON "Order"("providerReference");

-- CreateIndex
CREATE INDEX "Order_ownerId_createdAt_idx" ON "Order"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_ownerId_operation_environment_key_key" ON "IdempotencyRecord"("ownerId", "operation", "environment", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_reference_key" ON "PaymentIntent"("reference");

-- CreateIndex
CREATE INDEX "PaymentIntent_ownerId_createdAt_idx" ON "PaymentIntent"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_provider_providerAccount_environment_referenc_key" ON "PaymentIntent"("provider", "providerAccount", "environment", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAttempt_orderId_provider_providerAccount_environmen_key" ON "ProviderAttempt"("orderId", "provider", "providerAccount", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAttempt_provider_providerAccount_environment_extern_key" ON "ProviderAttempt"("provider", "providerAccount", "environment", "externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Inbox_status_createdAt_idx" ON "Inbox"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inbox_provider_providerAccount_environment_eventId_key" ON "Inbox"("provider", "providerAccount", "environment", "eventId");

-- CreateIndex
CREATE INDEX "Outbox_status_createdAt_idx" ON "Outbox"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_environment_eventKey_key" ON "Outbox"("environment", "eventKey");

-- CreateIndex
CREATE INDEX "SupportRequest_ownerId_createdAt_idx" ON "SupportRequest"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_operationId_key" ON "AuditEvent"("operationId");

-- CreateIndex
CREATE INDEX "AuditEvent_aggregateId_createdAt_idx" ON "AuditEvent"("aggregateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_operationId_key" ON "Review"("operationId");

-- CreateIndex
CREATE INDEX "SupplierBalanceObservation_provider_environment_observedAt_idx" ON "SupplierBalanceObservation"("provider", "environment", "observedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_journalId_currency_fkey" FOREIGN KEY ("journalId", "currency") REFERENCES "Journal"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_accountId_currency_fkey" FOREIGN KEY ("accountId", "currency") REFERENCES "LedgerAccount"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAttempt" ADD CONSTRAINT "ProviderAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Economic constraints complement Prisma; all failures abort the entire transaction.
ALTER TABLE "User" ADD CONSTRAINT user_role_check CHECK (role IN ('CUSTOMER','ADMIN'));
ALTER TABLE "Wallet" ADD CONSTRAINT wallet_currency_check CHECK (currency='NGN'), ADD CONSTRAINT wallet_nonnegative CHECK ("availableMinor">=0 AND "reservedMinor">=0), ADD CONSTRAINT wallet_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id);
ALTER TABLE "LedgerAccount" ADD CONSTRAINT ledger_currency_check CHECK (currency IN ('NGN','USD')), ADD CONSTRAINT ledger_direction_check CHECK ("normalDirection" IN ('DEBIT','CREDIT')), ADD CONSTRAINT ledger_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id);
CREATE UNIQUE INDEX ledger_customer_purpose_unique ON "LedgerAccount"("ownerId",environment,currency,purpose) WHERE "ownerId" IS NOT NULL;
ALTER TABLE "Journal" ADD CONSTRAINT journal_currency_check CHECK (currency IN ('NGN','USD'));
ALTER TABLE "Posting" ADD CONSTRAINT posting_amount_positive CHECK ("amountMinor">0), ADD CONSTRAINT posting_direction_check CHECK (direction IN ('DEBIT','CREDIT'));
ALTER TABLE "Quote" ADD CONSTRAINT quote_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id), ADD CONSTRAINT quote_money_check CHECK ("retailMinor">0 AND "supplierMinor">=0 AND quantity=1);
ALTER TABLE "Order" ADD CONSTRAINT order_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id), ADD CONSTRAINT order_money_bounds CHECK ("reservedMinor">0 AND "capturedMinor">=0 AND "releasedMinor">=0 AND "refundedMinor">=0 AND "capturedMinor"::numeric+"releasedMinor"::numeric<="reservedMinor"::numeric AND "refundedMinor"<="capturedMinor"), ADD CONSTRAINT order_fulfillment_check CHECK (fulfillment IN ('ACCEPTED','PROCESSING','QUEUED','DELIVERED','FAILED','NEEDS_REVIEW')), ADD CONSTRAINT order_money_state_check CHECK ("moneyStatus" IN ('RESERVED','CAPTURED','RELEASED','PARTIALLY_REFUNDED','REFUNDED'));
ALTER TABLE "PaymentIntent" ADD CONSTRAINT payment_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id), ADD CONSTRAINT payment_money_bounds CHECK (currency='NGN' AND "amountMinor">0 AND "creditedMinor">=0 AND "creditedMinor"<="amountMinor" AND "reversedMinor">=0 AND "reversedMinor"<="creditedMinor" AND "receivableMinor">=0 AND "receivableMinor"<="reversedMinor");
ALTER TABLE "SupportRequest" ADD CONSTRAINT support_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id);
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id);
ALTER TABLE "ProviderAttempt" ADD CONSTRAINT dispatch_count_check CHECK ("dispatchCount">=0 AND (provider<>'GRAML' OR "dispatchCount"<=1)), ADD CONSTRAINT attempt_state_check CHECK (status IN ('PREPARED','DISPATCHING','ACKNOWLEDGED','UNKNOWN','CLOSED'));
ALTER TABLE "Product" ADD CONSTRAINT product_money_check CHECK ("retailMinor">0 AND "supplierMinor">=0 AND stock>=0 AND version>0 AND "supplierCurrency" IN ('USD','NGN')), ADD CONSTRAINT product_publication_check CHECK (NOT published OR approved);
ALTER TABLE "SupplierBalanceObservation" ADD CONSTRAINT supplier_balance_check CHECK ("amountMinor">=0 AND currency IN ('NGN','USD'));

CREATE FUNCTION goober_reject_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable economic/audit record' USING ERRCODE='23514'; END $$;
CREATE TRIGGER postings_no_update_delete BEFORE UPDATE OR DELETE ON "Posting" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER journals_no_delete BEFORE DELETE ON "Journal" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER accounts_no_update_delete BEFORE UPDATE OR DELETE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER audits_no_update_delete BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER journal_no_truncate BEFORE TRUNCATE ON "Journal" FOR EACH STATEMENT EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER posting_no_truncate BEFORE TRUNCATE ON "Posting" FOR EACH STATEMENT EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER account_no_truncate BEFORE TRUNCATE ON "LedgerAccount" FOR EACH STATEMENT EXECUTE FUNCTION goober_reject_immutable();

CREATE FUNCTION goober_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."postedAt" IS NOT NULL THEN RAISE EXCEPTION 'posted journal is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.id<>OLD.id OR NEW.environment<>OLD.environment OR NEW."operationId"<>OLD."operationId" OR NEW.currency<>OLD.currency OR NEW.metadata<>OLD.metadata OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId" THEN RAISE EXCEPTION 'journal identity is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_mutation BEFORE UPDATE ON "Journal" FOR EACH ROW EXECUTE FUNCTION goober_journal_mutation();

CREATE FUNCTION goober_posting_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "Journal"%ROWTYPE; account "LedgerAccount"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT parent FROM "Journal" WHERE id=NEW."journalId" FOR UPDATE;
  IF parent."postedAt" IS NOT NULL THEN RAISE EXCEPTION 'cannot append to posted journal' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT account FROM "LedgerAccount" WHERE id=NEW."accountId";
  IF parent.environment<>account.environment OR parent.currency<>NEW.currency OR account.currency<>NEW.currency THEN RAISE EXCEPTION 'journal/account environment or currency mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posting_insert_guard BEFORE INSERT ON "Posting" FOR EACH ROW EXECUTE FUNCTION goober_posting_insert();

CREATE FUNCTION goober_assert_journal(journal_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE parent "Journal"%ROWTYPE; count_rows bigint; total numeric;
BEGIN
  SELECT * INTO STRICT parent FROM "Journal" WHERE id=journal_id;
  SELECT count(*),coalesce(sum(CASE WHEN direction='DEBIT' THEN "amountMinor"::numeric ELSE -"amountMinor"::numeric END),0) INTO count_rows,total FROM "Posting" WHERE "journalId"=journal_id;
  IF parent."postedAt" IS NULL OR count_rows<2 OR total<>0 THEN RAISE EXCEPTION 'journal must finalize balanced with at least two postings' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION goober_journal_deferred() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Journal' THEN PERFORM goober_assert_journal(NEW.id); ELSE PERFORM goober_assert_journal(NEW."journalId"); END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balance_deferred AFTER INSERT OR UPDATE ON "Journal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION goober_journal_deferred();
CREATE CONSTRAINT TRIGGER posting_balance_deferred AFTER INSERT ON "Posting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION goober_journal_deferred();

CREATE FUNCTION goober_assert_wallet(owner_id text, data_environment text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cached "Wallet"%ROWTYPE; available numeric; reserved numeric;
BEGIN
  IF owner_id IS NULL THEN RETURN; END IF;
  SELECT * INTO cached FROM "Wallet" WHERE "ownerId"=owner_id AND environment=data_environment AND currency='NGN';
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM "LedgerAccount" a JOIN "Posting" p ON p."accountId"=a.id WHERE a."ownerId"=owner_id AND a.environment=data_environment AND a.purpose IN ('CUSTOMER_AVAILABLE','CUSTOMER_RESERVED')) THEN RAISE EXCEPTION 'customer postings require wallet' USING ERRCODE='23514'; END IF;
    RETURN;
  END IF;
  SELECT coalesce(sum(CASE WHEN a.purpose='CUSTOMER_AVAILABLE' THEN CASE WHEN p.direction='CREDIT' THEN p."amountMinor"::numeric ELSE -p."amountMinor"::numeric END ELSE 0 END),0), coalesce(sum(CASE WHEN a.purpose='CUSTOMER_RESERVED' THEN CASE WHEN p.direction='CREDIT' THEN p."amountMinor"::numeric ELSE -p."amountMinor"::numeric END ELSE 0 END),0)
    INTO available,reserved FROM "LedgerAccount" a JOIN "Posting" p ON p."accountId"=a.id JOIN "Journal" j ON j.id=p."journalId" WHERE a."ownerId"=owner_id AND a.environment=data_environment AND a.currency='NGN' AND j."postedAt" IS NOT NULL;
  IF available<>cached."availableMinor" OR reserved<>cached."reservedMinor" THEN RAISE EXCEPTION 'wallet must reconcile to immutable ledger' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION goober_wallet_deferred() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account "LedgerAccount"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='Wallet' THEN PERFORM goober_assert_wallet(NEW."ownerId",NEW.environment);
  ELSE SELECT * INTO STRICT account FROM "LedgerAccount" WHERE id=NEW."accountId"; PERFORM goober_assert_wallet(account."ownerId",account.environment); END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER wallet_reconcile_deferred AFTER INSERT OR UPDATE ON "Wallet" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION goober_wallet_deferred();
CREATE CONSTRAINT TRIGGER posting_wallet_reconcile AFTER INSERT ON "Posting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION goober_wallet_deferred();

CREATE FUNCTION goober_attempt_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider<>OLD.provider OR NEW."providerAccount"<>OLD."providerAccount" OR NEW.environment<>OLD.environment OR NEW."providerMode"<>OLD."providerMode" OR NEW."externalReference"<>OLD."externalReference" OR NEW."requestDigest"<>OLD."requestDigest" OR NEW."requestPayload"<>OLD."requestPayload" OR NEW."orderId"<>OLD."orderId" OR NEW."dispatchCount"<OLD."dispatchCount" OR (OLD."dispatchedAt" IS NOT NULL AND NEW."dispatchedAt" IS DISTINCT FROM OLD."dispatchedAt") THEN RAISE EXCEPTION 'supplier dispatch identity/fence is immutable' USING ERRCODE='23514'; END IF;
  IF OLD."dispatchCount">0 AND NEW.status='PREPARED' THEN RAISE EXCEPTION 'cannot reset supplier dispatch fence' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER supplier_dispatch_fence BEFORE UPDATE ON "ProviderAttempt" FOR EACH ROW EXECUTE FUNCTION goober_attempt_fence();

CREATE FUNCTION goober_quote_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'acceptedAt')<>(to_jsonb(OLD)-'acceptedAt') OR OLD."acceptedAt" IS NOT NULL OR NEW."acceptedAt" IS NULL THEN RAISE EXCEPTION 'quote snapshot is immutable and single use' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_snapshot_guard BEFORE UPDATE OR DELETE ON "Quote" FOR EACH ROW EXECUTE FUNCTION goober_quote_immutable();
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT idempotency_owner_fk FOREIGN KEY ("ownerId") REFERENCES "User"(id);
ALTER TABLE "Review" ADD CONSTRAINT review_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id), ADD CONSTRAINT review_order_fk FOREIGN KEY ("orderId") REFERENCES "Order"(id);
CREATE TRIGGER idempotency_no_update_delete BEFORE UPDATE OR DELETE ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER delivery_no_update_delete BEFORE UPDATE OR DELETE ON "Delivery" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE FUNCTION goober_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId"<>OLD."ownerId" OR NEW.environment<>OLD.environment OR NEW."quoteId"<>OLD."quoteId" OR NEW."productId"<>OLD."productId" OR NEW.provider<>OLD.provider OR NEW."providerAccount"<>OLD."providerAccount" OR NEW."providerMode"<>OLD."providerMode" OR NEW."paymentMode"<>OLD."paymentMode" OR NEW."providerReference"<>OLD."providerReference" OR NEW."reservedMinor"<>OLD."reservedMinor" OR NEW."createdAt"<>OLD."createdAt" OR NEW."capturedMinor"<OLD."capturedMinor" OR NEW."releasedMinor"<OLD."releasedMinor" OR NEW."refundedMinor"<OLD."refundedMinor" THEN RAISE EXCEPTION 'order snapshot and economic counters are immutable/monotonic' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_economic_guard BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION goober_order_guard();
CREATE TRIGGER order_no_delete BEFORE DELETE ON "Order" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER attempt_no_delete BEFORE DELETE ON "ProviderAttempt" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
CREATE TRIGGER payment_no_delete BEFORE DELETE ON "PaymentIntent" FOR EACH ROW EXECUTE FUNCTION goober_reject_immutable();
