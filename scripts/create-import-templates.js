import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

const sql = `
BEGIN;

-- =====================================================================================
-- IMPORT TEMPLATES (Data Pasting Tables)
-- Paste your Excel data into these tables in the Supabase Table Editor.
-- Triggers will automatically process them into the main tables and generate Journal Entries.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS import_products_template (
  id SERIAL PRIMARY KEY,
  company_id TEXT, -- Optional, if empty will grab first available company
  name TEXT NOT NULL,
  sku TEXT,
  price NUMERIC DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  quantity_on_hand NUMERIC DEFAULT 0,
  category TEXT DEFAULT 'General',
  brand TEXT,
  uom TEXT DEFAULT 'pcs',
  description TEXT
);

CREATE TABLE IF NOT EXISTS import_contacts_template (
  id SERIAL PRIMARY KEY,
  company_id TEXT, -- Optional, if empty will grab first available company
  name TEXT NOT NULL,
  type TEXT DEFAULT 'CUSTOMER', -- 'CUSTOMER' or 'VENDOR'
  email TEXT,
  phone TEXT,
  address TEXT,
  opening_balance NUMERIC DEFAULT 0
);

-- Trigger Function for Products
CREATE OR REPLACE FUNCTION trg_process_import_product()
RETURNS TRIGGER AS $$
DECLARE
  v_prod_id TEXT;
  v_company_id TEXT;
BEGIN
  v_prod_id := 'PROD-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 6);
  v_company_id := NEW.company_id;

  -- Smart Resolver: If company_id is a name, find the ID
  IF v_company_id IS NOT NULL AND v_company_id !~ '^[0-9a-fA-F\-]+$' AND v_company_id !~ '^comp-' THEN
    SELECT id INTO v_company_id FROM docs_companies WHERE name ILIKE v_company_id LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    -- Try to find a company ID from docs_companies
    BEGIN
      SELECT id INTO v_company_id FROM docs_companies ORDER BY updated_at DESC LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      -- Table might not exist yet
    END;
  END IF;
  
  IF v_company_id IS NULL THEN
    v_company_id := 'DEFAULT-COMPANY';
  END IF;

  INSERT INTO docs_products (id, company_id, name, sku, price, cost_price, data)
  VALUES (
    v_prod_id,
    v_company_id,
    NEW.name,
    COALESCE(NEW.sku, 'SKU-' || substr(md5(random()::text), 1, 6)),
    COALESCE(NEW.price, 0),
    COALESCE(NEW.cost_price, 0),
    jsonb_build_object(
      'id', v_prod_id,
      'companyIds', jsonb_build_array(v_company_id),
      'name', NEW.name,
      'sku', COALESCE(NEW.sku, 'SKU-' || substr(md5(random()::text), 1, 6)),
      'price', COALESCE(NEW.price, 0),
      'costPrice', COALESCE(NEW.cost_price, 0),
      'quantityOnHand', COALESCE(NEW.quantity_on_hand, 0),
      'category', COALESCE(NEW.category, 'General'),
      'brand', NEW.brand,
      'uom', COALESCE(NEW.uom, 'pcs'),
      'description', NEW.description,
      'type', 'PRODUCT'
    )
  );
  -- The trigger 'trigger_product_opening_balance' on docs_products will fire and generate Journals.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_import_product ON import_products_template;
CREATE TRIGGER trigger_process_import_product
AFTER INSERT ON import_products_template
FOR EACH ROW
EXECUTE FUNCTION trg_process_import_product();


-- Trigger Function for Contacts
CREATE OR REPLACE FUNCTION trg_process_import_contact()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id TEXT;
  v_company_id TEXT;
BEGIN
  v_contact_id := 'CONT-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 6);
  v_company_id := NEW.company_id;

  -- Smart Resolver: If company_id is a name, find the ID
  IF v_company_id IS NOT NULL AND v_company_id !~ '^[0-9a-fA-F\-]+$' AND v_company_id !~ '^comp-' THEN
    SELECT id INTO v_company_id FROM docs_companies WHERE name ILIKE v_company_id LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    BEGIN
      SELECT id INTO v_company_id FROM docs_companies ORDER BY updated_at DESC LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
    END;
  END IF;
  
  IF v_company_id IS NULL THEN
    v_company_id := 'DEFAULT-COMPANY';
  END IF;

  INSERT INTO docs_contacts (id, company_id, name, type, data)
  VALUES (
    v_contact_id,
    v_company_id,
    NEW.name,
    COALESCE(NEW.type, 'CUSTOMER'),
    jsonb_build_object(
      'id', v_contact_id,
      'companyIds', jsonb_build_array(v_company_id),
      'name', NEW.name,
      'type', COALESCE(UPPER(NEW.type), 'CUSTOMER'),
      'email', NEW.email,
      'phone', NEW.phone,
      'address', NEW.address,
      'openingBalance', COALESCE(NEW.opening_balance, 0)
    )
  );
  -- The trigger 'trigger_contact_opening_balance' on docs_contacts will fire and generate Journals.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_import_contact ON import_contacts_template;
CREATE TRIGGER trigger_process_import_contact
AFTER INSERT ON import_contacts_template
FOR EACH ROW
EXECUTE FUNCTION trg_process_import_contact();

COMMIT;
`;

async function applySql() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log("SQL Applied Successfully! Import templates created.");
  } catch (err) {
    console.error("Error applying SQL:", err);
  } finally {
    await client.end();
  }
}

applySql();
