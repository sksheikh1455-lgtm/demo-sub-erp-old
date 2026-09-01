const pg = require('pg');
const crypto = require('crypto');

async function run() {
  const c = new pg.Client(process.env.SUPABASE_DB_URL);
  await c.connect();

  const companyId = 'comp-1';
  const adjustmentAmount = 1800000;

  const accId = crypto.randomUUID();
  const accCode = '699999';
  const accountData = { id: accId, code: accCode, name: 'Profit Adjustment', type: 'EXPENSE', companyId };
  
  await c.query('INSERT INTO docs_accounts (id, company_id, name, code, type, data) VALUES ($1, $2, $3, $4, $5, $6)', [accId, companyId, 'Profit Adjustment', accCode, 'EXPENSE', accountData]);
  
  const equityAccId = 'comp-1-300100';
  const journalId = crypto.randomUUID();
  const dateStr = new Date().toISOString().split('T')[0];
  
  const journalData = {
    id: journalId, companyId, date: dateStr, journalNumber: 'J-ADJ-001', journalType: 'MANUAL', reference: 'Adjusting Profit', description: 'Manual adjustment to reduce profit by 1,800,000.', status: 'POSTED',
    lines: [
      { accountId: accId, debit: adjustmentAmount, credit: 0, description: 'Reduce Profit' },
      { accountId: equityAccId, debit: 0, credit: adjustmentAmount, description: 'Offset to Equity' }
    ]
  };

  await c.query('INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference, description, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
    journalId, companyId, dateStr, 'MANUAL', 'POSTED', 'Adjusting Profit', 'Manual adjustment to reduce profit by 1,800,000.', journalData
  ]);

  const line1Id = crypto.randomUUID();
  const line1Data = { ...journalData.lines[0], id: line1Id };
  await c.query('INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [line1Id, journalId, companyId, accId, adjustmentAmount, 0, 'Reduce Profit', line1Data]);

  const line2Id = crypto.randomUUID();
  const line2Data = { ...journalData.lines[1], id: line2Id };
  await c.query('INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [line2Id, journalId, companyId, equityAccId, 0, adjustmentAmount, 'Offset to Equity', line2Data]);

  console.log('Successfully adjusted profit.');
  await c.end();
}
run().catch(console.error);
