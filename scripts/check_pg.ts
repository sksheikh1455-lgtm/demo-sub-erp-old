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
    console.log("Connected, querying function definition of get_user_email...");
    
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'get_user_email'
    `);
    
    if (res.rows.length > 0) {
      console.log("Function Source Code:");
      console.log("==========================================");
      console.log(res.rows[0].prosrc);
      console.log("==========================================");
    } else {
      console.log("Function not found.");
    }
  } catch (err: any) {
    console.error("Query failed:", err.message);
  } finally {
    await client.end();
  }
}

main();
