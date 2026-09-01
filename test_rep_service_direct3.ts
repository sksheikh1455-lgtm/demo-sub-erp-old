import dotenv from 'dotenv';
import fs from 'fs';
const env = dotenv.parse(fs.readFileSync('.env'));
process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

import { reportingService } from './services/reportingService';

async function run() {
   try {
       const res = await reportingService.getPartnerLedger(
          ['comp-1'],
          ['3d106296-a1a3-4f56-8ec8-66089bb9d2b7'],
          '2026-06-01',
          '2026-08-31',
          'CUSTOMER'
       );
       const relevant = res.filter(r => (r.reference && r.reference.includes('1175')) || (r.description && r.description.includes('1175')) || (r.journal_id && r.journal_id.includes('1175')) || (r.journal_id && r.journal_id.includes('245073BC')));
       console.log("Filtered result:", relevant.map(r => ({id: r.journal_id, prep: r.responsible_name})));
   } catch(e) {
       console.error(e);
   }
}
run();
