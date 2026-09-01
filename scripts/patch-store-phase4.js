import fs from 'fs';

let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

// 1. Add reverseJournalEntry action
const reversalAction = `
  const reverseJournalEntry = useCallback(async (id: string) => {
    try {
      const { supabase } = await import('../lib/supabase');
      const { data, error } = await supabase.rpc('reverse_journal_entry', {
        p_journal_id: id,
        p_user_id: currentUser?.id
      });
      if (error) throw error;
      
      // Refresh local state
      await fetchInitialData(currentUser?.id || '');
      return data;
    } catch (err: any) {
      console.error('reverseJournalEntry failed:', err);
      throw err;
    }
  }, [currentUser, fetchInitialData]);
`;

// Insert it before deleteJournalEntry
code = code.replace('const deleteJournalEntry = useCallback((id: string) => {', reversalAction + '\n  const deleteJournalEntry = useCallback((id: string) => {');

// 2. Harden deleteJournalEntry to prevent deleting POSTED entries
code = code.replace(
  'const entry = allEntries.find(e => e.id === id);',
  `const entry = allEntries.find(e => e.id === id) || paginatedEntries.find(e => e.id === id);
    if (entry?.status === 'POSTED') {
      throw new Error('Immutable Accounting Breach: Cannot delete a POSTED entry. Use Reverse instead.');
    }`
);

// 3. Fiscal Period Actions
const fiscalActions = `
  const closeFiscalPeriod = useCallback(async (periodId: string) => {
    const { supabase } = await import('../lib/supabase');
    const { error } = await supabase.from('docs_fiscal_periods')
      .update({ is_closed: true, closed_at: new Date().toISOString(), closed_by: currentUser?.id })
      .eq('id', periodId);
    if (error) throw error;
  }, [currentUser]);
`;
code = code.replace('const login = useCallback(', fiscalActions + '\n  const login = useCallback(');

// 4. Export the new actions
// We need to find the exports at the end
code = code.replace('payInvoice, resetInvoiceToDraft, resetJournalEntryToDraft, deleteJournalEntry,', 'payInvoice, resetInvoiceToDraft, reverseJournalEntry, resetJournalEntryToDraft, deleteJournalEntry,');
code = code.replace('clearPayment, switchCompany,', 'clearPayment, switchCompany, closeFiscalPeriod,');

fs.writeFileSync('store/useAccountingStore.ts', code);
