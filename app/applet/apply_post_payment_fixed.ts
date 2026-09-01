import { Client } from 'pg';

async function main() {
  const c = new Client(process.env.DATABASE_URL);
  await c.connect();

  console.log('Fetching active post_payment functiondef from PostgreSQL...');
  const res = await c.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'post_payment'");
  if (res.rows.length === 0) {
    console.error('Error: post_payment function not found!');
    process.exit(1);
  }

  let sql = res.rows[0].def;

  // 1. Modify the EXISTS check
  const oldExists = `IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN`;
  const newExists = `IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id AND status = 'POSTED') THEN`;

  if (sql.includes(oldExists)) {
    sql = sql.replace(oldExists, newExists);
    console.log('Modified EXISTS check successfully.');
  } else {
    // Try without spaces/case differences
    const oldExistsAlt = `IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN `;
    if (sql.includes(oldExistsAlt)) {
      sql = sql.replace(oldExistsAlt, newExists + ' ');
      console.log('Modified EXISTS check successfully (alt).');
    } else {
      console.warn('Warning: Could not find exact EXISTS check string to replace!');
    }
  }

  // 2. Modify the first INSERT and ON CONFLICT (DRAFT status)
  const oldInsertDraft = `INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
    VALUES (
      v_journal_id, 
      v_effective_company_id, 
      v_date, 
      CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 
      'DRAFT', 
      v_ref_val, 
      v_ref_val,
      v_prepared_by, 
      v_created_by_id, 
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW(), prepared_by = v_prepared_by, created_by_id = v_created_by_id;`;

  const newInsertDraft = `INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at, data)
    VALUES (
      v_journal_id, 
      v_effective_company_id, 
      v_date, 
      CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 
      'DRAFT', 
      v_ref_val, 
      v_ref_val,
      v_prepared_by, 
      v_created_by_id, 
      NOW(),
      jsonb_build_object('status', 'DRAFT')
    )
    ON CONFLICT (id) DO UPDATE SET 
      status = 'DRAFT', 
      updated_at = NOW(), 
      prepared_by = v_prepared_by, 
      created_by_id = v_created_by_id,
      data = jsonb_set(COALESCE(docs_journals.data, '{}'::jsonb), '{status}', '"DRAFT"');`;

  if (sql.includes(oldInsertDraft)) {
    sql = sql.replace(oldInsertDraft, newInsertDraft);
    console.log('Modified first/DRAFT insert successfully.');
  } else {
    // Let's do a more generic replace if formatting differs slightly
    // We already checked line break format so it should match
    console.warn('Warning: Could not find exact first/DRAFT insert string to replace!');
  }

  // 3. Modify the second INSERT and ON CONFLICT (POSTED status)
  const oldInsertPosted = `INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
    VALUES (
      v_journal_id, 
      v_effective_company_id, 
      v_date, 
      CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 
      'POSTED', 
      v_ref_val, 
      v_ref_val,
      v_prepared_by, 
      v_created_by_id, 
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET 
      updated_at = NOW(), 
      status = 'POSTED', 
      reference_number = v_ref_val, 
      reference = v_ref_val,
      prepared_by = v_prepared_by,
      created_by_id = v_created_by_id;`;

  const newInsertPosted = `INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at, data)
    VALUES (
      v_journal_id, 
      v_effective_company_id, 
      v_date, 
      CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 
      'POSTED', 
      v_ref_val, 
      v_ref_val,
      v_prepared_by, 
      v_created_by_id, 
      NOW(),
      jsonb_build_object('status', 'POSTED')
    )
    ON CONFLICT (id) DO UPDATE SET 
      updated_at = NOW(), 
      status = 'POSTED', 
      reference_number = v_ref_val, 
      reference = v_ref_val,
      prepared_by = v_prepared_by,
      created_by_id = v_created_by_id,
      data = jsonb_set(COALESCE(docs_journals.data, '{}'::jsonb), '{status}', '"POSTED"');`;

  if (sql.includes(oldInsertPosted)) {
    sql = sql.replace(oldInsertPosted, newInsertPosted);
    console.log('Modified second/POSTED insert successfully.');
  } else {
    console.warn('Warning: Could not find exact second/POSTED insert string to replace!');
  }

  console.log('Executing modified SQL defiition in PostgreSQL...');
  try {
    await c.query(sql);
    console.log('Successfully updated post_payment function in PostgreSQL!');
  } catch (err: any) {
    console.error('Error deploying function:', err.message);
  }

  await c.end();
}

main().catch(console.error);
