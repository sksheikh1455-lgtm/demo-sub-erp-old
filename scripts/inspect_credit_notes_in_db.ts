import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('Appliying RLS Policies for docs_credit_note_lines...');
    await client.query(`
      ALTER TABLE IF EXISTS docs_credit_note_lines ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "all_credit_note_lines" ON docs_credit_note_lines;
      CREATE POLICY "all_credit_note_lines" ON docs_credit_note_lines FOR ALL USING (true) WITH CHECK (true);
      
      DROP POLICY IF EXISTS "Company Isolation" ON docs_credit_note_lines;
      CREATE POLICY "Company Isolation" ON docs_credit_note_lines FOR ALL TO authenticated USING (check_company_access(company_id)) WITH CHECK (check_company_access(company_id));
    `);
    console.log('RLS Policies applied successfully!');

    const { rows: creditNotes } = await client.query('SELECT id, credit_note_number, cn_number, status, total, data FROM docs_credit_notes ORDER BY updated_at DESC LIMIT 5;');
    console.log('--- docs_credit_notes rows ---');
    for (const cn of creditNotes) {
      console.log(`CN ID: ${cn.id} | number: ${cn.credit_note_number || cn.cn_number} | status: ${cn.status} | total: ${cn.total}`);
      console.log('Data column:', JSON.stringify(cn.data, null, 2));
      const { rows: lines } = await client.query('SELECT * FROM docs_credit_note_lines WHERE credit_note_id = $1;', [cn.id]);
      console.log(`Relational Lines count: ${lines.length}`);
      for (const l of lines) {
         console.log(`  Line: ${l.id} | Product: ${l.product_id} | Qty: ${l.quantity} | Total: ${l.total}`);
      }
    }

    const { rows: tableInfo } = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname IN ('docs_credit_notes', 'docs_credit_note_lines');
    `);
    console.log('--- Table Security Info ---');
    for (const t of tableInfo) {
      console.log(`Table: ${t.relname} | RLS Enabled: ${t.relrowsecurity}`);
    }

    const { rows: columns } = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'docs_credit_note_lines';
    `);
    console.log('--- docs_credit_note_lines Columns ---');
    for (const col of columns) {
      console.log(`Column: ${col.column_name} | Type: ${col.data_type}`);
    }

    const { rows: missingPoliciesTables } = await client.query(`
      SELECT c.relname as table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relrowsecurity = true 
        AND n.nspname = 'public'
        AND c.relname NOT IN (SELECT DISTINCT tablename FROM pg_policies);
    `);
    console.log('--- Tables with RLS enabled but NO policies ---');
    for (const t of missingPoliciesTables) {
      console.log(`Table: ${t.table_name}`);
    }

    const { rows: policies } = await client.query(`
      SELECT tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename IN ('docs_credit_notes', 'docs_credit_note_lines');
    `);
    console.log('--- Table Policies ---');
    for (const p of policies) {
      console.log(`Table: ${p.tablename} | Policy: ${p.policyname} | Cmd: ${p.cmd} | Qual: ${p.qual}`);
    }

    const { rows: movements } = await client.query("SELECT * FROM docs_inventory_transactions WHERE reference_type = 'CREDIT_NOTE' ORDER BY updated_at DESC LIMIT 10;");
    console.log('--- Credit Note Inventory Transactions ---');
    for (const m of movements) {
      console.log(`ID: ${m.id} | Product: ${m.product_id} | Type: ${m.transaction_type} | Qty: ${m.quantity} | Ref: ${m.reference_id} | Cost: ${m.cost_price}`);
    }

    const { rows: products } = await client.query("SELECT id, name, quantity_on_hand, cost_price, data->>'quantityOnHand' as json_qty FROM docs_products WHERE id = '969f1279-e11f-488e-b806-4b364a780f7f';");
    console.log('--- Product Stock ---');
    for (const p of products) {
      console.log(`Product: ${p.id} | Name: ${p.name} | qty_on_hand: ${p.quantity_on_hand} | cost_price: ${p.cost_price} | json_qty: ${p.json_qty}`);
    }

    if (creditNotes.length > 0) {
      const draftCN = creditNotes.find(cn => cn.status === 'DRAFT');
      if (draftCN) {
        console.log(`Testing manual post_credit_note for draft CN: ${draftCN.id}...`);
        try {
          const res = await client.query('SELECT public.post_credit_note($1) as res;', [draftCN.id]);
          console.log('Post result:', JSON.stringify(res.rows[0].res, null, 2));
        } catch (postErr) {
          console.error('Post failed with error:', postErr);
        }
      } else {
        console.log('No DRAFT credit notes found to test.');
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
