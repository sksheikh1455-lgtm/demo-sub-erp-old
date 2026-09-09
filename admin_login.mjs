import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: auth } = await supabase.auth.signInWithPassword({
     email: 'raihansheikh145@gmail.com',
     password: '1234'
  });
  
  if (auth && auth.user) {
      console.log("Logged in admin!");
      const { data: users } = await supabase.from('docs_users').select('id, name, username, user_uuid, company_ids');
      const kabir = users.find(u => u.username === 'kabir');
      console.log("Kabir Profile:", kabir);
      if (kabir) {
          const { data: access, error: accErr } = await supabase.from('docs_user_company_access').select('*').eq('user_uuid', kabir.user_uuid);
          console.log("Kabir Access DB:", access, accErr);
      }
  } else {
      console.log("Login failed with 1234");
  }
}
run();
