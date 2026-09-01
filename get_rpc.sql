
CREATE OR REPLACE FUNCTION get_post_loan_payment_rpc() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE res text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO res FROM pg_proc WHERE proname = 'post_loan_payment_rpc' LIMIT 1;
  RETURN res;
END;
$$;
