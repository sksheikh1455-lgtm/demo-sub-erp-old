import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query('BEGIN');
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
      
      console.log(`Found ${invs.rows.length} invoices to fix.`);
      
      let inserted = 0;

      for (const inv of invs.rows) {
          const jid = inv.journal_entry_id;
          if (!jid) continue;

          // Get accounts
          const accRes = await client.query(`
              SELECT 
                (SELECT id FROM docs_accounts WHERE code IN ('1012','100200','100201','AR') AND company_id = $1 LIMIT 1) as ar_acc,
                (SELECT id FROM docs_accounts WHERE code IN ('4011', '4000', '400100', 'REVENUE', 'SALES') AND company_id = $1 LIMIT 1) as rev_acc,
                (SELECT id FROM docs_accounts WHERE code IN ('200102', 'TAX', 'VAT') AND company_id = $1 LIMIT 1) as tax_acc
          `, [inv.company_id]);
          const { ar_acc, rev_acc, tax_acc } = accRes.rows[0];

          if (!ar_acc || !rev_acc) {
              console.log('Missing accounts for company', inv.company_id);
              continue;
          }

          // 1. Insert AR line
          const total = Number(inv.total) || 0;
          await client.query(`
              INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
              VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
              ON CONFLICT (id) DO NOTHING
          `, ['JL-' + jid + '-ar', jid, inv.company_id, ar_acc, inv.customer_id, total, 'Accounts Receivable: ' + (inv.invoice_number || inv.id)]);
          inserted++;

          const items = inv.data.items || [];
          let globalDiscount = Number(inv.data.discountTotal || 0);
          
          // Calculate total revenue subtotal
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
              if (item.type === 'DISCOUNT' || item.type === 'TAX' || item.type === 'SHIPPING') {
                  continue;
              }
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
                  await client.query(`
                      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                      VALUES ($1, $2, $3, $4, 0, $5, $6)
                      ON CONFLICT (id) DO NOTHING
                  `, ['JL-' + jid + '-rev-' + idx, jid, inv.company_id, rev_acc, revenueNet, 'Revenue: ' + (item.description || item.displayDescription || '')]);
                  inserted++;
              }

              const taxTotal = Number(item.tax) || 0;
              if (taxTotal !== 0 && tax_acc) {
                  await client.query(`
                      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                      VALUES ($1, $2, $3, $4, 0, $5, $6)
                      ON CONFLICT (id) DO NOTHING
                  `, ['JL-' + jid + '-tax-' + idx, jid, inv.company_id, tax_acc, taxTotal, 'Tax: ' + (item.description || '')]);
                  inserted++;
              }
          }
      }

      console.log(`Inserted ${inserted} missing lines.`);
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
  }

  await client.end();
}
run();
