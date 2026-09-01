import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT LOWER(TRIM(name)) as name, company_id, COUNT(*) as cnt
      FROM docs_contacts
      GROUP BY LOWER(TRIM(name)), company_id
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 10;
    `);
    
    console.log("TOP 10 Duplicate Groups Dry Run Preview:");
    for (const group of res.rows) {
      console.log(`\nGroup Name: "${group.name}" | Company: "${group.company_id}"`);
      // Find master and duplicates
      const members = await client.query(`
        SELECT 
          id, 
          updated_at,
          (SELECT COUNT(*) FROM docs_invoices WHERE customer_id = c.id) as inv_cnt,
          (SELECT COUNT(*) FROM docs_bills WHERE vendor_id = c.id) as bill_cnt
        FROM docs_contacts c
        WHERE LOWER(TRIM(c.name)) = $1 
          AND (c.company_id = $2 OR (c.company_id IS NULL AND $2 IS NULL))
        ORDER BY 
          ((SELECT COUNT(*) FROM docs_invoices WHERE customer_id = c.id) + (SELECT COUNT(*) FROM docs_bills WHERE vendor_id = c.id)) DESC,
          c.updated_at DESC,
          c.id ASC;
      `, [group.name, group.company_id]);
      
      members.rows.forEach((m, idx) => {
        const total_tx = m.inv_cnt + m.bill_cnt;
        console.log(`  [${idx === 0 ? 'MASTER' : 'DUP'}] ID: ${m.id} | TX Total: ${total_tx} (Invs: ${m.inv_cnt}, Bills: ${m.bill_cnt}) | Updated: ${m.updated_at}`);
      });
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
