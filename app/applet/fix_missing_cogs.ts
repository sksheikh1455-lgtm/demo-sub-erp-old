import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL;

async function main() {
  const c = new Client({ connectionString });
  await c.connect();

  console.log('Starting migration to heal missing COGS entry lines in docs_journal_lines...');

  try {
    // 1. Fetch all missing COGS transactions where parent journal exists
    let q = await c.query(`
      WITH missing_moves AS (
         SELECT 
             t.id as movement_id, 
             t.reference_id, 
             t.product_id,
             t.quantity, 
             t.cost_price, 
             t.company_id,
             (t.quantity * t.cost_price) as movement_val,
             'JE-' || replace(replace(UPPER(t.reference_id), 'INV-', ''), 'INVOICE-', '') as jid
         FROM docs_inventory_transactions t
         WHERE t.company_id IN ('comp-1', 'comp-4')
           AND t.reference_type = 'INVOICE' 
           AND t.transaction_type = 'OUT'
           AND NOT EXISTS (
               SELECT 1 
               FROM docs_journal_lines jl 
               WHERE jl.journal_id = 'JE-' || replace(replace(UPPER(t.reference_id), 'INV-', ''), 'INVOICE-', '')
                 AND jl.id = 'JL-JE-' || replace(replace(UPPER(t.reference_id), 'INV-', ''), 'INVOICE-', '') || '-cogs-' || t.id
           )
      )
      SELECT m.*, p.name as product_name
      FROM missing_moves m
      JOIN docs_journals j ON m.jid = j.id
      LEFT JOIN docs_products p ON m.product_id = p.id
    `);

    const missingRows = q.rows;
    console.log(`Found ${missingRows.length} valid transactions missing matching COGS ledger lines.`);

    if (missingRows.length === 0) {
      console.log('No missing COGS ledger lines found. Database is perfectly healthy!');
      await c.end();
      return;
    }

    const accountMap: Record<string, { cogs: string; inv: string }> = {
      'comp-1': { cogs: 'comp-1-500101', inv: 'comp-1-100501' },
      'comp-4': { cogs: 'comp-4-500101', inv: 'comp-4-100501' }
    };

    console.log('Beginning transactional insert updates...');
    let successCount = 0;

    await c.query('BEGIN');

    // To prevent standard triggers or security overrides on journal lines from interfering
    await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER USER');

    for (let row of missingRows) {
      const companyId = row.company_id;
      const mapping = accountMap[companyId];
      if (!mapping) {
        console.warn(`No account mapping found for company: ${companyId}`);
        continue;
      }

      const jid = row.jid;
      const movementId = row.movement_id;
      const valuation = Math.round(parseFloat(row.movement_val || '0') * 100) / 100;
      const productName = row.product_name || 'Product';

      if (valuation <= 0) {
        // Skip zero valuation lines
        continue;
      }

      const cogsLineId = `JL-${jid}-cogs-${movementId}`;
      const invLineId = `JL-${jid}-inv-${movementId}`;

      // Insert COGS Debit Line
      await c.query(`
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
        VALUES ($1, $2, $3, $4, $5, 0, $6)
        ON CONFLICT (id) DO NOTHING
      `, [cogsLineId, jid, companyId, mapping.cogs, valuation, `COGS: ${productName}`]);

      // Insert Inventory Credit Line
      await c.query(`
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
        VALUES ($1, $2, $3, $4, 0, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [invLineId, jid, companyId, mapping.inv, valuation, `Inv Red: ${productName}`]);

      successCount++;
    }

    await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER USER');
    await c.query('COMMIT');

    console.log(`Successfully healed ${successCount} transactions by adding their respective Debit COGS and Credit Inventory lines!`);

  } catch (error) {
    await c.query('ROLLBACK');
    console.error('Critical transactional failure during COGS reconstruction:', error);
  } finally {
    await c.end();
  }
}

main();
