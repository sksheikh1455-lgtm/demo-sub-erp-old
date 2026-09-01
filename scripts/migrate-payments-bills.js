import pkg from 'pg';
const { Client } = pkg;
import { createClient } from '@supabase/supabase-js';

const connectionString = process.env.DATABASE_URL;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    CREATE TABLE IF NOT EXISTS docs_bills (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS docs_payments (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- RLS setup
    ALTER TABLE docs_bills ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all_bills" ON docs_bills FOR ALL USING (true) WITH CHECK (true);
    
    ALTER TABLE docs_payments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all_payments" ON docs_payments FOR ALL USING (true) WITH CHECK (true);

    -- Sequence table for company numbering
    CREATE TABLE IF NOT EXISTS company_doc_sequences (
      company_code TEXT,
      seq_group TEXT,
      last_value INTEGER DEFAULT 0,
      PRIMARY KEY (company_code, seq_group)
    );

    CREATE OR REPLACE FUNCTION get_next_company_doc_number(v_company_code TEXT, v_seq_group TEXT)
    RETURNS TEXT AS $$
    DECLARE
      v_next_val INTEGER;
    BEGIN
      INSERT INTO company_doc_sequences (company_code, seq_group, last_value)
      VALUES (v_company_code, v_seq_group, 1)
      ON CONFLICT (company_code, seq_group)
      DO UPDATE SET last_value = company_doc_sequences.last_value + 1
      RETURNING last_value INTO v_next_val;

      RETURN v_company_code || '-' || TO_CHAR(v_next_val, 'FM000000');
    END;
    $$ LANGUAGE plpgsql;

    -- Replace invoice trigger to use company numbering
    CREATE OR REPLACE FUNCTION generate_invoice_number()
    RETURNS TRIGGER AS $$
    DECLARE
      new_num TEXT;
      existing_num TEXT;
      v_company_code TEXT;
    BEGIN
      existing_num := NEW.data->>'number';
      v_company_code := NEW.data->>'companyCode';

      IF v_company_code IS NULL OR v_company_code = '' THEN
         v_company_code := COALESCE(NEW.data->>'companyId', 'CO'); -- fallback
      END IF;
      
      IF (NEW.data->>'status' = 'POSTED') AND (existing_num IS NULL OR existing_num = '' OR existing_num = 'DRAFT' OR existing_num = 'NEW') THEN
        new_num := get_next_company_doc_number(v_company_code, 'INVOICE');
        
        NEW.data := jsonb_set(
          COALESCE(NEW.data, '{}'::jsonb), 
          '{number}', 
          to_jsonb(new_num)
        );
        NEW.invoice_number := new_num;
      ELSE
        NEW.invoice_number := existing_num;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_generate_invoice_number ON docs_invoices;
    CREATE TRIGGER trg_generate_invoice_number
      BEFORE INSERT OR UPDATE ON docs_invoices
      FOR EACH ROW
      EXECUTE FUNCTION generate_invoice_number();
    CREATE OR REPLACE FUNCTION generate_bill_number()
    RETURNS TRIGGER AS $$
    DECLARE
      new_num TEXT;
      existing_num TEXT;
      v_company_code TEXT;
    BEGIN
      existing_num := NEW.data->>'number';
      v_company_code := NEW.data->>'companyCode';

      IF v_company_code IS NULL OR v_company_code = '' THEN
         v_company_code := COALESCE(NEW.data->>'companyId', 'CO');
      END IF;
      
      IF (NEW.data->>'status' = 'POSTED') AND (existing_num IS NULL OR existing_num = '' OR existing_num = 'DRAFT' OR existing_num = 'NEW') THEN
        -- SAME GROUP AS PAYMENT
        new_num := get_next_company_doc_number(v_company_code, 'PAYMENT_BILL');
        
        NEW.data := jsonb_set(
          COALESCE(NEW.data, '{}'::jsonb), 
          '{number}', 
          to_jsonb(new_num)
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_generate_bill_number ON docs_bills;
    CREATE TRIGGER trg_generate_bill_number
      BEFORE INSERT OR UPDATE ON docs_bills
      FOR EACH ROW
      EXECUTE FUNCTION generate_bill_number();

    -- Trigger for payments
    CREATE OR REPLACE FUNCTION generate_payment_number()
    RETURNS TRIGGER AS $$
    DECLARE
      new_num TEXT;
      existing_num TEXT;
      v_company_code TEXT;
    BEGIN
      existing_num := NEW.data->>'number';
      v_company_code := NEW.data->>'companyCode';

      IF v_company_code IS NULL OR v_company_code = '' THEN
         v_company_code := COALESCE(NEW.data->>'companyId', 'CO');
      END IF;
      
      IF (NEW.data->>'status' = 'POSTED') AND (existing_num IS NULL OR existing_num = '' OR existing_num = 'DRAFT' OR existing_num = 'NEW') THEN
        -- SAME GROUP AS BILL
        new_num := get_next_company_doc_number(v_company_code, 'PAYMENT_BILL');
        
        NEW.data := jsonb_set(
          COALESCE(NEW.data, '{}'::jsonb), 
          '{number}', 
          to_jsonb(new_num)
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_generate_payment_number ON docs_payments;
    CREATE TRIGGER trg_generate_payment_number
      BEFORE INSERT OR UPDATE ON docs_payments
      FOR EACH ROW
      EXECUTE FUNCTION generate_payment_number();

    NOTIFY pgrst, 'reload schema';
  `;
  
  await client.query(sql);

  // Migrate records
  const { data, error } = await supabase.from('erp_state').select('data').eq('id', 'singleton').maybeSingle();
  if (!error && data) {
     const state = data.data;
     if (state.allBills && state.allBills.length > 0) {
        const docs = state.allBills.map(p => ({ id: p.id, data: p }));
        await supabase.from('docs_bills').upsert(docs);
     }
     if (state.allPayments && state.allPayments.length > 0) {
        const docs = state.allPayments.map(p => ({ id: p.id, data: p }));
        await supabase.from('docs_payments').upsert(docs);
     }
  }

  console.log("Bills and Payments migrated!");
  await client.end();
}

migrate();
