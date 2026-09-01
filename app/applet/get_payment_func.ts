import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    let res = await client.query(`SELECT pg_get_functiondef('public.post_payment(text)'::regprocedure);`);
    console.log(res.rows[0].pg_get_functiondef);
  } catch(e) {
     console.error(e);
  } finally {
     await client.end();
  }
}
run();
