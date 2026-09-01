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
      WHERE table_schema = 'public' AND table_name LIKE 'docs_%' 
      ORDER BY table_name, ordinal_position;
    `);
    console.log(JSON.stringify(res.rows));
  } catch (err: any) {
    console.error("Database query failed:", err.message);
  } finally {
    await client.end();
  }
}

main();
