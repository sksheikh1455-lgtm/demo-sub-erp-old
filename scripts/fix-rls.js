import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const sql = `
    ALTER TABLE docs_product_costs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable read access for all users" ON docs_product_costs;
    CREATE POLICY "Enable read access for all users" ON docs_product_costs FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Enable insert access for all users" ON docs_product_costs;
    CREATE POLICY "Enable insert access for all users" ON docs_product_costs FOR INSERT WITH CHECK (true);
    
    DROP POLICY IF EXISTS "Enable update access for all users" ON docs_product_costs;
    CREATE POLICY "Enable update access for all users" ON docs_product_costs FOR UPDATE USING (true);
  `;
  await client.query(sql);
  console.log('RLS policies applied to docs_product_costs');
  await client.end();
}
run();
