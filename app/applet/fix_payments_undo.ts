import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query('ALTER TABLE docs_payments DISABLE TRIGGER USER');
  
  let val = '"comp-1-100102"';
  let q = `UPDATE docs_payments SET account_id = 'comp-1-100102', data = jsonb_set(jsonb_set(data, '{accountId}', CAST($1 AS jsonb)), '{liquidityAccountId}', CAST($1 AS jsonb)) WHERE xmin::text = '175279'`;
  let r = await c.query(q, [val]);
  console.log('Restored docs_payments to 100102:', r.rowCount);

  await c.query('ALTER TABLE docs_payments ENABLE TRIGGER USER');

  await c.end();
}
run();
