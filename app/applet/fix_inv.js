import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;
async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query(`ALTER TABLE docs_journal_lines DISABLE TRIGGER USER`);

  let qr = `
    SELECT j.id, i.total as inv_total, i.data->'items' as items, i.data->'taxTotal' as tax_total, i.data->'discountTotal' as discount_total
    FROM docs_journals j
    JOIN docs_invoices i ON j.id = 'JE-' || upper(i.id::text)
    WHERE j.journal_type = 'INV' AND j.status = 'POSTED'
      AND j.id IN (SELECT journal_id FROM docs_journal_lines WHERE debit = 0 AND credit = 0)
  `;
  let r = await c.query(qr);
  
  let updated = 0;
  for (let row of r.rows) {
      let invTotal = parseFloat(row.inv_total) || 0;
      let taxTotal = parseFloat(row.tax_total) || 0;
      let items = row.items || [];
      
      let linesQr = await c.query(`SELECT id, debit, credit FROM docs_journal_lines WHERE journal_id = $1 AND debit=0 AND credit=0`, [row.id]);
      
      for (let line of linesQr.rows) {
          let debit = 0;
          let credit = 0;
          
          if (line.id.endsWith('-ar')) {
              debit = invTotal;
          } else if (line.id.endsWith('-tax')) {
              credit = taxTotal;
          } else {
              let m = line.id.match(/-rev-(\d+)$/);
              if (m) {
                  let idx = parseInt(m[1]) - 1;
                  if (items[idx]) credit = parseFloat(items[idx].total) || 0;
              }
              let m2 = line.id.match(/-cogs-(\d+)$/);
              if (m2) {
                  let idx = parseInt(m2[1]) - 1;
                  if (items[idx]) {
                      let cost = parseFloat(items[idx].costPriceAtSale || items[idx].cost_price_at_sale || 0);
                      let qty = parseFloat(items[idx].quantity || 0);
                      debit = cost * qty;
                  }
              }
              let m3 = line.id.match(/-inv-(\d+)$/);
              if (m3) {
                  let idx = parseInt(m3[1]) - 1;
                  if (items[idx]) {
                      let cost = parseFloat(items[idx].costPriceAtSale || items[idx].cost_price_at_sale || 0);
                      let qty = parseFloat(items[idx].quantity || 0);
                      credit = cost * qty;
                  }
              }
              let m4 = line.id.match(/-disc-(\d+)$/);
              if (m4) {
                 let idx = parseInt(m4[1]) - 1;
                 if (items[idx]) debit = parseFloat(items[idx].discountAmount || 0);
              }
              if (line.id.endsWith('-discount')) {
                 debit = parseFloat(row.discount_total || 0);
              }
          }
          
          if (debit > 0 || credit > 0) {
             let upd = await c.query(`UPDATE docs_journal_lines SET debit = $1, credit = $2 WHERE id = $3`, [debit, credit, line.id]);
             updated += upd.rowCount;
          }
      }
  }

  console.log('Restored INV lines:', updated);
  
  await c.query(`ALTER TABLE docs_journal_lines ENABLE TRIGGER USER`);
  await c.end();
}
run();
