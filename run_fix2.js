import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
async function main() {
  const sql = fs.readFileSync('fix_post_bill.sql', 'utf8');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`DROP TRIGGER IF EXISTS trg_immutable_bills ON docs_bills;`);
    await client.query(sql);
    const res = await client.query(`SELECT id, company_id FROM docs_bills WHERE status IN ('POSTED', 'PAID', 'PARTIAL')`);
    for (const row of res.rows) {
      await client.query('SELECT post_bill($1, $2)', [row.id, row.company_id]);
    }
    console.log(`Re-posted ${res.rows.length} bills.`);
    await client.query(`
        CREATE TRIGGER trg_immutable_bills BEFORE UPDATE ON docs_bills
        FOR EACH ROW EXECUTE FUNCTION enforce_accounting_immutability();
    `);
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
