import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows: payments } = await client.query("SELECT * FROM docs_payments WHERE type = 'REFUND' LIMIT 5;");
    console.log('--- docs_payments rows (REFUND) ---');
    for (const p of payments) {
      console.log(`Payment ID: ${p.id} | type: ${p.type} | amount: ${p.amount} | status: ${p.status}`);
      console.log('Data field:', JSON.stringify(p.data, null, 2));
    }
    
    // Check if post_payment is defined or what its source code contains about REFUND or type
    const { rows: rpcDef } = await client.query(`
      SELECT pg_get_functiondef(p.oid) as def 
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND p.proname = 'post_payment';
    `);
    if (rpcDef[0]) {
      console.log('--- post_payment RPC DEFINITION ---');
      console.log(rpcDef[0].def);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
