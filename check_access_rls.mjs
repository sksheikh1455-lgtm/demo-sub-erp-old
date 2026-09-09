import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const fakeUuid = crypto.randomUUID();
  const { error } = await supabase.from('docs_user_company_access').insert({
      user_uuid: fakeUuid,
      company_id: 'comp-1',
      role_id: 'role-accountant'
  });
  console.log("Anon insert error:", error?.message || "SUCCESS");
}
run();
