const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, payment_number FROM docs_payments WHERE data::text LIKE '%178996732%' OR data::text LIKE '%178996731%';
    `);
    console.log('Payments data:', res.rows);
    
    const res2 = await client.query(`
      SELECT id, payment_number FROM docs_payments WHERE id LIKE '%178996732%' OR id LIKE '%178996731%';
    `);
    console.log('Payments id:', res2.rows);

    const res3 = await client.query(`
      SELECT id, payment_number FROM docs_payments WHERE payment_number LIKE '%178996732%' OR payment_number LIKE '%178996731%';
    `);
    console.log('Payments num:', res3.rows);

  } catch (e) {
    console.error('Error applying SQL:', e);
  } finally {
    await client.end();
  }
}
run();
