import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY); // Note: Anon key might not be able to bypass RLS for users. Let's see.

async function run() {
  console.log("Fetching companies...");
  const { data: companies } = await supabase.from('docs_companies').select('id, name');
  console.log("Companies:", companies);
  
  if (!companies) {
      console.log("No companies found.");
      return;
  }
  
  const subornoElectric = companies.find(c => c.name.toLowerCase().includes('electric'));
  const subornoNew = companies.find(c => c.name.toLowerCase().includes('new'));
  
  console.log("Suborno Electric ID:", subornoElectric?.id);
  console.log("Suborno New ID:", subornoNew?.id);
  
  const targetIds = [subornoElectric?.id, subornoNew?.id].filter(Boolean);
  console.log("Target IDs:", targetIds);

  const { data: users, error: uErr } = await supabase.from('docs_users').select('id, name, email, company_ids').eq('email', 'kabir@gmail.com');
  console.log("Users:", users, uErr);
  
  if (users && users.length > 0) {
      const user = users[0];
      console.log(`Found user ${user.name} (${user.email}). Current company_ids:`, user.company_ids);
      
      const { data: updated, error: updateErr } = await supabase.from('docs_users')
        .update({ company_ids: targetIds })
        .eq('id', user.id)
        .select();
        
      if (updateErr) {
          console.error("Failed to update user via API (RLS might block this without service key):", updateErr);
      } else {
          console.log("Successfully updated user via API:", updated);
      }
  } else {
      console.log("User kabir@gmail.com not found via API. Might be restricted by RLS or email is different.");
      
      // Let's try searching by name just in case
      const { data: usersByName } = await supabase.from('docs_users').select('id, name, email, company_ids').ilike('name', '%kabir%');
      console.log("Users by name 'kabir':", usersByName);
  }
}
run();
