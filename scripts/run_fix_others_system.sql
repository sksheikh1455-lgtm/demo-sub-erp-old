UPDATE docs_invoices j
SET data = jsonb_set(
  data,
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE j.data->>'createdById' = u.id AND (j.data->>'preparedBy' = 'System' OR j.data->>'preparedBy' IS NULL OR j.data->>'preparedBy' = '');

UPDATE docs_payments j
SET data = jsonb_set(
  data,
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE j.data->>'createdById' = u.id AND (j.data->>'preparedBy' = 'System' OR j.data->>'preparedBy' IS NULL OR j.data->>'preparedBy' = '');

UPDATE docs_bills j
SET data = jsonb_set(
  data,
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE j.data->>'createdById' = u.id AND (j.data->>'preparedBy' = 'System' OR j.data->>'preparedBy' IS NULL OR j.data->>'preparedBy' = '');
