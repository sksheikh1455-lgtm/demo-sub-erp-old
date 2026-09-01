CREATE OR REPLACE FUNCTION test_get_constraint() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  res text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO res FROM pg_constraint WHERE conname = 'unq_journal_num_company';
  RETURN res;
END;
$$;
