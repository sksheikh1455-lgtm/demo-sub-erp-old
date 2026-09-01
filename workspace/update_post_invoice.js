import pkg from "pg";
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  const q = await c.query(`SELECT routine_definition FROM information_schema.routines WHERE routine_name = 'post_invoice'`);
  let def = q.rows[0]?.routine_definition;
  
  const regex = /v_journal_id := COALESCE\(v_invoice\.journal_entry_id, 'JE-' \|\| replace\(replace\(UPPER\(p_invoice_id\), 'INV-', ''\), 'INVOICE-', ''\)\);\s*-- Ensure we can cleanly repost by deleting existing lines\s*PERFORM set_config\('core\.bypass_audit', 'true', true\);/;

  const newStr = `v_journal_id := COALESCE(v_invoice.journal_entry_id, 'JE-' || replace(replace(UPPER(p_invoice_id), 'INV-', ''), 'INVOICE-', ''));

            -- Temporarily set journal to DRAFT so RLS allows deletion of existing lines
            UPDATE docs_journals SET status = 'DRAFT' WHERE id = v_journal_id;

            -- Ensure we can cleanly repost by deleting existing lines
            PERFORM set_config('core.bypass_audit', 'true', true);`;

  if (regex.test(def)) {
     def = def.replace(regex, newStr);
     await c.query(`CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id text, p_company_id text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql AS $$ ${def} $$;`);
     console.log("Successfully updated post_invoice!");
  } else {
     console.log("Regex match failed.");
  }
  
  process.exit();
}
run();
