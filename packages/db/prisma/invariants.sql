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
