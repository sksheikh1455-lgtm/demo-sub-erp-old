UPDATE docs_journals j
SET prepared_by = COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System')
FROM docs_users u
WHERE j.created_by_id = u.id AND (j.prepared_by = 'System' OR j.prepared_by IS NULL);

UPDATE docs_journals j
SET data = jsonb_set(
  COALESCE(j.data, '{}'::jsonb),
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE (j.created_by_id = u.id OR j.data->>'createdById' = u.id) AND (j.data->>'preparedBy' = 'System' OR j.data->>'preparedBy' IS NULL);

UPDATE docs_invoices i
SET data = jsonb_set(
  COALESCE(i.data, '{}'::jsonb),
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE (i.data->>'createdById' = u.id) AND (i.data->>'preparedBy' = 'System' OR i.data->>'preparedBy' IS NULL);

UPDATE docs_bills b
SET data = jsonb_set(
  COALESCE(b.data, '{}'::jsonb),
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE (b.data->>'createdById' = u.id) AND (b.data->>'preparedBy' = 'System' OR b.data->>'preparedBy' IS NULL);

UPDATE docs_payments p
SET data = jsonb_set(
  COALESCE(p.data, '{}'::jsonb),
  '{preparedBy}',
  to_jsonb(COALESCE(u.name, u.username, split_part(u.email, '@', 1), 'System'))
)
FROM docs_users u
WHERE (p.data->>'createdById' = u.id) AND (p.data->>'preparedBy' = 'System' OR p.data->>'preparedBy' IS NULL);
