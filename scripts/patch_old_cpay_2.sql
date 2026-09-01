-- Fix old journals
UPDATE docs_journals j
SET 
  created_by_id = COALESCE(j.created_by_id, p.data->>'createdById'),
  prepared_by = COALESCE(j.prepared_by, p.data->>'preparedBy'),
  data = jsonb_set(
    jsonb_set(
      j.data, 
      '{createdById}', 
      to_jsonb(COALESCE(j.created_by_id, p.data->>'createdById'))
    ),
    '{preparedBy}',
    to_jsonb(COALESCE(j.prepared_by, p.data->>'preparedBy'))
  )
FROM docs_payments p
WHERE j.reference = p.id AND (j.created_by_id IS NULL OR j.data->>'createdById' IS NULL OR j.data->>'preparedBy' IS NULL OR j.data->>'preparedBy' = '');
