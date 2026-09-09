import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: userEmail } = await supabase.rpc('get_user_email', { p_username: 'kabir' });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
     email: userEmail,
     password: '123400' 
  });
  if (authError) {
     console.log("Could not login as kabir:", authError.message);
     return;
  }
  
  const user_uuid = auth.user.id;
  
  const { data: profile } = await supabase.from('docs_users').select('company_ids, role_id').eq('user_uuid', user_uuid).single();
  console.log("Profile:", profile);
  
  const accessPayload = (profile.company_ids || []).map(cid => ({
     user_uuid: user_uuid,
     company_id: cid,
     role_id: profile.role_id || 'role-accountant'
  }));
  
  const { error: delErr } = await supabase.from('docs_user_company_access').delete().eq('user_uuid', user_uuid);
  console.log("Delete error:", delErr?.message);
  
  const { error: upErr } = await supabase.from('docs_user_company_access').upsert(accessPayload);
  console.log("Upsert error:", upErr?.message);
}
run();
