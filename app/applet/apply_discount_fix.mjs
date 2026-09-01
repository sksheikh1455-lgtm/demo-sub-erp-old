import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res = await c.query("SELECT pg_get_functiondef('public.post_invoice'::regproc) as def");
  let funcDef = res.rows[0].def;

  // Fix the invalid reference to v_invoice.discount
  funcDef = funcDef.replace(
    /v_global_discount := COALESCE\(v_invoice\.discount, COALESCE\(\(v_invoice\.data->>'discount'\)::numeric, 0\)\);/,
    "v_global_discount := COALESCE((v_invoice.data->>'discount')::numeric, 0);"
  );

  // We should also replace the definition CREATE OR REPLACE FUNCTION so it successfully replaces
  funcDef = funcDef.replace(/CREATE OR REPLACE FUNCTION public\.post_invoice/, "CREATE OR REPLACE FUNCTION public.post_invoice");

  await c.query(funcDef);
  console.log("post_invoice function patched to remove v_invoice.discount reference.");

  await c.end();
}

run().catch(console.error);
