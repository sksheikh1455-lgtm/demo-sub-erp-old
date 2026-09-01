import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    console.log('=== INSPECTING INVOICES ===');
    const invRes = await c.query(`
      SELECT i.id, i.invoice_number, i.status, i.date, i.total, i.customer_id, co.name AS customer_name
      FROM docs_invoices i
      JOIN docs_contacts co ON i.customer_id = co.id
      WHERE i.invoice_number IN ('INV-SUL-000775', 'INV-SUL-000768')
        AND i.company_id = 'comp-1'
    `);
    console.log(JSON.stringify(invRes.rows, null, 2));

    for (const inv of invRes.rows) {
      console.log(`\n=== CHECKING JOURNAL FOR ${inv.invoice_number} (id: ${inv.id}) ===`);
      const journalRes = await c.query(`
        SELECT id, reference_number, status, journal_number, description
        FROM docs_journals
        WHERE reference_number = $1 AND company_id = 'comp-1'
      `, [inv.invoice_number]);
      console.log('Journals found:', journalRes.rows);

      if (journalRes.rows.length > 0) {
        const jId = journalRes.rows[0].id;
        const linesRes = await c.query(`
          SELECT jl.id, jl.account_id, a.code, a.name as account_name, jl.debit, jl.credit, jl.contact_id, co.name AS contact_name
          FROM docs_journal_lines jl
          JOIN docs_accounts a ON jl.account_id = a.id
          LEFT JOIN docs_contacts co ON jl.contact_id = co.id
          WHERE jl.journal_id = $1
        `, [jId]);
        console.log('Journal Lines:');
        console.log(linesRes.rows);
      }
    }

    console.log('\n=== INSPECTING GET_PARTNER_LEDGER FUNCTION DEFINITION ===');
    const funcRes = await c.query(`
      SELECT pg_get_functiondef(p.oid) as def
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'get_partner_ledger'
    `);
    if (funcRes.rows.length > 0) {
      console.log(funcRes.rows[0].def);
    } else {
      console.log('get_partner_ledger function not found in PostgreSQL metadata.');
    }

  } catch (err: any) {
    console.error('ERROR:', err.message);
  } finally {
    await c.end();
  }
}
run();
