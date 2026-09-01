import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  let sql = fs.readFileSync('scripts/inventory_rpcs.sql', 'utf8');

  // Insert security check
  const injectTarget = "v_effective_company_id := COALESCE(p_company_id, v_adj.company_id, v_adj.data->>'companyId');";
  const injection = `
    v_effective_company_id := COALESCE(p_company_id, v_adj.company_id, v_adj.data->>'companyId');
    
    -- Security Validation
    IF NOT check_company_access(v_effective_company_id) THEN 
        RAISE EXCEPTION 'Access denied for company %', v_effective_company_id; 
    END IF;
  `;

  sql = sql.replace(injectTarget, injection);

  console.log("Applying updated inventory RPCs to database...");
  await client.query(sql);
  console.log("Inventory RPCs updated successfully.");
  
  await client.end();
}

run().catch(console.error);
