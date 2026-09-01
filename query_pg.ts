import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgres://postgres.buspgzsamhfmjrmmwpmo:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, data FROM docs_accounts WHERE data->>'code' IN ('100100', '210100')`);
  console.log(JSON.stringify(res.rows, null, 2));
  
  const loanRes = await client.query(`SELECT id, data FROM docs_loans WHERE data->>'number' = 'OP-LOAN-2494'`);
  console.log('Loan:', JSON.stringify(loanRes.rows, null, 2));

  await client.end();
}
run();
