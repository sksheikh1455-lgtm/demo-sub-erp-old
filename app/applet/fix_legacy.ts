import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  
  let res = await client.query("SELECT id, name FROM docs_contacts WHERE id LIKE 'CT-IMP-%'");
  let legacyContacts = res.rows;
  console.log('Legacy contacts to process:', legacyContacts.length);
  
  let fixedCount = 0;
  for (const lc of legacyContacts) {
    if (!lc.name) continue;
    
    let res2 = await client.query("SELECT id FROM docs_contacts WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id NOT LIKE 'CT-IMP-%' LIMIT 1", [lc.name]);
    
    if (res2.rows.length > 0) {
      let realId = res2.rows[0].id;
      
      try {
        await client.query('BEGIN');
        
        await client.query("UPDATE docs_invoices SET customer_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{customerId}', $2::jsonb) WHERE customer_id = $3", [realId, JSON.stringify(realId), lc.id]);
        await client.query("UPDATE docs_bills SET vendor_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{vendorId}', $2::jsonb) WHERE vendor_id = $3", [realId, JSON.stringify(realId), lc.id]);
        
        try {
            await client.query("UPDATE docs_payments SET contact_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{contactId}', $2::jsonb) WHERE contact_id = $3", [realId, JSON.stringify(realId), lc.id]);
        } catch(e){}
        
        try {
            await client.query("UPDATE docs_credit_notes SET customer_id = $1, data = jsonb_set(COALESCE(data, '{}'::jsonb), '{customerId}', $2::jsonb) WHERE customer_id = $3", [realId, JSON.stringify(realId), lc.id]);
        } catch(e){}

        await client.query("UPDATE docs_journal_lines SET contact_id = $1 WHERE contact_id = $2", [realId, lc.id]);

        await client.query('COMMIT');
        fixedCount++;
      } catch(e) {
        await client.query('ROLLBACK');
        console.error('Failed mapping for', lc.name, e.message);
      }
    }
  }
  
  console.log('Fixed', fixedCount, 'legacy duplicates globally.');
  await client.end();
}
main();
