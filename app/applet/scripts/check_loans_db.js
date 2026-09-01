const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
(async () => {
   const res = await supabase.from('docs_loans').select('*');
   console.log('Loans inside DB:', res.data?.length, res.error);
})();
