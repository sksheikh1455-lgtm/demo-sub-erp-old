import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function updateTriggers() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    DROP FUNCTION IF EXISTS get_next_company_doc_number(TEXT, TEXT);
    
    CREATE OR REPLACE FUNCTION get_company_short_code(v_company_id TEXT)
    RETURNS TEXT AS $$
    DECLARE
      v_code TEXT;
      v_name TEXT;
    BEGIN
      -- Try to get code from physical column in docs_companies
      SELECT code INTO v_code FROM docs_companies WHERE id = v_company_id;
      
      -- If not found or looks like a UUID or is too generic, fallback
      IF v_code IS NULL OR v_code = '' OR v_code LIKE 'comp-%' OR length(v_code) > 10 THEN
         SELECT name INTO v_name FROM docs_companies WHERE id = v_company_id;
         -- If name exists, try to get first characters of each word or first 3 chars
         IF v_name IS NOT NULL AND v_name <> '' THEN
            -- Try to get initials (e.g. "Software Enterprise" -> "SE")
            SELECT STRING_AGG(UPPER(LEFT(word, 1)), '') INTO v_code 
            FROM UNNEST(REGEXP_SPLIT_TO_ARRAY(v_name, '\s+')) AS word
            WHERE length(word) > 0;
            
            -- If only 1 word, take 3 chars
            IF length(v_code) < 2 THEN
               v_code := UPPER(LEFT(v_name, 3));
            END IF;
         END IF;
         
         IF v_code IS NULL OR v_code = '' THEN
            v_code := 'CO';
         END IF;
      END IF;
      
      RETURN UPPER(v_code);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION get_next_company_doc_number(v_company_id TEXT, v_seq_group TEXT)
    RETURNS TEXT AS $$
    DECLARE
      v_next_val INTEGER;
      v_prefix TEXT;
      v_company_code TEXT;
    BEGIN
      v_company_code := get_company_short_code(v_company_id);

      INSERT INTO company_doc_sequences (company_code, seq_group, last_value)
      VALUES (v_company_code, v_seq_group, 1)
      ON CONFLICT (company_code, seq_group)
      DO UPDATE SET last_value = company_doc_sequences.last_value + 1
      RETURNING last_value INTO v_next_val;

        -- Map seq_group to short prefix (Using uppercase as requested)
        v_prefix := CASE 
          WHEN v_seq_group = 'INVOICE' THEN 'INV'
          WHEN v_seq_group = 'BILL' THEN 'BIL'
          WHEN v_seq_group = 'PAYMENT' THEN 'PAY'
          WHEN v_seq_group = 'CREDIT_NOTE' THEN 'CN'
          WHEN v_seq_group = 'JOURNAL' THEN 'JEN'
          WHEN v_seq_group = 'LOAN' THEN 'LON'
          WHEN v_seq_group = 'EXPENSE' THEN 'EXP'
          WHEN v_seq_group = 'CONTACT' THEN 'CON'
          WHEN v_seq_group = 'PRODUCT' THEN 'PROD'
          WHEN v_seq_group = 'CATEGORY' THEN 'CAT'
          WHEN v_seq_group = 'BRAND' THEN 'BRND'
          WHEN v_seq_group = 'ACCOUNT' THEN 'ACC'
          ELSE UPPER(v_seq_group)
        END;

        -- Format: INV-SUL-000001
        RETURN v_prefix || '-' || v_company_code || '-' || TO_CHAR(v_next_val, 'FM000000');
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Helper to check if user has access to company
    CREATE OR REPLACE FUNCTION check_company_access(v_company_id TEXT)
    RETURNS BOOLEAN AS $$
    BEGIN
      IF auth.uid() IS NULL THEN RETURN TRUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM company_users) THEN RETURN TRUE; END IF;
      RETURN EXISTS (
        SELECT 1 FROM company_users 
        WHERE user_id = auth.uid() 
        AND company_id = v_company_id
      ) OR v_company_id IS NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- TABLES SETUP
    CREATE TABLE IF NOT EXISTS docs_companies (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT, code TEXT);
    CREATE TABLE IF NOT EXISTS docs_users (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT);
    CREATE TABLE IF NOT EXISTS docs_roles (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT);
    CREATE TABLE IF NOT EXISTS docs_invoices (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, invoice_number TEXT, company_id TEXT, date DATE, customer_id TEXT, status TEXT, total NUMERIC DEFAULT 0);
    CREATE TABLE IF NOT EXISTS docs_bills (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, bill_number TEXT, company_id TEXT, date DATE, vendor_id TEXT, status TEXT, total NUMERIC DEFAULT 0);
    CREATE TABLE IF NOT EXISTS docs_payments (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, payment_number TEXT, company_id TEXT, date DATE, contact_id TEXT, status TEXT, amount NUMERIC DEFAULT 0);
    CREATE TABLE IF NOT EXISTS docs_credit_notes (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, credit_note_number TEXT, company_id TEXT, date DATE, total NUMERIC DEFAULT 0);
    CREATE TABLE IF NOT EXISTS docs_journals (id TEXT PRIMARY KEY, data JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), reference_number TEXT, company_id TEXT, date DATE, journal_type TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS docs_journal_lines (id TEXT PRIMARY KEY, journal_id TEXT, company_id TEXT, account_id TEXT, contact_id TEXT, debit NUMERIC DEFAULT 0, credit NUMERIC DEFAULT 0, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='docs_journals' AND column_name='created_at') THEN
        ALTER TABLE docs_journals ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='docs_journal_lines' AND column_name='created_at') THEN
        ALTER TABLE docs_journal_lines ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS docs_loans (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, loan_number TEXT, company_id TEXT, date DATE, amount NUMERIC DEFAULT 0, status TEXT);
    CREATE TABLE IF NOT EXISTS docs_products (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT, name TEXT, sku TEXT, price NUMERIC DEFAULT 0, cost_price NUMERIC DEFAULT 0);
    CREATE TABLE IF NOT EXISTS docs_contacts (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT, name TEXT, type TEXT);
    CREATE TABLE IF NOT EXISTS docs_accounts (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT, name TEXT, code TEXT);
    CREATE TABLE IF NOT EXISTS docs_brands (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT);
    CREATE TABLE IF NOT EXISTS docs_categories (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT);
    CREATE TABLE IF NOT EXISTS docs_inventory_adjustments (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ, company_id TEXT, date DATE, status TEXT);
    CREATE TABLE IF NOT EXISTS company_doc_sequences (company_code TEXT, seq_group TEXT, last_value INTEGER, PRIMARY KEY (company_code, seq_group));
    CREATE TABLE IF NOT EXISTS company_users (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID NOT NULL, company_id TEXT NOT NULL, role TEXT DEFAULT 'USER', UNIQUE(user_id, company_id));

    CREATE TABLE IF NOT EXISTS docs_product_costs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      avg_cost NUMERIC DEFAULT 0,
      total_qty NUMERIC DEFAULT 0,
      total_value NUMERIC DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='docs_product_costs' AND column_name='created_at') THEN
        ALTER TABLE docs_product_costs ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS docs_inventory_transactions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL DEFAULT 'main-warehouse',
      transaction_type TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      reference_id TEXT,
      reference_type TEXT,
      date DATE NOT NULL,
      cost_price NUMERIC DEFAULT 0,
      unit_price NUMERIC DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='docs_inventory_transactions' AND column_name='created_at') THEN
        ALTER TABLE docs_inventory_transactions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
      END IF;
    END $$;

    DO $$
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE docs_inventory_transactions;
    EXCEPTION WHEN duplicate_object OR sqlstate '42704' OR others THEN
      NULL;
    END $$;

    DO $$
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE docs_product_costs;
    EXCEPTION WHEN duplicate_object OR sqlstate '42704' OR others THEN
      NULL;
    END $$;

    -- SYNC TRIGGER: Company ID and Metadata
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
           IF (NEW.data ? 'status') THEN NEW.status := NEW.data->>'status'; END IF;
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
           IF (NEW.data ? 'total') THEN NEW.total := (NEW.data->>'total')::NUMERIC; 
           ELSIF (NEW.data ? 'amount') THEN NEW.amount := (NEW.data->>'amount')::NUMERIC;
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
           END IF;
        EXCEPTION WHEN undefined_column THEN END;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DO $$ 
    DECLARE 
      t TEXT;
    BEGIN
      -- Tables with 'data' JSONB column
      FOR t IN SELECT unnest(ARRAY['docs_products', 'docs_contacts', 'docs_accounts', 'docs_users', 'docs_roles', 'docs_brands', 'docs_categories', 'docs_inventory_adjustments', 'docs_invoices', 'docs_bills', 'docs_payments', 'docs_credit_notes', 'docs_journals']) LOOP
        -- Remove legacy triggers from advanced_erp_upgrade
        EXECUTE format('DROP TRIGGER IF EXISTS trg_invoice_number ON %I', t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_bill_number ON %I', t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_payment_number ON %I', t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_journal_number ON %I', t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_loan_number ON %I', t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_cn_number ON %I', t);

        EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_%I_doc ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_sync_%I_doc BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_document_metadata()', t, t);
      END LOOP;
    END $$;

    -- HARDENED Journal Balance Trigger
    CREATE OR REPLACE FUNCTION check_journal_balance()
    RETURNS TRIGGER AS $$
    DECLARE
        v_debit NUMERIC := 0;
        v_credit NUMERIC := 0;
        v_line JSONB;
    BEGIN
        -- Skip check if status is not POSTED
        IF NEW.status IS NULL OR NEW.status != 'POSTED' THEN
            RETURN NEW;
        END IF;

        -- Check if relational lines exist first (this is the double-entry ground truth)
        IF EXISTS (SELECT 1 FROM docs_journal_lines WHERE journal_id = NEW.id) THEN
            SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_debit, v_credit 
            FROM docs_journal_lines 
            WHERE journal_id = NEW.id;
        ELSIF (NEW.data->'lines') IS NOT NULL AND jsonb_array_length(NEW.data->'lines') > 0 THEN
            FOR v_line IN SELECT jsonb_array_elements(NEW.data->'lines') LOOP
                v_debit := v_debit + COALESCE((v_line->>'debit')::numeric, 0);
                v_credit := v_credit + COALESCE((v_line->>'credit')::numeric, 0);
            END LOOP;
        END IF;
        
        IF ABS(v_debit - v_credit) > 0.05 THEN
            RAISE EXCEPTION 'Journal Entry % is not balanced. Debits (%) != Credits (%)', NEW.id, v_debit, v_credit;
        END IF;

        IF v_debit = 0 AND v_credit = 0 THEN
             RAISE EXCEPTION 'Journal Entry % has no value (zero-sum).', NEW.id;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_journal_balance ON docs_journals;
    CREATE TRIGGER trg_journal_balance AFTER INSERT OR UPDATE ON docs_journals FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

    -- NUMBER GENERATION TRIGGERS
    CREATE OR REPLACE FUNCTION generate_document_numbers()
    RETURNS TRIGGER AS $$
    DECLARE
      v_field TEXT;
      v_seq TEXT;
      v_cid TEXT;
      v_num TEXT;
      v_status TEXT;
    BEGIN
      v_cid := NEW.company_id;
      
      -- Try to get from data if available and cid is missing
      BEGIN
        IF v_cid IS NULL AND NEW.data IS NOT NULL THEN
          v_cid := COALESCE(NEW.data->>'companyId', NEW.data->'companyIds'->>0);
        END IF;
        
        -- Robust status check: Prefer JSON status, fallback to column status
        IF (NEW.data ? 'status') THEN
          v_status := NEW.data->>'status';
        ELSE
          -- Attempt to get from column if it exists (for flat-synced tables)
          BEGIN
            v_status := NEW.status;
          EXCEPTION WHEN undefined_column THEN
            v_status := NULL;
          END;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_status := NULL;
      END;

      IF TG_TABLE_NAME = 'docs_invoices' THEN v_field := 'number'; v_seq := 'INVOICE';
      ELSIF TG_TABLE_NAME = 'docs_bills' THEN v_field := 'number'; v_seq := 'BILL';
      ELSIF TG_TABLE_NAME = 'docs_payments' THEN v_field := 'number'; v_seq := 'PAYMENT';
      ELSIF TG_TABLE_NAME = 'docs_journals' THEN v_field := 'reference'; v_seq := COALESCE(NEW.data->>'journalType', 'JOURNAL');
      ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN v_field := 'number'; v_seq := 'CREDIT_NOTE';
      ELSIF TG_TABLE_NAME = 'docs_loans' THEN v_field := 'number'; v_seq := 'LOAN';
      ELSIF TG_TABLE_NAME = 'docs_products' THEN v_field := 'sku'; v_seq := 'PRODUCT';
      ELSIF TG_TABLE_NAME = 'docs_contacts' THEN v_field := 'externalId'; v_seq := 'CONTACT';
      END IF;

      -- Use a local variable to check the document number to avoid undefined_column on NEW.data
      DECLARE
        v_current_doc_num TEXT;
      BEGIN
        v_current_doc_num := NEW.data->>v_field;
        
        -- Only generate if status is POSTED/ACTIVE or it is a master record (product/contact)
        IF (v_status IS NULL OR v_status IN ('POSTED', 'PAID', 'PARTIAL', 'ACTIVE', 'OPEN')) AND (v_current_doc_num IS NULL OR v_current_doc_num = '' OR v_current_doc_num LIKE 'DRAFT-%') THEN
          IF v_cid IS NOT NULL THEN
            -- Skip if already has a real number to prevent double increment
            IF v_current_doc_num IS NOT NULL AND v_current_doc_num <> '' AND v_current_doc_num NOT LIKE 'DRAFT-%' THEN
               -- Number already exists, skip
            ELSE
               v_num := get_next_company_doc_number(v_cid, v_seq);
               NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), ('{' || v_field || '}')::text[], to_jsonb(v_num));
               
               -- Sync flat columns
               IF TG_TABLE_NAME = 'docs_invoices' THEN NEW.invoice_number := v_num;
               ELSIF TG_TABLE_NAME = 'docs_bills' THEN NEW.bill_number := v_num;
               ELSIF TG_TABLE_NAME = 'docs_payments' THEN NEW.payment_number := v_num;
               ELSIF TG_TABLE_NAME = 'docs_journals' THEN NEW.reference_number := v_num;
               ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN NEW.credit_note_number := v_num;
               END IF;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN undefined_column THEN
        -- Should not happen on these tables, but skip if it does
      END;

      IF TG_TABLE_NAME = 'docs_journals' THEN
         IF NEW.journal_number IS NULL THEN
            NEW.journal_number := COALESCE(NEW.reference_number, NEW.id, 'JE-' || substring(md5(random()::text) from 1 for 10));
         END IF;
         IF NEW.journal_date IS NULL THEN
            NEW.journal_date := COALESCE(NEW.date, NOW()::date);
         END IF;
         IF NEW.reference_number IS NULL THEN
            NEW.reference_number := NEW.journal_number;
         END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DO $$ 
    DECLARE 
      t TEXT;
    BEGIN
      FOR t IN SELECT unnest(ARRAY['docs_invoices', 'docs_bills', 'docs_payments', 'docs_credit_notes', 'docs_loans', 'docs_products', 'docs_contacts', 'docs_journals']) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_gen_num_%I ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_gen_num_%I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION generate_document_numbers()', t, t);
      END LOOP;
    END $$;

    -- INVENTORY TRANSACTIONS
    CREATE OR REPLACE FUNCTION update_average_cost()
    RETURNS TRIGGER AS $$
    DECLARE
       v_pid TEXT;
       v_cid TEXT;
       v_wid TEXT;
       v_cost_id TEXT;
       v_total_qty NUMERIC := 0;
       v_total_val NUMERIC := 0;
       v_avg_cost NUMERIC := 0;
       v_base_cost NUMERIC := 0;
       v_current_cost NUMERIC;
       r RECORD;
    BEGIN
       -- Recursion guard
       IF pg_trigger_depth() > 5 THEN RETURN NEW; END IF;

       v_pid := COALESCE(NEW.product_id, OLD.product_id);
       v_cid := COALESCE(NEW.company_id, OLD.company_id);
       v_wid := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
       v_cost_id := v_cid || ':' || v_pid || ':' || v_wid;

       -- Get base cost from product for fallback
       SELECT COALESCE((data->>'costPrice')::NUMERIC, 0) INTO v_base_cost FROM docs_products WHERE id = v_pid;
       v_avg_cost := v_base_cost;

       -- Sequential WAC calculation to ensure immutability and correct logic
       -- We iterate through all historical transactions for this product-warehouse combo
       FOR r IN 
         SELECT transaction_type, quantity, cost_price, reference_type
         FROM docs_inventory_transactions 
         WHERE product_id = v_pid AND warehouse_id = v_wid AND company_id = v_cid
         ORDER BY date ASC, created_at ASC 
       LOOP
          IF r.transaction_type = 'IN' THEN
             IF r.reference_type IN ('BILL', 'ADJUSTMENT', 'OPENING_STOCK') THEN
                -- RECALIBRATE WAC on Purchases/Adjustments IN/Opening Balances
                v_total_val := v_total_val + (r.quantity * r.cost_price);
                v_total_qty := v_total_qty + r.quantity;
                IF v_total_qty > 0 THEN 
                   v_avg_cost := v_total_val / v_total_qty; 
                END IF;
             ELSE
                -- OTHER INs (like Sales Returns) - MUST NOT change WAC
                -- We enter the pool at the CURRENT average cost
                v_total_qty := v_total_qty + r.quantity;
                v_total_val := v_total_qty * v_avg_cost;
             END IF;
          ELSE
             -- OUT transactions decrease stock
             IF r.reference_type = 'PURCHASE_RETURN' THEN
                -- RECALIBRATE WAC on Purchase Returns (if we return at a specific price)
                v_total_val := v_total_val - (r.quantity * r.cost_price);
                v_total_qty := v_total_qty - r.quantity;
                IF v_total_qty > 0 THEN 
                   v_avg_cost := v_total_val / v_total_qty; 
                END IF;
             ELSE
                -- SALES and other OUTs - MUST NOT change WAC
                v_total_qty := v_total_qty - r.quantity;
                v_total_val := v_total_qty * v_avg_cost;
             END IF;
          END IF;
       END LOOP;

       v_total_qty := COALESCE(v_total_qty, 0);
       v_avg_cost := COALESCE(v_avg_cost, v_base_cost);
       
       -- Get current cost to avoid redundant updates
       SELECT (data->>'costPrice')::NUMERIC INTO v_current_cost FROM docs_products WHERE id = v_pid;

       -- Edge case: If quantity is 0 or negative, we reset value to 0 but keep the last known average cost (or base cost)
       IF v_total_qty <= 0 THEN
          v_total_val := 0;
       ELSE
          v_total_val := v_total_qty * v_avg_cost;
       END IF;

       INSERT INTO docs_product_costs (id, company_id, product_id, warehouse_id, total_qty, total_value, avg_cost, updated_at)
       VALUES (v_cost_id, v_cid, v_pid, v_wid, v_total_qty, v_total_val, v_avg_cost, NOW())
       ON CONFLICT (id) DO UPDATE SET 
         total_qty = EXCLUDED.total_qty,
         total_value = EXCLUDED.total_value,
         avg_cost = EXCLUDED.avg_cost,
         updated_at = NOW();

       -- Sync back to main products table ONLY IF changed
       IF v_current_cost IS DISTINCT FROM v_avg_cost THEN
           UPDATE docs_products p
           SET data = jsonb_set(data, '{costPrice}', to_jsonb(v_avg_cost)),
               updated_at = NOW()
           WHERE id = v_pid;
       END IF;

       RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_update_average_cost ON docs_inventory_transactions;
    CREATE TRIGGER trg_update_average_cost AFTER INSERT OR UPDATE OR DELETE ON docs_inventory_transactions FOR EACH ROW EXECUTE FUNCTION update_average_cost();

    CREATE OR REPLACE FUNCTION generate_inventory_movements()
    RETURNS TRIGGER AS $$
    DECLARE
      item JSONB;
      v_wh_id TEXT;
      v_wh_id_fallback TEXT;
      v_wh_id_final TEXT;
      v_is_posted BOOLEAN;
      v_tx_cost NUMERIC;
      v_cursor RECORD;
    BEGIN
      -- Recursion guard
      IF pg_trigger_depth() > 3 THEN RETURN NEW; END IF;

      -- Status check for inventory impact
      v_is_posted := NEW.status IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN');

      -- Handle inventory adjustments (multiple items)
      IF TG_TABLE_NAME = 'docs_inventory_adjustments' AND (v_is_posted AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN'))) THEN
          IF (NEW.data->'items') IS NOT NULL THEN
            FOR item IN SELECT * FROM jsonb_array_elements(NEW.data->'items') LOOP
              v_wh_id := COALESCE(item->>'warehouseId', NEW.data->>'warehouseId', 'wh-' || NEW.company_id);
              INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price)
              VALUES (
                'mov-adj-' || NEW.id || '-' || COALESCE(item->>'productId', md5(item::text)), 
                NEW.company_id, 
                item->>'productId', 
                v_wh_id, 
                CASE WHEN (item->>'difference')::NUMERIC >= 0 THEN 'IN' ELSE 'OUT' END, 
                ABS((item->>'difference')::NUMERIC), 
                NEW.id, 
                'ADJUSTMENT', 
                COALESCE((NEW.data->>'date')::DATE, NEW.updated_at::DATE, NOW()::DATE), 
                COALESCE((item->>'costPrice')::NUMERIC, (SELECT cost_price FROM docs_products WHERE id = item->>'productId'), 0)
              )
              ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
            END LOOP;
          END IF;
      END IF;

      -- Handle Bills and Invoices (Supporting both jsonb items array and relational line tables)
      IF TG_TABLE_NAME IN ('docs_bills', 'docs_invoices', 'docs_credit_notes') AND (v_is_posted AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
         FOR v_cursor IN 
             -- JSONB items source:
             SELECT 
               t_item->>'id' AS line_id,
               t_item->>'productId' AS product_id,
               COALESCE((t_item->>'quantity')::NUMERIC, 0) AS quantity,
               COALESCE((t_item->>'netUnitCost')::NUMERIC, (t_item->>'unitPrice')::NUMERIC, (t_item->>'costPrice')::NUMERIC, 0) AS bill_unit_cost,
               COALESCE((t_item->>'unitPrice')::NUMERIC, 0) AS unit_price
             FROM jsonb_array_elements(COALESCE(NEW.data->'items', '[]'::jsonb)) AS t_item
             WHERE t_item->>'productId' IS NOT NULL AND t_item->>'productId' <> ''
             
             UNION ALL
             
             -- Relational table source: bills
             SELECT 
               id AS line_id,
               product_id,
               quantity,
               unit_price AS bill_unit_cost,
               unit_price AS unit_price
             FROM docs_bill_lines
             WHERE TG_TABLE_NAME = 'docs_bills' AND bill_id = NEW.id AND (NEW.data IS NULL OR NEW.data->'items' IS NULL OR NEW.data->'items' = '[]'::jsonb)
             
             UNION ALL
             
             -- Relational table source: invoices
             SELECT 
               id AS line_id,
               product_id,
               quantity,
               0 AS bill_unit_cost,
               unit_price
             FROM docs_invoice_lines
             WHERE TG_TABLE_NAME = 'docs_invoices' AND invoice_id = NEW.id AND (NEW.data IS NULL OR NEW.data->'items' IS NULL OR NEW.data->'items' = '[]'::jsonb)
             
             UNION ALL
             
             -- Relational table source: credit notes
             SELECT 
               id AS line_id,
               product_id,
               quantity,
               0 AS bill_unit_cost,
               unit_price
             FROM docs_credit_note_lines
             WHERE TG_TABLE_NAME = 'docs_credit_notes' AND credit_note_id = NEW.id AND (NEW.data IS NULL OR NEW.data->'items' IS NULL OR NEW.data->'items' = '[]'::jsonb)
         LOOP
             IF v_cursor.product_id IS NOT NULL AND v_cursor.product_id <> '' THEN
                -- Find default or current warehouse for the company
                SELECT COALESCE(
                  (SELECT id FROM docs_warehouses WHERE company_id = NEW.company_id AND is_default = true LIMIT 1),
                  (SELECT id FROM docs_warehouses WHERE company_id = NEW.company_id LIMIT 1),
                  'wh-' || NEW.company_id
                ) INTO v_wh_id;

                -- Determine cost price (Immutable logic)
                IF TG_TABLE_NAME = 'docs_bills' THEN
                    -- Purchases always use the transaction unit price for WAC calculation
                    v_tx_cost := v_cursor.bill_unit_cost;
                ELSE
                    -- Sales and Sales Returns do NOT change WAC. 
                    -- They must use the CURRENT WAC at the time of transaction for COGS.
                    SELECT avg_cost INTO v_tx_cost FROM docs_product_costs 
                    WHERE product_id = v_cursor.product_id AND warehouse_id = v_wh_id AND company_id = NEW.company_id;
                    
                    IF v_tx_cost IS NULL THEN
                       SELECT COALESCE((data->>'costPrice')::NUMERIC, cost_price, 0) INTO v_tx_cost FROM docs_products WHERE id = v_cursor.product_id;
                    END IF;
                END IF;

                INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
                VALUES (
                  CASE 
                    WHEN TG_TABLE_NAME = 'docs_bills' THEN 'mov-bil-' 
                    WHEN TG_TABLE_NAME = 'docs_credit_notes' THEN 'mov-cn-' 
                    ELSE 'mov-inv-' 
                  END || NEW.id || '-' || COALESCE(v_cursor.line_id, md5(v_cursor::text)),
                  NEW.company_id,
                  v_cursor.product_id,
                  v_wh_id,
                  CASE 
                    WHEN TG_TABLE_NAME = 'docs_bills' AND COALESCE(NEW.data->>'type', 'BILL') = 'PURCHASE_RETURN' THEN 'OUT'
                    WHEN TG_TABLE_NAME = 'docs_bills' THEN 'IN' 
                    WHEN TG_TABLE_NAME = 'docs_credit_notes' THEN 'IN' 
                    ELSE 'OUT' 
                  END,
                  COALESCE(v_cursor.quantity, 0),
                  NEW.id,
                  CASE 
                    WHEN TG_TABLE_NAME = 'docs_bills' AND COALESCE(NEW.data->>'type', 'BILL') = 'PURCHASE_RETURN' THEN 'PURCHASE_RETURN'
                    WHEN TG_TABLE_NAME = 'docs_bills' THEN 'BILL' 
                    WHEN TG_TABLE_NAME = 'docs_credit_notes' THEN 'CREDIT_NOTE' 
                    ELSE 'INVOICE' 
                  END,
                  COALESCE((NEW.data->>'date')::DATE, NEW.date, NEW.updated_at::DATE, NOW()::DATE),
                  COALESCE(v_tx_cost, 0),
                  COALESCE(v_cursor.unit_price, 0)
                ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
             END IF;
         END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_bill_inventory ON docs_bills;
    CREATE TRIGGER trg_bill_inventory AFTER INSERT OR UPDATE ON docs_bills FOR EACH ROW EXECUTE FUNCTION generate_inventory_movements();
    DROP TRIGGER IF EXISTS trg_invoice_inventory ON docs_invoices;
    CREATE TRIGGER trg_invoice_inventory AFTER INSERT OR UPDATE ON docs_invoices FOR EACH ROW EXECUTE FUNCTION generate_inventory_movements();
    DROP TRIGGER IF EXISTS trg_adjustment_inventory ON docs_inventory_adjustments;
    CREATE TRIGGER trg_adjustment_inventory AFTER INSERT OR UPDATE ON docs_inventory_adjustments FOR EACH ROW EXECUTE FUNCTION generate_inventory_movements();
    DROP TRIGGER IF EXISTS trg_credit_note_inventory ON docs_credit_notes;
    CREATE TRIGGER trg_credit_note_inventory AFTER INSERT OR UPDATE ON docs_credit_notes FOR EACH ROW EXECUTE FUNCTION generate_inventory_movements();

    -- Opening Balance Trigger
    CREATE OR REPLACE FUNCTION initialize_product_inventory()
    RETURNS TRIGGER AS $$
    DECLARE
      v_cid TEXT;
      v_qty NUMERIC;
      v_cost NUMERIC;
    BEGIN
      -- Recursion guard
      IF pg_trigger_depth() > 5 THEN RETURN NEW; END IF;

      -- Prevent infinite trigger loop if initial stock levels and costs have not changed
      IF (TG_OP = 'UPDATE') THEN
        IF (NEW.data->'initialStockLevels') IS NOT DISTINCT FROM (OLD.data->'initialStockLevels') 
           AND (NEW.data->>'initialCost') IS NOT DISTINCT FROM (OLD.data->>'initialCost') 
           AND (NEW.data->>'createdAt') IS NOT DISTINCT FROM (OLD.data->>'createdAt') THEN
          RETURN NEW;
        END IF;
      END IF;

      IF (NEW.data->'initialStockLevels') IS NOT NULL THEN
        FOR v_cid, v_qty IN SELECT * FROM jsonb_each_text(NEW.data->'initialStockLevels') LOOP
           v_cost := COALESCE((NEW.data->>'initialCost')::NUMERIC, (NEW.data->>'costPrice')::NUMERIC, 0);
           INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price)
           VALUES ('mov-init-' || NEW.id || '-' || v_cid, v_cid, NEW.id, 'wh-' || v_cid, 'IN', v_qty::NUMERIC, NEW.id, 'OPENING_STOCK', COALESCE((NEW.data->>'createdAt')::DATE, NOW()::DATE), v_cost)
           ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
        END LOOP;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_initialize_product_inventory ON docs_products;
    CREATE TRIGGER trg_initialize_product_inventory AFTER INSERT OR UPDATE ON docs_products FOR EACH ROW EXECUTE FUNCTION initialize_product_inventory();

    NOTIFY pgrst, 'reload schema';
  `;
  
  await client.query(sql);
  console.log("Database updated successfully!");
  await client.end();
}

updateTriggers();
