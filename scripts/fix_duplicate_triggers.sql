
-- Fix Duplicate Triggers and Ensure Sequential Numbering

-- 1. Drop old triggers created manually
DROP TRIGGER IF EXISTS trg_generate_invoice_number ON docs_invoices;
DROP TRIGGER IF EXISTS trg_generate_bill_number ON docs_bills;
DROP TRIGGER IF EXISTS trg_generate_payment_number ON docs_payments;
DROP TRIGGER IF EXISTS trg_invoice_number ON docs_invoices;
DROP TRIGGER IF EXISTS trg_bill_number ON docs_bills;
DROP TRIGGER IF EXISTS trg_payment_number ON docs_payments;
DROP TRIGGER IF EXISTS trg_journal_number ON docs_journals;
DROP TRIGGER IF EXISTS trg_credit_note_number ON docs_credit_notes;
DROP TRIGGER IF EXISTS trg_generate_credit_note_number ON docs_credit_notes;
DROP TRIGGER IF EXISTS trg_generate_journal_number ON docs_journals;


-- 2. Ensure only the advanced ones from advanced_erp_upgrade.sql are active
-- These are already handled in advanced_erp_upgrade.sql but we re-apply them to be safe
-- with proper guards.

-- 3. Fix the shared sequence group issue if it exists
-- In migrate-payments-bills.js, Bills and Payments shared 'PAYMENT_BILL'
-- In advanced_erp_upgrade.sql, they use 'BIL' and 'PAY' which is better.

-- Re-apply the generate_document_number function with a fix for the status column
-- We check if status column exists or fallback to data->>'status'
CREATE OR REPLACE FUNCTION generate_document_number() 
RETURNS TRIGGER AS $$
DECLARE
    comp_code TEXT;
    doc_prefix TEXT;
    new_seq BIGINT;
    final_number TEXT;
    existing_num TEXT;
    v_status TEXT;
    v_company_id TEXT;
BEGIN
    -- Determine prefix based on table
    IF TG_TABLE_NAME = 'docs_invoices' THEN doc_prefix := 'INV'; 
    ELSIF TG_TABLE_NAME = 'docs_bills' THEN doc_prefix := 'BIL';
    ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN doc_prefix := 'CN';
    ELSIF TG_TABLE_NAME = 'docs_payments' THEN doc_prefix := 'PAY';
    ELSIF TG_TABLE_NAME = 'docs_journals' THEN doc_prefix := 'JEN';
    ELSIF TG_TABLE_NAME = 'docs_loans' THEN doc_prefix := 'LO';
    ELSE RETURN NEW;
    END IF;

    -- Extract status reliably
    BEGIN
        v_status := NEW.status;
    EXCEPTION WHEN OTHERS THEN
        v_status := NEW.data->>'status';
    END;
    
    IF v_status IS NULL THEN v_status := 'DRAFT'; END IF;

    -- Extract company_id reliably
    BEGIN
        v_company_id := NEW.company_id;
    EXCEPTION WHEN OTHERS THEN
        v_company_id := NEW.data->>'companyId';
    END;

    -- Get current number
    BEGIN
        IF TG_TABLE_NAME = 'docs_invoices' THEN existing_num := NEW.invoice_number;
        ELSIF TG_TABLE_NAME = 'docs_bills' THEN existing_num := NEW.bill_number;
        ELSIF TG_TABLE_NAME = 'docs_payments' THEN existing_num := NEW.payment_number;
        ELSIF TG_TABLE_NAME = 'docs_journals' THEN existing_num := NEW.reference_number;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        existing_num := NULL;
    END;

    IF existing_num IS NULL THEN
        existing_num := (NEW.data->>'number');
    END IF;

    -- Only generate if status is NOT DRAFT/VOID and we logicly need a new number
    IF (v_status NOT IN ('DRAFT', 'DELETED', 'VOID')) AND (existing_num IS NULL OR existing_num = '' OR existing_num LIKE 'DRAFT-%' OR existing_num = 'NEW') THEN
        
        -- Get company code
        SELECT code INTO comp_code FROM docs_companies WHERE id = v_company_id;
        IF comp_code IS NULL THEN comp_code := 'CO'; END IF;

        -- Increment sequence
        INSERT INTO docs_document_sequences (company_id, document_type, last_sequence)
        VALUES (v_company_id, doc_prefix, 1)
        ON CONFLICT (company_id, document_type) 
        DO UPDATE SET last_sequence = docs_document_sequences.last_sequence + 1
        RETURNING last_sequence INTO new_seq;

        final_number := doc_prefix || '-' || comp_code || '-' || LPAD(new_seq::text, 6, '0');

        -- Update both JSON and Column
        NEW.data := jsonb_set(COALESCE(NEW.data, '{}'::jsonb), '{number}', to_jsonb(final_number));

        BEGIN
            IF TG_TABLE_NAME = 'docs_invoices' THEN NEW.invoice_number := final_number;
            ELSIF TG_TABLE_NAME = 'docs_bills' THEN NEW.bill_number := final_number;
            ELSIF TG_TABLE_NAME = 'docs_payments' THEN NEW.payment_number := final_number;
            ELSIF TG_TABLE_NAME = 'docs_journals' THEN NEW.reference_number := final_number;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Columns might not exist, that's fine we have it in data JSON
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The dynamic trigges trg_gen_num_%I are already active for all tables.
