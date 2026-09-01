import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
    const { rows } = await client.query(`
      SELECT id, reference_number, date 
      FROM docs_journals 
      WHERE updated_at >= NOW() - INTERVAL '30 minutes'
        AND status = 'POSTED'
        AND journal_type = 'CREDIT_NOTE'
      ORDER BY reference_number
    `);
    
    console.log("Found:", rows.length);
    console.log(rows.map(r => r.reference_number).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
