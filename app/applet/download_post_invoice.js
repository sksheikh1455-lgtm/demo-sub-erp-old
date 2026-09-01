const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await c.connect();
  const res = await c.query("SELECT pg_get_functiondef('public.post_invoice'::regproc) as def");
  fs.writeFileSync('current_db_post_invoice.txt', res.rows[0].def);
  await c.end();
}
main();
