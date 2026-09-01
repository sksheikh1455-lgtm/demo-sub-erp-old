import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Replacing get_company_short_code function...');
  await client.query(`
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
            FROM UNNEST(REGEXP_SPLIT_TO_ARRAY(v_name, '\\s+')) AS word
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
  `);

  console.log('Replacement complete. Now testing post_invoice on our test invoice...');
  
  // Find an invoice to test
  const { rows } = await client.query(`SELECT id, company_id FROM docs_invoices ORDER BY updated_at DESC LIMIT 1`);
  if (rows.length === 0) {
    console.log("No invoices found to test.");
    await client.end();
    return;
  }
  const invoice = rows[0];
  console.log('Testing post_invoice on: %o', invoice);
  
  try {
    const { rows: rpcRes } = await client.query(`SELECT post_invoice($1, $2) as res`, [invoice.id, invoice.company_id]);
    console.log('SUCCESS! Result:', rpcRes[0].res);
  } catch (err: any) {
    console.error('FAILED with error:');
    console.error(err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.where) console.error('Where (Context):', err.where);
  }

  await client.end();
}
run().catch(console.error);
