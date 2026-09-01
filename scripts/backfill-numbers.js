
import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function backfill() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT id, company_id FROM docs_invoices WHERE invoice_number IS NULL AND status IN ('POSTED', 'PAID', 'PARTIAL', 'ACTIVE')");
    for (const r of rows) {
      console.log('Processing:', r.id);
      const { rows: numRes } = await client.query("SELECT get_next_company_doc_number($1::text, 'INVOICE') as num", [r.company_id]);
      const num = numRes[0].num;
      await client.query("UPDATE docs_invoices SET invoice_number = $1::text WHERE id = $2::text", [num, r.id]);
      await client.query("UPDATE docs_invoices SET data = data || jsonb_build_object('number', $1::text) WHERE id = $2::text", [num, r.id]);
      console.log('Assigned:', num);
    }
  } finally {
    await client.end();
  }
}
backfill();
