import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_general_ledger', {
     p_company_ids: ['comp-1'],
     p_start_date: '2026-06-01',
     p_end_date: '2026-08-31',
     p_partner_ids: ['3d106296-a1a3-4f56-8ec8-66089bb9d2b7'],
     p_partner_type: 'CUSTOMER'
  });
  
  if (error) { console.error(error); return; }
  
  let mapped = (data || []).map((row) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
  }));

  const baseIds = new Set();
  mapped.forEach((r) => {
      if (r.journal_id && (r.journal_id.startsWith('JE-CPAY-') || r.journal_id.startsWith('JE-VPAY-'))) {
          baseIds.add(r.journal_id.replace('JE-CPAY-', '').replace('JE-VPAY-', ''));
      }
  });
  
  const mappedFiltered = mapped.filter((r) => {
      if (r.journal_id && r.journal_id.startsWith('JE-PAY-')) {
          const baseId = r.journal_id.replace('JE-PAY-', '');
          if (baseIds.has(baseId)) {
              return false; // drop duplicate
          }
      }
      return true;
  });

  const entryFiltered = mappedFiltered.filter(r => (r.reference && r.reference.includes('1175')) || (r.description && r.description.includes('1175')) || (r.journal_id && r.journal_id.includes('1175')) || (r.journal_id && r.journal_id.includes('245073BC')));
  
  console.log("Filtered matched entries:", entryFiltered);
}
run();
