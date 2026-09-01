import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

const AccountType = {
  ASSET: 'ASSET', 
  LIABILITY: 'LIABILITY', 
  EQUITY: 'EQUITY', 
  REVENUE: 'REVENUE', 
  COST_OF_REVENUE: 'COST_OF_REVENUE',
  EXPENSE: 'EXPENSE',
  OTHER_REVENUE: 'OTHER_REVENUE',
  OTHER_EXPENSE: 'OTHER_EXPENSE'
};
const AccountSubType = {
  BANK: 'BANK', CASH: 'CASH', ACCOUNTS_RECEIVABLE: 'ACCOUNTS_RECEIVABLE', INVENTORY: 'INVENTORY',
  OTHER_CURRENT_ASSET: 'OTHER_CURRENT_ASSET', FIXED_ASSET: 'FIXED_ASSET', ACCOUNTS_PAYABLE: 'ACCOUNTS_PAYABLE',
  CREDIT_CARD: 'CREDIT_CARD', OTHER_CURRENT_LIABILITY: 'OTHER_CURRENT_LIABILITY', LONG_TERM_LIABILITY: 'LONG_TERM_LIABILITY',
  EQUITY: 'EQUITY', RETAINED_EARNINGS: 'RETAINED_EARNINGS', REVENUE: 'REVENUE', OTHER_REVENUE: 'OTHER_REVENUE',
  COGS: 'COGS', EXPENSE: 'EXPENSE', OTHER_EXPENSE: 'OTHER_EXPENSE'
};

const INITIAL_ACCOUNTS = [
  { id: '100100', code: '100100', name: 'Cash', type: AccountType.ASSET, subType: AccountSubType.CASH, isSystem: true },
  { id: '100101', code: '100101', name: 'Petty Cash', type: AccountType.ASSET, subType: AccountSubType.CASH, isSystem: true },
  { id: '100102', code: '100102', name: 'Main Bank Account', type: AccountType.ASSET, subType: AccountSubType.BANK, isSystem: true },
  { id: '100201', code: '100201', name: 'Accounts Receivable', type: AccountType.ASSET, subType: AccountSubType.ACCOUNTS_RECEIVABLE, isSystem: true },
  { id: '100300', code: '100300', name: 'Advance to Suppliers', type: AccountType.ASSET, subType: AccountSubType.OTHER_CURRENT_ASSET, isSystem: true },
  { id: '100400', code: '100400', name: 'Prepaid Expenses', type: AccountType.ASSET, subType: AccountSubType.OTHER_CURRENT_ASSET, isSystem: true },
  { id: '100501', code: '100501', name: 'Inventory Asset', type: AccountType.ASSET, subType: AccountSubType.INVENTORY, isSystem: true },
  { id: '100502', code: '100502', name: 'Finished Goods', type: AccountType.ASSET, subType: AccountSubType.INVENTORY, isSystem: true },
  
  { id: '200101', code: '200101', name: 'Accounts Payable', type: AccountType.LIABILITY, subType: AccountSubType.ACCOUNTS_PAYABLE, isSystem: true },
  { id: '200201', code: '200201', name: 'Credit Card', type: AccountType.LIABILITY, subType: AccountSubType.CREDIT_CARD, isSystem: true },
  { id: '200300', code: '200300', name: 'Advance from Customers', type: AccountType.LIABILITY, subType: AccountSubType.OTHER_CURRENT_LIABILITY, isSystem: true },
  { id: '200400', code: '200400', name: 'VAT/Tax Payable', type: AccountType.LIABILITY, subType: AccountSubType.OTHER_CURRENT_LIABILITY, isSystem: true },
  { id: '200500', code: '200500', name: 'Accrued Expenses', type: AccountType.LIABILITY, subType: AccountSubType.OTHER_CURRENT_LIABILITY, isSystem: true },
  
  { id: '300100', code: '300100', name: 'Owner\'s Equity', type: AccountType.EQUITY, subType: AccountSubType.EQUITY, isSystem: true },
  { id: '300200', code: '300200', name: 'Retained Earnings', type: AccountType.EQUITY, subType: AccountSubType.RETAINED_EARNINGS, isSystem: true },
  
  { id: '400100', code: '400100', name: 'Sales Revenue', type: AccountType.REVENUE, subType: AccountSubType.REVENUE, isSystem: true },
  { id: '400200', code: '400200', name: 'Service Revenue', type: AccountType.REVENUE, subType: AccountSubType.REVENUE, isSystem: true },
  { id: '400300', code: '400300', name: 'Discount Given', type: AccountType.REVENUE, subType: AccountSubType.REVENUE, isSystem: true },
  { id: '400400', code: '400400', name: 'Other Income', type: AccountType.REVENUE, subType: AccountSubType.OTHER_REVENUE, isSystem: true },
  
  { id: '500101', code: '500101', name: 'Cost of Goods Sold', type: AccountType.COST_OF_REVENUE, subType: AccountSubType.COGS, isSystem: true },
  { id: '600100', code: '600100', name: 'Rent Expense', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600200', code: '600200', name: 'Utility Expense', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600300', code: '600300', name: 'Salary Expense', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600400', code: '600400', name: 'Office Supplies', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600500', code: '600500', name: 'Bank Charges', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600600', code: '600600', name: 'Travel Expense', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600700', code: '600700', name: 'Meals and Entertainment', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600800', code: '600800', name: 'Marketing & Advertising', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '600900', code: '600900', name: 'Repairs & Maintenance', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true },
  { id: '601000', code: '601000', name: 'Inventory Shrinkage', type: AccountType.EXPENSE, subType: AccountSubType.EXPENSE, isSystem: true }
];

async function seed() {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        const { rows: companies } = await client.query('SELECT id FROM docs_companies');
        for (const company of companies) {
            const cid = company.id;
            for (const a of INITIAL_ACCOUNTS) {
                const acc = { ...a, id: `${cid}-${a.code}`, companyId: cid };
                await client.query(
                    `INSERT INTO docs_accounts (id, data, company_id, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;`,
                    [acc.id, JSON.stringify(acc), cid]
                );
            }
        }
        console.log('Seeded accounts for all companies successfully!');
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
seed();
