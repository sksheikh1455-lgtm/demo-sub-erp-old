import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, status, data
      FROM docs_bills
      WHERE bill_number = 'BIL-SUL-000393';
    `);
    const bill = res.rows[0];
    console.log("Bill Status:", bill.status);
    
    const movRes = await client.query(`
      SELECT * FROM docs_inventory_transactions WHERE reference_id = $1;
    `, [bill.id]);
    console.log("Inventory Movements:", movRes.rows);
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
