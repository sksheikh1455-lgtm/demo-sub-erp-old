const fs = require('fs');

let text = fs.readFileSync('/tmp/func_out.txt', 'utf8');

text = text.replace(
    /AND i\.status IN \('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED'\)/g,
    "-- removed status filter for invoices to show all sequence"
);

text = text.replace(
    /COALESCE\(\(SELECT SUM\(jl\.debit - jl\.credit\)/g,
    "COALESCE(((SELECT SUM(jl.debit - jl.credit)"
); // actually, string replacement is safer

let narration_part = `COALESCE(
               (SELECT 'Paid via ' || string_agg(p.payment_number, ', ')
                FROM docs_payments p
                WHERE p.id = 'PAY-AUTO-' || i.id
                   OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(
                         CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices 
                         ELSE '[]'::jsonb END
                      ) e
                      WHERE e->>'invoiceId' = i.id
                      OR e->>'invoice_id' = i.id
                   )
               ),
                CASE WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 'Cash Sales' ELSE 'Sales' END
            ) || 
            CASE 
                WHEN i.status = 'FULL_REFUNDED' THEN ' (Full Refunded)'
                WHEN i.status = 'PARTIAL_REFUNDED' THEN ' (Partial Refunded)'
                ELSE ''
            END AS narration`;

let new_narration_part = `CASE WHEN i.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') THEN 'MISSING / ' || UPPER(i.status) ELSE COALESCE(
               (SELECT 'Paid via ' || string_agg(p.payment_number, ', ')
                FROM docs_payments p
                WHERE p.id = 'PAY-AUTO-' || i.id
                   OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(
                         CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices 
                         ELSE '[]'::jsonb END
                      ) e
                      WHERE e->>'invoiceId' = i.id
                      OR e->>'invoice_id' = i.id
                   )
               ),
                CASE WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 'Cash Sales' ELSE 'Sales' END
            ) || 
            CASE 
                WHEN i.status = 'FULL_REFUNDED' THEN ' (Full Refunded)'
                WHEN i.status = 'PARTIAL_REFUNDED' THEN ' (Partial Refunded)'
                ELSE ''
            END END AS narration`;

text = text.replace(narration_part, new_narration_part);

text = text.replace(
    `COALESCE(i.total, 0) AS amount`,
    `CASE WHEN i.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') THEN 0 ELSE COALESCE(i.total, 0) END AS amount`
);

let paid_part = `CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(i.total, 0)
                ELSE (COALESCE(i.total, 0) - CASE WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 ELSE COALESCE((i.data->>'due')::numeric, i.total) END)
            END AS paid`;

let new_paid_part = `CASE WHEN i.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') THEN 0 ELSE CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN COALESCE(i.total, 0)
                ELSE (COALESCE(i.total, 0) - CASE WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 ELSE COALESCE((i.data->>'due')::numeric, i.total) END)
            END END AS paid`;
            
text = text.replace(paid_part, new_paid_part);

let due_part = `CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 
                ELSE COALESCE((i.data->>'due')::numeric, i.total) 
            END AS due`;
            
let new_due_part = `CASE WHEN i.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') THEN 0 ELSE CASE 
                WHEN COALESCE(c.name, 'Unknown') ILIKE '%Cash Sale%' THEN 0
                WHEN i.status IN ('PAID', 'FULL_REFUNDED') THEN 0 
                ELSE COALESCE((i.data->>'due')::numeric, i.total) 
            END END AS due`;
            
text = text.replace(due_part, new_due_part);

let cash_impact_part = `COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE (jl.journal_id = i.data->>'journalEntryId' OR jl.journal_id = 'JE-CPAY-' || UPPER(REPLACE(REPLACE('PAY-AUTO-' || i.id, 'PAY-', ''), 'PAY-', ''))) AND a.code = '100100'), 0) AS cash_impact`;
             
let new_cash_impact_part = `CASE WHEN i.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') THEN 0 ELSE COALESCE((SELECT SUM(jl.debit - jl.credit) 
             FROM docs_journal_lines jl 
             JOIN docs_accounts a ON a.id = jl.account_id 
             WHERE (jl.journal_id = i.data->>'journalEntryId' OR jl.journal_id = 'JE-CPAY-' || UPPER(REPLACE(REPLACE('PAY-AUTO-' || i.id, 'PAY-', ''), 'PAY-', ''))) AND a.code = '100100'), 0) END AS cash_impact`;

text = text.replace(cash_impact_part, new_cash_impact_part);

fs.writeFileSync('/tmp/func_updated.sql', text);
console.log('done! replaced:', text.includes('MISSING / '));
