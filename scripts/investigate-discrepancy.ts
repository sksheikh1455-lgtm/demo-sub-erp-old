import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- DEEP DISCREPANCY INVESTIGATION ---');

  // Let's get the sum of quantity_on_hand * cost_price for each product
  const productsQuery = await client.query(`
    SELECT sku, name, quantity_on_hand, cost_price,
           (quantity_on_hand * cost_price) as valuation
    FROM docs_products
    WHERE quantity_on_hand != 0
    ORDER BY valuation DESC
  `);

  console.log(`\nProducts with non-zero quantum: ${productsQuery.rows.length}`);
  const totalValuation = productsQuery.rows.reduce((sum, p) => sum + Number(p.valuation), 0);
  console.log(`Total Products Catalog Valuation: ${totalValuation.toFixed(2)}`);

  // Let's look at all journals and try to see which ones affect the Inventory Asset account code '100501' (or whatever account has 'inventory' in the name)
  const invAccounts = await client.query(`
    SELECT id, code, name FROM docs_accounts 
    WHERE code = '100501' OR name ILIKE '%inventory%'
  `);
  console.log('\nInventory Accounts found:');
  invAccounts.rows.forEach(a => console.log(`  Account ID: ${a.id} | Code: ${a.code} | Name: ${a.name}`));

  const invAccountIds = invAccounts.rows.map(a => `'${a.id}'`).join(',');
  
  if (invAccountIds) {
    const linesQuery = await client.query(`
      SELECT 
        j.id as journal_id,
        j.reference_number,
        j.date,
        j.description as journal_desc,
        jl.id as line_id,
        jl.debit,
        jl.credit,
        jl.description as line_desc,
        jl.contact_id
      FROM docs_journal_lines jl
      JOIN docs_journals j ON j.id = jl.journal_id
      WHERE jl.account_id IN (${invAccountIds})
      ORDER BY j.date ASC, j.reference_number ASC
    `);

    console.log(`\nJournal lines affecting Inventory Accounts: ${linesQuery.rows.length}`);
    let glSum = 0;
    linesQuery.rows.forEach((line: any) => {
      const net = Number(line.debit) - Number(line.credit);
      glSum += net;
    });
    console.log(`Total GL Sum for Inventory: ${glSum.toFixed(2)}`);

    // Let's look if there is any other transaction table, say invoices or bills, that directly affects inventory but doesn't have journal entries?
    // Remember, we wiped transaction tables! Row counts: docs_invoices: 1, docs_bills: 2.
    // Let's print out what is inside those docs_invoices and docs_bills too!
    console.log('\n--- EXAMINING INVOICES ---');
    const invoices = await client.query('SELECT * FROM docs_invoices');
    invoices.rows.forEach((i: any) => {
      console.log(`Invoice: ${i.invoice_number} | Company: ${i.company_id} | Status: ${i.status} | Data:`, JSON.stringify(i.data).substring(0, 150));
    });

    console.log('\n--- EXAMINING BILLS ---');
    const bills = await client.query('SELECT * FROM docs_bills');
    bills.rows.forEach((b: any) => {
      console.log(`Bill: ${b.bill_number} | Company: ${b.company_id} | Status: ${b.status} | Data:`, JSON.stringify(b.data).substring(0, 150));
    });

    // Let's see if there are any products imported without audit or if any product was manually adjusted.
    // Let's find out if there's any product where SKU or valuation is exactly matching the BDT 36,529.00 difference!
    console.log('\nDoes any product have a valuation of exactly 36529.00?');
    const matchVal = productsQuery.rows.filter(p => Math.abs(Number(p.valuation) - 36529.00) < 1);
    if (matchVal.length > 0) {
      matchVal.forEach(p => console.log(`  MATCH: ${p.sku} | ${p.name} | Qty: ${p.quantity_on_hand} | Cost: ${p.cost_price} | Val: ${p.valuation}`));
    } else {
      console.log('  No single product has valuation exactly 36529.00.');
    }

    // Is there a combination? Or is there any product with SKU / Name related to 36529?
    console.log('\nChecking products with non-zero stock & potential issues (like cost_price = 0 or quantity_on_hand < 0):');
    const zeroCostProds = await client.query(`
      SELECT sku, name, quantity_on_hand, cost_price
      FROM docs_products
      WHERE quantity_on_hand != 0 AND COALESCE(cost_price, 0) = 0
    `);
    console.log(`  Products with stock but 0 cost: ${zeroCostProds.rows.length}`);
    zeroCostProds.rows.forEach(p => console.log(`    SKU: ${p.sku} | ${p.name} | Qty: ${p.quantity_on_hand}`));
  }

  await client.end();
}

run().catch(console.error);
