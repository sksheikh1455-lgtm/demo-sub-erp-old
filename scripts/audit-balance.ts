import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- AUDITING DATABASE STATE FOR INVENTORY ASSETS & VALUATIONS ---');

  // 1. Row counts
  const tables = [
    'docs_companies', 'docs_accounts', 'docs_products', 
    'docs_journals', 'docs_journal_lines', 'docs_product_stocks',
    'docs_stock_movements', 'docs_inventory_adjustments'
  ];
  console.log('Row Counts:');
  for (const t of tables) {
    const res = await client.query(`SELECT COUNT(*) as count FROM "${t}"`);
    console.log(`  ${t}: ${res.rows[0].count}`);
  }

  // 2. Total Catalog Valuation
  const prodRes = await client.query(`
    SELECT 
      company_id,
      COUNT(*) as count,
      SUM(COALESCE(quantity_on_hand, 0) * COALESCE(cost_price, 0)) as total_val,
      SUM(CASE WHEN COALESCE(quantity_on_hand, 0) < 0 THEN 1 ELSE 0 END) as negative_count,
      SUM(CASE WHEN COALESCE(quantity_on_hand, 0) < 0 THEN COALESCE(quantity_on_hand, 0) * COALESCE(cost_price, 0) ELSE 0 END) as negative_val
    FROM docs_products
    GROUP BY company_id
  `);
  console.log('\nCatalog Valuations by Company:');
  prodRes.rows.forEach((r: any) => {
    console.log(`  Company: ${r.company_id} | Products: ${r.count} | Valuation: ${Number(r.total_val).toFixed(2)} | Neg Count: ${r.negative_count} | Neg Val: ${Number(r.negative_val).toFixed(2)}`);
  });

  // 3. GL Balance (debit - credit) for accounts matching Inventory Asset (code starting 100501 or sub_type INVENTORY)
  const glRes = await client.query(`
    SELECT 
      j.company_id,
      j.status,
      COUNT(jl.id) as line_count,
      SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) as gl_net
    FROM docs_journal_lines jl
    JOIN docs_journals j ON j.id = jl.journal_id
    JOIN docs_accounts a ON a.id = jl.account_id
    WHERE a.code = '100501' OR a.name ILIKE '%inventory%'
    GROUP BY j.company_id, j.status
  `);
  console.log('\nGL Balance for Inventory Asset accounts by Company and status:');
  glRes.rows.forEach((r: any) => {
    console.log(`  Company: ${r.company_id} | Status: ${r.status} | Lines: ${r.line_count} | GL Net: ${Number(r.gl_net).toFixed(2)}`);
  });

  // 4. Inspect specific products if negative stock shows any count or if cost_price issues exist
  const costIssues = await client.query(`
    SELECT id, sku, name, quantity_on_hand, cost_price, company_id
    FROM docs_products
    WHERE COALESCE(quantity_on_hand, 0) < 0
  `);
  if (costIssues.rows.length > 0) {
    console.log(`\nFound ${costIssues.rows.length} negative quantity products:`);
    costIssues.rows.forEach((r: any) => {
      console.log(`  SKU: ${r.sku} | Name: ${r.name} | Qty: ${r.quantity_on_hand} | Cost: ${r.cost_price} | Company: ${r.company_id}`);
    });
  } else {
    console.log('\nNo negative stock products found in docs_products.');
  }

  // 5. Total inventory valuation report function results
  // Let's see if there is a function like get_inventory_valuation or something similar
  const funcRes = await client.query(`
    SELECT proname 
    FROM pg_proc 
    WHERE proname ILIKE '%valuation%' OR proname ILIKE '%stock%'
  `);
  console.log('\nValuation-related functions:', funcRes.rows.map((r: any) => r.proname));

  await client.end();
}

run().catch(console.error);
