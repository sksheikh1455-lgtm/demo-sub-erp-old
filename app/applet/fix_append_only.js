const fs = require('fs');

function replaceDeletions(text) {
  // Fix 1: invoice logic
  text = text.replace(
    /IF v_invoice\.journal_entry_id IS NOT NULL THEN\s*DELETE FROM docs_journal_lines WHERE journal_id = v_invoice\.journal_entry_id;\s*DELETE FROM docs_journals WHERE id = v_invoice\.journal_entry_id;\s*END IF;/g,
    `IF v_invoice.journal_entry_id IS NOT NULL THEN
               INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
               SELECT 'REV-' || substring(md5(random()::text) from 1 for 10), journal_id, company_id, account_id, contact_id,
                      CASE WHEN sum(debit - credit) < 0 THEN abs(sum(debit - credit)) ELSE 0 END,
                      CASE WHEN sum(debit - credit) > 0 THEN sum(debit - credit) ELSE 0 END,
                      'Auto Reversal of previous total'
               FROM docs_journal_lines 
               WHERE journal_id = v_invoice.journal_entry_id
               GROUP BY journal_id, company_id, account_id, contact_id
               HAVING sum(debit - credit) != 0;
               
               UPDATE docs_journals SET status = 'VOIDED', updated_at = NOW() WHERE id = v_invoice.journal_entry_id;
            END IF;`
  );
  
  text = text.replace(
    /DELETE FROM docs_journal_lines WHERE journal_id IN \(SELECT id FROM docs_journals WHERE reference_number = 'PAY-AUTO-' \|\| p_invoice_id\);\s*DELETE FROM docs_journals WHERE reference_number = 'PAY-AUTO-' \|\| p_invoice_id;\s*DELETE FROM docs_payments WHERE id = 'PAY-AUTO-' \|\| p_invoice_id;/g,
    `INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
               SELECT 'REV-' || substring(md5(random()::text) from 1 for 10), journal_id, company_id, account_id, contact_id,
                      CASE WHEN sum(debit - credit) < 0 THEN abs(sum(debit - credit)) ELSE 0 END,
                      CASE WHEN sum(debit - credit) > 0 THEN sum(debit - credit) ELSE 0 END,
                      'Auto Reversal of auto-payment'
               FROM docs_journal_lines 
               WHERE journal_id IN (SELECT id FROM docs_journals WHERE reference_number = 'PAY-AUTO-' || p_invoice_id)
               GROUP BY journal_id, company_id, account_id, contact_id
               HAVING sum(debit - credit) != 0;
               
            UPDATE docs_journals SET status = 'VOIDED', updated_at = NOW() WHERE reference_number = 'PAY-AUTO-' || p_invoice_id;
            UPDATE docs_payments SET status = 'CANCELLED', amount = 0, updated_at = NOW() WHERE id = 'PAY-AUTO-' || p_invoice_id;`
  );

  return text;
}

let inv = fs.readFileSync('current_post_invoice.txt', 'utf8');
fs.writeFileSync('current_post_invoice.txt', replaceDeletions(inv));
console.log('Fixed current_post_invoice.txt');
