const pg = require('pg');
const crypto = require('crypto');

async function run() {
  const c = new pg.Client(process.env.SUPABASE_DB_URL);
  await c.connect();
  
  try {
    const companyId = 'comp-1';
    const amount = 1800000;
    const profitAdjAccId = '3815ad7a-6b4d-4e88-91a1-393103dbf58b';
    const cogsAccId = 'comp-1-500101';
    
    const journalId = crypto.randomUUID();
    const dateStr = new Date().toISOString().split('T')[0];
    const journalData = JSON.stringify({
      id: journalId, companyId, date: dateStr, journalNumber: 'J-ADJ-002', journalType: 'MANUAL',
      reference: 'Reclass Profit Adj to COGS', description: 'Reclassifying 1.8m profit adjustment to COGS per user request',
      status: 'POSTED',
      lines: [
        { accountId: cogsAccId, debit: amount, credit: 0, description: 'Reclass to COGS' },
        { accountId: profitAdjAccId, debit: 0, credit: amount, description: 'Zero out previous adjustment' }
      ]
    });
    
    await c.query('INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference, description, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
      journalId, companyId, dateStr, 'MANUAL', 'POSTED', 'Reclass Profit Adj to COGS', 'Reclassifying 1.8m profit adjustment to COGS per user request', journalData
    ]);
    
    const line1Id = crypto.randomUUID();
    await c.query('INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      line1Id, journalId, companyId, cogsAccId, amount, 0, 'Reclass to COGS'
    ]);
    
    const line2Id = crypto.randomUUID();
    await c.query('INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      line2Id, journalId, companyId, profitAdjAccId, 0, amount, 'Zero out previous adjustment'
    ]);
    
    console.log('Successfully reclassified adjustment to COGS.');
    
  } catch(e) {
    console.error('Error:', e);
  } finally {
    await c.end();
  }
}
run();
