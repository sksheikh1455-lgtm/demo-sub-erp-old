import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Searching for ALL PG functions that contain any reference to '.data' or '->' or similar syntax, returning them...");

  const res = await client.query(`
    SELECT proname, oidvectortypes(proargtypes) AS arg_types, prosrc 
    FROM pg_proc 
    WHERE (prosrc ILIKE '%invoice%' OR prosrc ILIKE '%bill%' OR prosrc ILIKE '%credit_note%')
      AND (prosrc ILIKE '%data%' OR prosrc ILIKE '%->%')
  `);

  console.log(`Found ${res.rows.length} matches:`);
  for (const row of res.rows) {
    console.log(`- Function: ${row.proname} | Args: ${row.arg_types}`);
    // If the function contains .data or -> we show lines where it does
    const lines = row.prosrc.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('.data') || line.includes('->') || line.includes('data->') || line.includes('NEW.data') || line.includes('OLD.data') || line.includes('v_invoice.data') || line.includes('v_inv.data') || line.includes('invoice.data')) {
        console.log(`   L${idx + 1}: ${line.trim()}`);
      }
    });
  }

  await client.end();
}
run();
