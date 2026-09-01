const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
(async () => {
   const res = await supabase.from('docs_loans').select('id').limit(1);
   console.log('Select result:', res.error ? res.error.message : 'Table exists');
})();
