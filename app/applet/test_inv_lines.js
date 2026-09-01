import pkg from "pg";
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  let invoiceId = "37fbe428-33e1-4c2b-b11b-47391f2e476c";
  const res = await client.query("SELECT count(*) FROM docs_journal_lines WHERE journal_id = $1", ["JE-" + invoiceId.toUpperCase()]);
  console.log("LINES:", res.rows[0].count);
  const q2 = await client.query("SELECT status, journal_entry_id FROM docs_invoices WHERE id = $1", [invoiceId]);
  console.log("INV:", q2.rows[0]);
  await client.end();
}
main();
