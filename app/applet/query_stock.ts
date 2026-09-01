import pkg from 'pg';
const { Client } = pkg;
const c = new Client(process.env.DATABASE_URL);
async function run() {
  await c.connect();
  const ids = ['29f8a0b2-039d-422a-bdc6-c1735c957ad1', '71a9ac80-e23b-4ef9-857f-9fb16d209af1', '481af69c-4579-41e5-b9ae-7c0b207b6fb0'];
  for(let pid of ids) {
    const q = `
      SELECT 
        (SELECT COALESCE(SUM(dl.quantity), 0) FROM docs_bill_lines dl JOIN docs_bills d ON d.id = dl.bill_id WHERE dl.product_id = $1 AND d.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')) as bought,
        (SELECT COALESCE(SUM(dl.quantity), 0) FROM docs_invoice_lines dl JOIN docs_invoices d ON d.id = dl.invoice_id WHERE dl.product_id = $1 AND d.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')) as sold,
        (SELECT COALESCE(SUM(dl.quantity), 0) FROM docs_credit_note_lines dl JOIN docs_credit_notes d ON d.id = dl.credit_note_id WHERE dl.product_id = $1 AND d.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')) as returned
    `;
    const res = await c.query(q, [pid]);
    console.log('Product', pid, res.rows[0]);
  }
  await c.end();
}
run();
