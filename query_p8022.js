import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.example' });

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
});

async function main() {
  try {
    const res1 = await pool.query("SELECT * FROM docs_products WHERE data->>'sku' ILIKE '%p8022%' OR data->>'name' ILIKE '%p8022%' OR data->>'name' ILIKE '%3PIN SOCKET%';");
    console.log("Products found:", res1.rows.length);
    for (const r of res1.rows) {
      console.log("-", r.id, r.data?.sku, r.data?.name, "Archived:", r.data?.isArchived, r.is_archived);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
main();
