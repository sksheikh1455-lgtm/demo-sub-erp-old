import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const sql = `
CREATE OR REPLACE FUNCTION public.generate_document_numbers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      v_field TEXT;
      v_seq TEXT;
      v_cid TEXT;
      v_num TEXT;
      v_status TEXT;
      v_current_doc_num TEXT;
      v_journal_id_cpay TEXT;
      v_journal_id_vpay TEXT;
    BEGIN
      v_cid := (to_jsonb(NEW) ->> 'company_id');
      v_status := (to_jsonb(NEW) ->> 'status');

      IF TG_TABLE_NAME = 'docs_invoices' THEN v_seq := 'INVOICE'; v_current_doc_num := NEW.invoice_number;
      ELSIF TG_TABLE_NAME = 'docs_bills' THEN v_seq := 'BILL'; v_current_doc_num := NEW.bill_number;
      ELSIF TG_TABLE_NAME = 'docs_payments' THEN v_seq := 'PAYMENT'; v_current_doc_num := NEW.payment_number;
      ELSIF TG_TABLE_NAME = 'docs_journals' THEN
         v_current_doc_num := NEW.reference_number;
         IF NEW.journal_type IN ('JOURNAL', 'EXPENSE') THEN
            IF NEW.journal_type = 'EXPENSE' THEN
               v_seq := 'EXPENSE';
            ELSE
               v_seq := 'JOURNAL';
            END IF;
         END IF;
      ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN v_seq := 'CREDIT_NOTE'; v_current_doc_num := NEW.credit_note_number;
      ELSIF TG_TABLE_NAME = 'docs_loans' THEN v_seq := 'LOAN'; v_current_doc_num := NEW.loan_number;
      ELSIF TG_TABLE_NAME = 'docs_products' THEN v_seq := 'PRODUCT'; v_current_doc_num := NEW.sku;
      ELSIF TG_TABLE_NAME = 'docs_contacts' THEN v_seq := 'CONTACT'; v_current_doc_num := NEW.external_id;
      END IF;

      IF v_seq IS NOT NULL AND (v_status IS NULL OR v_status IN ('POSTED', 'PAID', 'PARTIAL', 'ACTIVE', 'OPEN')) AND 
         (v_current_doc_num IS NULL OR v_current_doc_num = '' OR v_current_doc_num LIKE 'DRAFT%') THEN
        IF v_cid IS NOT NULL THEN
           v_num := get_next_company_doc_number(v_cid, v_seq);
           
           IF TG_TABLE_NAME = 'docs_invoices' THEN 
              NEW.invoice_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
              UPDATE docs_journals SET reference_number = v_num, reference = v_num, description = 'Invoice ' || v_num WHERE id = COALESCE(NEW.journal_entry_id, 'JE-' || UPPER(NEW.id));
           ELSIF TG_TABLE_NAME = 'docs_bills' THEN 
              NEW.bill_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
              UPDATE docs_journals SET reference_number = v_num, reference = v_num, description = 'AP: ' || v_num WHERE id = COALESCE(NEW.journal_entry_id, 'JE-' || UPPER(NEW.id));
           ELSIF TG_TABLE_NAME = 'docs_payments' THEN 
              NEW.payment_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
              
              v_journal_id_cpay := 'JE-CPAY-' || replace(replace(UPPER(NEW.id), 'PAY-', ''), 'PAY-', '');
              v_journal_id_vpay := 'JE-VPAY-' || replace(replace(UPPER(NEW.id), 'PAY-', ''), 'PAY-', '');
              
              UPDATE docs_journals 
              SET reference_number = v_num, 
                  reference = v_num, 
                  journal_number = v_num,
                  data = jsonb_set(jsonb_set(COALESCE(data, '{}'::jsonb), '{reference}', to_jsonb(v_num)), '{reference_number}', to_jsonb(v_num))
              WHERE id IN (v_journal_id_cpay, v_journal_id_vpay);
              
              UPDATE docs_journal_lines 
              SET description = REPLACE(description, NEW.id, v_num) 
              WHERE journal_id IN (v_journal_id_cpay, v_journal_id_vpay);
              
           ELSIF TG_TABLE_NAME = 'docs_journals' THEN 
              NEW.reference_number := v_num;
              IF NEW.data IS NOT NULL THEN 
                 NEW.data := jsonb_set(jsonb_set(NEW.data, '{reference}', to_jsonb(v_num)), '{reference_number}', to_jsonb(v_num));
              END IF;
           ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN 
              NEW.credit_note_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
              UPDATE docs_journals SET reference_number = v_num, reference = v_num WHERE id = COALESCE(NEW.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(NEW.id), 'CN-', ''), 'CN-', ''));
           ELSIF TG_TABLE_NAME = 'docs_loans' THEN 
              NEW.loan_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_products' THEN 
              NEW.sku := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{sku}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_contacts' THEN 
              NEW.external_id := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{externalId}', to_jsonb(v_num)); END IF;
           END IF;
        END IF;
      END IF;

      -- Ensure not-null constraints for draft documents (if sequence was not generated)
      IF TG_TABLE_NAME = 'docs_invoices' THEN
          IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
              NEW.invoice_number := 'DRAFT-' || NEW.id;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(NEW.invoice_number)); END IF;
          END IF;
      ELSIF TG_TABLE_NAME = 'docs_bills' THEN
          IF NEW.bill_number IS NULL OR NEW.bill_number = '' THEN
              NEW.bill_number := 'DRAFT-' || NEW.id;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(NEW.bill_number)); END IF;
          END IF;
      END IF;

      IF TG_TABLE_NAME = 'docs_journals' THEN
         IF NEW.journal_number IS NULL OR NEW.journal_number = '' OR (NEW.journal_number LIKE 'DRAFT%' AND NEW.status != 'DRAFT') THEN
            NEW.journal_number := COALESCE(NEW.reference_number, NEW.id, 'JE-TMP');
            IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{journal_number}', to_jsonb(NEW.journal_number)); END IF;
         END IF;
         IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
            NEW.reference_number := NEW.journal_number;
            IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{reference_number}', to_jsonb(NEW.reference_number)); END IF;
         END IF;
         IF NEW.journal_date IS NULL THEN
            NEW.journal_date := COALESCE(NEW.date, CURRENT_DATE);
         END IF;
      END IF;

      RETURN NEW;
    END;
$function$;
  `;
  await client.query(sql);
  console.log('Trigger function updated successfully.');
  await client.end();
}
run();
