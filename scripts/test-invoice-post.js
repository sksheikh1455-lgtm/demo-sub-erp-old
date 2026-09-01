import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function test() {
  await client.connect();
  const { rows } = await client.query(`SELECT id, company_id FROM docs_invoices WHERE status = 'DRAFT' LIMIT 1`);
  if (rows.length === 0) {
    console.log("No draft invoices.");
    process.exit();
  }
  const invoice = rows[0];
  console.log('Testing invoice post...', invoice.id);
  const { rows: rpcRes } = await client.query(`SELECT post_invoice($1, $2) as res`, [invoice.id, invoice.company_id]);
  console.log(rpcRes[0].res);
  
  // also get docs_journals
  const j = await client.query(`SELECT id, status, reference_number, date FROM docs_journals WHERE id = $1`, [rpcRes[0].res.journal_id]);
  console.log('Journal:', j.rows);
  
  await client.end();
}
test().catch(console.error);
