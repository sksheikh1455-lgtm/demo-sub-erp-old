
-- Advanced ERP Upgrade: Company-wise Numbering and Strict Accounting

-- 1. Document Sequences Table
CREATE TABLE IF NOT EXISTS docs_document_sequences (
    company_id TEXT,
    document_type TEXT, -- 'INV', 'BIL', 'CN', 'PAY', 'JEN', 'LO'
    last_sequence BIGINT DEFAULT 0,
    PRIMARY KEY (company_id, document_type)
);

-- 2. Function to generate document numbers
CREATE OR REPLACE FUNCTION generate_document_number() 
RETURNS TRIGGER AS $$
DECLARE
    comp_code TEXT;
    doc_prefix TEXT;
    new_seq BIGINT;
    final_number TEXT;
    existing_num TEXT;
BEGIN
    -- Only generate if status is POSTED/PAID/SENT/ACTIVE (non-draft)
    -- and numbering is not already set (or is still 'DRAFT-...')
    
    -- Determine prefix based on table
    IF TG_TABLE_NAME = 'docs_invoices' THEN doc_prefix := 'INV'; 
    ELSIF TG_TABLE_NAME = 'docs_bills' THEN doc_prefix := 'BIL';
    ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN doc_prefix := 'CN';
    ELSIF TG_TABLE_NAME = 'docs_payments' THEN doc_prefix := 'PAY';
    ELSIF TG_TABLE_NAME = 'docs_journals' THEN doc_prefix := 'JEN';
    ELSIF TG_TABLE_NAME = 'docs_loans' THEN doc_prefix := 'LO';
    ELSE RETURN NEW;
    END IF;

    -- Get current number from NEW.data
    existing_num := NULL;
    IF TG_TABLE_NAME = 'docs_invoices' THEN existing_num := NEW.invoice_number;
    ELSIF TG_TABLE_NAME = 'docs_bills' THEN existing_num := NEW.bill_number;
    ELSIF TG_TABLE_NAME = 'docs_payments' THEN existing_num := NEW.payment_number;
    ELSIF TG_TABLE_NAME = 'docs_journals' THEN existing_num := NEW.reference_number;
    ELSIF TG_TABLE_NAME = 'docs_loans' THEN existing_num := (NEW.data->>'number');
    -- CN might use data directly if it doesn't have a column
    END IF;

    IF existing_num IS NULL THEN
        existing_num := (NEW.data->>'number');
    END IF;

    -- If status is changing to something non-DRAFT and we don't have a real number yet
    IF (NEW.status NOT IN ('DRAFT', 'DELETED', 'VOID')) AND (existing_num IS NULL OR existing_num = '' OR existing_num LIKE 'DRAFT-%' OR existing_num = 'NEW') THEN
        
        -- Get company code
        SELECT code INTO comp_code FROM docs_companies WHERE id = NEW.company_id;
        IF comp_code IS NULL THEN comp_code := 'UNK'; END IF;

        -- Increment sequence atomicaly
        INSERT INTO docs_document_sequences (company_id, document_type, last_sequence)
        VALUES (NEW.company_id, doc_prefix, 1)
        ON CONFLICT (company_id, document_type) 
        DO UPDATE SET last_sequence = docs_document_sequences.last_sequence + 1
        RETURNING last_sequence INTO new_seq;

        -- Format: PREFIX-CODE-000000 (6 digits padding)
        final_number := doc_prefix || '-' || comp_code || '-' || LPAD(new_seq::text, 6, '0');

        -- Update the specific column and the JSONB data
        NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(final_number));

        IF TG_TABLE_NAME = 'docs_invoices' THEN NEW.invoice_number := final_number;
        ELSIF TG_TABLE_NAME = 'docs_bills' THEN NEW.bill_number := final_number;
        ELSIF TG_TABLE_NAME = 'docs_payments' THEN NEW.payment_number := final_number;
        ELSIF TG_TABLE_NAME = 'docs_journals' THEN NEW.reference_number := final_number;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Apply Triggers to relevant tables
DROP TRIGGER IF EXISTS trg_invoice_number ON docs_invoices;
CREATE TRIGGER trg_invoice_number BEFORE INSERT OR UPDATE ON docs_invoices
FOR EACH ROW EXECUTE FUNCTION generate_document_number();

DROP TRIGGER IF EXISTS trg_bill_number ON docs_bills;
CREATE TRIGGER trg_bill_number BEFORE INSERT OR UPDATE ON docs_bills
FOR EACH ROW EXECUTE FUNCTION generate_document_number();

DROP TRIGGER IF EXISTS trg_payment_number ON docs_payments;
CREATE TRIGGER trg_payment_number BEFORE INSERT OR UPDATE ON docs_payments
FOR EACH ROW EXECUTE FUNCTION generate_document_number();

DROP TRIGGER IF EXISTS trg_journal_number ON docs_journals;
CREATE TRIGGER trg_journal_number BEFORE INSERT OR UPDATE ON docs_journals
FOR EACH ROW EXECUTE FUNCTION generate_document_number();

DROP TRIGGER IF EXISTS trg_loan_number ON docs_loans;
CREATE TRIGGER trg_loan_number BEFORE INSERT OR UPDATE ON docs_loans
FOR EACH ROW EXECUTE FUNCTION generate_document_number();

DROP TRIGGER IF EXISTS trg_cn_number ON docs_credit_notes;
CREATE TRIGGER trg_cn_number BEFORE INSERT OR UPDATE ON docs_credit_notes
FOR EACH ROW EXECUTE FUNCTION generate_document_number();

-- 4. Add Unique Constraints
-- Note: UNIQUE constraints on (company_id, number)
-- We use COALESCE or handles NULLs for drafts (though we set DRAFT-unique_id in frontend now)
-- Better: Unique on (company_id, invoice_number) where invoice_number IS NOT NULL

ALTER TABLE docs_invoices DROP CONSTRAINT IF EXISTS uq_invoice_number_company;
ALTER TABLE docs_invoices ADD CONSTRAINT uq_invoice_number_company UNIQUE (company_id, invoice_number);

ALTER TABLE docs_bills DROP CONSTRAINT IF EXISTS uq_bill_number_company;
ALTER TABLE docs_bills ADD CONSTRAINT uq_bill_number_company UNIQUE (company_id, bill_number);

-- 5. Inventory Movement enforcement
-- Already have docs_inventory_transactions.
-- We ensure docs_products doesn't have a direct 'stock' column that we rely on for writes.
-- Stock should be a computed property in the frontend or a VIEW.

CREATE OR REPLACE VIEW product_stock_levels AS
SELECT 
    product_id,
    company_id,
    SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END) as current_stock
FROM docs_inventory_transactions
GROUP BY product_id, company_id;

-- 6. Accounting Integrity: Enforce credit = debit on posting
CREATE OR REPLACE FUNCTION check_journal_balance() 
RETURNS TRIGGER AS $$
DECLARE
    d_sum NUMERIC;
    c_sum NUMERIC;
BEGIN
    IF NEW.status = 'POSTED' THEN
        SELECT SUM(debit), SUM(credit) INTO d_sum, c_sum 
        FROM docs_journal_lines 
        WHERE journal_entry_id = NEW.id;
        
        IF d_sum != c_sum THEN
            RAISE EXCEPTION 'Journal Entry % is not balanced. Debits (%) != Credits (%)', NEW.id, d_sum, c_sum;
        END IF;

        IF d_sum = 0 AND c_sum = 0 THEN
             RAISE EXCEPTION 'Journal Entry % has no value.', NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_balance ON docs_journals;
CREATE TRIGGER trg_journal_balance BEFORE UPDATE ON docs_journals
FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
