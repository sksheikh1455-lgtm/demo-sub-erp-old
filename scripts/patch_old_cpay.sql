UPDATE docs_journals
SET data = jsonb_set(
  data,
  '{createdById}',
  to_jsonb(created_by_id)
)
WHERE id LIKE 'JE-CPAY-%' AND data->>'createdById' IS NULL AND created_by_id IS NOT NULL;
