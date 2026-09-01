import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = process.env.DATABASE_URL;

const files = [
  'scripts/phase3_rpc.sql',
  'scripts/phase4_core_schema.sql',
  'scripts/phase4_immutability.sql',
  'scripts/phase4_inventory_hardening.sql',
  'scripts/phase4_reversals.sql',
  'scripts/phase4_saas_hardening.sql',
  'scripts/advanced_erp_upgrade.sql',
  'scripts/advanced_rpcs.sql',
  'scripts/advanced_rpcs_2.sql'
];

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.log('Skipping', f);
      continue;
    }
    console.log('Running', f);
    let sql = fs.readFileSync(f, 'utf8');
    
    // Patch immutability
    if (f === 'scripts/phase4_immutability.sql') {
       sql = sql.replace(/'POSTED', 'VOID', 'PAID', 'PARTIAL_REFUNDED', 'FULL_REFUNDED'/g, "'POSTED', 'VOID', 'PAID', 'PARTIAL', 'PARTIAL_REFUNDED', 'FULL_REFUNDED'");
       sql = sql.replace(/'VOID', 'PAID', 'PARTIAL_REFUNDED', 'FULL_REFUNDED'/g, "'VOID', 'PAID', 'PARTIAL', 'PARTIAL_REFUNDED', 'FULL_REFUNDED'");
       sql = sql.replace(/OLD\.status = 'PAID'/g, "OLD.status IN ('PAID', 'PARTIAL')");
    }

    try {
      await c.query(sql);
      console.log('Success', f);
    } catch (e) {
      console.error('Error in', f, e.message);
    }
  }

  await c.end();
}
run();
