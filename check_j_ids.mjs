import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('docs_journals').select('*').in('id', ['JE-PAY-245073BC-49A0-4935-A584-730668FA7B5B', 'JE-CPAY-245073BC-49A0-4935-A584-730668FA7B5B']);
  console.log(data);
}
run();
