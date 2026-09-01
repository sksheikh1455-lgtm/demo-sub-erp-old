import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Re-triggering inventory transactions for invoices missing COGS in batches...');
  let totalProcessed = 0;
  while (true) {
      const c = await client.query(`
        WITH to_update AS (
            SELECT t.id
            FROM docs_inventory_transactions t
            JOIN docs_invoices i ON i.id = t.reference_id
            WHERE i.company_id = 'comp-1' AND i.status IN ('POSTED', 'PAID', 'PARTIAL')
              AND NOT EXISTS (
                  SELECT 1 FROM docs_journal_lines jl 
                  JOIN docs_accounts a ON a.id = jl.account_id
                  WHERE jl.journal_id = COALESCE(i.journal_entry_id, 'JE-' || UPPER(replace(i.id, 'INV-', '')))
                    AND UPPER(a.data->>'type') = 'COST_OF_REVENUE'
              )
            LIMIT 500
        )
        UPDATE docs_inventory_transactions t
        SET updated_at = NOW()
        FROM to_update
        WHERE t.id = to_update.id
        RETURNING t.id;
      `);
      
      const count = c.rows.length;
      totalProcessed += count;
      console.log(`Processed ${count} transactions. Total: ${totalProcessed}`);
      
      if (count === 0) break;
  }

  console.log('Done');
  await client.end();
}
run();
