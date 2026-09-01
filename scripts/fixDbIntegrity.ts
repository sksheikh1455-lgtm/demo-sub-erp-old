import pkg from 'pg';
const { Client } = pkg;
// PostgreSQL connection string
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Start transaction
    await client.query('BEGIN');
    
    // 1. Create a Suspense / Historical Adjustment account if it doesn't exist
    await client.query(`
      INSERT INTO docs_accounts (id, company_id, name, code, type, sub_type, updated_at)
      VALUES (
        'comp-1-999999', 
        'comp-1', 
        'Historical Adjustment (Suspense)', 
        '999999', 
        'EQUITY', 
        'EQUITY',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    
    console.log("Verified Historical Adjustment account.");

    // 2. Identify the broken journals and auto-insert the balancing lines
    const imbalancedQuery = await client.query(`
      SELECT j.id, j.company_id, SUM(jl.debit) as d, SUM(jl.credit) as c 
      FROM docs_journals j
      JOIN docs_journal_lines jl ON jl.journal_id = j.id
      WHERE j.status = 'POSTED'
      GROUP BY j.id, j.company_id
      HAVING SUM(jl.debit) != SUM(jl.credit)
    `);

    const imbalancedJournals = imbalancedQuery.rows;
    console.log(`Found ${imbalancedJournals.length} imbalanced journals.`);

    for (const journal of imbalancedJournals) {
      const diff = Number(journal.c) - Number(journal.d);
      
      if (diff > 0) {
        // Missing Debit
        const newLineId = `jl-${journal.id}-bal-d`;
        await client.query(`
          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, updated_at, created_at)
          VALUES ($1, $2, $3, 'comp-1-999999', $4, 0, 'Auto-correction for missing debits', NOW(), NOW())
        `, [newLineId, journal.id, journal.company_id, diff]);
        console.log(`Fixed journal ${journal.id} with missing debit of ${diff}`);
      } else if (diff < 0) {
        // Missing Credit
        const newLineId = `jl-${journal.id}-bal-c`;
        await client.query(`
          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, updated_at, created_at)
          VALUES ($1, $2, $3, 'comp-1-999999', 0, $4, 'Auto-correction for missing credits', NOW(), NOW())
        `, [newLineId, journal.id, journal.company_id, Math.abs(diff)]);
        console.log(`Fixed journal ${journal.id} with missing credit of ${Math.abs(diff)}`);
      }
    }

    // 3. Create strict constraint trigger for Double-Entry Integrity on lines
    await client.query(`
      CREATE OR REPLACE FUNCTION verify_double_entry_integrity()
      RETURNS TRIGGER AS $$
      DECLARE
          v_journal_id text;
          v_status text;
          d_sum numeric;
          c_sum numeric;
      BEGIN
          -- Get journal_id based on TG_OP
          IF TG_OP = 'DELETE' THEN
              v_journal_id := OLD.journal_id;
          ELSE
              v_journal_id := NEW.journal_id;
          END IF;

          -- Only enforce for POSTED journals
          SELECT status INTO v_status FROM docs_journals WHERE id = v_journal_id;
          
          IF v_status = 'POSTED' THEN
              SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
              INTO d_sum, c_sum
              FROM docs_journal_lines
              WHERE journal_id = v_journal_id;

              IF d_sum != c_sum THEN
                  RAISE EXCEPTION 'Strict Accounting Constraint Violation in Journal %: Total Debits (%) must equal Total Credits (%)', v_journal_id, d_sum, c_sum;
              END IF;
          END IF;

          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    // Drop the trigger if it already exists to avoid duplication
    await client.query(`DROP TRIGGER IF EXISTS trg_strict_double_entry_check ON docs_journal_lines`);

    // Create a deferrable trigger so we can perform multi-row updates in a transaction
    await client.query(`
      CREATE CONSTRAINT TRIGGER trg_strict_double_entry_check
      AFTER INSERT OR UPDATE OR DELETE ON docs_journal_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION verify_double_entry_integrity();
    `);

    // We also need to tighten the existing trg_journal_balance trigger which runs on the journals table
    // by making it deferrable or just keeping it since it catches early POSTED updates.
    
    await client.query('COMMIT');
    console.log("Successfully fixed all imbalances and added strict double-entry integrity constraints.");
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Transaction failed, rolled back:", err);
  } finally {
    await client.end();
  }
}

run();
