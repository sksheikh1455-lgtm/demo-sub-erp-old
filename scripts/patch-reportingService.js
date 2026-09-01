import fs from 'fs';

let code = fs.readFileSync('services/reportingService.ts', 'utf8');

const newCode = `import { supabase } from '../lib/supabase';

export interface TrialBalanceEntry {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  branch_id?: string;
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
}

export interface BalanceSheetEntry {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  branch_id?: string;
  balance: number;
}

export interface StockValuationEntry {
  company_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  unit_cost: number;
  on_hand_qty: number;
  total_value: number;
}

export interface GeneralLedgerEntry {
  date: string;
  reference: string;
  description: string;
  company_name: string;
  partner_name: string;
  prepared_by: string;
  debit: number;
  credit: number;
  running_balance: number;
  is_opening: boolean;
}

// Helper to interact with the orchestration async backend
async function generateAsyncReport(reportType: string, companyId: string | null, params: any): Promise<any> {
    const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reportType,
            companyId: companyId === 'CONSOLIDATED' ? null : companyId,
            parameters: params,
            requestedBy: 'SYSTEM'
        })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate report');
    }
    const { jobId } = await res.json();
    
    // Poll for completion
    while (true) {
        await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds
        const jobRes = await fetch(\`/api/reports/job/\${jobId}\`);
        if (!jobRes.ok) throw new Error('Failed to fetch job status');
        const job = await jobRes.json();
        
        if (job.status === 'COMPLETED') {
            return job.result_data;
        } else if (job.status === 'FAILED') {
            throw new Error(job.error_message || 'Job failed');
        }
    }
}

export const reportingService = {
  async getTrialBalance(companyId: string | null, startDate: string, endDate: string): Promise<TrialBalanceEntry[]> {
    return generateAsyncReport('TRIAL_BALANCE', companyId, { startDate, endDate }) as Promise<TrialBalanceEntry[]>;
  },

  async getBalanceSheet(companyId: string | null, asOfDate: string): Promise<BalanceSheetEntry[]> {
    return generateAsyncReport('BALANCE_SHEET', companyId, { asOfDate }) as Promise<BalanceSheetEntry[]>;
  },

  async getProfitAndLoss(companyId: string | null, startDate: string, endDate: string) {
    return generateAsyncReport('PROFIT_AND_LOSS', companyId, { startDate, endDate });
  },

  async getStockValuation(companyId: string | null): Promise<StockValuationEntry[]> {
    return generateAsyncReport('STOCK_VALUATION', companyId, {});
  },

  async getInventoryLedger(
    companyIds: string[],
    productIds: string[] | null = null,
    startDate: string | null = null,
    endDate: string | null = null
  ): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_inventory_ledger', {
      p_company_ids: companyIds,
      p_product_ids: productIds,
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) {
      console.error('Error fetching Inventory Ledger:', error);
      throw error;
    }
    return data;
  },

  async getGeneralLedger(companyId: string | null, accountId: string, startDate: string, endDate: string): Promise<GeneralLedgerEntry[]> {
    const { data, error } = await supabase.rpc('get_general_ledger_v2', {
      p_company_id: companyId === 'CONSOLIDATED' ? null : companyId,
      p_account_id: accountId,
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) {
      console.error('Error fetching General Ledger:', error);
      throw error;
    }
    return data as GeneralLedgerEntry[];
  },

  async getGeneralLedgerByCode(companyIds: string[], accountCode: string, startDate: string, endDate: string): Promise<GeneralLedgerEntry[]> {
    const { data: accounts, error: accError } = await supabase
      .from('docs_accounts')
      .select('id, company_id')
      .eq('code', accountCode)
      .in('company_id', companyIds);
    
    if (accError || !accounts || accounts.length === 0) {
      return [];
    }

    const allResults = await Promise.all(accounts.map(acc => 
      this.getGeneralLedger(acc.company_id, acc.id, startDate, endDate)
    ));

    const flattened = allResults.flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    return flattened.map(tx => {
      runningBalance += (tx.debit - tx.credit);
      return { ...tx, running_balance: runningBalance };
    });
  },

  async getPartnerSummary(companyIds: string[], contactType: 'CUSTOMER' | 'VENDOR', asOfDate: string | null = null): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_partner_summary', {
      p_company_ids: companyIds,
      p_contact_type: contactType,
      p_as_of_date: asOfDate
    });

    if (error) {
      console.error(\`Error fetching \${contactType} summary:\`, error);
      throw error;
    }
    return data;
  },

  async getPartnerLedger(
    companyIds: string[], 
    partnerIds: string[] | null, 
    startDate: string, 
    endDate: string
  ): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_general_ledger', {
      p_company_ids: companyIds,
      p_account_ids: null, 
      p_partner_ids: partnerIds,
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) {
       console.error('Error fetching Partner Ledger:', error);
       throw error;
    }
    return data;
  },

  async getDashboardSummary(companyId: string | null, asOfDate: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_dashboard_summary', {
      p_company_id: companyId === 'CONSOLIDATED' ? null : companyId,
      p_as_of_date: asOfDate
    });

    if (error) {
       console.error('Error fetching Dashboard Summary:', error);
       throw error;
    }
    return data;
  },

  async getAccountBalance(companyIds: string[] | null, accountId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_account_balance', {
      p_company_ids: companyIds,
      p_account_id: accountId
    });

    if (error) {
      console.error('Error fetching account balance:', error);
      return 0;
    }
    return data || 0;
  },

  async getPartnerBalance(companyIds: string[] | null, contactId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_partner_balance', {
      p_company_ids: companyIds,
      p_contact_id: contactId
    });

    if (error) {
      console.error('Error fetching partner balance:', error);
      return 0;
    }
    return data || 0;
  },

  async getAllAccountBalances(companyIds: string[] | null, asOfDate: string): Promise<Record<string, number>> {
    const { data, error } = await supabase.rpc('get_all_account_balances', {
      p_company_ids: companyIds,
      p_as_of_date: asOfDate
    });

    if (error) {
      console.error('Error fetching all account balances:', error);
      return {};
    }

    const balances: Record<string, number> = {};
    (data as any[]).forEach(row => {
      balances[row.account_id] = row.balance;
    });
    return balances;
  }
};
`;

fs.writeFileSync('services/reportingService.ts', newCode);
