import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('docs_loans').select('id, updated_at, company_id, loan_number, date, amount, status, name, type, notes, contact_id, start_date, term_months, interest_rate, interest_type, principal_amount, paid_periods, journal_entry_id, amortization_schedule, data');
  console.log("Select Result:", data?.length, error);
}
run();
