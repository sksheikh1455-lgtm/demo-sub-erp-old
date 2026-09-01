import pkg from 'pg'; 
const { Client } = pkg; 
const c = new Client(process.env.DATABASE_URL); 
async function run() { 
  await c.connect(); 
  const bills = await c.query("SELECT b.id FROM docs_bills b WHERE b.status IN ('POSTED', 'PAID', 'PARTIAL') AND EXISTS (SELECT 1 FROM docs_bill_lines l WHERE l.bill_id = b.id AND l.product_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM docs_inventory_transactions t WHERE t.reference_id = b.id)"); 
  for (const b of bills.rows) { 
    await c.query("UPDATE docs_bills SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{__dummy}', '1') WHERE id = $1", [b.id]); 
  } 
  console.log('Updated ' + bills.rows.length + ' bills'); 

  const inv = await c.query("SELECT i.id FROM docs_invoices i WHERE i.status IN ('POSTED', 'PAID', 'PARTIAL') AND EXISTS (SELECT 1 FROM docs_invoice_lines l WHERE l.invoice_id = i.id AND l.product_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM docs_inventory_transactions t WHERE t.reference_id = i.id)"); 
  for (const i of inv.rows) { 
    await c.query("UPDATE docs_invoices SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{__dummy}', '1') WHERE id = $1", [i.id]); 
  } 
  console.log('Updated ' + inv.rows.length + ' invoices'); 

  await c.query("UPDATE docs_bills SET data = data - '__dummy' WHERE data ? '__dummy'");
  await c.query("UPDATE docs_invoices SET data = data - '__dummy' WHERE data ? '__dummy'");
  await c.end(); 
} 
run();
