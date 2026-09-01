import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'post_invoice'
  `);
  
  if (res.rows.length > 0) {
      let funcDef = res.rows[0].pg_get_functiondef;
      
      const insertPoint = `                                SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId');`;
      const toInject = `                                SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId');
                                
                                IF v_wac_cost > 0 THEN
                                    DECLARE
                                        v_item_cogs NUMERIC := ROUND(v_wac_cost * COALESCE((v_item->>'quantity')::numeric, 0), 2);
                                        v_cogs_acc TEXT;
                                        v_inv_asset_acc TEXT;
                                    BEGIN
                                        IF v_item_cogs > 0 THEN
                                            SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code = '500101' AND company_id = v_effective_company_id LIMIT 1;
                                            IF v_cogs_acc IS NULL THEN
                                                SELECT id INTO v_cogs_acc FROM docs_accounts WHERE (type = 'COST_OF_REVENUE' OR type = 'COGS') AND company_id = v_effective_company_id LIMIT 1;
                                            END IF;

                                            SELECT id INTO v_inv_asset_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_effective_company_id LIMIT 1;
                                            IF v_inv_asset_acc IS NULL THEN
                                                SELECT id INTO v_inv_asset_acc FROM docs_accounts WHERE (sub_type = 'inventory' OR type = 'INVENTORY') AND company_id = v_effective_company_id LIMIT 1;
                                            END IF;

                                            IF v_cogs_acc IS NOT NULL AND v_inv_asset_acc IS NOT NULL THEN
                                                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                                                VALUES ('JL-' || v_journal_id || '-cogs-' || v_idx, v_journal_id, v_effective_company_id, v_cogs_acc, v_item_cogs, 0, 'COGS: ' || COALESCE((v_item->>'description'), ''));
                                                
                                                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                                                VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_asset_acc, 0, v_item_cogs, 'Inv Red: ' || COALESCE((v_item->>'description'), ''));
                                            END IF;
                                        END IF;
                                    END;
                                END IF;`;
                                
      if (!funcDef.includes("v_item_cogs NUMERIC")) {
          funcDef = funcDef.replace(insertPoint, toInject);
          await client.query(funcDef);
          console.log("Updated post_invoice function!");
      } else {
          console.log("Looks like it's already updated?");
      }
  }

  await client.end();
}
run();
