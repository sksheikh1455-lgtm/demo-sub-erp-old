import pkg from 'pg';
const { Client } = pkg;
async function test() {
  const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Connected directly!");
    const res = await client.query('SELECT count(*) FROM docs_users;');
    console.log("Users:", res.rows[0].count);
    
    // Also update check_company_access to be robust
    const updateFn = `
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

      -- 3. Fallback to native and JSONB docs_users lookup
      RETURN EXISTS (
        SELECT 1 FROM docs_users 
        WHERE (id = v_uid::text OR user_uuid = v_uid) 
        AND (
          company_id = v_company_id
          OR v_company_id = ANY(company_ids)
          OR role_id = 'role-admin'
          OR data->'companyIds' ? v_company_id
          OR data->>'companyId' = v_company_id
          OR data->>'roleId' = 'role-admin'
        )
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
    await client.query(updateFn);
    console.log("Updated check_company_access!");
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}
test();
