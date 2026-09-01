import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function setupInvoiceNumbering() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    -- 1. Create a sequence for invoices
    CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

    -- 2. Modify docs_invoices table: add invoice_number column
    -- Try to add column, ignore if it already exists
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='docs_invoices' AND column_name='invoice_number') THEN
        ALTER TABLE docs_invoices ADD COLUMN invoice_number TEXT UNIQUE;
      END IF;
    END
    $$;

    -- 3. Trigger to auto-generate invoice_number and update data JSON on insert
    CREATE OR REPLACE FUNCTION generate_invoice_number()
    RETURNS TRIGGER AS $$
    DECLARE
      new_num TEXT;
      existing_num TEXT;
    BEGIN
      -- Check if frontend sent a valid number
      existing_num := NEW.data->>'number';
      
      IF existing_num IS NULL OR existing_num = '' OR existing_num = 'DRAFT' OR existing_num = 'NEW' THEN
        -- Generate new number
        new_num := 'INV-' || TO_CHAR(NEXTVAL('invoice_seq'), 'FM000000');
        NEW.invoice_number := new_num;
        
        -- Need to update the 'number' within the JSON data
        NEW.data := jsonb_set(
          COALESCE(NEW.data, '{}'::jsonb), 
          '{number}', 
          to_jsonb(new_num)
        );
      ELSE
        NEW.invoice_number := existing_num;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_generate_invoice_number ON docs_invoices;
    CREATE TRIGGER trg_generate_invoice_number
      BEFORE INSERT ON docs_invoices
      FOR EACH ROW
      EXECUTE FUNCTION generate_invoice_number();
      
    NOTIFY pgrst, 'reload schema';
  `;
  
  await client.query(sql);
  console.log("Invoice numbering setup complete!");
  await client.end();
}

setupInvoiceNumbering();
