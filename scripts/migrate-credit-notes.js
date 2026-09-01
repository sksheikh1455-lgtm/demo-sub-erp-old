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
    -- Create docs_credit_notes
    CREATE TABLE IF NOT EXISTS docs_credit_notes (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE docs_credit_notes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "all_credit_notes" ON docs_credit_notes;
    CREATE POLICY "all_credit_notes" ON docs_credit_notes FOR ALL USING (true) WITH CHECK (true);

    -- Update numbering groups
    -- Ensure we have groups for INVOICE, PAYMENT_BILL, CREDIT_NOTE, JOURNAL, EXPENSE
    
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

      -- Format: CO-000001
      RETURN v_company_code || '-' || TO_CHAR(v_next_val, 'FM000000');
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger for Credit Notes
    CREATE OR REPLACE FUNCTION generate_credit_note_number()
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
        new_num := get_next_company_doc_number(v_company_code, 'CREDIT_NOTE');
        
        NEW.data := jsonb_set(
          COALESCE(NEW.data, '{}'::jsonb), 
          '{number}', 
          to_jsonb(new_num)
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_generate_credit_note_number ON docs_credit_notes;
    CREATE TRIGGER trg_generate_credit_note_number
      BEFORE INSERT OR UPDATE ON docs_credit_notes
      FOR EACH ROW
      EXECUTE FUNCTION generate_credit_note_number();

    NOTIFY pgrst, 'reload schema';
  `;
  
  await client.query(sql);

  // Migrate records
  const { data, error } = await supabase.from('erp_state').select('data').eq('id', 'singleton').maybeSingle();
  if (!error && data) {
     const state = data.data;
     if (state.allCreditNotes && state.allCreditNotes.length > 0) {
        const docs = state.allCreditNotes.map(cn => ({ id: cn.id, data: cn }));
        await supabase.from('docs_credit_notes').upsert(docs);
     }
  }

  console.log("Credit Notes migrated and triggers set up!");
  await client.end();
}

migrate();
