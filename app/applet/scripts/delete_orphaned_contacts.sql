BEGIN;

WITH ContactStats AS (
  SELECT 
    c.id,
    LOWER(TRIM(c.name)) as clean_name,
    c.company_id,
    (SELECT COUNT(*) FROM docs_invoices WHERE customer_id = c.id) as inv_cnt,
    (SELECT COUNT(*) FROM docs_bills WHERE vendor_id = c.id) as bill_cnt,
    (SELECT COUNT(*) FROM docs_payments WHERE contact_id = c.id) as pay_cnt,
    (SELECT COUNT(*) FROM docs_credit_notes WHERE customer_id = c.id) as cn_cnt,
    (SELECT COUNT(*) FROM docs_journal_lines WHERE contact_id = c.id) as jl_cnt,
    (SELECT COUNT(*) FROM docs_loans WHERE contact_id = c.id) as ln_cnt,
    COUNT(*) OVER(PARTITION BY LOWER(TRIM(c.name))) as name_count,
    (
      SELECT COALESCE(SUM(value::numeric), 0) 
      FROM jsonb_each_text(c.opening_balances)
    ) as ob_balance
  FROM docs_contacts c
),
RankedContacts AS (
  SELECT *,
    ROW_NUMBER() OVER(
      PARTITION BY clean_name 
      ORDER BY 
        (inv_cnt + bill_cnt + pay_cnt + cn_cnt + jl_cnt + ln_cnt) DESC, 
        CASE WHEN company_id IS NOT NULL THEN 1 ELSE 2 END,
        id ASC
    ) as rn
  FROM ContactStats
  WHERE name_count > 1
),
OrphansToDelete AS (
  SELECT id
  FROM RankedContacts
  WHERE rn > 1
    AND inv_cnt = 0 
    AND bill_cnt = 0 
    AND pay_cnt = 0 
    AND cn_cnt = 0
    AND jl_cnt = 0
    AND ln_cnt = 0
    AND ob_balance = 0
)
DELETE FROM docs_contacts
WHERE id IN (SELECT id FROM OrphansToDelete);

COMMIT;
