import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  
  let res = await client.query(`
    SELECT id, name FROM docs_contacts WHERE id LIKE 'CT-IMP-%';
  `);
  
  let legacyContacts = res.rows;
  console.log('Legacy contacts to process:', legacyContacts.length);
  
  let count = 0;
  for (const lc of legacyContacts) {
    if (!lc.name) continue;

    const res2 = await client.query(`
      SELECT id FROM docs_contacts 
      WHERE LOWER(TRIM(name)) = $1 
      AND id NOT LIKE 'CT-IMP-%'
      LIMIT 1;
    `, [lc.name.toLowerCase().trim()]);
    
    if (res2.rows.length > 0) {
      let realId = res2.rows[0].id;
      
      let uInv = await client.query(`UPDATE docs_invoices SET customer_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{customerId}', $2::jsonb) WHERE customer_id = $3`, [realId, JSON.stringify(realId), lc.id]);
      let uJl = await client.query(`UPDATE docs_journal_lines SET contact_id = $1 WHERE contact_id = $2`, [realId, lc.id]);
      let uPay = await client.query(`UPDATE docs_payments SET contact_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{contactId}', $2::jsonb) WHERE contact_id = $3`, [realId, JSON.stringify(realId), lc.id]);
      let uBill = await client.query(`UPDATE docs_bills SET vendor_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{vendorId}', $2::jsonb) WHERE vendor_id = $3`, [realId, JSON.stringify(realId), lc.id]);
      let uExp = await client.query(`UPDATE docs_expenses SET vendor_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{vendorId}', $2::jsonb) WHERE vendor_id = $3`, [realId, JSON.stringify(realId), lc.id]);
      
      if (uInv.rowCount > 0 || uJl.rowCount > 0 || uPay.rowCount > 0 || uBill.rowCount > 0 || uExp.rowCount > 0) {
          console.log(`Mapped legacy contact ${lc.name} from ${lc.id} to ${realId}`);
          count++;
      }
    }
  }
  
  console.log('Fix complete. Mapped records for', count, 'contacts.');
  await client.end();
}
main();
