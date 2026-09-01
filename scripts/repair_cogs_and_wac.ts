import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  console.log('--- STARTING OPTIMIZED COGS AND AVERAGE COST DATABASE PATCH ---');

  // 1. Redeploy capture_cost_at_sale
  console.log('1. Re-deploying capture_cost_at_sale()...');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.capture_cost_at_sale()
     RETURNS trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    DECLARE
        v_company_id TEXT;
    BEGIN
        IF NEW.product_id IS NOT NULL THEN
            -- Safely resolve company_id from invoice if missing in line
            v_company_id := NEW.company_id;
            IF v_company_id IS NULL OR v_company_id = '' THEN
                SELECT company_id INTO v_company_id FROM docs_invoices WHERE id = NEW.invoice_id;
                NEW.company_id := v_company_id;
            END IF;

            -- Only set if it hasn't been explicitly provided
            IF NEW.cost_price_at_sale IS NULL OR NEW.cost_price_at_sale = 0 THEN
                -- Try company warehouse WAC
                SELECT avg_cost INTO NEW.cost_price_at_sale 
                FROM docs_product_costs 
                WHERE product_id = NEW.product_id 
                  AND company_id = v_company_id 
                  AND warehouse_id = 'wh-' || v_company_id
                LIMIT 1;

                -- Fallback to main warehouse WAC
                IF NEW.cost_price_at_sale IS NULL OR NEW.cost_price_at_sale = 0 THEN
                    SELECT avg_cost INTO NEW.cost_price_at_sale 
                    FROM docs_product_costs 
                    WHERE product_id = NEW.product_id 
                      AND company_id = v_company_id 
                      AND warehouse_id = 'main'
                    LIMIT 1;
                END IF;

                -- Fallback to the product's defined cost_price
                IF NEW.cost_price_at_sale IS NULL OR NEW.cost_price_at_sale = 0 THEN
                    SELECT COALESCE(cost_price, last_purchase_price, initial_cost, (data->>'costPrice')::numeric, 0)
                    INTO NEW.cost_price_at_sale
                    FROM docs_products
                    WHERE id = NEW.product_id;
                END IF;
                
                NEW.cost_price_at_sale := COALESCE(NEW.cost_price_at_sale, 0);
            END IF;
        END IF;
        RETURN NEW;
    END;
    $function$;
  `);
  console.log('Successfully updated capture_cost_at_sale().');

  // 2. Redeploy post_inventory_ledger_lines
  console.log('2. Re-deploying post_inventory_ledger_lines()...');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.post_inventory_ledger_lines()
     RETURNS trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    DECLARE
        v_journal_id TEXT;
        v_inv_acc TEXT;
        v_cogs_acc TEXT;
        v_exp_acc TEXT;
        v_valuation NUMERIC;
        v_company_id TEXT;
        v_product_name TEXT;
        v_contact_id TEXT;
    BEGIN
        IF pg_trigger_depth() > 5 THEN RETURN NEW; END IF;

        IF NEW.quantity = 0 THEN RETURN NEW; END IF;

        v_company_id := NEW.company_id;
        v_valuation := ROUND(NEW.quantity * NEW.cost_price, 2);

        IF v_valuation = 0 THEN RETURN NEW; END IF;

        -- Target standard asset inventory account
        SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_company_id LIMIT 1;
        IF v_inv_acc IS NULL THEN SELECT id INTO v_inv_acc FROM docs_accounts WHERE (name ILIKE '%inventory%' OR code ILIKE '1005%') AND company_id = v_company_id LIMIT 1; END IF;
        
        -- Target 500101 and 500100 first for COGS, then 400501, then names resembling COGS
        SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100', '400501') AND company_id = v_company_id LIMIT 1;
        IF v_cogs_acc IS NULL THEN 
            SELECT id INTO v_cogs_acc 
            FROM docs_accounts 
            WHERE (name ILIKE '%cost of goods%' OR name ILIKE '%cogs%' OR code ILIKE '5001%' OR code ILIKE '4005%') 
              AND company_id = v_company_id 
            LIMIT 1; 
        END IF;

        SELECT id INTO v_exp_acc FROM docs_accounts WHERE code = '500501' AND company_id = v_company_id LIMIT 1;
        IF v_exp_acc IS NULL THEN SELECT id INTO v_exp_acc FROM docs_accounts WHERE (name ILIKE '%adjustment%' OR code ILIKE '5005%') AND company_id = v_company_id LIMIT 1; END IF;

        SELECT data->>'name' INTO v_product_name FROM docs_products WHERE id = NEW.product_id;

        IF NEW.reference_type = 'INVOICE' THEN
            v_journal_id := 'JE-' || replace(replace(UPPER(NEW.reference_id), 'INV-', ''), 'INVOICE-', '');
            IF TG_OP = 'INSERT' AND NEW.transaction_type = 'OUT' THEN
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-cogs-' || NEW.id, v_journal_id, v_company_id, v_cogs_acc, v_valuation, 0, 'COGS: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-inv-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, 0, v_valuation, 'Inv Red: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
            END IF;
        ELSIF NEW.reference_type = 'CREDIT_NOTE' THEN
            v_journal_id := 'JE-' || replace(replace(UPPER(NEW.reference_id), 'CN-', ''), 'CREDIT-', '');
            IF TG_OP = 'INSERT' AND NEW.transaction_type = 'IN' THEN
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-inv-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, v_valuation, 0, 'Inv Add: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-cogs-' || NEW.id, v_journal_id, v_company_id, v_cogs_acc, 0, v_valuation, 'COGS Rev: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
            END IF;
        ELSIF NEW.reference_type = 'ADJUSTMENT' THEN
            v_journal_id := 'JE-ADJ-' || replace(UPPER(NEW.reference_id), 'ADJ-', '');
            IF TG_OP = 'INSERT' THEN
                 SELECT data->>'contactId' INTO v_contact_id FROM docs_inventory_adjustments WHERE id = NEW.reference_id;
                 IF NEW.transaction_type = 'IN' THEN
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-I-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, v_valuation, 0, 'Stock Adjustment: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-E-' || NEW.id, v_journal_id, v_company_id, v_exp_acc, 0, v_valuation, 'Inventory Adjustment Expense: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                 ELSE
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-I-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, 0, v_valuation, 'Stock Adjustment: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-E-' || NEW.id, v_journal_id, v_company_id, v_exp_acc, v_valuation, 0, 'Inventory Adjustment Expense: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                 END IF;
            END IF;
        END IF;

        IF v_journal_id IS NULL THEN
            RETURN NEW;
        END IF;

        IF NEW.reference_type IN ('INVOICE', 'BILL', 'CREDIT_NOTE') THEN
            INSERT INTO docs_journals (id, company_id, date, status, updated_at)
            VALUES (v_journal_id, v_company_id, NEW.date, 'DRAFT', NOW())
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO docs_journals (id, company_id, date, status, updated_at)
            VALUES (v_journal_id, v_company_id, NEW.date, 'POSTED', NOW())
            ON CONFLICT (id) DO NOTHING;
        END IF;

        RETURN NEW;
    END;
    $function$;
  `);
  console.log('Successfully updated post_inventory_ledger_lines().');

  // 3. Re-calculate WAC for active products only (products that have transaction logs)
  console.log('3. Re-calculating WAC for actively-traded products only...');
  const activeProdsRes = await c.query(`
    SELECT DISTINCT product_id, company_id 
    FROM docs_inventory_transactions 
    WHERE product_id IS NOT NULL AND company_id IS NOT NULL
  `);
  console.log(`Found ${activeProdsRes.rows.length} product-company settings with transaction history.`);

  for (const row of activeProdsRes.rows) {
    await c.query(`SELECT rebuild_wac_for_product($1, $2)`, [row.company_id, row.product_id]);
  }
  console.log('Active product WAC recalculation completed.');

  // 4. Load average-costs maps
  console.log('4. Building cost maps...');
  const prodCostsRes = await c.query(`SELECT company_id, product_id, warehouse_id, avg_cost FROM docs_product_costs`);
  const costsMap: Record<string, number> = {};
  prodCostsRes.rows.forEach(r => {
    costsMap[`${r.company_id}:${r.product_id}:${r.warehouse_id}`] = Number(r.avg_cost || 0);
  });

  const productsCostRes = await c.query(`SELECT id, company_id, cost_price, (data->>'costPrice')::numeric as fallback FROM docs_products`);
  const fallbackMap: Record<string, number> = {};
  productsCostRes.rows.forEach(r => {
    fallbackMap[`${r.company_id}:${r.id}`] = Number(r.cost_price || r.fallback || 0);
  });

  // Load companies & standard/system accounts
  const accountsRes = await c.query(`SELECT id, code, company_id, name FROM docs_accounts`);
  const accountsMap: Record<string, { cogs: string; inv: string }> = {};
  
  const companiesRes = await c.query(`SELECT DISTINCT company_id FROM docs_accounts`);
  for (const comp of companiesRes.rows) {
     const cid = comp.company_id;
     // Resolve COGS
     let cogs = accountsRes.rows.find(a => a.company_id === cid && ['500101', '500100', '400501'].includes(a.code))?.id;
     if (!cogs) cogs = accountsRes.rows.find(a => a.company_id === cid && (a.name.toLowerCase().includes('cost of goods') || a.name.toLowerCase() === 'cogs'))?.id;
     
     // Resolve Inventory
     let inv = accountsRes.rows.find(a => a.company_id === cid && ['100501', '100500'].includes(a.code))?.id;
     if (!inv) inv = accountsRes.rows.find(a => a.company_id === cid && a.name.toLowerCase().includes('inventory'))?.id;

     accountsMap[cid] = {
        cogs: cogs || '',
        inv: inv || ''
     };
  }

  // RECONCILE INVOICE LINES
  console.log('--- RECONCILING INVOICES ---');
  const invoicesRes = await c.query(`
     SELECT i.id, i.company_id, i.date, i.status, i.invoice_number 
     FROM docs_invoices i
     WHERE i.status IN ('POSTED', 'PAID', 'PARTIAL')
  `);
  console.log(`Found ${invoicesRes.rows.length} posted invoices.`);

  for (const inv of invoicesRes.rows) {
     const invLinesRes = await c.query(`
        SELECT l.id, l.product_id, l.quantity, l.cost_price_at_sale, p.name as product_name
        FROM docs_invoice_lines l
        LEFT JOIN docs_products p ON l.product_id = p.id
        WHERE l.invoice_id = $1 AND l.type = 'PRODUCT'
     `, [inv.id]);

     const journalId = 'JE-' + inv.id.toUpperCase().replace('INV-', '').replace('INVOICE-', '');

     for (const line of invLinesRes.rows) {
        if (!line.product_id) continue;

        // Determine WAC cost
        const lookupKeyWh = `${inv.company_id}:${line.product_id}:wh-${inv.company_id}`;
        const lookupKeyMain = `${inv.company_id}:${line.product_id}:main`;
        const companyFallbackKey = `${inv.company_id}:${line.product_id}`;

        let targetCost = costsMap[lookupKeyWh] || costsMap[lookupKeyMain] || fallbackMap[companyFallbackKey] || 0;
        
        // Update cost_price_at_sale on docs_invoice_lines
        await c.query(`
           UPDATE docs_invoice_lines 
           SET cost_price_at_sale = $1, company_id = $2
           WHERE id = $3
        `, [targetCost, inv.company_id, line.id]);

        // Update target cost in docs_inventory_transactions
        const movementId = 'mov-inv-' + inv.id + '-' + line.id;
        await c.query(`
           UPDATE docs_inventory_transactions
           SET cost_price = $1, company_id = $2
           WHERE id = $3
        `, [targetCost, inv.company_id, movementId]);

        // Delete old JLs
        await c.query(`
           DELETE FROM docs_journal_lines 
           WHERE id IN ($1, $2)
        `, [`JL-${journalId}-cogs-${movementId}`, `JL-${journalId}-inv-${movementId}`]);

        // Insert fresh corrected ones using the standard resolved accounts
        const valuation = Math.round(Number(line.quantity || 0) * targetCost * 100) / 100;
        if (valuation > 0) {
           const cogsAccId = accountsMap[inv.company_id]?.cogs;
           const invAccId = accountsMap[inv.company_id]?.inv;

           if (cogsAccId && invAccId) {
              await c.query(`
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ($1, $2, $3, $4, $5, 0, $6)
                 ON CONFLICT (id) DO NOTHING
              `, [`JL-${journalId}-cogs-${movementId}`, journalId, inv.company_id, cogsAccId, valuation, `COGS: ${line.product_name || 'Product'}`]);

              await c.query(`
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ($1, $2, $3, $4, 0, $5, $6)
                 ON CONFLICT (id) DO NOTHING
              `, [`JL-${journalId}-inv-${movementId}`, journalId, inv.company_id, invAccId, valuation, `Inv Red: ${line.product_name || 'Product'}`]);
           } else {
              console.warn(`Could not resolve accounts for company ${inv.company_id} to create journal entries.`);
           }
        }
     }
  }

  // RECONCILE CREDIT NOTE LINES
  console.log('--- RECONCILING CREDIT NOTES ---');
  const creditNotesRes = await c.query(`
     SELECT cn.id, cn.company_id, cn.date, cn.status, cn.credit_note_number 
     FROM docs_credit_notes cn
     WHERE cn.status IN ('POSTED', 'PAID', 'PARTIAL')
  `);
  console.log(`Found ${creditNotesRes.rows.length} posted credit notes.`);

  for (const cn of creditNotesRes.rows) {
     const cnLinesRes = await c.query(`
        SELECT l.id, l.product_id, l.quantity, p.name as product_name
        FROM docs_credit_note_lines l
        LEFT JOIN docs_products p ON l.product_id = p.id
        WHERE l.credit_note_id = $1 AND l.type = 'PRODUCT'
     `, [cn.id]);

     const journalId = 'JE-' + cn.id.toUpperCase().replace('CN-', '').replace('CREDIT-', '');

     for (const line of cnLinesRes.rows) {
        if (!line.product_id) continue;

        const lookupKeyWh = `${cn.company_id}:${line.product_id}:wh-${cn.company_id}`;
        const lookupKeyMain = `${cn.company_id}:${line.product_id}:main`;
        const companyFallbackKey = `${cn.company_id}:${line.product_id}`;

        let targetCost = costsMap[lookupKeyWh] || costsMap[lookupKeyMain] || fallbackMap[companyFallbackKey] || 0;

        // Update target cost in docs_inventory_transactions
        const movementId = 'mov-cn-' + cn.id + '-' + line.id;
        await c.query(`
           UPDATE docs_inventory_transactions
           SET cost_price = $1, company_id = $2
           WHERE id = $3
        `, [targetCost, cn.company_id, movementId]);

        // Delete old JLs
        await c.query(`
           DELETE FROM docs_journal_lines 
           WHERE id IN ($1, $2)
        `, [`JL-${journalId}-inv-${movementId}`, `JL-${journalId}-cogs-${movementId}`]);

        // Insert fresh corrected ones
        const valuation = Math.round(Number(line.quantity || 0) * targetCost * 100) / 100;
        if (valuation > 0) {
           const cogsAccId = accountsMap[cn.company_id]?.cogs;
           const invAccId = accountsMap[cn.company_id]?.inv;

           if (cogsAccId && invAccId) {
              await c.query(`
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ($1, $2, $3, $4, $5, 0, $6)
                 ON CONFLICT (id) DO NOTHING
              `, [`JL-${journalId}-inv-${movementId}`, journalId, cn.company_id, invAccId, valuation, `Inv Add: ${line.product_name || 'Product'}`]);

              await c.query(`
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ($1, $2, $3, $4, 0, $5, $6)
                 ON CONFLICT (id) DO NOTHING
              `, [`JL-${journalId}-cogs-${movementId}`, journalId, cn.company_id, cogsAccId, valuation, `COGS Rev: ${line.product_name || 'Product'}`]);
           }
        }
     }
  }

  await c.end();
  console.log('--- COGS RECONCILIATION AND HISTORICAL PATCH SUCCEEDED ---');
}

run().catch(console.error);
