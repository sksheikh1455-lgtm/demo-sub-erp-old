import { supabase } from './lib/supabase';

(async () => {
   const res = await supabase.from('docs_loans').select('id').limit(1);
   console.log('Select docs_loans:', res.error ? res.error.message : 'Table exists');
   
   const res2 = await supabase.from('docs_products').select('id').limit(1);
   console.log('Select docs_products:', res2.error ? res2.error.message : 'Table exists');
})();
