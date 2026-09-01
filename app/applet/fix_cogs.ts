import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  
  await client.query("SET session_replication_role = 'replica';"); // bypass triggers for speed
  await client.query("SELECT set_config('core.bypass_audit', 'true', true);");

  // Get all transactions ordered by product and date
  const res = await client.query(`
    SELECT t.id, t.company_id, t.product_id, t.transaction_type, t.quantity, t.cost_price, t.reference_type, t.reference_id,
           COALESCE(p.data->>'costPrice', '0')::numeric as fallback_cost
    FROM docs_inventory_transactions t
    LEFT JOIN docs_products p ON t.product_id = p.id
    WHERE t.company_id = 'comp-1'
    ORDER BY t.product_id, t.date ASC, t.updated_at ASC
  `);

  let currentProduct = null;
  let totalQty = 0;
  let totalValue = 0;
  let avgCost = 0;

  const updates = [];

  for (const tx of res.rows) {
      if (tx.product_id !== currentProduct) {
          currentProduct = tx.product_id;
          totalQty = 0;
          totalValue = 0;
          avgCost = Number(tx.fallback_cost); // fallback
      }

      const qty = Number(tx.quantity) || 0;
      let cost = Number(tx.cost_price) || 0;

      if (tx.transaction_type === 'IN') {
          // If cost is 0 on a BILL, try fallback
          if (cost === 0 && tx.reference_type !== 'INVOICE') {
             cost = avgCost;
          }
          totalQty += qty;
          totalValue += qty * cost;
          if (totalQty > 0) {
              avgCost = totalValue / totalQty;
          }
      } else {
          // OUT transaction
          if (Math.abs(cost - avgCost) > 0.001) {
              updates.push({ id: tx.id, newCost: avgCost });
          }
          
          totalQty -= qty;
          totalValue -= qty * avgCost;
      }
  }

  console.log(`Found ${updates.length} OUT transactions with incorrect cost.`);
  
  for (const u of updates) {
      await client.query(`UPDATE docs_inventory_transactions SET cost_price = $1 WHERE id = $2`, [u.newCost, u.id]);
  }
  
  // Now, calculate the correct COGS per invoice
  const invRes = await client.query(`
    SELECT reference_id, SUM(quantity * cost_price) as total_cogs
    FROM docs_inventory_transactions
    WHERE company_id = 'comp-1' AND reference_type = 'INVOICE'
    GROUP BY reference_id
  `);

  let jUpdates = 0;
  let linesFixed = 0;
  for (const inv of invRes.rows) {
      const cogs = Number(inv.total_cogs) || 0;
      const jeId = 'JE-' + inv.reference_id.toUpperCase();
      
      const lines = await client.query(`SELECT id, account_id, debit, credit FROM docs_journal_lines WHERE journal_id = $1`, [jeId]);
      let hasCogs = false;
      let hasInv = false;
      let cogsSum = 0;
      for (const l of lines.rows) {
          // Check if it's COGS account (500101) or INVENTORY account (100501)
          if (l.account_id === 'comp-1-500101') {
              hasCogs = true;
              cogsSum += Number(l.debit);
              if (Number(l.debit) !== cogs) {
                  await client.query(`UPDATE docs_journal_lines SET debit = $1 WHERE id = $2`, [cogs, l.id]);
                  linesFixed++;
              }
          }
          if (l.account_id === 'comp-1-100501') {
              hasInv = true;
              if (Number(l.credit) !== cogs) {
                  await client.query(`UPDATE docs_journal_lines SET credit = $1 WHERE id = $2`, [cogs, l.id]);
              }
          }
      }
      
      if (!hasCogs && cogs > 0) {
          // Insert COGS line if missing
          await client.query(`
              INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
              VALUES ($1, $2, 'comp-1', 'comp-1-500101', $3, 0, 'COGS')
          `, ['JL-' + jeId + '-cogs-fix', jeId, cogs]);
          
          await client.query(`
              INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
              VALUES ($1, $2, 'comp-1', 'comp-1-100501', 0, $3, 'Inv Red')
          `, ['JL-' + jeId + '-inv-fix', jeId, cogs]);
          jUpdates++;
      }
  }

  console.log(`Updated ${jUpdates} missing invoice journals, ${linesFixed} fixed lines.`);

  await client.query("SET session_replication_role = 'origin';");
  await client.end();
}
run();
