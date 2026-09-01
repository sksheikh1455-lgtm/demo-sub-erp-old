import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query("SET statement_timeout = 600000;"); // 10 minutes timeout for safety
  await c.query("SET lock_timeout = 10000;");

  console.log('=== STARTING COMPEHENSIVE MISMATCHED INVOICES REPAIR ===');

  // Find all invoices with POSTED/PAID/PARTIAL status but no valid journal entry
  const queryRes = await c.query(`
    SELECT i.id, i.invoice_number, i.status, i.company_id
    FROM docs_invoices i
    LEFT JOIN docs_journals j ON i.journal_entry_id = j.id
    WHERE i.status IN ('POSTED', 'PAID', 'PARTIAL', 'PARTIALLY_PAID', 'PARTIAL_REFUNDED')
      AND j.id IS NULL
    ORDER BY i.invoice_number ASC
  `);

  const problemInvoices = queryRes.rows;
  console.log(`Found ${problemInvoices.length} invoices that are posted/paid but missing active journal entries (and thus missing from partner ledgers).`);

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < problemInvoices.length; i++) {
    const inv = problemInvoices[i];
    const percentage = (((i + 1) / problemInvoices.length) * 100).toFixed(1);
    try {
      console.log(`[${i + 1}/${problemInvoices.length} - ${percentage}%] Repairing invoice: ${inv.invoice_number} (ID: ${inv.id})`);
      const postRes = await c.query("SELECT public.post_invoice($1, $2) as r;", [inv.id, inv.company_id]);
      console.log(`  -> Success! Journal created: ${postRes.rows[0].r.journal_id}`);
      successCount++;
    } catch (err: any) {
      console.error(`  -> [ERROR] Failed to post invoice ${inv.invoice_number}:`, err.message);
      failureCount++;
    }
  }

  console.log('=== REPAIR SUMMARY ===');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failureCount}`);

  // Rebuild product stocks to ensure zero double-depletion
  console.log('\n=== RECONCILING AND REBUILDING PRODUCT STOCK LEVEL SENSORS ===');
  try {
    const txSums = await c.query(`
      WITH tx_sums AS (
        SELECT 
          product_id, 
          COALESCE(SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END), 0) as calc_qty
        FROM docs_inventory_transactions
        GROUP BY product_id
      )
      SELECT 
        p.id, 
        p.name, 
        p.sku, 
        p.company_id, 
        p.quantity_on_hand as db_qty,
        p.data,
        COALESCE(ts.calc_qty, 0) as ts_calc_qty
      FROM docs_products p
      LEFT JOIN tx_sums ts ON p.id = ts.product_id
      WHERE 
        p.quantity_on_hand != COALESCE(ts.calc_qty, 0) OR
        COALESCE((p.data->>'quantityOnHand')::NUMERIC, 0) != COALESCE(ts.calc_qty, 0) OR
        COALESCE((p.data->'stockLevels'->>(p.company_id))::NUMERIC, 0) != COALESCE(ts.calc_qty, 0)
    `);

    console.log(`Found ${txSums.rows.length} product(s) requiring inventory reconciliation.`);

    for (const r of txSums.rows) {
      const pid = r.id;
      const targetQty = Number(r.ts_calc_qty);
      const companyId = r.company_id || 'comp-1';

      console.log(`  -> Reconciling product stock for "${r.name}" (${r.sku}): DB says ${r.db_qty} -> Rebuilt to ${targetQty}`);

      let currentData = r.data || {};
      if (!currentData.stockLevels) {
        currentData.stockLevels = {};
      }
      currentData.stockLevels[companyId] = targetQty;
      currentData.quantityOnHand = targetQty;

      await c.query(`
        UPDATE docs_products
        SET 
          quantity_on_hand = $1,
          data = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [targetQty, JSON.stringify(currentData), pid]);
    }
    console.log('Product stock level sensors rebuilt successfully.');
  } catch (err: any) {
    console.error('Error during product stock level sensors rebuild:', err.message);
  }

  await c.end();
}

run().catch(console.error);
