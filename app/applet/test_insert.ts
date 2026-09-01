import { supabase } from './lib/supabase';
(async () => {
   const res = await supabase.from('docs_loans').insert([{ id: 'test-loan-id', company_id: 'test-cid', loan_number: 'L-123', amount: 1000 }]);
   console.log('insert result error:', res.error);
})();
