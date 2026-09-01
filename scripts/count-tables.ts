import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function count() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Counting tables...');
  
  const countInvoices = await client.query('SELECT count(*) as count FROM docs_invoices');
  const countLines = await client.query('SELECT count(*) as count FROM docs_invoice_lines');
  
  console.log('Invoices count:', countInvoices.rows[0].count);
  console.log('Lines count:', countLines.rows[0].count);
  
  // Also get the schema types of docs_invoice_lines
  const columns = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_invoice_lines'
  `);
  console.log('Columns of docs_invoice_lines:', columns.rows.map(c => `${c.column_name}: ${c.data_type}`));

  await client.end();
}

count().catch(console.error);
