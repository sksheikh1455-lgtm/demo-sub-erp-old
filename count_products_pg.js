import pg from 'pg';

const pool = new pg.Pool({
  host: 'db.buspgzsamhfmjrmmwpmo.supabase.co',
  port: 6543,
  user: 'postgres.buspgzsamhfmjrmmwpmo',
  password: 'sk445@raihan',
  database: 'postgres',
});

async function main() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM docs_products;');
    console.log("Total products in db:", res.rows[0].count);
    
    const res2 = await pool.query(`SELECT id, data FROM docs_products WHERE data::text ILIKE '%p8022%' OR data::text ILIKE '%p7022%';`);
    console.log("Found matches:", res2.rows.length);
    for (const r of res2.rows) {
        console.log("-", r.id, r.data?.name, r.data?.sku);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
main();
