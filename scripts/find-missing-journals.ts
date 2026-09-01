import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- FINDING PRODUCTS MISSING OPENING BALANCE JOURNALS ---');

  // Let's get all products with non-zero quantity on hand
  const productsRes = await client.query(`
    SELECT sku, name, quantity_on_hand, cost_price,
           (quantity_on_hand * cost_price) as valuation, company_id
    FROM docs_products
    WHERE quantity_on_hand > 0
    ORDER BY sku ASC
  `);

  console.log(`Products with positive stock: ${productsRes.rows.length}`);

  // Let's get all opening balance journal entries (OB-SKU)
  const journalsRes = await client.query(`
    SELECT reference_number, id, company_id
    FROM docs_journals
    WHERE journal_type = 'OPENING_BALANCE' OR reference_number LIKE 'OB-%'
  `);
  console.log(`Opening Balance Journals found: ${journalsRes.rows.length}`);

  // Put journal references into a Set for fast lookup
  const journalRefMap = new Map();
  journalsRes.rows.forEach(j => {
    // Standard format is 'OB-SKU'
    journalRefMap.set(j.reference_number, j);
  });

  let missingValuationTotal = 0;
  let missingCount = 0;
  const missingProductsList: any[] = [];

  for (const prod of productsRes.rows) {
    const sku = prod.sku;
    const lookupRef1 = `OB-${sku}`;
    
    // Check if it exists in the active journals
    if (!journalRefMap.has(lookupRef1)) {
      missingCount++;
      const val = Number(prod.valuation);
      missingValuationTotal += val;
      missingProductsList.push(prod);
      console.log(`  MISSING: SKU: ${sku} | Name: ${prod.name} | Qty: ${prod.quantity_on_hand} | Cost: ${prod.cost_price} | Val: ${val.toFixed(2)}`);
    }
  }

  console.log(`\nDiscrepancy Check:`);
  console.log(`  Number of products missing journals: ${missingCount}`);
  console.log(`  Total valuation of missing products: BDT ${missingValuationTotal.toFixed(2)}`);
  
  const expectedDiscrepancy = 9965505.05 - 9928976.05;
  console.log(`  Expected Discrepancy: BDT ${expectedDiscrepancy.toFixed(2)}`);
  console.log(`  Difference: BDT ${(missingValuationTotal - expectedDiscrepancy).toFixed(2)}`);

  await client.end();
}

run().catch(console.error);
