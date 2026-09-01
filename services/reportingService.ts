import { supabase } from '../lib/supabase';

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

// Helper to retrieve the active API Base URL
const getApiUrl = (path: string): string => {
  let baseUrl = '';
  try {
    if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) {
      baseUrl = process.env.NEXT_PUBLIC_API_URL;
    }
  } catch (e) {}

  if (!baseUrl) {
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
        // @ts-ignore
        baseUrl = import.meta.env.VITE_API_URL;
      }
    } catch (e) {}
  }

  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
  return `${cleanBase}${path}`;
};

// Helper to interact with the orchestration async backend
async function generateAsyncReport(reportType: string, companyIds: string[] | string | null, params: any): Promise<any> {
    const activeIds = Array.isArray(companyIds) ? companyIds : (companyIds && companyIds !== 'CONSOLIDATED' ? [companyIds] : []);
    const singleId = Array.isArray(companyIds) ? companyIds[0] : (companyIds === 'CONSOLIDATED' ? null : companyIds);

    const runDirectRpcFallback = async () => {
        if (reportType === 'TRIAL_BALANCE') {
            const { data, error } = await supabase.rpc('get_trial_balance', {
                p_company_ids: activeIds,
                p_as_of_date: params.endDate || params.asOfDate || new Date().toISOString()
            });
            if (error) throw error;
            return data;
        } 
        else if (reportType === 'PROFIT_AND_LOSS') {
            const { data, error } = await supabase.rpc('get_profit_and_loss_enterprise', {
                p_company_ids: activeIds,
                p_start_date: params.startDate,
                p_end_date: params.endDate
            });
            if (error) throw error;
            return data;
        }
        else if (reportType === 'BALANCE_SHEET') {
            const { data, error } = await supabase.rpc('get_balance_sheet_structured', {
                p_company_ids: activeIds,
                p_as_of_date: params.asOfDate
            });
            if (error) throw error;
            return data;
        }
        else if (reportType === 'STOCK_VALUATION') {
            const { data, error } = await supabase.rpc('get_stock_valuation', {
                p_company_id: singleId
            });
            if (error) throw error;
            return data;
        }
        throw new Error(`Direct RPC fallback not supported for report type: ${reportType}`);
    };

    const apiUrl = getApiUrl('/api/reports/generate');
    const isVercel = typeof window !== 'undefined' && (
        window.location.hostname.includes('vercel.app') || 
        window.location.hostname.includes('amplifyapp') || 
        window.location.hostname.includes('web.app') || 
        window.location.hostname.includes('firebaseapp')
    );
    const hasAbsoluteApiUrl = apiUrl.startsWith('http');
    const isLocalhost = typeof window !== 'undefined' && (
        window.location.hostname.includes('localhost') || 
        window.location.hostname.includes('127.0.0.1')
    );

    // If on Vercel or we lack an absolute backend URL and are not on localhost, use the direct RPC immediately
    if (isVercel || (!hasAbsoluteApiUrl && !isLocalhost)) {
        console.log('Client-only or Vercel environment detected. Generating report directly via Supabase RPCs...');
        return runDirectRpcFallback();
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const authHeaders: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...authHeaders
            },
            body: JSON.stringify({
                reportType,
                companyIds: activeIds,
                companyId: singleId,
                parameters: { ...params, companyIds: activeIds },
                requestedBy: 'SYSTEM'
            })
        });

        if (!res.ok) {
            throw new Error(`Backend report API returned status: ${res.status}`);
        }

        const responseText = await res.text();
        let payload;
        try {
            payload = JSON.parse(responseText);
        } catch (jsonErr) {
            throw new Error('Backend did not return valid JSON. Likely SPA fallback.');
        }

        const { jobId } = payload;
        if (!jobId) {
            throw new Error('No jobId returned by backend reporting API');
        }
        
        // Poll for completion
        let attempts = 0;
        while (attempts < 30) {
            await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds
            attempts++;
            const jobRes = await fetch(getApiUrl(`/api/reports/job/${jobId}`), {
                headers: authHeaders
            });
            if (!jobRes.ok) throw new Error('Failed to fetch job status');
            const job = await jobRes.json();
            
            if (job.status === 'COMPLETED') {
                return job.result_data;
            } else if (job.status === 'FAILED') {
                throw new Error(job.error_message || 'Job failed');
            }
        }
        throw new Error('Report generation job timed out');
    } catch (err) {
        console.warn('Backend reporting API failed. Falling back to direct Supabase RPC execution:', err);
        return runDirectRpcFallback();
    }
}

export const reportingService = {
  async getTrialBalance(companyIds: string[], startDate: string, endDate: string): Promise<TrialBalanceEntry[]> {
    return generateAsyncReport('TRIAL_BALANCE', companyIds, { startDate, endDate }) as Promise<TrialBalanceEntry[]>;
  },

  async getBalanceSheet(companyIds: string[], asOfDate: string): Promise<BalanceSheetEntry[]> {
    return generateAsyncReport('BALANCE_SHEET', companyIds, { asOfDate }) as Promise<BalanceSheetEntry[]>;
  },

  async getProfitAndLoss(companyIds: string[], startDate: string, endDate: string) {
    return generateAsyncReport('PROFIT_AND_LOSS', companyIds, { startDate, endDate });
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
      p_product_ids: productIds === undefined ? null : productIds,
      p_start_date: startDate || '1970-01-01',
      p_end_date: endDate || '2099-12-31'
    });

    if (error) {
      console.error('Error fetching Inventory Ledger RPC:', error);
      throw error;
    }
    return data || [];
  },

  async getGeneralLedger(companyId: string | null, accountId: string, startDate: string, endDate: string): Promise<GeneralLedgerEntry[]> {
    const { data, error } = await supabase.rpc('get_general_ledger_v2', {
      p_company_id: (companyId === 'CONSOLIDATED' || companyId === undefined) ? null : companyId,
      p_account_id: accountId === undefined ? null : accountId,
      p_start_date: startDate || '1970-01-01',
      p_end_date: endDate || '2099-12-31'
    });

    if (error) {
      console.error('Error fetching General Ledger:', error);
      throw error;
    }
    let mapped = (data || []).map((row: any) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
    })) as GeneralLedgerEntry[];

    const baseIds = new Set();
    mapped.forEach((r: any) => {
        if (r.journal_id && (r.journal_id.startsWith('JE-CPAY-') || r.journal_id.startsWith('JE-VPAY-'))) {
            baseIds.add(r.journal_id.replace('JE-CPAY-', '').replace('JE-VPAY-', ''));
        }
    });
    
    mapped = mapped.filter((r: any) => {
        if (r.journal_id && r.journal_id.startsWith('JE-PAY-')) {
            const baseId = r.journal_id.replace('JE-PAY-', '');
            if (baseIds.has(baseId)) {
                return false; // drop duplicate
            }
        }
        return true;
    });

    return mapped;
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

  async getPartnerSummary(companyIds: string[], contactType: 'CUSTOMER' | 'VENDOR' | 'LOAN_RECEIVABLE' | 'LOAN_PAYABLE', asOfDate: string | null = null): Promise<any[]> {
    if (contactType === 'LOAN_RECEIVABLE' || contactType === 'LOAN_PAYABLE') {
      const isGiven = contactType === 'LOAN_RECEIVABLE';
      const { data: loans, error: loansError } = await supabase
        .from('docs_loans')
        .select('*')
        .eq('status', 'ACTIVE')
        .eq('type', isGiven ? 'GIVEN' : 'RECEIVED')
        .in('company_id', companyIds);

      if (loansError) {
        console.error('Error fetching loan summaries:', loansError);
        throw loansError;
      }

      const contactBalances: Record<string, number> = {};
      (loans || []).forEach((loan: any) => {
        const contactId = loan.contact_id || loan.contactId;
        if (!contactId) return;

        const schedule = loan.amortization_schedule || loan.amortizationSchedule || [];
        const paidPeriods = loan.paid_periods || loan.paidPeriods || [];

        const unpaidPrincipal = schedule
          .filter((e: any) => {
            if (asOfDate) {
              return e.date >= asOfDate || !paidPeriods.includes(e.period);
            }
            return !paidPeriods.includes(e.period);
          })
          .reduce((sum: number, e: any) => sum + (Number(e.principal) || 0), 0);

        contactBalances[contactId] = (contactBalances[contactId] || 0) + unpaidPrincipal;
      });

      return Object.entries(contactBalances).map(([contactId, bal]) => ({
        contact_id: contactId,
        balance: bal
      }));
    }

    const rpcParams: any = {
      p_company_ids: companyIds,
      p_contact_type: contactType
    };
    if (asOfDate) rpcParams.p_as_of_date = asOfDate;

    const { data, error } = await supabase.rpc('get_partner_summary', rpcParams);

    if (error) {
      console.error(`Error fetching ${contactType} summary:`, error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      ...row,
      balance: Number(row.balance) || 0
    }));
  },

  async getPartnerLedger(
    companyIds: string[], 
    partnerIds: string[] | null, 
    startDate: string, 
    endDate: string,
    partnerType?: string
  ): Promise<any[]> {
    const isLoanType = partnerType === 'LOAN_RECEIVABLE' || partnerType === 'LOAN_PAYABLE';
    const rpcParams: any = {
      p_company_ids: companyIds,
      p_start_date: startDate || '1970-01-01',
      p_end_date: endDate || '2099-12-31'
    };
    if (partnerIds) rpcParams.p_partner_ids = partnerIds;
    if (partnerType && !isLoanType) rpcParams.p_partner_type = partnerType;

    const { data, error } = await supabase.rpc('get_general_ledger', rpcParams);

    if (error) {
       console.error('Error fetching Partner Ledger:', error, JSON.stringify(error));
       throw error;
    }
    let mapped = (data || []).map((row: any) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
    }));

    // Deduplicate payment journals: if a JE-PAY- variant and a JE-CPAY-/JE-VPAY- variant exist for the same payment, drop the JE-PAY- one.
    const baseIds = new Set();
    mapped.forEach((r: any) => {
        if (r.journal_id && (r.journal_id.startsWith('JE-CPAY-') || r.journal_id.startsWith('JE-VPAY-'))) {
            baseIds.add(r.journal_id.replace('JE-CPAY-', '').replace('JE-VPAY-', ''));
        }
    });
    
    mapped = mapped.filter((r: any) => {
        if (r.journal_id && r.journal_id.startsWith('JE-PAY-')) {
            const baseId = r.journal_id.replace('JE-PAY-', '');
            if (baseIds.has(baseId)) {
                return false; // drop duplicate
            }
        }
        return true;
    });

    if (partnerType === 'LOAN_RECEIVABLE') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('loan receivable') || 
        String(r.accountName || '').toLowerCase().includes('loan receivable') || 
        String(r.account_id || r.accountId || '').slice(0, 4) === '1006' || 
        String(r.account_name).toLowerCase().includes('loan provided')
      );
    }

    if (partnerType === 'LOAN_PAYABLE') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('loan payable') ||
        String(r.accountName || '').toLowerCase().includes('loan payable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '2101' ||
        String(r.account_name).toLowerCase().includes('loan received')
      );
    }

    if (partnerType === 'CUSTOMER') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('receivable') ||
        String(r.accountName || '').toLowerCase().includes('receivable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '1002' ||
        String(r.account_type || r.accountType || '').toUpperCase() === 'RECEIVABLE'
      );
    }

    if (partnerType === 'VENDOR') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('payable') ||
        String(r.accountName || '').toLowerCase().includes('payable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '2001' ||
        String(r.account_type || r.accountType || '').toUpperCase() === 'PAYABLE'
      );
    }

    return mapped;
  },

  async getDashboardSummary(companyId: string | null, args: { asOfDate?: string, startDate?: string, endDate?: string }): Promise<any> {
    if (args.startDate && args.endDate) {
      const { data, error } = await supabase.rpc('get_dashboard_summary', {
        p_company_id: (companyId === 'CONSOLIDATED' || companyId === undefined) ? null : companyId,
        p_start_date: args.startDate,
        p_end_date: args.endDate
      });
      if (error) {
         console.error('Error fetching Dashboard Summary (Range):', error);
         throw error;
      }
      if (data) {
        for (const key in data) {
           data[key] = Number(data[key]) || 0;
        }
      }
      return data;
    } else {
      const { data, error } = await supabase.rpc('get_dashboard_summary', {
        p_company_id: (companyId === 'CONSOLIDATED' || companyId === undefined) ? null : companyId,
        p_as_of_date: args.asOfDate || new Date().toISOString().split('T')[0]
      });
      if (error) {
         console.error('Error fetching Dashboard Summary (As Of):', error);
         throw error;
      }
      if (data) {
        for (const key in data) {
           data[key] = Number(data[key]) || 0;
        }
      }
      return data;
    }
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
    return Number(data) || 0;
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
    return Number(data) || 0;
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
    if (data) {
      (data as any[]).forEach(row => {
        balances[row.account_id] = Number(row.balance) || 0;
      });
    }
    return balances;
  },

  async getInventoryValuation(companyIds: string[], warehouseId: string = 'all'): Promise<{
    total_items: number;
    total_on_hand: number;
    total_asset_value: number;
    total_retail_value: number;
  }> {
    const { data, error } = await supabase.rpc('get_inventory_valuation', {
      p_company_ids: companyIds,
      p_warehouse_id: warehouseId
    });
    if (error) {
      console.error('Error fetching inventory valuation RPC:', error);
      throw error;
    }
    const row = data && data[0] ? data[0] : { total_items: 0, total_on_hand: 0, total_asset_value: 0, total_retail_value: 0 };
    return {
      total_items: Number(row.total_items) || 0,
      total_on_hand: Number(row.total_on_hand) || 0,
      total_asset_value: Number(row.total_asset_value) || 0,
      total_retail_value: Number(row.total_retail_value) || 0
    };
  }
};
