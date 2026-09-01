-- 1. Secure check_company_access function
CREATE OR REPLACE FUNCTION check_company_access(v_company_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN 
    RETURN FALSE; 
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM docs_users 
    WHERE user_uuid = v_uid 
    AND (
      data->'companyIds' ? v_company_id
      OR
      data->>'companyId' = v_company_id
    )
  ) OR v_company_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop all policies
DO $$ 
DECLARE
    pol RECORD;
BEGIN 
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 3. Enable RLS on all tables and create secure policies
DO $$
DECLARE
  rec RECORD;
  company_col TEXT;
BEGIN
  FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', rec.tablename);
    
    -- Assign default check based on table structure
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = rec.tablename AND column_name = 'company_id') THEN
      EXECUTE format('CREATE POLICY "Company Isolation" ON %I FOR ALL TO authenticated USING (check_company_access(company_id)) WITH CHECK (check_company_access(company_id));', rec.tablename);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = rec.tablename AND column_name = 'id' AND rec.tablename = 'docs_companies') THEN
      EXECUTE format('CREATE POLICY "Company Isolation" ON %I FOR ALL TO authenticated USING (check_company_access(id)) WITH CHECK (check_company_access(id));', rec.tablename);
    END IF;
  END LOOP;
END;
$$;

-- 4. Special Policies
-- docs_users: A user can access their own record. Admins might need access to others, but simple rule first.
CREATE POLICY "Self access" ON docs_users FOR ALL TO authenticated USING (user_uuid = auth.uid()) WITH CHECK (user_uuid = auth.uid());

-- 5. Revoke ALL from public, grant to authenticated and service_role
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON %I FROM public, anon;', rec.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', rec.tablename);
    EXECUTE format('GRANT ALL ON %I TO service_role;', rec.tablename);
  END LOOP;
END
$$;
