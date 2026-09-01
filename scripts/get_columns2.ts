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
        'docs_stock_movements', 'docs_product_costs', 'docs_product_stocks'
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
