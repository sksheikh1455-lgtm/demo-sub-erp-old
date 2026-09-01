import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function setupAcidDatabase() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    -- Default UUID overrides for all docs tables
    DO $$
    DECLARE
      rec RECORD;
    BEGIN
      FOR rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name LIKE 'docs_%' 
          AND table_type = 'BASE TABLE'
      LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = rec.table_name AND column_name = 'id') THEN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;', rec.table_name);
        END IF;
      END LOOP;
    END;
    $$;

    -- Ensure company_doc_sequences exists
    CREATE TABLE IF NOT EXISTS company_doc_sequences (
      company_code TEXT, 
      seq_group TEXT, 
      last_value INTEGER, 
      PRIMARY KEY (company_code, seq_group)
    );

    -- Locking sequences to enforce ACID numbering (gapless, transaction-bound)
    CREATE OR REPLACE FUNCTION get_next_company_doc_number(v_company_id TEXT, v_seq_group TEXT)
    RETURNS TEXT AS $func$
    DECLARE
      v_next_val INTEGER;
      v_prefix TEXT;
      v_company_code TEXT;
    BEGIN
      v_company_code := get_company_short_code(v_company_id);

      -- Perform an ACID compliant upsert sequence generation 
      -- Row-level locking occurs here. If the parent transaction rolls back, this sequence generation also rolls back, ensuring gapless numbering.
      INSERT INTO company_doc_sequences (company_code, seq_group, last_value)
      VALUES (v_company_code, v_seq_group, 1)
      ON CONFLICT (company_code, seq_group)
      DO UPDATE SET last_value = company_doc_sequences.last_value + 1
      RETURNING last_value INTO v_next_val;

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

      RETURN v_prefix || '-' || v_company_code || '-' || TO_CHAR(v_next_val, 'FM000000');
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER;

    NOTIFY pgrst, 'reload schema';
  `;
  
  await client.query(sql);
  console.log("Database SQL refactored with UUID defaults and ACID locking sequences.");
  await client.end();
}

setupAcidDatabase().catch(console.error);
