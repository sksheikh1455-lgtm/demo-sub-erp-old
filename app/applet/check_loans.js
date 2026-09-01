const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('docs_loans').select('*').then(res => {
  console.log('Loans count:', res.data?.length, res.error);
}).catch(err => console.error(err));
