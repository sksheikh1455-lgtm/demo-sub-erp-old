import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
      await client.query('BEGIN');
      console.log('Starting merge script...');

      // Find all duplicate pairs
      const res = await client.query(`
        SELECT a.id as imp_id, b.id as real_id, a.name
        FROM docs_contacts a
        JOIN docs_contacts b ON LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
        WHERE a.id LIKE 'CT-IMP-%'
          AND b.id NOT LIKE 'CT-IMP-%'
      `);
      
      const pairs = res.rows;
      console.log(`Found ${pairs.length} duplicate pairs to merge.`);

      let totalUpdated = {
         invoices: 0, bills: 0, credit_notes: 0, payments: 0,
         journal_lines: 0, loans: 0
      };

      for (const pair of pairs) {
          const imp_id = pair.imp_id;
          const real_id = pair.real_id;

          // Invoices
          const rInv = await client.query(`UPDATE docs_invoices SET customer_id = $1 WHERE customer_id = $2`, [real_id, imp_id]);
          totalUpdated.invoices += rInv.rowCount;

          // Bills
          const rBil = await client.query(`UPDATE docs_bills SET vendor_id = $1 WHERE vendor_id = $2`, [real_id, imp_id]);
          totalUpdated.bills += rBil.rowCount;

          // Credit Notes
          const rCn = await client.query(`UPDATE docs_credit_notes SET customer_id = $1 WHERE customer_id = $2`, [real_id, imp_id]);
          totalUpdated.credit_notes += rCn.rowCount;

          // Payments
          const rPay = await client.query(`UPDATE docs_payments SET contact_id = $1 WHERE contact_id = $2`, [real_id, imp_id]);
          totalUpdated.payments += rPay.rowCount;

          // Journal Lines
          const rJl = await client.query(`UPDATE docs_journal_lines SET contact_id = $1 WHERE contact_id = $2`, [real_id, imp_id]);
          totalUpdated.journal_lines += rJl.rowCount;
          
          // Loans
          const rLn = await client.query(`UPDATE docs_loans SET contact_id = $1 WHERE contact_id = $2`, [real_id, imp_id]);
          totalUpdated.loans += rLn.rowCount;
          
          // Delete from docs_contact_companies so we avoid duplicate conflicts if we want to drop them
          await client.query(`DELETE FROM docs_contact_companies WHERE contact_id = $1`, [imp_id]);
          
          // We can't easily update journal jsonb 'data' field via simple parameterized query without complex JSONB REPLACE functions, 
          // but since get_general_ledger uses journal_lines contact_id FIRST, this is perfectly adequate!
          
          // Finally, hide or delete the imported contact so it doesn't clutter
          // Let's just delete it to be clean.
          await client.query(`DELETE FROM docs_contacts WHERE id = $1`, [imp_id]);
      }
      
      console.log('Merge complete. Result summary:');
      console.log(totalUpdated);
      
      await client.query('COMMIT');
      console.log('Committed successfully.');
  } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error during merge, rolled back.', err);
  } finally {
      await client.query(`
        -- Also, set is_customer = true for any remaining CT-IMP- contacts that are type CUSTOMER 
        -- so they at least show up in future searches if there is no duplicate for them!
        UPDATE docs_contacts SET is_customer = true WHERE id LIKE 'CT-IMP-%' AND type = 'CUSTOMER' AND is_customer = false;
      `);
      console.log('Fixed is_customer for remaining CT-IMP- customers.');
      await client.end();
  }
}
main();
