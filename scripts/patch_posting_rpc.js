import fs from 'fs';

async function run() {
  console.log("Normalizing and patching scripts/posting_rpcs.sql...");
  
  let content = fs.readFileSync('scripts/posting_rpcs.sql', 'utf8');
  content = content.replace(/\r\n/g, '\n');
  
  // Patch 1: Safe fallback if data column is NULL
  const target1 = `    -- 1. Get Credit Note
    SELECT * INTO v_cn FROM docs_credit_notes WHERE id = p_cn_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit Note not found: %', p_cn_id; END IF;
    v_journal_id := COALESCE(v_cn.data->>'journalEntryId', 'JE-' || replace(UPPER(v_cn.id), 'CN-', ''));`;
    
  const replacement1 = `    -- 1. Get Credit Note
    SELECT * INTO v_cn FROM docs_credit_notes WHERE id = p_cn_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit Note not found: %', p_cn_id; END IF;

    -- Safe fallback if data column is NULL
    IF v_cn.data IS NULL OR jsonb_typeof(v_cn.data) = 'null' THEN
        v_cn.data := jsonb_build_object(
            'id', v_cn.id,
            'number', COALESCE(v_cn.credit_note_number, v_cn.cn_number, 'CN-' || v_cn.id),
            'customerId', v_cn.customer_id,
            'date', v_cn.date,
            'total', COALESCE(v_cn.total, 0),
            'subtotal', COALESCE(v_cn.subtotal, v_cn.total, 0),
            'taxTotal', COALESCE(v_cn.tax_total, 0),
            'status', COALESCE(v_cn.status, 'DRAFT'),
            'items', '[]'::jsonb
        );
    END IF;

    v_journal_id := COALESCE(v_cn.data->>'journalEntryId', 'JE-' || replace(UPPER(v_cn.id), 'CN-', ''));`;

  if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    console.log("Successfully applied Patch 1!");
  } else {
    // Check if Patch 1 was already applied
    if (content.includes("Safe fallback if data column is NULL")) {
       console.log("Patch 1 was already applied.");
    } else {
       console.error("CRITICAL error: Target 1 not found!");
       process.exit(1);
    }
  }
  
  // Patch 2: Fallback for empty/zero items array
  const target2 = `    -- Balancing
    v_total_debit := ROUND(v_total_debit, 2);
    v_total_credit := ROUND(v_total_credit, 2);`;
    
  const replacement2 = `    -- If no items / lines were processed or debit is still 0 while credit is > 0,
    -- create a default Sales Return line matching v_cn.subtotal (or total - tax)
    IF v_total_credit > 0 AND v_total_debit = 0 THEN
        DECLARE
            v_net_return NUMERIC;
            v_tax_return NUMERIC;
        BEGIN
            v_tax_return := ROUND(COALESCE((v_cn.data->>'taxTotal')::numeric, v_cn.tax_total, 0), 2);
            v_net_return := ROUND(v_total_credit - v_tax_return, 2);
            
            -- Debit Revenue
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
            VALUES ('JL-' || v_journal_id || '-rev-fallback', v_journal_id, v_effective_company_id, v_rev_acc, v_net_return, 0, 'Srv Return (Fallback): ' || COALESCE(v_cn.data->>'number', v_cn.credit_note_number));
            v_total_debit := v_total_debit + v_net_return;
            
            -- Debit Tax if any
            IF v_tax_return > 0 THEN
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-fallback', v_journal_id, v_effective_company_id, v_tax_acc, v_tax_return, 0, 'Tax Reverse (Fallback): ' || COALESCE(v_cn.data->>'number', v_cn.credit_note_number));
                v_total_debit := v_total_debit + v_tax_return;
            END IF;
        END;
    END IF;

    -- Balancing
    v_total_debit := ROUND(v_total_debit, 2);
    v_total_credit := ROUND(v_total_credit, 2);`;

  if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    console.log("Successfully applied Patch 2!");
  } else {
    if (content.includes("Srv Return (Fallback)")) {
       console.log("Patch 2 was already applied.");
    } else {
       console.error("CRITICAL error: Target 2 not found!");
       process.exit(1);
    }
  }
  
  // Patch 3: Use COALESCE(data, '{}'::jsonb) for update to protect against NULL updates
  const target3 = `    -- Update flat columns for sync correctly
    UPDATE docs_credit_notes 
    SET status = 'POSTED', 
        data = jsonb_set(
            jsonb_set(data, '{status}', '"POSTED"'),
            '{journalEntryId}', to_jsonb(v_journal_id)
        ), 
        updated_at = NOW() 
    WHERE id = p_cn_id;`;
   
  const replacement3 = `    -- Update flat columns for sync correctly
    UPDATE docs_credit_notes 
    SET status = 'POSTED', 
        data = jsonb_set(
            jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'),
            '{journalEntryId}', to_jsonb(v_journal_id)
        ), 
        updated_at = NOW() 
    WHERE id = p_cn_id;`;

  if (content.includes(target3)) {
    content = content.replace(target3, replacement3);
    console.log("Successfully applied Patch 3!");
  } else {
    if (content.includes("COALESCE(data, '{}'::jsonb)")) {
       console.log("Patch 3 was already applied.");
    } else {
       console.error("CRITICAL error: Target 3 not found!");
       process.exit(1);
    }
  }
  
  fs.writeFileSync('scripts/posting_rpcs.sql', content, 'utf8');
  console.log("All patches successfully processed and saved!");
}

run().catch(console.error);
