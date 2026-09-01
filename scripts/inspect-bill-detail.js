import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectBillAndJournal() {
  const billId = '3a12eda7-0d09-4569-bd0b-ad59a9b3333d';
  const { data: bill } = await supabase.from('docs_bills').select('*').eq('id', billId).single();
  const { data: journal } = await supabase.from('docs_journals').select('*').eq('reference_number', bill?.bill_number);
  const { data: lines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', journal?.[0]?.id);
  
  console.log('--- BILL DETAIL ---', JSON.stringify(bill, null, 2));
  console.log('--- JOURNAL ---', JSON.stringify(journal, null, 2));
  console.log('--- JOURNAL LINES ---', JSON.stringify(lines, null, 2));
}

inspectBillAndJournal();
