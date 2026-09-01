import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabaseAdmin.from('docs_loans').select('*');
  console.log("Loans in docs_loans:", data?.length, error?.message);
  if (data?.length) {
    console.log("First docs_loans:", data[0]);
  }
}
run();
