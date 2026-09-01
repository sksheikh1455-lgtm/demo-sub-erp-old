
import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function applyNumberingFix() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to DB. Applying numbering fixes...');

    const sql = `
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

        -- Map seq_group to short prefix (Using lowercase as requested in example 'inv-SUL-000001')
        v_prefix := CASE 
          WHEN v_seq_group = 'INVOICE' THEN 'inv'
          WHEN v_seq_group = 'BILL' THEN 'bil'
          WHEN v_seq_group = 'PAYMENT' THEN 'pay'
          WHEN v_seq_group = 'CREDIT_NOTE' THEN 'cn'
          WHEN v_seq_group = 'JOURNAL' THEN 'jen'
          WHEN v_seq_group = 'LOAN' THEN 'lon'
          WHEN v_seq_group = 'EXPENSE' THEN 'exp'
          WHEN v_seq_group = 'CONTACT' THEN 'con'
          WHEN v_seq_group = 'PRODUCT' THEN 'prod'
          WHEN v_seq_group = 'CATEGORY' THEN 'cat'
          WHEN v_seq_group = 'BRAND' THEN 'brnd'
          WHEN v_seq_group = 'ACCOUNT' THEN 'acc'
          ELSE LOWER(v_seq_group)
        END;

        -- Format: inv-SUL-000001
        RETURN v_prefix || '-' || v_company_code || '-' || TO_CHAR(v_next_val, 'FM000000');
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- Ensure get_company_short_code prefers the 'code' field we just updated
      CREATE OR REPLACE FUNCTION get_company_short_code(v_company_id TEXT)
      RETURNS TEXT AS $$
      DECLARE
        v_code TEXT;
        v_name TEXT;
      BEGIN
        SELECT code INTO v_code FROM docs_companies WHERE id = v_company_id;
        
        -- Fallback if code is missing
        IF v_code IS NULL OR v_code = '' OR v_code LIKE 'comp-%' THEN
           -- Try to generate from name as a last resort
           SELECT name INTO v_name FROM docs_companies WHERE id = v_company_id;
           v_code := UPPER(LEFT(v_name, 3));
        END IF;

        RETURN COALESCE(UPPER(v_code), 'CO');
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- Force a reload of the schema for PostgREST
      NOTIFY pgrst, 'reload schema';
    `;

    await client.query(sql);
    console.log('SQL applied successfully.');

    // Also update existing companies to make sure the 'code' column is populated if it's not
    // (though I already did this in data JSON, having it in the flat column is better)
    console.log('Syncing flat code columns...');
    const companiesRes = await client.query('SELECT id, data FROM docs_companies');
    for (const row of companiesRes.rows) {
      if (row.data && row.data.code) {
        await client.query('UPDATE docs_companies SET code = $1 WHERE id = $2', [row.data.code, row.id]);
      }
    }

    console.log('Update finished.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

applyNumberingFix();
