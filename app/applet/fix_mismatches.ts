import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;
async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  const res = await c.query(`
    SELECT p.id as payment_id, p.amount as p_amount, i_orig.id as orig_id, i_orig.invoice_number as orig_num, 
           i_app.id as app_id, i_app.invoice_number as app_num
    FROM docs_payments p, jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.data->'invoiceIds')='array' THEN p.data->'invoiceIds' ELSE '[]'::jsonb END) i_orig_id
    LEFT JOIN docs_invoices i_orig ON i_orig.id = i_orig_id
    LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'appliedInvoices')='array' THEN p.data->'appliedInvoices' ELSE '[]'::jsonb END) i_app_obj ON true
    LEFT JOIN docs_invoices i_app ON i_app.id = (i_app_obj->>'invoiceId')
    WHERE i_orig.id IS NOT NULL AND i_app.id IS NOT NULL AND i_orig.id <> i_app.id
  `);
  
  const mismatches = res.rows;
  console.log(`Found ${mismatches.length} mismatches`);
  
  let fixed = 0;
  for (const m of mismatches) {
    if (!m.orig_id || !m.app_id || m.orig_id === m.app_id) continue;
    
    const arr = JSON.stringify([{
      amount: Number(m.p_amount),
      invoiceId: m.orig_id,
      remaining: 0,
      invoiceNumber: m.orig_num
    }]);

    await c.query(`
      UPDATE docs_payments 
      SET applied_invoices = $1::jsonb, 
          data = jsonb_set(data, '{appliedInvoices}', $1::jsonb) 
      WHERE id = $2
    `, [arr, m.payment_id]);
    
    await c.query(`
      UPDATE docs_invoices 
      SET status = 'POSTED', 
          data = jsonb_set(data, '{status}', '"POSTED"') 
      WHERE id = $1
    `, [m.app_id]);

    await c.query(`
      UPDATE docs_invoices 
      SET status = 'PAID', 
          data = jsonb_set(data, '"status"', '"PAID"') 
      WHERE id = $1
    `, [m.orig_id]);

    fixed++;
  }
  
  console.log(`Fixed ${fixed} payments`);
  await c.end();
}
run();
