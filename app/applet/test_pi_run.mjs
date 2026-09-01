import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res = await c.query("SELECT id FROM docs_invoices WHERE status = 'DRAFT' LIMIT 1");
  if (res.rows.length > 0) {
    const invId = res.rows[0].id;
    console.log("Testing post_invoice on", invId);
    try {
      const pRes = await c.query("SELECT post_invoice($1)", [invId]);
      console.log("Success:", pRes.rows[0]);
    } catch(err) {
      console.error("Error executing post_invoice:", err.message);
    }
  } else {
    console.log("No draft invoices found. Just printing to confirm structure is intact.");
  }

  await c.end();
}

run().catch(console.error);
