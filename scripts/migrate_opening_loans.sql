-- SQL Migration: Loan Management Module & Opening Loan Liabilities
-- Target platform: PostgreSQL (Supabase)

BEGIN;

-- 1. Ensure columns exist on docs_contacts table (they should, but guard in case)
ALTER TABLE docs_contacts ADD COLUMN IF NOT EXISTS is_customer BOOLEAN DEFAULT false;
ALTER TABLE docs_contacts ADD COLUMN IF NOT EXISTS is_vendor BOOLEAN DEFAULT false;
ALTER TABLE docs_contacts ADD COLUMN IF NOT EXISTS is_lender BOOLEAN DEFAULT false;

-- 2. Configure/re-create Name Cleaning Trigger or function
CREATE OR REPLACE FUNCTION clean_contact_name()
RETURNS TRIGGER AS $$
DECLARE
  cleaned_name TEXT;
BEGIN
  cleaned_name := NEW.name;
  cleaned_name := regexp_replace(cleaned_name, '\s*\(\s*LOAN\s*\)\s*', ' ', 'gi');
  cleaned_name := regexp_replace(cleaned_name, '\s*\bLOAN\b\s*', ' ', 'gi');
  cleaned_name := regexp_replace(cleaned_name, '\s*\(\s*Customer\s*\)\s*', ' ', 'gi');
  cleaned_name := regexp_replace(cleaned_name, '\s*\(\s*Vendor\s*\)\s*', ' ', 'gi');
  cleaned_name := regexp_replace(cleaned_name, '\s*\(\s*Employee\s*\)\s*', ' ', 'gi');
  cleaned_name := regexp_replace(cleaned_name, '\s+', ' ', 'g');
  cleaned_name := trim(cleaned_name);
  
  NEW.name := cleaned_name;
  
  IF NEW.data IS NOT NULL AND jsonb_typeof(NEW.data) = 'object' THEN
     NEW.data := jsonb_set(NEW.data, '{name}', to_jsonb(cleaned_name));
     NEW.data := jsonb_set(NEW.data, '{isCustomer}', to_jsonb(COALESCE(NEW.is_customer, false)));
     NEW.data := jsonb_set(NEW.data, '{isVendor}', to_jsonb(COALESCE(NEW.is_vendor, false)));
     NEW.data := jsonb_set(NEW.data, '{isLender}', to_jsonb(COALESCE(NEW.is_lender, false)));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create the trigger if it doesn't already exist or to be sure it is up to date
DROP TRIGGER IF EXISTS trg_clean_contact_name ON docs_contacts;
CREATE TRIGGER trg_clean_contact_name
BEFORE INSERT OR UPDATE ON docs_contacts
FOR EACH ROW
EXECUTE FUNCTION clean_contact_name();


-- 3. Upsert Lenders into docs_contacts
-- We use the pre-determined contact UUIDs mapped to existing specific accounts
INSERT INTO docs_contacts (id, name, type, company_id, company_ids, is_customer, is_vendor, is_lender, external_id, data)
VALUES
  (
    '10c7aa1a-172f-4722-8cd8-3baa6105f99c', 
    'Baccho Mia Mama', 
    'VENDOR', 
    'comp-1', 
    ARRAY['comp-1']::text[], 
    false, 
    false, 
    true, 
    'CON-SUL-LN10C7AA', 
    '{"id": "10c7aa1a-172f-4722-8cd8-3baa6105f99c", "name": "Baccho Mia Mama", "type": "VENDOR", "isLender": true, "isVendor": false, "companyId": "comp-1", "companyIds": ["comp-1"], "externalId": "CON-SUL-LN10C7AA", "isCustomer": false, "openingBalance": 0, "openingBalances": {}}'::jsonb
  ),
  (
    'a0e0513b-54d7-4f1e-9d05-38abfd79cb3b', 
    'EMDADUL VAI (COURT MOSJID)', 
    'VENDOR', 
    'comp-1', 
    ARRAY['comp-1']::text[], 
    false, 
    false, 
    true, 
    'CON-SUL-LNA0E051', 
    '{"id": "a0e0513b-54d7-4f1e-9d05-38abfd79cb3b", "name": "EMDADUL VAI (COURT MOSJID)", "type": "VENDOR", "isLender": true, "isVendor": false, "companyId": "comp-1", "companyIds": ["comp-1"], "externalId": "CON-SUL-LNA0E051", "isCustomer": false, "openingBalance": 0, "openingBalances": {}}'::jsonb
  ),
  (
    '6018b07e-6fe1-4493-87e0-43600cdab76e', 
    'MAHABUB MAMA ISLAMBAG', 
    'VENDOR', 
    'comp-1', 
    ARRAY['comp-1']::text[], 
    false, 
    false, 
    true, 
    'CON-SUL-LN6018B0', 
    '{"id": "6018b07e-6fe1-4493-87e0-43600cdab76e", "name": "MAHABUB MAMA ISLAMBAG", "type": "VENDOR", "isLender": true, "isVendor": false, "companyId": "comp-1", "companyIds": ["comp-1"], "externalId": "CON-SUL-LN6018B0", "isCustomer": false, "openingBalance": 0, "openingBalances": {}}'::jsonb
  ),
  (
    '36850fc2-2e47-433b-814d-ed37c891018e', 
    'MOMOTAZ NASRIN', 
    'VENDOR', 
    'comp-1', 
    ARRAY['comp-1']::text[], 
    false, 
    false, 
    true, 
    'CON-SUL-LN36850F', 
    '{"id": "36850fc2-2e47-433b-814d-ed37c891018e", "name": "MOMOTAZ NASRIN", "type": "VENDOR", "isLender": true, "isVendor": false, "companyId": "comp-1", "companyIds": ["comp-1"], "externalId": "CON-SUL-LN36850F", "isCustomer": false, "openingBalance": 0, "openingBalances": {}}'::jsonb
  ),
  (
    '08de120d-f8d3-4ba0-bf5a-c1eeb13224de', 
    'MONOWARA BEGUM', 
    'VENDOR', 
    'comp-1', 
    ARRAY['comp-1']::text[], 
    false, 
    false, 
    true, 
    'CON-SUL-LN08DE12', 
    '{"id": "08de120d-f8d3-4ba0-bf5a-c1eeb13224de", "name": "MONOWARA BEGUM", "type": "VENDOR", "isLender": true, "isVendor": false, "companyId": "comp-1", "companyIds": ["comp-1"], "externalId": "CON-SUL-LN08DE12", "isCustomer": false, "openingBalance": 0, "openingBalances": {}}'::jsonb
  ),
  (
    'b1e0513b-54d7-4f1e-9d05-38abfd79cb3c', 
    'STANDARD BANK', 
    'VENDOR', 
    'comp-1', 
    ARRAY['comp-1']::text[], 
    false, 
    false, 
    true, 
    'CON-SUL-LNB1E051', 
    '{"id": "b1e0513b-54d7-4f1e-9d05-38abfd79cb3c", "name": "STANDARD BANK", "type": "VENDOR", "isLender": true, "isVendor": false, "companyId": "comp-1", "companyIds": ["comp-1"], "externalId": "CON-SUL-LNB1E051", "isCustomer": false, "openingBalance": 0, "openingBalances": {}}'::jsonb
  )
ON CONFLICT (id) DO UPDATE 
SET 
  name = EXCLUDED.name,
  is_lender = true,
  data = jsonb_set(docs_contacts.data, '{name}', to_jsonb(EXCLUDED.name));


-- 4. Upsert corresponding Loans in docs_loans
-- Each loan is RECEIVED (loan payable), status = ACTIVE, rate = 9%, term = 12 months, interestType = REDUCING
INSERT INTO docs_loans (id, company_id, loan_number, date, amount, status, name, type, contact_id, start_date, term_months, interest_rate, interest_type, principal_amount, paid_periods, journal_entry_id, notes, data)
VALUES
  (
    'loan-op-10c7aa1a-172f-4722-8cd8-3baa6105f99c',
    'comp-1',
    'LOAN-OP-10C7AA1A',
    CURRENT_DATE,
    1200000.00,
    'ACTIVE',
    'Opening Loan - Baccho Mia Mama',
    'RECEIVED',
    '10c7aa1a-172f-4722-8cd8-3baa6105f99c',
    '2026-06-06',
    12,
    9.0,
    'REDUCING',
    1200000.00,
    ARRAY[]::text[],
    'JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c',
    'Opening loan liability migration',
    '{}'::jsonb
  ),
  (
    'loan-op-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
    'comp-1',
    'LOAN-OP-A0E0513B',
    CURRENT_DATE,
    16000000.00,
    'ACTIVE',
    'Opening Loan - EMDADUL VAI (COURT MOSJID)',
    'RECEIVED',
    'a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
    '2026-06-06',
    12,
    9.0,
    'REDUCING',
    16000000.00,
    ARRAY[]::text[],
    'JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
    'Opening loan liability migration',
    '{}'::jsonb
  ),
  (
    'loan-op-6018b07e-6fe1-4493-87e0-43600cdab76e',
    'comp-1',
    'LOAN-OP-6018B07E',
    CURRENT_DATE,
    200000.00,
    'ACTIVE',
    'Opening Loan - MAHABUB MAMA ISLAMBAG',
    'RECEIVED',
    '6018b07e-6fe1-4493-87e0-43600cdab76e',
    '2026-06-06',
    12,
    9.0,
    'REDUCING',
    200000.00,
    ARRAY[]::text[],
    'JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e',
    'Opening loan liability migration',
    '{}'::jsonb
  ),
  (
    'loan-op-36850fc2-2e47-433b-814d-ed37c891018e',
    'comp-1',
    'LOAN-OP-36850FC2',
    CURRENT_DATE,
    270110.00,
    'ACTIVE',
    'Opening Loan - MOMOTAZ NASRIN',
    'RECEIVED',
    '36850fc2-2e47-433b-814d-ed37c891018e',
    '2026-06-06',
    12,
    9.0,
    'REDUCING',
    270110.00,
    ARRAY[]::text[],
    'JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e',
    'Opening loan liability migration',
    '{}'::jsonb
  ),
  (
    'loan-op-08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
    'comp-1',
    'LOAN-OP-08DE120D',
    CURRENT_DATE,
    1344698.00,
    'ACTIVE',
    'Opening Loan - MONOWARA BEGUM',
    'RECEIVED',
    '08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
    '2026-06-06',
    12,
    9.0,
    'REDUCING',
    1344698.00,
    ARRAY[]::text[],
    'JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
    'Opening loan liability migration',
    '{}'::jsonb
  ),
  (
    'loan-op-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c',
    'comp-1',
    'LOAN-OP-B1E0513B',
    CURRENT_DATE,
    32252981.00,
    'ACTIVE',
    'Opening Loan - STANDARD BANK',
    'RECEIVED',
    'b1e0513b-54d7-4f1e-9d05-38abfd79cb3c',
    '2026-06-06',
    12,
    9.0,
    'REDUCING',
    32252981.00,
    ARRAY[]::text[],
    'JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c',
    'Opening loan liability migration',
    '{}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  amount = EXCLUDED.amount,
  principal_amount = EXCLUDED.principal_amount,
  start_date = EXCLUDED.start_date,
  interest_rate = EXCLUDED.interest_rate,
  interest_type = EXCLUDED.interest_type,
  status = 'ACTIVE';


-- 5. Creating corresponding Opening Balance Journal Headers in docs_journals
INSERT INTO docs_journals (id, company_id, journal_date, journal_number, reference, description, journal_type, status, company_code, is_immutable)
VALUES
  (
    'JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c',
    'comp-1',
    '2026-06-06',
    'JEN-OPLN-10C7AA1A',
    'JEN-OPLN-10C7AA1A',
    'Opening Loan Balance Migration: Baccho Mia Mama',
    'MANUAL',
    'POSTED',
    'SUL',
    true
  ),
  (
    'JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
    'comp-1',
    '2026-06-06',
    'JEN-OPLN-A0E0513B',
    'JEN-OPLN-A0E0513B',
    'Opening Loan Balance Migration: EMDADUL VAI (COURT MOSJID)',
    'MANUAL',
    'POSTED',
    'SUL',
    true
  ),
  (
    'JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e',
    'comp-1',
    '2026-06-06',
    'JEN-OPLN-6018B07E',
    'JEN-OPLN-6018B07E',
    'Opening Loan Balance Migration: MAHABUB MAMA ISLAMBAG',
    'MANUAL',
    'POSTED',
    'SUL',
    true
  ),
  (
    'JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e',
    'comp-1',
    '2026-06-06',
    'JEN-OPLN-36850FC2',
    'JEN-OPLN-36850FC2',
    'Opening Loan Balance Migration: MOMOTAZ NASRIN',
    'MANUAL',
    'POSTED',
    'SUL',
    true
  ),
  (
    'JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
    'comp-1',
    '2026-06-06',
    'JEN-OPLN-08DE120D',
    'JEN-OPLN-08DE120D',
    'Opening Loan Balance Migration: MONOWARA BEGUM',
    'MANUAL',
    'POSTED',
    'SUL',
    true
  ),
  (
    'JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c',
    'comp-1',
    '2026-06-06',
    'JEN-OPLN-B1E0513B',
    'JEN-OPLN-B1E0513B',
    'Opening Loan Balance Migration: STANDARD BANK',
    'MANUAL',
    'POSTED',
    'SUL',
    true
  )
ON CONFLICT (id) DO UPDATE
SET
  description = EXCLUDED.description,
  status = 'POSTED';


-- 6. Creating corresponding Opening Balance Journal Lines in docs_journal_lines
-- Delete existing lines first to avoid duplicate primary key violations or out-of-balance entries
DELETE FROM docs_journal_lines
WHERE journal_id IN (
  'JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c',
  'JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
  'JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e',
  'JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e',
  'JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
  'JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c'
);

INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
VALUES
  -- Baccho Mia Mama (1,200,000.00)
  (
    'JL-JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c-eq',
    'JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c',
    'comp-1',
    'comp-1-300100',
    1200000.00,
    0.00,
    'Opening Equity Debit Offset for Baccho Mia Mama',
    NULL
  ),
  (
    'JL-JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c-loan',
    'JE-OPLN-10c7aa1a-172f-4722-8cd8-3baa6105f99c',
    'comp-1',
    'comp-1-2101',
    0.00,
    1200000.00,
    'Opening Loan Liability for Baccho Mia Mama',
    '10c7aa1a-172f-4722-8cd8-3baa6105f99c'
  ),

  -- EMDADUL VAI (COURT MOSJID) (16,000,000.00)
  (
    'JL-JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b-eq',
    'JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
    'comp-1',
    'comp-1-300100',
    16000000.00,
    0.00,
    'Opening Equity Debit Offset for EMDADUL VAI (COURT MOSJID)',
    NULL
  ),
  (
    'JL-JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b-loan',
    'JE-OPLN-a0e0513b-54d7-4f1e-9d05-38abfd79cb3b',
    'comp-1',
    'comp-1-2101',
    0.00,
    16000000.00,
    'Opening Loan Liability for EMDADUL VAI (COURT MOSJID)',
    'a0e0513b-54d7-4f1e-9d05-38abfd79cb3b'
  ),

  -- MAHABUB MAMA ISLAMBAG (200,000.00)
  (
    'JL-JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e-eq',
    'JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e',
    'comp-1',
    'comp-1-300100',
    200000.00,
    0.00,
    'Opening Equity Debit Offset for MAHABUB MAMA ISLAMBAG',
    NULL
  ),
  (
    'JL-JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e-loan',
    'JE-OPLN-6018b07e-6fe1-4493-87e0-43600cdab76e',
    'comp-1',
    'comp-1-2101',
    0.00,
    200000.00,
    'Opening Loan Liability for MAHABUB MAMA ISLAMBAG',
    '6018b07e-6fe1-4493-87e0-43600cdab76e'
  ),

  -- MOMOTAZ NASRIN (270,110.00)
  (
    'JL-JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e-eq',
    'JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e',
    'comp-1',
    'comp-1-300100',
    270110.00,
    0.00,
    'Opening Equity Debit Offset for MOMOTAZ NASRIN',
    NULL
  ),
  (
    'JL-JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e-loan',
    'JE-OPLN-36850fc2-2e47-433b-814d-ed37c891018e',
    'comp-1',
    'comp-1-2101',
    0.00,
    270110.00,
    'Opening Loan Liability for MOMOTAZ NASRIN',
    '36850fc2-2e47-433b-814d-ed37c891018e'
  ),

  -- MONOWARA BEGUM (1,344,698.00)
  (
    'JL-JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de-eq',
    'JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
    'comp-1',
    'comp-1-300100',
    1344698.00,
    0.00,
    'Opening Equity Debit Offset for MONOWARA BEGUM',
    NULL
  ),
  (
    'JL-JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de-loan',
    'JE-OPLN-08de120d-f8d3-4ba0-bf5a-c1eeb13224de',
    'comp-1',
    'comp-1-2101',
    0.00,
    1344698.00,
    'Opening Loan Liability for MONOWARA BEGUM',
    '08de120d-f8d3-4ba0-bf5a-c1eeb13224de'
  ),

  -- STANDARD BANK (32,252,981.00)
  (
    'JL-JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c-eq',
    'JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c',
    'comp-1',
    'comp-1-300100',
    32252981.00,
    0.00,
    'Opening Equity Debit Offset for STANDARD BANK',
    NULL
  ),
  (
    'JL-JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c-loan',
    'JE-OPLN-b1e0513b-54d7-4f1e-9d05-38abfd79cb3c',
    'comp-1',
    'comp-1-2101',
    0.00,
    32252981.00,
    'Opening Loan Liability for STANDARD BANK',
    'b1e0513b-54d7-4f1e-9d05-38abfd79cb3c'
  );

COMMIT;
