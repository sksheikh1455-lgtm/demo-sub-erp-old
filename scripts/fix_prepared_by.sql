-- Update RPCs first
\ir scripts/posting_rpcs.sql

-- Now update existing records where preparedBy is missing or blank
-- For docs_journals:
UPDATE docs_journals 
SET data = jsonb_set(data, '{preparedBy}', '"RAIHAN SHEIKH"') 
WHERE data->>'preparedBy' IS NULL OR data->>'preparedBy' = '';

-- For docs_invoices:
UPDATE docs_invoices 
SET data = jsonb_set(data, '{preparedBy}', '"RAIHAN SHEIKH"') 
WHERE data->>'preparedBy' IS NULL OR data->>'preparedBy' = '';

UPDATE docs_invoices 
SET data = jsonb_set(data, '{salesperson}', '"RAIHAN SHEIKH"') 
WHERE data->>'salesperson' IS NULL OR data->>'salesperson' = '';

-- For docs_bills:
UPDATE docs_bills 
SET data = jsonb_set(data, '{preparedBy}', '"RAIHAN SHEIKH"') 
WHERE data->>'preparedBy' IS NULL OR data->>'preparedBy' = '';

-- For docs_payments:
UPDATE docs_payments 
SET data = jsonb_set(data, '{preparedBy}', '"RAIHAN SHEIKH"') 
WHERE data->>'preparedBy' IS NULL OR data->>'preparedBy' = '';

-- For docs_credit_notes:
UPDATE docs_credit_notes 
SET data = jsonb_set(data, '{preparedBy}', '"RAIHAN SHEIKH"') 
WHERE data->>'preparedBy' IS NULL OR data->>'preparedBy' = '';

SELECT 'Prepared By values updated successfully!' as result;
