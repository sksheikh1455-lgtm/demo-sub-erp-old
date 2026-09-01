import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query("SELECT set_config('core.bypass_audit', 'true', true);");
  await client.query("SET session_replication_role = 'replica';");

  try {
      // Find unbalanced journals in comp-1
      const unb = await client.query(`
        SELECT jl.journal_id
        FROM docs_journal_lines jl
        JOIN docs_journals j ON j.id = jl.journal_id
        WHERE jl.company_id = 'comp-1' AND j.status = 'POSTED'
        GROUP BY jl.journal_id
        HAVING abs(sum(debit) - sum(credit)) > 0.01
      `);
      
      console.log('Unbalanced journals to fix:', unb.rows.length);
      
      const a = await client.query(`SELECT id, code FROM docs_accounts WHERE company_id = 'comp-1'`);
      const ar_acc = a.rows.find(x => ['1012','100200','100201','AR'].includes(x.code))?.id;
      const rev_acc = a.rows.find(x => ['4011', '4000', '400100', 'REVENUE', 'SALES'].includes(x.code))?.id;
      const tax_acc = a.rows.find(x => ['200102', 'TAX', 'VAT'].includes(x.code))?.id;

      let fixed = 0;

      for (const row of unb.rows) {
          const jid = row.journal_id;
          
          // Get the invoice for this journal
          const invReq = await client.query(`SELECT * FROM docs_invoices WHERE journal_entry_id = $1`, [jid]);
          const inv = invReq.rows[0];
          
          if (!inv) continue; // Might be something else, like a manual journal

          // Delete existing AR, Rev, Tax lines for this journal
          await client.query(`
             DELETE FROM docs_journal_lines 
             WHERE journal_id = $1 
               AND (account_id = $2 OR account_id = $3 OR account_id = $4)
          `, [jid, ar_acc, rev_acc, tax_acc]);

          const total = Number(inv.total) || 0;
          await client.query(`
              INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
              VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
          `, ['JL-' + jid + '-ar', jid, inv.company_id, ar_acc, inv.customer_id || null, total, 'Accounts Receivable: ' + (inv.invoice_number || inv.id)]);

          const items = inv.data.items || [];
          let globalDiscount = Number(inv.data.discountTotal || 0);
          
          let totalRevSubtotal = 0;
          for (const item of items) {
              if (item.type !== 'DISCOUNT' && item.type !== 'TAX' && item.type !== 'SHIPPING') {
                  const qty = Number(item.quantity) || 0;
                  const price = Number(item.unitPrice) || 0;
                  const lv = Number(item.lineValue);
                  const itemSubtotal = !isNaN(lv) ? lv : (qty * price);
                  totalRevSubtotal += itemSubtotal;
              }
          }

          let discountDistributed = 0;
          let idx = 0;
          let itemsCount = items.filter((i: any) => i.type !== 'DISCOUNT' && i.type !== 'TAX' && i.type !== 'SHIPPING').length;
          let currentItemIdx = 0;

          for (const item of items) {
              idx++;
              if (item.type === 'DISCOUNT' || item.type === 'TAX' || item.type === 'SHIPPING') continue;
              currentItemIdx++;

              const qty = Number(item.quantity) || 0;
              const price = Number(item.unitPrice) || 0;
              const lv = Number(item.lineValue);
              const itemSubtotal = !isNaN(lv) ? lv : (qty * price);

              let propDiscount = 0;
              if (currentItemIdx === itemsCount) {
                  propDiscount = Math.round((globalDiscount - discountDistributed) * 100) / 100;
              } else {
                  propDiscount = totalRevSubtotal > 0 ? (itemSubtotal / totalRevSubtotal) * globalDiscount : 0;
                  propDiscount = Math.round(propDiscount * 100) / 100;
                  discountDistributed += propDiscount;
              }

              const revenueNet = Math.round((itemSubtotal - propDiscount) * 100) / 100;

              if (revenueNet !== 0) {
                  await client.query(`
                      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                      VALUES ($1, $2, $3, $4, 0, $5, $6)
                  `, ['JL-' + jid + '-rev-' + idx, jid, inv.company_id, rev_acc, revenueNet, 'Revenue: ' + (item.description || item.displayDescription || '')]);
              }

              const taxTotal = Number(item.tax) || 0;
              if (taxTotal !== 0 && tax_acc) {
                  await client.query(`
                      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                      VALUES ($1, $2, $3, $4, 0, $5, $6)
                  `, ['JL-' + jid + '-tax-' + idx, jid, inv.company_id, tax_acc, taxTotal, 'Tax: ' + (item.description || '')]);
              }
          }
          fixed++;
      }

      console.log('Fixed unbalanced journals:', fixed);
  } catch (e) {
      console.error(e);
  }

  await client.end();
}
run();
