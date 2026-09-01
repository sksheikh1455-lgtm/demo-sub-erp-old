
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

async function check() {
    if (!supabaseKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY not found in env');
        // fallback to anon key if possible, but RPCs might need more
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const rpcs = [
        { name: 'get_dashboard_summary', args: { p_company_id: null, p_as_of_date: new Date().toISOString().split('T')[0] } },
        { name: 'get_general_ledger_v2', args: { p_company_id: null, p_account_id: 'any', p_start_date: '2000-01-01', p_end_date: '2025-01-01' } },
        { name: 'get_account_balance', args: { p_company_ids: null, p_account_id: 'any' } },
        { name: 'get_partner_balance', args: { p_company_ids: null, p_contact_id: 'any' } }
    ];
    
    for (const rpcObj of rpcs) {
        const { error } = await supabase.rpc(rpcObj.name, rpcObj.args);
        if (error && error.message.includes('does not exist')) {
            console.log(`❌ RPC ${rpcObj.name} DOES NOT exist`);
        } else if (error) {
            console.log(`✅ RPC ${rpcObj.name} exists (returned execution error: ${error.message})`);
        } else {
            console.log(`✅ RPC ${rpcObj.name} exists and works!`);
        }
    }
}
check();
