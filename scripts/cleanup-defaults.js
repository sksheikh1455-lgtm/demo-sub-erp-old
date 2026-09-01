
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  console.log('Cleaning up default accounts...');
  
  const codesToRemove = ['1011', '2100', '2101', '2200', '100201', '100502', '100601', '2101', '400100', '400201', '400301', '500000', '500100', '500200', '500300', '500101', '500501', '500201', '300000'];
  
  // We want to remove these if they belong to the old hardcoded companies comp-1 to comp-7
  const oldCompanyIds = ['comp-1', 'comp-2', 'comp-3', 'comp-4', 'comp-5', 'comp-6', 'comp-7'];
  
  const { data: accounts, error } = await supabase
    .from('docs_accounts')
    .select('id, company_id')
    .in('company_id', oldCompanyIds);

  if (error) {
    console.error('Error fetching accounts:', error);
    return;
  }

  if (!accounts || accounts.length === 0) {
    console.log('No accounts from old companies found.');
  } else {
    console.log(`Found ${accounts.length} accounts to remove.`);
    const { error: deleteError } = await supabase
      .from('docs_accounts')
      .delete()
      .in('id', accounts.map(a => a.id));
      
    if (deleteError) {
      console.error('Error deleting accounts:', deleteError);
    } else {
      console.log('Accounts deleted successfully.');
    }
  }

  // Also remove old companies
  const { error: compDeleteError } = await supabase
    .from('docs_companies')
    .delete()
    .in('id', oldCompanyIds);

  if (compDeleteError) {
    console.error('Error deleting companies:', compDeleteError);
  } else {
    console.log('Old companies deleted successfully.');
  }
  
  console.log('Cleanup complete.');
}

cleanup();
