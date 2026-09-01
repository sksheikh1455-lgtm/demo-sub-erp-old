import pkg from "pg";
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  let paymentId = "PAY-TEST-999991";
  try {
    const invRes = await client.query("SELECT * FROM docs_invoices WHERE id = $1", ["37fbe428-33e1-4c2b-b11b-47391f2e476c"]);
    const inv = invRes.rows[0];
    
    let paymentToSave = {
      id: paymentId,
      status: "DRAFT",
      date: new Date().toISOString().split("T")[0],
      type: "RECEIPT",
      amount: 10,
      paymentDate: new Date().toISOString().split("T")[0],
      appliedInvoices: [{invoiceId: inv.id, invoiceNumber: inv.data.number, amount: 10, remaining: 0}],
      liquidityAccountId: "comp-1-100100",
      partnerAccountId: "comp-1-100201",
      method: "CASH",
      contactId: inv.customer_id
    };

    const q = `
      INSERT INTO docs_payments (id, company_id, date, contact_id, status, type, amount, payment_date, applied_invoices, applied_bills, account_id, partner_account_id, reference, method, data, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
    `;
    await client.query(q, [
      paymentToSave.id,
      inv.company_id,
      paymentToSave.date,
      paymentToSave.contactId,
      paymentToSave.status,
      paymentToSave.type,
      paymentToSave.amount,
      paymentToSave.paymentDate,
      JSON.stringify(paymentToSave.appliedInvoices),
      null,
      paymentToSave.liquidityAccountId,
      paymentToSave.partnerAccountId,
      null,
      paymentToSave.method,
      JSON.stringify(paymentToSave)
    ]);
    console.log("INSERT DONE");
    const res = await client.query("SELECT * FROM post_payment($1, $2)", [paymentId, inv.company_id]);
    console.log("SUCCESS RPC", res.rows);
  } catch(e) { 
    console.log("ERROR IS:", e.message);
  } finally {
    await client.query(`DELETE FROM docs_payments WHERE id = '${paymentId}'`).catch(()=>{});
    await client.query(`DELETE FROM docs_journals WHERE id LIKE '%PAY-TEST-999991%'`).catch(()=>{});
    await client.query(`DELETE FROM docs_journal_lines WHERE journal_id LIKE '%PAY-TEST-999991%'`).catch(()=>{});
    await client.end();
  }
}
main();
