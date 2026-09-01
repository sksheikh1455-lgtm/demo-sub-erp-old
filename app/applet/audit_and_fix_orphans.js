const { Client } = require('pg');
const crypto = require('crypto');

async function fix() {
  const c = new Client(process.env.DATABASE_URL);
  await c.connect();

  try {
    await c.query('BEGIN');

    // 1. Audit orphans
    const orphansQuery = `
      SELECT cn.id, cn.cn_number, cn.total, cn.customer_id, cn.date, cn.company_id
      FROM docs_credit_notes cn
      JOIN docs_contacts cnt ON cn.customer_id = cnt.id
      WHERE cnt.name ILIKE '%Cash Sale%' AND cn.status IN ('POSTED', 'CLOSED')
      AND NOT EXISTS (
          SELECT 1 FROM docs_payments p 
          WHERE p.data->>'reference' ILIKE '%' || COALESCE(cn.cn_number, cn.id) || '%'
             OR p.data->>'creditNoteId' = cn.id
      )
    `;
    const res = await c.query(orphansQuery);
    console.log(`Found ${res.rows.length} orphaned credit notes requiring refunds.`);

    for (const cn of res.rows) {
      if (!cn.cn_number) {
         cn.cn_number = cn.id.substring(0, 8); // fallback
      }

      const companyId = cn.company_id;
      const amount = parseFloat(cn.total);

      // Get accounts
      const accRes = await c.query(`SELECT id, code FROM docs_accounts WHERE company_id = $1 AND code IN ('100100', '100201')`, [companyId]);
      const cashAcc = accRes.rows.find(a => a.code === '100100')?.id;
      const arAcc = accRes.rows.find(a => a.code === '100201')?.id;

      if (!cashAcc || !arAcc) {
        console.warn(`Missing accounts for company ${companyId}`);
        continue;
      }

      const paymentId = crypto.randomUUID();
      const refCode = `CPAY/REF-${cn.cn_number.split('/').pop()}`;
      
      const pData = JSON.stringify({
        accountId: cashAcc,
        partnerAccountId: arAcc,
        method: "CASH",
        reference: refCode,
        type: "REFUND",
        creditNoteId: cn.id,
        createdAt: new Date().toISOString()
      });

      // Insert payment
      await c.query(`
        INSERT INTO docs_payments (id, payment_number, company_id, date, amount, contact_id, status, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [paymentId, `PAY-REF-${cn.cn_number}`, companyId, cn.date, amount, cn.customer_id, 'POSTED', pData]);

      // Insert Journal
      const journalId = crypto.randomUUID();
      const jData = JSON.stringify({
        sourceType: "PAYMENT",
        sourceId: paymentId
      });

      await c.query(`
        INSERT INTO docs_journals (id, company_id, journal_number, date, description, reference, status, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [journalId, companyId, `JE-REF-${cn.cn_number}`, cn.date, `Refund Payment: ${refCode}`, cn.cn_number, 'POSTED', jData]);

      // Insert Lines
      // Dr AR 100201
      await c.query(`
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, contact_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [crypto.randomUUID(), journalId, companyId, arAcc, amount, 0, cn.customer_id]);

      // Cr Cash 100100
      await c.query(`
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, contact_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [crypto.randomUUID(), journalId, companyId, cashAcc, 0, amount, cn.customer_id]);
      
      // Mark CN as CLOSED because it is fully refunded
      // update amount_paid in data and status
      await c.query(`
        UPDATE docs_credit_notes 
        SET status = 'CLOSED',
            data = jsonb_set(
                data, 
                '{amountPaid}', 
                ((COALESCE((data->>'amountPaid')::numeric, 0) + $1)::text)::jsonb
            )
        WHERE id = $2
      `, [amount, cn.id]);

      console.log(`Posted refund for CN: ${cn.cn_number} (Amount: ${amount})`);
    }

    await c.query('COMMIT');
    console.log('Automated historical refund patch completed successfully.');
  } catch(e) {
    await c.query('ROLLBACK');
    console.error('Error during patch:', e);
  } finally {
    await c.end();
  }
}

fix();
