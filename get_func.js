import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config({override: true});
const { Client } = pkg;
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'post_payment';");
  console.log(res.rows[0].prosrc);
  await client.end();
}
main();
