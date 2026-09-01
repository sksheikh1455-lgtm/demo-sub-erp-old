import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_general_ledger', {
     p_company_ids: ['comp-1'],
     p_start_date: '1970-01-01',
     p_end_date: '2099-12-31'
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

  const entryRaju = mapped.filter(r => (r.reference && r.reference.includes('1175')) || (r.description && r.description.includes('1175')));
  const entryFiltered = mappedFiltered.filter(r => (r.reference && r.reference.includes('1175')) || (r.description && r.description.includes('1175')));
  
  console.log("Original matched entries length:", entryRaju.length);
  console.log("Original matched entries:", entryRaju.map(e => ({
     id: e.journal_id,
     ref: e.reference,
     desc: e.description,
     prep: e.responsible_name
  })));
  console.log("Filtered matched entries length:", entryFiltered.length);
}
run();
