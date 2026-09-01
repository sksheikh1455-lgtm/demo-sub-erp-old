CREATE OR REPLACE FUNCTION sync_document_metadata()
RETURNS TRIGGER AS $$
DECLARE
  v_val TEXT;
BEGIN
  IF NEW.data IS NOT NULL THEN
    -- Sync Company ID
    IF (NEW.data ? 'companyId') THEN
      v_val := COALESCE(NEW.data->>'companyId', NEW.data->'companyIds'->>0);
      IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
    ELSIF (NEW.data ? 'companyIds') THEN
      v_val := NEW.data->'companyIds'->>0;
      IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
    END IF;

    -- Sync Status (Try to handle missing columns gracefully)
    BEGIN
       IF TG_OP = 'UPDATE' THEN
         IF NEW.status IS DISTINCT FROM OLD.status THEN
           NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{status}', to_jsonb(NEW.status));
         ELSIF (NEW.data ? 'status') AND (NEW.data->>'status' IS DISTINCT FROM OLD.data->>'status') THEN
           NEW.status := NEW.data->>'status';
         ELSE
           IF (NEW.data ? 'status') THEN NEW.status := NEW.data->>'status'; END IF;
         END IF;
       ELSE -- INSERT
         IF NEW.status IS NOT NULL AND (NEW.data IS NULL OR NOT (NEW.data ? 'status')) THEN
           NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{status}', to_jsonb(NEW.status));
         ELSIF (NEW.data ? 'status') THEN
           NEW.status := NEW.data->>'status';
         END IF;
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    -- Sync Date
    BEGIN
       IF (NEW.data ? 'date') THEN NEW.date := (NEW.data->>'date')::DATE; 
       ELSIF (NEW.data ? 'createdAt') THEN NEW.date := (NEW.data->>'createdAt')::DATE;
       END IF;

       -- Specific payment_date for docs_payments
       IF TG_TABLE_NAME = 'docs_payments' THEN
         IF (NEW.data ? 'date') THEN NEW.payment_date := (NEW.data->>'date')::DATE;
         ELSIF (NEW.data ? 'paymentDate') THEN NEW.payment_date := (NEW.data->>'paymentDate')::DATE;
         ELSIF (NEW.data ? 'createdAt') THEN NEW.payment_date := (NEW.data->>'createdAt')::DATE;
         ELSE NEW.payment_date := CURRENT_DATE;
         END IF;
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    -- Sync Totals/Amounts
    BEGIN
       -- For Total
       IF TG_OP = 'UPDATE' THEN
         IF NEW.total IS DISTINCT FROM OLD.total THEN
           NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{total}', to_jsonb(NEW.total));
         ELSIF (NEW.data ? 'total') AND (NEW.data->>'total' IS DISTINCT FROM OLD.data->>'total') THEN
           NEW.total := (NEW.data->>'total')::NUMERIC;
         ELSE
           IF (NEW.data ? 'total') THEN NEW.total := (NEW.data->>'total')::NUMERIC; END IF;
         END IF;
       ELSE -- INSERT
         IF NEW.total IS NOT NULL AND (NEW.data IS NULL OR NOT (NEW.data ? 'total')) THEN
           NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{total}', to_jsonb(NEW.total));
         ELSIF (NEW.data ? 'total') THEN
           NEW.total := (NEW.data->>'total')::NUMERIC;
         END IF;
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    BEGIN
       -- For Amount (on tables like docs_payments)
       IF TG_OP = 'UPDATE' THEN
         IF NEW.amount IS DISTINCT FROM OLD.amount THEN
           NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{amount}', to_jsonb(NEW.amount));
         ELSIF (NEW.data ? 'amount') AND (NEW.data->>'amount' IS DISTINCT FROM OLD.data->>'amount') THEN
           NEW.amount := (NEW.data->>'amount')::NUMERIC;
         ELSE
           IF (NEW.data ? 'amount') THEN NEW.amount := (NEW.data->>'amount')::NUMERIC; END IF;
         END IF;
       ELSE -- INSERT
         IF NEW.amount IS NOT NULL AND (NEW.data IS NULL OR NOT (NEW.data ? 'amount')) THEN
           NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{amount}', to_jsonb(NEW.amount));
         ELSIF (NEW.data ? 'amount') THEN
           NEW.amount := (NEW.data->>'amount')::NUMERIC;
         END IF;
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    -- Sync Partner/Contact ID
    BEGIN
       IF TG_TABLE_NAME = 'docs_invoices' THEN
         v_val := COALESCE(NEW.data->>'customerId', NEW.data->>'contactId');
         IF v_val IS NOT NULL THEN NEW.customer_id := v_val; END IF;
       ELSIF TG_TABLE_NAME = 'docs_bills' THEN
         v_val := COALESCE(NEW.data->>'vendorId', NEW.data->>'contactId');
         IF v_val IS NOT NULL THEN NEW.vendor_id := v_val; END IF;
       ELSIF TG_TABLE_NAME = 'docs_payments' THEN
         v_val := COALESCE(NEW.data->>'contactId', NEW.data->>'customerId', NEW.data->>'vendorId');
         IF v_val IS NOT NULL THEN NEW.contact_id := v_val; END IF;
       ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN
         v_val := COALESCE(NEW.data->>'customerId', NEW.data->>'contactId');
         IF v_val IS NOT NULL THEN NEW.customer_id := v_val; END IF;
       ELSE
         IF (NEW.data ? 'contactId') THEN NEW.contact_id := NEW.data->>'contactId';
         ELSIF (NEW.data ? 'customerId') THEN NEW.contact_id := NEW.data->>'customerId';
         ELSIF (NEW.data ? 'vendorId') THEN NEW.contact_id := NEW.data->>'vendorId';
         END IF;
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    -- Sync Journal ID (for cross-referencing)
    BEGIN
       IF (NEW.data ? 'journalEntryId') THEN NEW.journal_id := NEW.data->>'journalEntryId'; END IF;
    EXCEPTION WHEN undefined_column THEN END;

    -- Sync Product specific flat columns
    BEGIN
       IF TG_TABLE_NAME = 'docs_products' THEN
         IF (NEW.data ? 'name') THEN NEW.name := NEW.data->>'name'; END IF;
         IF (NEW.data ? 'sku') THEN NEW.sku := NEW.data->>'sku'; END IF;
         IF (NEW.data ? 'price') THEN NEW.price := (NEW.data->>'price')::NUMERIC; END IF;
         IF (NEW.data ? 'costPrice') THEN NEW.cost_price := (NEW.data->>'costPrice')::NUMERIC; END IF;
       ELSIF TG_TABLE_NAME = 'docs_contacts' THEN
         IF (NEW.data ? 'name') THEN NEW.name := NEW.data->>'name'; END IF;
         IF (NEW.data ? 'type') THEN NEW.type := NEW.data->>'type'; END IF;
       ELSIF TG_TABLE_NAME = 'docs_payments' THEN
         IF (NEW.data ? 'type') THEN NEW.type := NEW.data->>'type'; END IF;
         IF (NEW.data ? 'method') THEN NEW.method := NEW.data->>'method';
         ELSIF (NEW.data ? 'paymentMethod') THEN NEW.method := NEW.data->>'paymentMethod';
         END IF;
         IF (NEW.data ? 'accountId') THEN NEW.account_id := NEW.data->>'accountId';
         ELSIF (NEW.data ? 'liquidityAccountId') THEN NEW.account_id := NEW.data->>'liquidityAccountId';
         END IF;
         IF (NEW.data ? 'partnerAccountId') THEN NEW.partner_account_id := NEW.data->>'partnerAccountId'; END IF;
         IF (NEW.data ? 'reference') THEN NEW.reference := NEW.data->>'reference'; END IF;
         IF (NEW.data ? 'appliedInvoices') THEN NEW.applied_invoices := NEW.data->'appliedInvoices';
         ELSIF (NEW.data ? 'applied_invoices') THEN NEW.applied_invoices := NEW.data->'applied_invoices';
         END IF;
         IF (NEW.data ? 'appliedBills') THEN NEW.applied_bills := NEW.data->'appliedBills';
         ELSIF (NEW.data ? 'applied_bills') THEN NEW.applied_bills := NEW.data->'applied_bills';
         END IF;
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    -- Sync Created By and Prepared By to support specific user action logging
    BEGIN
       IF (NEW.data ? 'createdById') THEN 
         NEW.created_by_id := NULLIF(TRIM(NEW.data->>'createdById'), ''); 
       ELSIF (NEW.data ? 'authorId') THEN
         NEW.created_by_id := NULLIF(TRIM(NEW.data->>'authorId'), '');
       END IF;
    EXCEPTION WHEN undefined_column THEN END;

    BEGIN
       IF (NEW.data ? 'preparedBy') AND NULLIF(TRIM(NEW.data->>'preparedBy'), '') IS NOT NULL THEN
         NEW.prepared_by := NULLIF(TRIM(NEW.data->>'preparedBy'), '');
       ELSIF (NEW.data ? 'salesperson') AND NULLIF(TRIM(NEW.data->>'salesperson'), '') IS NOT NULL THEN
         NEW.prepared_by := NULLIF(TRIM(NEW.data->>'salesperson'), '');
       ELSIF (NEW.data ? 'purchaser') AND NULLIF(TRIM(NEW.data->>'purchaser'), '') IS NOT NULL THEN
         NEW.prepared_by := NULLIF(TRIM(NEW.data->>'purchaser'), '');
       END IF;
    EXCEPTION WHEN undefined_column THEN END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
