import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res2 = await c.query("SELECT pg_get_functiondef('public.post_credit_note'::regproc) as def");
  let funcDef2 = res2.rows[0].def;
  if(funcDef2.includes('v_invoice.discount') || funcDef2.includes('v_credit_note.discount')) {
        console.log("post_credit_note has discount issue!");
  }

  const res3 = await c.query("SELECT pg_get_functiondef('public.post_bill'::regproc) as def");
  let funcDef3 = res3.rows[0].def;
  if(funcDef3.includes('v_bill.discount')) {
        console.log("post_bill has discount issue!");
  }

  await c.end();
}

run().catch(console.error);
