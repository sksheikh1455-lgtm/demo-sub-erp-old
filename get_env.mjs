import fs from 'fs';
import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('.env'));
console.log(env.SUPABASE_SERVICE_ROLE_KEY ? "Found service key" : "No service key");
