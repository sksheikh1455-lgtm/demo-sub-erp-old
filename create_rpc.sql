CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE 'WITH q AS (' || query || ') SELECT jsonb_agg(q) FROM q' INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
