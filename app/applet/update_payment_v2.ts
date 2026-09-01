import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const { rows: payRows } = await client.query(`SELECT * FROM docs_payments WHERE data->>'number' = 'PAY-SUL-004001'`);
  let pay = payRows[0];
  pay.amount = '11950';
  pay.data.amount = 11950;
  if (pay.applied_invoices) pay.applied_invoices[0].amount = 11950;
  if (pay.data.appliedInvoices) pay.data.appliedInvoices[0].amount = 11950;
  if (pay.data.applied_invoices) pay.data.applied_invoices[0].amount = 11950;
  
  await client.query('SET session_replication_role = replica');
  await client.query(
    'UPDATE docs_payments SET amount = $1, applied_invoices = $2::jsonb, data = $3::jsonb WHERE id = $4',
    [pay.amount, JSON.stringify(pay.applied_invoices), JSON.stringify(pay.data), pay.id]
  );
  await client.query('SET session_replication_role = DEFAULT');
  await client.query('UPDATE docs_payments SET updated_at = NOW() WHERE id = $1', [pay.id]);
  
  console.log('Payment fixed.');
  await client.end();
}
run();