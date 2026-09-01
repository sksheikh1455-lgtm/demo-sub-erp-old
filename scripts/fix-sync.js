import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Creating missing tables and columns...");

  const tables = [
    'docs_companies', 'docs_users', 'docs_roles', 'docs_invoices', 'docs_bills', 
    'docs_payments', 'docs_credit_notes', 'docs_journals', 'docs_products', 
    'docs_contacts', 'docs_accounts', 'docs_inventory_adjustments', 'docs_payslips',
    'docs_advance_salaries', 'docs_brands', 'docs_categories', 'docs_attendance',
    'docs_commission_targets', 'docs_leaves', 'docs_tasks', 'docs_holidays'
  ];

  let sql = "";
  
  for (const table of tables) {
    sql += `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ);\n`;
    sql += `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS company_id TEXT;\n`;
    sql += `CREATE INDEX IF NOT EXISTS idx_${table}_company ON ${table}(company_id);\n`;
    sql += `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n`;
    sql += `DROP POLICY IF EXISTS "Company Isolation" ON ${table};\n`;
    
    if (table === 'docs_companies') {
      sql += `CREATE POLICY "Company Isolation" ON ${table} FOR ALL USING (check_company_access(id)) WITH CHECK (check_company_access(id));\n`;
    } else {
      sql += `CREATE POLICY "Company Isolation" ON ${table} FOR ALL USING (check_company_access(company_id)) WITH CHECK (check_company_access(company_id));\n`;
    }
  }

  // Ensure specific columns exist
  sql += `ALTER TABLE docs_invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;\n`;
  sql += `ALTER TABLE docs_bills ADD COLUMN IF NOT EXISTS bill_number TEXT;\n`;
  sql += `ALTER TABLE docs_payments ADD COLUMN IF NOT EXISTS payment_number TEXT;\n`;
  sql += `ALTER TABLE docs_credit_notes ADD COLUMN IF NOT EXISTS credit_note_number TEXT;\n`;
  sql += `ALTER TABLE docs_journals ADD COLUMN IF NOT EXISTS reference_number TEXT;\n`;

  // Re-apply triggers for all tables
  for (const table of tables) {
    if (['docs_invoices', 'docs_bills', 'docs_payments', 'docs_journals'].includes(table)) continue;
    if (table === 'docs_companies') {
        sql += `
        DROP TRIGGER IF EXISTS trg_sync_company_own_id ON docs_companies;
        CREATE TRIGGER trg_sync_company_own_id
          BEFORE INSERT OR UPDATE ON docs_companies
          FOR EACH ROW
          EXECUTE FUNCTION sync_company_own_id();
        `;
    } else {
        sql += `
        DROP TRIGGER IF EXISTS trg_sync_${table}_company ON ${table};
        CREATE TRIGGER trg_sync_${table}_company
          BEFORE INSERT OR UPDATE ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION sync_company_id();
        `;
    }
  }

  await client.query(sql);
  console.log("Migration complete!");
  await client.end();
}

migrate().catch(console.error);
