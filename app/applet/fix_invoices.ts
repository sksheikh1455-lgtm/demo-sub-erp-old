import pg from 'pg';
import crypto from 'crypto';
import { supabase } from './lib/supabase.ts';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

function unnestItem(item: any): any {
    // If the item is deeply nested under 'data', extract the innermost object
    let current = item;
    while (current && current.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
        current = current.data;
    }
    // ensure the extracted object is an item, if it has 'type'
    if (current && current.type) {
        return { ...current }; // shallow copy
    }
    return item;
}

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Finding invoices with nested/duplicated items...');
  
  // 1. Get all invoices with nested items
  const nestedRes = await client.query(`
    SELECT id, invoice_number, data 
    FROM docs_invoices 
    WHERE data->'items'->0->'data' IS NOT NULL
  `);

  // 2. Get invoices with exact duplicated product lines in docs_invoice_lines
  const duplicateRes = await client.query(`
    SELECT invoice_id
    FROM docs_invoice_lines 
    WHERE type = 'PRODUCT' AND product_id IS NOT NULL 
    GROUP BY invoice_id, product_id 
    HAVING count(*) > 1
  `);

  const corruptedIds = new Set([
      ...nestedRes.rows.map(r => r.id),
      ...duplicateRes.rows.map(r => r.invoice_id)
  ]);

  console.log(`Found ${corruptedIds.size} corrupted invoices to fix.`);

  await client.query('ALTER TABLE docs_invoice_lines DISABLE TRIGGER ALL');

  let fixed = 0;
  for (const invId of corruptedIds) {
      const { data: inv } = await supabase.from('docs_invoices').select('id, invoice_number, data, company_id, status').eq('id', invId).single();
      if (!inv) continue;

      let rawItems = inv.data.items || [];
      
      // Also fetch lines from DB as a fallback to reconstruct if JSON is completely busted
      const { data: dbLines } = await supabase.from('docs_invoice_lines').select('*').eq('invoice_id', invId).order('display_index');
      
      // We will prefer the unnested JSON items, but if they are missing products that are in DB lines, we'll merge them.
      let itemsToProcess = [];
      if (rawItems.length > 0) {
          itemsToProcess = rawItems.map(unnestItem);
      } else {
          // If no items in JSON, try to reconstruct from DB lines
          itemsToProcess = dbLines.map(l => ({
              id: l.id,
              type: l.type,
              productId: l.product_id,
              quantity: l.quantity,
              unitPrice: l.unit_price,
              description: l.description,
              total: l.total,
              discount: l.discount,
              discountMode: l.discount_mode,
              discountRate: l.discount_rate
          }));
      }

      // Check if DB lines have products not in our JSON items (this happened with INV-SUL-003443, it only had 1 item in JSON!)
      const jsonProductIds = new Set(itemsToProcess.filter(i => i.type === 'PRODUCT').map(i => i.productId));
      for (const line of dbLines) {
          if (line.type === 'PRODUCT' && line.product_id && !jsonProductIds.has(line.product_id)) {
              itemsToProcess.push({
                  id: crypto.randomUUID(),
                  type: 'PRODUCT',
                  productId: line.product_id,
                  quantity: Number(line.quantity),
                  unitPrice: Number(line.unit_price),
                  description: line.description,
                  total: Number(line.total),
                  discount: Number(line.discount),
                  discountMode: line.discount_mode,
                  discountRate: Number(line.discount_rate)
              });
              jsonProductIds.add(line.product_id);
          }
      }

      // Now remove duplicates
      const uniqueItemsMap = new Map();
      let cleanItems = [];
      let displayIndex = 1;

      for (const item of itemsToProcess) {
         let key = '';
         if (item.type === 'DISCOUNT') {
             key = `discount_${item.total}`;
         } else {
             if (!item.productId) continue; // skip invalid products
             key = `${item.productId}_${item.unitPrice}_${item.quantity}`;
         }

         if (!uniqueItemsMap.has(key)) {
             uniqueItemsMap.set(key, true);
             cleanItems.push({
                 ...item,
                 displayIndex: displayIndex++
             });
         }
      }

      // Recalculate totals
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
              total += Number(item.total); // Discount total is negative
              discountTotal += Math.abs(Number(item.total));
          }
      }

      // Update JSON
      const updatedData = { 
          ...inv.data, 
          items: cleanItems, 
          total: total, 
          subtotal: subtotal,
          discountTotal: discountTotal
      };

      await client.query('UPDATE docs_invoices SET total = $1, subtotal = $2, discount_total = $3, data = $4 WHERE id = $5', [total, subtotal, discountTotal, updatedData, invId]);

      // Re-insert DB lines cleanly
      await client.query('DELETE FROM docs_invoice_lines WHERE invoice_id = $1', [invId]);
      
      for (const item of cleanItems) {
         await client.query(
             `INSERT INTO docs_invoice_lines (id, invoice_id, company_id, product_id, quantity, unit_price, type, total, discount, tax, discount_rate, discount_mode, description, display_index)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
             [
                 item.id || crypto.randomUUID(), 
                 invId, 
                 inv.company_id, 
                 item.productId || null, 
                 Number(item.quantity || 0), 
                 Number(item.unitPrice || 0), 
                 item.type || 'PRODUCT', 
                 Number(item.total || 0), 
                 Number(item.discount || 0), 
                 Number(item.tax || 0), 
                 Number(item.discountRate || 0), 
                 item.discountMode || 'PERCENT',
                 item.description || '',
                 item.displayIndex
             ]
         );
      }

      // If POSTED, clean up inventory transactions and re-insert correctly
      if (inv.status === 'POSTED') {
          await client.query('DELETE FROM docs_inventory_transactions WHERE reference_id = $1 AND reference_type = $2', [invId, 'INVOICE']);
          
          for (const item of cleanItems) {
              if (item.type === 'PRODUCT' && item.productId) {
                  await client.query(
                      `INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, unit_price)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                      [
                          `mov-inv-${invId}-${crypto.randomUUID()}`, 
                          inv.company_id, 
                          item.productId, 
                          `wh-${inv.company_id}`, 
                          'OUT', 
                          Number(item.quantity), 
                          invId, 
                          'INVOICE', 
                          inv.data.date, 
                          Number(item.unitPrice)
                      ]
                  );
              }
          }
      }

      fixed++;
      if (fixed % 10 === 0) console.log(`Fixed ${fixed} invoices...`);
  }

  await client.query('ALTER TABLE docs_invoice_lines ENABLE TRIGGER ALL');
  
  console.log(`Successfully fixed ${fixed} invoices.`);

  // We should reconcile inventory for all companies to be safe, or just the ones affected.
  console.log('Reconciling inventory globally...');
  await supabase.rpc('reconcile_inventory', { p_company_id: 'comp-1' });
  await supabase.rpc('reconcile_inventory', { p_company_id: 'comp-2' });
  await supabase.rpc('reconcile_inventory', { p_company_id: 'comp-3' });

  await client.end();
  console.log('Done!');
}
run().catch(console.error);
