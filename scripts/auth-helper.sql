CREATE OR REPLACE FUNCTION get_user_email(p_username TEXT)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT data->>'email' INTO v_email 
  FROM docs_users 
  WHERE data->>'username' = p_username OR data->>'email' = p_username
  LIMIT 1;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_email(TEXT) TO anon, authenticated;
