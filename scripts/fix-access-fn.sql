CREATE OR REPLACE FUNCTION check_company_access(v_company_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_uid UUID;
  v_has_access BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN 
    RETURN FALSE; 
  END IF;

  -- Ensure backwards compatibility
  IF v_company_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- 1. Relational check
  SELECT TRUE INTO v_has_access 
  FROM docs_user_company_access 
  WHERE user_uuid = v_uid 
  AND company_id = v_company_id
  LIMIT 1;

  IF v_has_access THEN
     RETURN TRUE;
  END IF;

  -- 2. Check if the user is a global admin
  IF EXISTS (SELECT 1 FROM docs_user_company_access WHERE user_uuid = v_uid AND role_id = 'role-admin' LIMIT 1) THEN
     RETURN TRUE;
  END IF;

  -- 3. Fallback to old JSONB docs_users lookup
  -- We check both 'id' and 'user_uuid' column
  RETURN EXISTS (
    SELECT 1 FROM docs_users 
    WHERE (id = v_uid::text OR user_uuid = v_uid) 
    AND (
      data->'companyIds' ? v_company_id
      OR data->>'companyId' = v_company_id
      OR data->>'roleId' = 'role-admin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
