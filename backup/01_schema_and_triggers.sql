-- ====================================================================
-- SUBORNO ERP: COMPLETE DATABASE SCHEMA, TRIGGERS & RPC PROCEDURES
-- ====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Core Tables
CREATE TABLE IF NOT EXISTS public.docs_companies (
    id TEXT PRIMARY KEY,
    name TEXT,
    code TEXT,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_accounts (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    code TEXT,
    name TEXT,
    type TEXT,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_contacts (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    company_ids TEXT[],
    name TEXT,
    type TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    external_id TEXT,
    opening_balances JSONB,
    data JSONB,
    is_customer BOOLEAN DEFAULT FALSE,
    is_vendor BOOLEAN DEFAULT FALSE,
    is_lender BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_products (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    company_ids TEXT[],
    name TEXT,
    sku TEXT,
    price NUMERIC,
    cost_price NUMERIC,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_categories (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    company_ids TEXT[],
    name TEXT,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_brands (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    company_ids TEXT[],
    name TEXT,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT,
    company_id TEXT,
    company_code TEXT,
    customer_id TEXT,
    date DATE,
    invoice_date DATE,
    due_date DATE,
    status TEXT,
    total NUMERIC,
    subtotal NUMERIC,
    tax_total NUMERIC,
    discount_total NUMERIC,
    total_profit NUMERIC,
    salesperson TEXT,
    sr_id TEXT,
    created_by_id TEXT,
    reference TEXT,
    customer_note TEXT,
    delivery_person TEXT,
    messages JSONB,
    journal_entry_id TEXT,
    version INT DEFAULT 1,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_invoice_lines (
    id TEXT PRIMARY KEY,
    invoice_id TEXT REFERENCES public.docs_invoices(id) ON DELETE CASCADE,
    company_id TEXT,
    product_id TEXT,
    type TEXT,
    uom TEXT,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    line_value NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    discount_mode TEXT,
    discount_rate NUMERIC DEFAULT 0,
    cost_price_at_sale NUMERIC DEFAULT 0,
    tax NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    description TEXT,
    display_description TEXT,
    serial_numbers TEXT[],
    display_index INT DEFAULT 0,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT,
    company_id TEXT,
    company_code TEXT,
    vendor_id TEXT,
    date DATE,
    bill_date DATE,
    due_date DATE,
    status TEXT,
    total NUMERIC,
    subtotal NUMERIC,
    tax_total NUMERIC,
    discount_total NUMERIC,
    created_by_id TEXT,
    reference TEXT,
    journal_entry_id TEXT,
    version INT DEFAULT 1,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_bill_lines (
    id TEXT PRIMARY KEY,
    bill_id TEXT REFERENCES public.docs_bills(id) ON DELETE CASCADE,
    company_id TEXT,
    product_id TEXT,
    type TEXT,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    line_value NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    discount_mode TEXT,
    discount_rate NUMERIC DEFAULT 0,
    discount_value NUMERIC DEFAULT 0,
    tax NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    description TEXT,
    serial_numbers TEXT[],
    display_index INT DEFAULT 0,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_journals (
    id TEXT PRIMARY KEY,
    journal_number TEXT,
    reference_number TEXT,
    company_id TEXT,
    company_code TEXT,
    date DATE,
    journal_date DATE,
    journal_type TEXT,
    status TEXT,
    reference TEXT,
    description TEXT,
    created_by_id TEXT,
    prepared_by TEXT,
    is_immutable BOOLEAN DEFAULT FALSE,
    reversal_of_id TEXT,
    reversed_by_id TEXT,
    fiscal_period_id TEXT,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_journal_lines (
    id TEXT PRIMARY KEY,
    journal_id TEXT REFERENCES public.docs_journals(id) ON DELETE CASCADE,
    company_id TEXT,
    account_id TEXT,
    contact_id TEXT,
    debit NUMERIC DEFAULT 0,
    credit NUMERIC DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_payments (
    id TEXT PRIMARY KEY,
    payment_number TEXT,
    company_id TEXT,
    contact_id TEXT,
    date DATE,
    payment_date DATE,
    status TEXT,
    amount NUMERIC DEFAULT 0,
    type TEXT,
    method TEXT,
    payment_method TEXT,
    account_id TEXT,
    partner_account_id TEXT,
    reference TEXT,
    applied_invoices JSONB,
    applied_bills JSONB,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_inventory_transactions (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    product_id TEXT,
    warehouse_id TEXT,
    transaction_type TEXT,
    quantity NUMERIC DEFAULT 0,
    cost_price NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    reference_id TEXT,
    reference_type TEXT,
    date DATE,
    created_by_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_credit_notes (
    id TEXT PRIMARY KEY,
    credit_note_number TEXT,
    cn_number TEXT,
    company_id TEXT,
    customer_id TEXT,
    date DATE,
    status TEXT,
    total NUMERIC DEFAULT 0,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_credit_note_lines (
    id TEXT PRIMARY KEY,
    credit_note_id TEXT,
    company_id TEXT,
    product_id TEXT,
    type TEXT,
    uom TEXT,
    description TEXT,
    display_description TEXT,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    line_value NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    discount_mode TEXT,
    discount_rate NUMERIC DEFAULT 0,
    serial_numbers TEXT[],
    display_index INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_loans (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    contact_id TEXT,
    principal_amount NUMERIC DEFAULT 0,
    interest_rate NUMERIC DEFAULT 0,
    term_months INT DEFAULT 1,
    interest_type TEXT DEFAULT 'REDUCING',
    start_date DATE,
    status TEXT,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.docs_users (
    id TEXT PRIMARY KEY,
    user_uuid UUID,
    name TEXT,
    username TEXT,
    email TEXT,
    role_id TEXT,
    status TEXT,
    company_id TEXT,
    company_ids TEXT[],
    pin TEXT,
    email_confirmed BOOLEAN DEFAULT TRUE,
    data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_invoices_comp ON public.docs_invoices (company_id, date);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_inv ON public.docs_invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_bills_comp ON public.docs_bills (company_id, date);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON public.docs_bill_lines (bill_id);
CREATE INDEX IF NOT EXISTS idx_journals_comp ON public.docs_journals (company_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON public.docs_journal_lines (journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_acc ON public.docs_journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_contact ON public.docs_journal_lines (contact_id);
CREATE INDEX IF NOT EXISTS idx_payments_comp ON public.docs_payments (company_id, date);
CREATE INDEX IF NOT EXISTS idx_inv_tx_prod ON public.docs_inventory_transactions (product_id, company_id);

-- 4. RPC Functions & Stored Procedures
CREATE OR REPLACE FUNCTION public.get_user_email(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT email FROM public.docs_users WHERE lower(username) = lower(p_username) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.create_bill(p_bill jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bill_id uuid;
    v_bill_number text;
    v_company_id uuid;
    v_vendor_id uuid;
    v_date date;
    v_status text;
    v_total numeric;
    v_lines jsonb;
    v_line jsonb;
BEGIN
    v_bill_id := (p_bill->>'id')::uuid;
    v_company_id := (p_bill->>'companyId')::uuid;
    v_vendor_id := COALESCE(p_bill->>'vendorId', p_bill->>'supplierId')::uuid;
    v_date := (p_bill->>'date')::date;
    v_status := COALESCE(p_bill->>'status', 'DRAFT');
    v_total := COALESCE((p_bill->>'total')::numeric, 0);
    v_lines := p_bill->'items';
    v_bill_number := p_bill->>'number';
    
    IF v_bill_number = 'DRAFT' OR v_bill_number = 'NEW' OR v_bill_number LIKE 'DRAFT-%' THEN
        v_bill_number := NULL;
    END IF;
    
    INSERT INTO public.docs_bills (
        id, company_id, vendor_id, date, status, total, data, bill_number
    ) VALUES (
        v_bill_id, v_company_id, v_vendor_id, v_date, v_status, v_total, p_bill, v_bill_number
    )
    ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        vendor_id = EXCLUDED.vendor_id,
        date = EXCLUDED.date,
        total = EXCLUDED.total,
        status = EXCLUDED.status,
        bill_number = EXCLUDED.bill_number
    RETURNING bill_number INTO v_bill_number;
    
    p_bill := jsonb_set(p_bill, '{number}', to_jsonb(v_bill_number));
    UPDATE public.docs_bills SET data = p_bill WHERE id = v_bill_id;
    
    DELETE FROM public.docs_bill_lines WHERE bill_id = v_bill_id;
    
    IF v_lines IS NOT NULL AND jsonb_array_length(v_lines) > 0 THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
        LOOP
            INSERT INTO public.docs_bill_lines (
                id, bill_id, company_id, product_id, quantity, unit_price, discount, tax, total, description, line_value, discount_rate, discount_mode, discount_value, type, display_index, data
            ) VALUES (
                COALESCE((v_line->>'id')::uuid, gen_random_uuid()),
                v_bill_id,
                v_company_id,
                (v_line->>'productId')::uuid,
                COALESCE((v_line->>'quantity')::numeric, 0),
                COALESCE((v_line->>'unitPrice')::numeric, COALESCE((v_line->>'rate')::numeric, 0)),
                COALESCE((v_line->>'discount')::numeric, COALESCE((v_line->>'discount_value')::numeric, 0)),
                COALESCE((v_line->>'tax')::numeric, COALESCE((v_line->>'taxValue')::numeric, 0)),
                COALESCE((v_line->>'lineValue')::numeric, COALESCE((v_line->>'total')::numeric, COALESCE((v_line->>'amount')::numeric, 0))),
                v_line->>'description',
                COALESCE((v_line->>'lineValue')::numeric, COALESCE((v_line->>'total')::numeric, COALESCE((v_line->>'amount')::numeric, 0))),
                COALESCE((v_line->>'discountRate')::numeric, 0),
                v_line->>'discountMode',
                COALESCE((v_line->>'discount')::numeric, COALESCE((v_line->>'discount_value')::numeric, 0)),
                COALESCE(v_line->>'type', 'PRODUCT'),
                COALESCE((v_line->>'display_index')::integer, 0),
                v_line
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id, 'bill_number', v_bill_number, 'data', p_bill);
END;
$$;

-- 5. Inventory Transaction Triggers
CREATE OR REPLACE FUNCTION public.sync_invoice_inventory()
RETURNS trigger AS $$
DECLARE
    v_item JSONB;
    v_cost NUMERIC;
    v_idx INT := 0;
    v_should_run BOOLEAN := false;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('POSTED', 'PAID') THEN
            v_should_run := true;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IN ('POSTED', 'PAID') AND OLD.status NOT IN ('POSTED', 'PAID') THEN
            v_should_run := true;
        END IF;
    END IF;

    IF v_should_run THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'items') = 'array' THEN NEW.data->'items' ELSE '[]'::jsonb END) LOOP
            v_idx := v_idx + 1;
            IF v_item->>'type' = 'PRODUCT' THEN
                SELECT COALESCE(cost_price, (data->>'costPrice')::numeric, 0) INTO v_cost 
                FROM docs_products WHERE id = v_item->>'productId';
                
                INSERT INTO docs_inventory_transactions (
                    id, company_id, product_id, warehouse_id, transaction_type, 
                    quantity, reference_id, reference_type, date, cost_price, updated_at
                ) VALUES (
                    'mov-inv-' || NEW.id || '-' || v_idx, 
                    COALESCE(NEW.company_id, NEW.data->>'companyId'), 
                    v_item->>'productId', 
                    'WH-MAIN-' || COALESCE(NEW.company_id, NEW.data->>'companyId'), 
                    'OUT', 
                    COALESCE((v_item->>'quantity')::numeric, 0), 
                    NEW.id, 
                    'INVOICE', 
                    NEW.date, 
                    COALESCE(v_cost, 0), 
                    NOW()
                ) ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_invoice_inventory ON public.docs_invoices;
CREATE TRIGGER trg_sync_invoice_inventory
AFTER INSERT OR UPDATE ON public.docs_invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_inventory();
