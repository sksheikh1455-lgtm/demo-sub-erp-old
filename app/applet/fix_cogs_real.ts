import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Fetching post_invoice definition...');
  let argsRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) as def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'post_invoice'
  `);
  
  if (argsRes.rows.length > 0) {
      let fullDef = argsRes.rows[0].def;
      fullDef = fullDef.replace(/IF v_cogs_acc IS NOT NULL AND v_inv_asset_acc IS NOT NULL THEN[\s\S]*?END IF;/g, '-- Removed manual COGS insertion as it is handled by inventory triggers');
      await client.query(`CREATE OR REPLACE ${fullDef.substring(fullDef.indexOf('FUNCTION'))}`);
      console.log('post_invoice patched.');
  }

  console.log('Fetching post_invoice_v2 definition...');
  argsRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) as def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'post_invoice_v2'
  `);
  
  if (argsRes.rows.length > 0) {
      let fullDef = argsRes.rows[0].def;
      fullDef = fullDef.replace(/v_cogs_value := ROUND\(COALESCE\(\(v_item->>'quantity'\)::numeric, 0\) \* COALESCE\(\(v_product_record\.data->>'costPrice'\)::numeric, 0\), 2\);[\s\S]*?END IF;/g, '-- Removed manual COGS insertion as it is handled by inventory triggers');
      await client.query(`CREATE OR REPLACE ${fullDef.substring(fullDef.indexOf('FUNCTION'))}`);
      console.log('post_invoice_v2 patched.');
  }

  console.log('Fetching rebuild_invoice_journals definition...');
  argsRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) as def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'rebuild_invoice_journals'
  `);
  
  if (argsRes.rows.length > 0) {
      let fullDef = argsRes.rows[0].def;
      fullDef = fullDef.replace(/v_cogs_value := ROUND\(COALESCE\(\(v_item->>'quantity'\)::numeric, 0\) \* COALESCE\(\(v_item->>'costPriceAtSale'\)::numeric, \(v_item->>'cost_price_at_sale'\)::numeric, 0\), 2\);[\s\S]*?END IF;/g, '-- Removed manual COGS insertion as it is handled by inventory triggers');
      await client.query(`CREATE OR REPLACE ${fullDef.substring(fullDef.indexOf('FUNCTION'))}`);
      console.log('rebuild_invoice_journals patched.');
  }

  console.log('Cleaning up duplicate COGS lines...');
  await client.query(`
    DELETE FROM docs_journal_lines jl
    USING docs_invoices i
    WHERE jl.journal_id = COALESCE(i.journal_entry_id, 'JE-' || UPPER(i.id))
      AND jl.id LIKE '%-cogs-%' 
      AND jl.id NOT LIKE '%-mov-%'
  `);
  
  await client.query(`
    DELETE FROM docs_journal_lines jl
    USING docs_invoices i
    WHERE jl.journal_id = COALESCE(i.journal_entry_id, 'JE-' || UPPER(i.id))
      AND jl.id LIKE '%-inv-%' 
      AND jl.id NOT LIKE '%-mov-%'
  `);

  console.log('Done');
  await client.end();
}
run();
