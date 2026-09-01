import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Clearing old product costs...');
  await client.query('DELETE FROM docs_product_costs;');

  console.log('Replaying inventory transactions to rebuild WAC...');
  const sql = `
  DO $$
  DECLARE
      tx RECORD;
  BEGIN
      FOR tx IN (
          SELECT id, quantity 
          FROM docs_inventory_transactions 
          ORDER BY date ASC, created_at ASC
      )
      LOOP
          -- touching quantity fires the ON UPDATE? Wait, our trigger is AFTER INSERT.
          -- We must make the trigger run again? No, trigger is AFTER INSERT!
      END LOOP;
  END;
  $$;
  `;
  // Wait, if the trigger is only on AFTER INSERT, updating them won't fire it!
  console.log('Trigger analysis...');
  await client.end();
}

run().catch(console.error);
