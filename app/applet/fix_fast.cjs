const pg = require('pg');
const { Pool } = pg;
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL;

function unnestItem(item) {
    let current = item;
    while (current && current.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
        current = current.data;
    }
    if (current && current.type) {
        return { ...current };
    }
    return item;
}

async function run() {
  const pool = new Pool({ connectionString, max: 20 });

  const client = await pool.connect();
  console.log('Finding corrupted invoices...');
  const nestedRes = await client.query(`SELECT id, data, company_id, status FROM docs_invoices WHERE data->'items'->0->'data' IS NOT NULL`);
  const duplicateRes = await client.query(`SELECT invoice_id FROM docs_invoice_lines WHERE type = 'PRODUCT' AND product_id IS NOT NULL GROUP BY invoice_id, product_id HAVING count(*) > 1`);

  const corruptedIds = Array.from(new Set([ ...nestedRes.rows.map(r => r.id), ...duplicateRes.rows.map(r => r.invoice_id) ]));
  console.log(`Found ${corruptedIds.length} corrupted invoices to fix.`);
  
  if (corruptedIds.length === 0) {
      client.release();
      await pool.end();
      return;
  }

  await client.query('ALTER TABLE docs_invoice_lines DISABLE TRIGGER ALL');

  // Load all lines for all corrupted invoices in one go
  console.log('Fetching all lines...');
  const linesRes = await client.query(`SELECT * FROM docs_invoice_lines WHERE invoice_id = ANY($1) ORDER BY invoice_id, display_index`, [corruptedIds]);
  const linesByInv = {};
  for (const row of linesRes.rows) {
      if (!linesByInv[row.invoice_id]) linesByInv[row.invoice_id] = [];
      linesByInv[row.invoice_id].push(row);
  }

  const invoicesRes = await client.query(`SELECT id, data, company_id, status FROM docs_invoices WHERE id = ANY($1)`, [corruptedIds]);
  const invoices = invoicesRes.rows;

  let queries = [];
  let fixed = 0;

  for (const inv of invoices) {
      let rawItems = inv.data.items || [];
      const dbLines = linesByInv[inv.id] || [];
      
      let itemsToProcess = [];
      if (rawItems.length > 0) {
          itemsToProcess = rawItems.map(unnestItem);
      } else {
          itemsToProcess = dbLines.map(l => ({
              id: l.id, type: l.type, productId: l.product_id, quantity: l.quantity,
              unitPrice: l.unit_price, description: l.description, total: l.total,
              discount: l.discount, discountMode: l.discount_mode, discountRate: l.discount_rate
          }));
      }

      const jsonProductIds = new Set(itemsToProcess.filter(i => i.type === 'PRODUCT').map(i => i.productId));
      for (const line of dbLines) {
          if (line.type === 'PRODUCT' && line.product_id && !jsonProductIds.has(line.product_id)) {
              itemsToProcess.push({
                  id: crypto.randomUUID(), type: 'PRODUCT', productId: line.product_id,
                  quantity: Number(line.quantity), unitPrice: Number(line.unit_price), description: line.description,
                  total: Number(line.total), discount: Number(line.discount), discountMode: line.discount_mode, discountRate: Number(line.discount_rate)
              });
              jsonProductIds.add(line.product_id);
          } else if (line.type === 'DISCOUNT') {
              itemsToProcess.push({
                  id: crypto.randomUUID(), type: 'DISCOUNT', total: Number(line.total), description: line.description
              });
          }
      }

      const uniqueItemsMap = new Map();
      let cleanItems = [];
      let displayIndex = 1;

      for (const item of itemsToProcess) {
         let key = '';
         if (item.type === 'DISCOUNT') {
             key = `discount_${item.total}`;
         } else {
             if (!item.productId) continue;
             key = `${item.productId}_${item.unitPrice}_${item.quantity}_${item.total}`;
         }

         if (!uniqueItemsMap.has(key)) {
             uniqueItemsMap.set(key, true);
             cleanItems.push({ ...item, displayIndex: displayIndex++ });
         }
      }

      let subtotal = 0;
      let total = 0;
      let discountTotal = 0;

      for (const item of cleanItems) {
          if (item.type === 'PRODUCT') {
              subtotal += (Number(item.quantity) * Number(item.unitPrice));
              const lineTotal = Number(item.total) || 0;
              total += lineTotal;
              discountTotal += (Number(item.quantity) * Number(item.unitPrice) - lineTotal);
          } else if (item.type === 'DISCOUNT') {
              total += Number(item.total);
              discountTotal += Math.abs(Number(item.total));
          }
      }

      const updatedData = { ...inv.data, items: cleanItems, total, subtotal, discountTotal };
      
      queries.push({
          text: 'UPDATE docs_invoices SET total = $1, subtotal = $2, discount_total = $3, data = $4 WHERE id = $5',
          values: [total, subtotal, discountTotal, updatedData, inv.id]
      });

      queries.push({
          text: 'DELETE FROM docs_invoice_lines WHERE invoice_id = $1',
          values: [inv.id]
      });

      for (const item of cleanItems) {
         queries.push({
             text: `INSERT INTO docs_invoice_lines (id, invoice_id, company_id, product_id, quantity, unit_price, type, total, discount, tax, discount_rate, discount_mode, description, display_index)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
             values: [item.id || crypto.randomUUID(), inv.id, inv.company_id, item.productId || null, Number(item.quantity || 0), Number(item.unitPrice || 0), item.type || 'PRODUCT', Number(item.total || 0), Number(item.discount || 0), Number(item.tax || 0), Number(item.discountRate || 0), item.discountMode || 'PERCENT', item.description || '', item.displayIndex]
         });
      }

      if (inv.status === 'POSTED') {
          queries.push({
              text: 'DELETE FROM docs_inventory_transactions WHERE reference_id = $1 AND reference_type = $2',
              values: [inv.id, 'INVOICE']
          });
          for (const item of cleanItems) {
              if (item.type === 'PRODUCT' && item.productId) {
                  queries.push({
                      text: `INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, unit_price)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                      values: [`mov-inv-${inv.id}-${crypto.randomUUID()}`, inv.company_id, item.productId, `wh-${inv.company_id}`, 'OUT', Number(item.quantity), inv.id, 'INVOICE', inv.data.date, Number(item.unitPrice)]
                  });
              }
          }
      }
  }

  console.log(`Prepared ${queries.length} queries. Executing in batches...`);
  
  // Execute queries in batches
  const BATCH_SIZE = 500;
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      for (const q of batch) {
          await client.query(q);
      }
      await client.query('COMMIT');
      console.log(`Executed ${i + batch.length} / ${queries.length} queries.`);
  }

  await client.query('ALTER TABLE docs_invoice_lines ENABLE TRIGGER ALL');
  client.release();
  
  // Update inventory
  console.log('Reconciling inventory globally...');
  for (const cId of ['comp-1', 'comp-2', 'comp-3']) {
      const rClient = await pool.connect();
      await rClient.query(`SELECT reconcile_inventory($1)`, [cId]);
      rClient.release();
  }

  await pool.end();
  console.log('Done fixing all invoices!');
}
run().catch(console.error);
