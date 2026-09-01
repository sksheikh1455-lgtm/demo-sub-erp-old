import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    console.log('Reading post_invoice_def.txt...');
    let text = fs.readFileSync('post_invoice_def.txt', 'utf8');

    // 1. Add v_last_rev_id declaration
    const declareTarget = '            v_line_cogs NUMERIC := 0;\n        BEGIN';
    const declareReplacement = '            v_line_cogs NUMERIC := 0;\n            v_last_rev_id TEXT;\n        BEGIN';
    
    if (!text.includes(declareTarget)) {
      throw new Error('Could not find declare target in function definition');
    }
    text = text.replace(declareTarget, declareReplacement);
    console.log('Add variable declaration: SUCCESS');

    // 2. Replace the unbalanced auto-adjust block
    const adjustTarget = `            IF v_total_debit != v_total_credit THEN
                -- RETAIL MANUAL DISCOUNT AUTO-ADJUST
                IF EXISTS(SELECT 1 FROM docs_journal_lines WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-rev-' || v_idx) THEN
                    UPDATE docs_journal_lines 
                    SET credit = ROUND(credit + (v_total_debit - v_total_credit), 2)
                    WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-rev-' || v_idx;
                    v_total_credit := v_total_debit;
                ELSE
                    RAISE EXCEPTION 'Invoice Failed: Unbalanced Invoice (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
                END IF;
            END IF;`;

    const adjustReplacement = `            IF v_total_debit != v_total_credit THEN
                -- RETAIL MANUAL DISCOUNT AUTO-ADJUST
                SELECT id INTO v_last_rev_id 
                FROM docs_journal_lines 
                WHERE journal_id = v_journal_id AND account_id = v_rev_acc 
                ORDER BY id DESC 
                LIMIT 1;

                IF v_last_rev_id IS NOT NULL THEN
                    UPDATE docs_journal_lines 
                    SET credit = ROUND(credit + (v_total_debit - v_total_credit), 2)
                    WHERE id = v_last_rev_id;
                    v_total_credit := v_total_debit;
                ELSE
                    RAISE EXCEPTION 'Invoice Failed: Unbalanced Invoice (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
                END IF;
            END IF;`;

    if (!text.includes(adjustTarget)) {
      throw new Error('Could not find the unbalanced adjust block in function definition');
    }
    text = text.replace(adjustTarget, adjustReplacement);
    console.log('Update unbalanced adjust block: SUCCESS');

    // 3. Apply the updated function definition to the database
    console.log('Applying updated post_invoice function to the database...');
    await c.query(text);
    console.log('SUCCESS: post_invoice function updated in database!');

  } catch (err: any) {
    console.error('ERROR:', err.message);
  } finally {
    await c.end();
  }
}
run();
