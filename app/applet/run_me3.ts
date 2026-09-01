import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query("SELECT set_config('core.bypass_audit', 'true', true);");
  await client.query("SET session_replication_role = 'replica';");

  try {
      const invs = await client.query(`
        SELECT i.id, i.company_id, i.customer_id, i.invoice_number, i.total, i.data, i.journal_entry_id
        FROM docs_invoices i 
        WHERE i.company_id = 'comp-1' AND i.status IN ('POSTED', 'PAID', 'PARTIAL')
          AND NOT EXISTS (
              SELECT 1 FROM docs_journal_lines jl 
              JOIN docs_accounts a ON a.id = jl.account_id
              WHERE jl.journal_id = i.journal_entry_id 
                AND UPPER(a.data->>'type') = 'REVENUE'
          )
      `);
      
      console.log('Found invoices to fix:', invs.rows.length);
      
      const a = await client.query(`SELECT id, code FROM docs_accounts WHERE company_id = 'comp-1'`);
      const ar_acc = a.rows.find(x => ['1012','100200','100201','AR'].includes(x.code))?.id;
      const rev_acc = a.rows.find(x => ['4011', '4000', '400100', 'REVENUE', 'SALES'].includes(x.code))?.id;
      const tax_acc = a.rows.find(x => ['200102', 'TAX', 'VAT'].includes(x.code))?.id;

      if (!ar_acc || !rev_acc) {
          console.log('Missing accounts!');
          return;
      }

      let inserted = 0;
      let e = null;

      // Group into batches of 50
      const batchSize = 50;
      for (let b = 0; b < invs.rows.length; b += batchSize) {
          const batch = invs.rows.slice(b, b + batchSize);
          
          let insertValues = [];
          let paramIdx = 1;
          let params = [];

          for (const inv of batch) {
              const jid = inv.journal_entry_id;
              if (!jid) continue;

              const total = Number(inv.total) || 0;
              insertValues.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, 0, $${paramIdx++})`);
              params.push('JL-' + jid + '-ar', jid, inv.company_id, ar_acc, inv.customer_id || null, total, 'Accounts Receivable: ' + (inv.invoice_number || inv.id));
              inserted++;

              const items = inv.data.items || [];
              let globalDiscount = Number(inv.data.discountTotal || 0);
              
              let totalRevSubtotal = 0;
              for (const item of items) {
                  if (item.type !== 'DISCOUNT' && item.type !== 'TAX' && item.type !== 'SHIPPING') {
                      const qty = Number(item.quantity) || 0;
                      const price = Number(item.unitPrice) || 0;
                      totalRevSubtotal += (qty * price);
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
                  const itemSubtotal = qty * price;

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
                      insertValues.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NULL, 0, $${paramIdx++}, $${paramIdx++})`);
                      params.push('JL-' + jid + '-rev-' + idx, jid, inv.company_id, rev_acc, revenueNet, 'Revenue: ' + (item.description || item.displayDescription || ''));
                      inserted++;
                  }

                  const taxTotal = Number(item.tax) || 0;
                  if (taxTotal !== 0 && tax_acc) {
                      insertValues.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NULL, 0, $${paramIdx++}, $${paramIdx++})`);
                      params.push('JL-' + jid + '-tax-' + idx, jid, inv.company_id, tax_acc, taxTotal, 'Tax: ' + (item.description || ''));
                      inserted++;
                  }
              }
          }

          if (insertValues.length > 0) {
              await client.query(`
                  INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
                  VALUES ${insertValues.join(', ')}
                  ON CONFLICT (id) DO NOTHING
              `, params);
          }
      }

      console.log('Inserted missing lines:', inserted);
  } catch (e) {
      console.error(e);
  }

  await client.end();
}
run();
