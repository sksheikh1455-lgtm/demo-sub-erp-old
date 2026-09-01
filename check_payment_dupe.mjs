import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  console.log("Checking payments...");
  const { data: payments } = await supabase.from('docs_payments').select('id, reference, status, author_id, created_at').eq('reference', 'PAY-SUL-001175');
  console.log("Payments:", payments);

  console.log("\nChecking journals...");
  const { data: journals } = await supabase.from('docs_journals').select('id, reference, status, author_id, created_at').eq('reference', 'PAY-SUL-001175');
  console.log("Journals:", journals);
  
  if (journals && journals.length > 0) {
      for (const j of journals) {
          const { data: lines } = await supabase.from('docs_journal_lines').select('id, account_id, contact_id, debit, credit').eq('journal_id', j.id);
          console.log(`Lines for journal ${j.id}:`, lines);
      }
  }
}
check();
