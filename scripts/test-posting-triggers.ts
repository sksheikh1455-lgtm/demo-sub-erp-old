import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  log('Connected. Setting statement_timeout to 2000ms...');
  await client.query('SET statement_timeout = 2000');

  // Use unique individual IDs to avoid sharing same invoice/bill default journal strings
  const pSuffix = Math.random().toString(36).substring(2, 10);
  const bSuffix = Math.random().toString(36).substring(2, 10);
  const iSuffix = Math.random().toString(36).substring(2, 10);

  const productId = 'prod-' + pSuffix;
  const billId = 'bill-' + bSuffix;
  const invoiceId = 'inv-' + iSuffix;

  log(`Using unique IDs: Product=${productId}, Bill=${billId}, Invoice=${invoiceId}`);

  log('Inserting dummy product...');
  try {
    await client.query(`
      INSERT INTO docs_products (id, company_id, name, sku, type, cost_price, price, updated_at, data)
      VALUES ($1, 'comp-1', 'Test Trigger Product ' || $2, 'SKU-' || $2, 'Goods', 100, 250, NOW(), '{"trackInventory": true}'::jsonb);
    `, [productId, pSuffix]);
    log('Product inserted successfully!');
  } catch (err: any) {
    log(`Product insert error: ${err.message}`);
  }

  log('Inserting dummy bill (DRAFT)...');
  try {
    await client.query(`
      INSERT INTO docs_bills (id, company_id, bill_number, date, bill_date, status, total, vendor_id, updated_at, data)
      VALUES ($1, 'comp-1', 'BILL-TRG-' || $2, '2026-05-21', '2026-05-21', 'DRAFT', 500, 'contact-cash-sale-global', NOW(), '{}'::jsonb);
    `, [billId, bSuffix]);
    await client.query(`
      INSERT INTO docs_bill_lines (id, bill_id, company_id, product_id, quantity, unit_price, total, type)
      VALUES ('bline-' || $1, $2, 'comp-1', $3, 5, 100, 500, 'PRODUCT');
    `, [bSuffix, billId, productId]);
    log('Bill and bill line inserted successfully!');
  } catch (err: any) {
    log(`Bill insert error: ${err.message}`);
  }

  log('Calling post_bill RPC...');
  try {
    const res = await client.query('SELECT post_bill($1, \'comp-1\')', [billId]);
    log(`post_bill RPC completed! Result: ${JSON.stringify(res.rows[0])}`);
  } catch (err: any) {
    log(`post_bill RPC error: ${err.message}`);
  }

  log('Checking generated inventory transactions for bill...');
  try {
    const { rows } = await client.query('SELECT * FROM docs_inventory_transactions WHERE reference_id = $1', [billId]);
    log(`Found ${rows.length} transactions for bill: ${JSON.stringify(rows)}`);
  } catch (err: any) {
    log(`Bill transactions query error: ${err.message}`);
  }

  log('Inserting dummy invoice (DRAFT)...');
  try {
    await client.query(`
      INSERT INTO docs_invoices (id, company_id, invoice_number, date, invoice_date, status, total, customer_id, updated_at, data)
      VALUES ($1, 'comp-1', 'INV-TRG-' || $2, '2026-05-21', '2026-05-21', 'DRAFT', 750, 'contact-cash-sale-global', NOW(), '{}'::jsonb);
    `, [invoiceId, iSuffix]);
    await client.query(`
      INSERT INTO docs_invoice_lines (id, invoice_id, company_id, product_id, quantity, unit_price, total)
      VALUES ('iline-' || $1, $2, 'comp-1', $3, 3, 250, 750);
    `, [iSuffix, invoiceId, productId]);
    log('Invoice and invoice line inserted successfully!');
  } catch (err: any) {
    log(`Invoice insert error: ${err.message}`);
  }

  log('Calling post_invoice RPC...');
  try {
    const res = await client.query('SELECT post_invoice($1, \'comp-1\')', [invoiceId]);
    log(`post_invoice RPC completed! Result: ${JSON.stringify(res.rows[0])}`);
  } catch (err: any) {
    log(`post_invoice RPC error: ${err.message}`);
  }

  log('Checking generated inventory transactions for invoice...');
  try {
    const { rows } = await client.query('SELECT * FROM docs_inventory_transactions WHERE reference_id = $1', [invoiceId]);
    log(`Found ${rows.length} transactions for invoice: ${JSON.stringify(rows)}`);
  } catch (err: any) {
    log(`Invoice transactions query error: ${err.message}`);
  }

  log('Testing complete.');
  await client.end();
}
run().catch(console.error);
