import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows: Invoices } = await client.query('SELECT * FROM docs_invoices LIMIT 5;');
    console.log('--- docs_invoices rows ---');
    for (const inv of Invoices) {
      console.log(`INV ID: ${inv.id} | number: ${inv.invoice_number} | status: ${inv.status} | total: ${inv.total}`);
      console.log('Data field:', JSON.stringify(inv.data?.items ? { ...inv.data, items: `[${inv.data.items.length} items]` } : inv.data, null, 2));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
