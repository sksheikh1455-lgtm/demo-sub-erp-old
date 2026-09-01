import pkg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database.');

    // 1. Alter table docs_accounts to add sub_type column if not exists
    console.log('Altering table docs_accounts...');
    await client.query(`
      ALTER TABLE docs_accounts ADD COLUMN IF NOT EXISTS sub_type TEXT;
    `);
    console.log('Column sub_type added successfully/exists.');

    // 2. Populate sub_type codes
    console.log('Populating existing accounts with sub_type codes...');
    const updateResult = await client.query(`
      UPDATE docs_accounts
      SET sub_type = CASE
          WHEN code IN ('100100', '100101') THEN 'CASH'
          WHEN code = '100102' THEN 'BANK'
          WHEN code IN ('100201', '100200') THEN 'ACCOUNTS_RECEIVABLE'
          WHEN code IN ('100300', '100400') THEN 'OTHER_CURRENT_ASSET'
          WHEN code IN ('100501', '100502', '100500') THEN 'INVENTORY'
          WHEN code IN ('200101', '200100') THEN 'ACCOUNTS_PAYABLE'
          WHEN code = '200201' THEN 'CREDIT_CARD'
          WHEN code IN ('200300', '200400', '200500') THEN 'OTHER_CURRENT_LIABILITY'
          WHEN code = '300100' THEN 'EQUITY'
          WHEN code = '300200' THEN 'RETAINED_EARNINGS'
          WHEN code IN ('400100', '400200', '400300') THEN 'REVENUE'
          WHEN code = '400400' THEN 'OTHER_REVENUE'
          WHEN code = '500101' THEN 'COGS'
          WHEN type = 'REVENUE' THEN 'REVENUE'
          WHEN type = 'EXPENSE' THEN 'EXPENSE'
          WHEN type = 'COST_OF_REVENUE' THEN 'COGS'
          WHEN data IS NOT NULL AND data->>'subType' IS NOT NULL THEN data->>'subType'
          ELSE 'EXPENSE'
      END
      WHERE sub_type IS NULL OR sub_type = '';
    `);
    console.log(`Updated accounts sub_types. Rows affected: ${updateResult.rowCount}`);

    // Let's also verify that data is updated correctly and logs some rows
    const verifyRes = await client.query(`
      SELECT id, name, code, type, sub_type 
      FROM docs_accounts 
      LIMIT 10
    `);
    console.log('Sample updated accounts:', verifyRes.rows);

    // 3. Re-run phase2_reporting_engine.sql to ensure get_trial_balance_enterprise function uses the new column perfectly
    const sqlPath = path.join(process.cwd(), 'scripts', 'phase2_reporting_engine.sql');
    if (fs.existsSync(sqlPath)) {
      console.log('Re-applying scripts/phase2_reporting_engine.sql...');
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sqlContent);
      console.log('Scripts/phase2_reporting_engine.sql executed successfully.');
    } else {
      console.warn('scripts/phase2_reporting_engine.sql not found at path: ' + sqlPath);
    }

    // 4. Force reload schema for PostgREST
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('PostgREST schema reloaded.');

  } catch (err: any) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
