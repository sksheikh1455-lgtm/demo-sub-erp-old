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
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'docs_%' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log(res.rows.map(r => r.table_name).join("\\n"));
  } catch (err: any) {
    console.error("Database query failed:", err.message);
  } finally {
    await client.end();
  }
}

main();
