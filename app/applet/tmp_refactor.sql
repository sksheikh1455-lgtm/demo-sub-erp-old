-- 1. Create the unified Inventory Ledger trigger function
CREATE OR REPLACE FUNCTION public.post_inventory_ledger_lines()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_journal_id TEXT;
    v_inv_acc TEXT;
    v_cogs_acc TEXT;
    v_exp_acc TEXT;
    v_valuation NUMERIC;
    v_company_id TEXT;
    v_product_name TEXT;
    v_contact_id TEXT;
BEGIN
    IF pg_trigger_depth() > 5 THEN RETURN NEW; END IF;

    IF NEW.quantity = 0 THEN RETURN NEW; END IF;

    v_company_id := NEW.company_id;
    v_valuation := ROUND(NEW.quantity * NEW.cost_price, 2);

    IF v_valuation = 0 THEN RETURN NEW; END IF;

    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_company_id LIMIT 1;
    IF v_inv_acc IS NULL THEN SELECT id INTO v_inv_acc FROM docs_accounts WHERE (name ILIKE '%inventory%' OR code ILIKE '1005%') AND company_id = v_company_id LIMIT 1; END IF;
    
    SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code = '400501' AND company_id = v_company_id LIMIT 1;
    IF v_cogs_acc IS NULL THEN SELECT id INTO v_cogs_acc FROM docs_accounts WHERE (name ILIKE '%cost of goods%' OR code ILIKE '4005%') AND company_id = v_company_id LIMIT 1; END IF;

    SELECT id INTO v_exp_acc FROM docs_accounts WHERE code = '500501' AND company_id = v_company_id LIMIT 1;
    IF v_exp_acc IS NULL THEN SELECT id INTO v_exp_acc FROM docs_accounts WHERE (name ILIKE '%adjustment%' OR code ILIKE '5005%') AND company_id = v_company_id LIMIT 1; END IF;

    SELECT data->>'name' INTO v_product_name FROM docs_products WHERE id = NEW.product_id;

    IF NEW.reference_type = 'INVOICE' THEN
        v_journal_id := 'JE-' || replace(replace(UPPER(NEW.reference_id), 'INV-', ''), 'INVOICE-', '');
        IF TG_OP = 'INSERT' AND NEW.transaction_type = 'OUT' THEN
             INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
             VALUES ('JL-' || v_journal_id || '-cogs-' || NEW.id, v_journal_id, v_company_id, v_cogs_acc, v_valuation, 0, 'COGS: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
             INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
             VALUES ('JL-' || v_journal_id || '-inv-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, 0, v_valuation, 'Inv Red: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
        END IF;
    ELSIF NEW.reference_type = 'CREDIT_NOTE' THEN
        v_journal_id := 'JE-' || replace(replace(UPPER(NEW.reference_id), 'CN-', ''), 'CREDIT-', '');
        IF TG_OP = 'INSERT' AND NEW.transaction_type = 'IN' THEN
             INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
             VALUES ('JL-' || v_journal_id || '-inv-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, v_valuation, 0, 'Inv Add: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
             INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
             VALUES ('JL-' || v_journal_id || '-cogs-' || NEW.id, v_journal_id, v_company_id, v_cogs_acc, 0, v_valuation, 'COGS Rev: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
        END IF;
    ELSIF NEW.reference_type = 'ADJUSTMENT' THEN
        v_journal_id := 'JE-ADJ-' || replace(UPPER(NEW.reference_id), 'ADJ-', '');
        IF TG_OP = 'INSERT' THEN
             SELECT data->>'contactId' INTO v_contact_id FROM docs_inventory_adjustments WHERE id = NEW.reference_id;
             IF NEW.transaction_type = 'IN' THEN
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                 VALUES ('JL-' || v_journal_id || '-I-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, v_valuation, 0, 'Stock Adjustment: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                 VALUES ('JL-' || v_journal_id || '-E-' || NEW.id, v_journal_id, v_company_id, v_exp_acc, 0, v_valuation, 'Inventory Adjustment Expense: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
             ELSE
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                 VALUES ('JL-' || v_journal_id || '-I-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, 0, v_valuation, 'Stock Adjustment: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                 VALUES ('JL-' || v_journal_id || '-E-' || NEW.id, v_journal_id, v_company_id, v_exp_acc, v_valuation, 0, 'Inventory Adjustment Expense: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
             END IF;
        END IF;
    END IF;

    IF v_journal_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.reference_type IN ('INVOICE', 'BILL', 'CREDIT_NOTE') THEN
        INSERT INTO docs_journals (id, company_id, date, status, updated_at)
        VALUES (v_journal_id, v_company_id, NEW.date, 'DRAFT', NOW())
        ON CONFLICT (id) DO NOTHING;
    ELSE
        INSERT INTO docs_journals (id, company_id, date, status, updated_at)
        VALUES (v_journal_id, v_company_id, NEW.date, 'POSTED', NOW())
        ON CONFLICT (id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_inventory_ledger ON docs_inventory_transactions;
CREATE TRIGGER trg_inventory_ledger
AFTER INSERT ON docs_inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION post_inventory_ledger_lines();

CREATE OR REPLACE FUNCTION prevent_manual_inventory_edits()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.quantity_on_hand IS DISTINCT FROM OLD.quantity_on_hand OR NEW.cost_price IS DISTINCT FROM OLD.cost_price) THEN
        IF auth.uid() IS NOT NULL AND current_setting('request.jwt.claims', true) IS NOT NULL THEN
            IF pg_trigger_depth() <= 1 AND current_setting('request.path', true) NOT LIKE '%rpc%' THEN
                RAISE EXCEPTION 'Strict Perpetual Inventory enabled. Cannot manually edit quantity_on_hand or cost_price. Use Inventory Transactions.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_manual_inventory_edits ON docs_products;
CREATE TRIGGER block_manual_inventory_edits
BEFORE UPDATE ON docs_products
FOR EACH ROW
EXECUTE FUNCTION prevent_manual_inventory_edits();
