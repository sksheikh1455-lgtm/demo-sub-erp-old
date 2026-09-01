import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
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
    BEGIN
      v_cid := (to_jsonb(NEW) ->> 'company_id');
      v_status := (to_jsonb(NEW) ->> 'status');

      IF TG_TABLE_NAME = 'docs_invoices' THEN v_seq := 'INVOICE'; v_current_doc_num := NEW.invoice_number;
      ELSIF TG_TABLE_NAME = 'docs_bills' THEN v_seq := 'BILL'; v_current_doc_num := NEW.bill_number;
      ELSIF TG_TABLE_NAME = 'docs_payments' THEN v_seq := 'PAYMENT'; v_current_doc_num := NEW.payment_number;
      ELSIF TG_TABLE_NAME = 'docs_journals' THEN v_seq := 'JOURNAL'; v_current_doc_num := NEW.reference_number;
      ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN v_seq := 'CREDIT_NOTE'; v_current_doc_num := NEW.credit_note_number;
      ELSIF TG_TABLE_NAME = 'docs_loans' THEN v_seq := 'LOAN'; v_current_doc_num := NEW.loan_number;
      ELSIF TG_TABLE_NAME = 'docs_products' THEN v_seq := 'PRODUCT'; v_current_doc_num := NEW.sku;
      ELSIF TG_TABLE_NAME = 'docs_contacts' THEN v_seq := 'CONTACT'; v_current_doc_num := NEW.external_id;
      END IF;

      IF (v_status IS NULL OR v_status IN ('POSTED', 'PAID', 'PARTIAL', 'ACTIVE', 'OPEN')) AND 
         (v_current_doc_num IS NULL OR v_current_doc_num = '' OR v_current_doc_num LIKE 'DRAFT-%') THEN
        IF v_cid IS NOT NULL THEN
           v_num := get_next_company_doc_number(v_cid, v_seq);
           
           IF TG_TABLE_NAME = 'docs_invoices' THEN NEW.invoice_number := v_num;
           ELSIF TG_TABLE_NAME = 'docs_bills' THEN NEW.bill_number := v_num;
           ELSIF TG_TABLE_NAME = 'docs_payments' THEN NEW.payment_number := v_num;
           ELSIF TG_TABLE_NAME = 'docs_journals' THEN NEW.reference_number := v_num;
           ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN NEW.credit_note_number := v_num;
           ELSIF TG_TABLE_NAME = 'docs_loans' THEN NEW.loan_number := v_num;
           ELSIF TG_TABLE_NAME = 'docs_products' THEN NEW.sku := v_num;
           ELSIF TG_TABLE_NAME = 'docs_contacts' THEN NEW.external_id := v_num;
           END IF;
        END IF;
      END IF;

      IF TG_TABLE_NAME = 'docs_journals' THEN
         IF NEW.journal_number IS NULL THEN
            NEW.journal_number := COALESCE(NEW.reference_number, NEW.id, 'JE-TMP');
         END IF;
         IF NEW.reference_number IS NULL THEN
            NEW.reference_number := NEW.journal_number;
         END IF;
         IF NEW.journal_date IS NULL THEN
            NEW.journal_date := COALESCE(NEW.date, CURRENT_DATE);
         END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;
  `);
  console.log("Trigger function updated.");
  await client.end();
}
run();
