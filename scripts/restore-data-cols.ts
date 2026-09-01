import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const tables = [
    'docs_invoices',
    'docs_bills',
    'docs_credit_notes',
    'docs_payments',
    'docs_journals',
    'docs_products',
    'docs_contacts',
    'docs_accounts',
    'docs_brands',
    'docs_categories'
  ];

  for (const table of tables) {
    try {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS data JSONB`);
      console.log(`Added data column to ${table}`);
    } catch (e: any) {
      console.log(`Error adding data column to ${table}: ${e.message}`);
    }
  }

  await client.end();
}
run();
