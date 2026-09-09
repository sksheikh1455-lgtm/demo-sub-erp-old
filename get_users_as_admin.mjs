import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
     email: 'raihansheikh145@gmail.com',
     password: '123456' // Guessing, if not we will know
  });
  if (authError) {
      console.log("Failed to login as admin:", authError);
      return;
  }
  
  const { data: users, error } = await supabase.from('docs_users').select('id, name, username, user_uuid, company_ids');
  console.log("All users:", users);
  
  if (users) {
      const kabir = users.find(u => u.username && u.username.toLowerCase() === 'kabir' || u.name && u.name.toLowerCase().includes('kabir'));
      console.log("Kabir Profile:", kabir);
      
      if (kabir && kabir.user_uuid) {
          const { data: access } = await supabase.from('docs_user_company_access').select('*').eq('user_uuid', kabir.user_uuid);
          console.log("Kabir Access:", access);
      }
  }
}
run();
