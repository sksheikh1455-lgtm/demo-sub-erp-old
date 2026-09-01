import pg from 'pg';
const { Client } = pg;

async function main() {
  const rawDbUrl = process.env.DATABASE_URL;
  const connectionString = (rawDbUrl && (rawDbUrl.startsWith("postgres://") || rawDbUrl.startsWith("postgresql://")))
    ? rawDbUrl
    : process.env.SUPABASE_DB_URL;

  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'docs_invoices', 'docs_invoice_lines', 
        'docs_bills', 'docs_bill_lines', 
        'docs_journals', 'docs_journal_lines', 
        'docs_payments', 'docs_products', 
        'docs_contacts', 'docs_accounts',
        'docs_credit_notes', 'docs_credit_note_lines'
      )
      ORDER BY table_name, ordinal_position;
    `);
    
    const tables: Record<string, string[]> = {};
    for (const row of res.rows) {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push(row.column_name);
    }
    
    console.log(JSON.stringify(tables, null, 2));
  } catch (err: any) {
    console.error("Database query failed:", err.message);
  } finally {
    await client.end();
  }
}

main();
