import pkg from 'pg';
const { Client } = pkg;
const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION sync_product_metadata() RETURNS TRIGGER AS $$
      DECLARE v_val TEXT;
      BEGIN
        IF NEW.data IS NOT NULL THEN
          IF (NEW.data ? 'companyId') THEN
            v_val := COALESCE(NEW.data->>'companyId', NEW.data->'companyIds'->>0);
            IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
          ELSIF (NEW.data ? 'companyIds') THEN
            v_val := NEW.data->'companyIds'->>0;
            IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
          END IF;
          
          IF (NEW.data ? 'name') THEN NEW.name := NULLIF(NEW.data->>'name', ''); END IF;
          IF (NEW.data ? 'sku') THEN NEW.sku := NULLIF(NEW.data->>'sku', ''); END IF;
          IF (NEW.data ? 'price') THEN NEW.price := NULLIF(NEW.data->>'price', '')::NUMERIC; END IF;
          IF (NEW.data ? 'costPrice') THEN NEW.cost_price := NULLIF(NEW.data->>'costPrice', '')::NUMERIC; END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_sync_docs_products_doc BEFORE INSERT OR UPDATE ON docs_products FOR EACH ROW EXECUTE FUNCTION sync_product_metadata();

      CREATE OR REPLACE FUNCTION sync_contact_metadata() RETURNS TRIGGER AS $$
      DECLARE v_val TEXT;
      BEGIN
        IF NEW.data IS NOT NULL THEN
          IF (NEW.data ? 'companyId') THEN
            v_val := COALESCE(NEW.data->>'companyId', NEW.data->'companyIds'->>0);
            IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
          ELSIF (NEW.data ? 'companyIds') THEN
            v_val := NEW.data->'companyIds'->>0;
            IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
          END IF;
          
          IF (NEW.data ? 'name') THEN NEW.name := NULLIF(NEW.data->>'name', ''); END IF;
          IF (NEW.data ? 'type') THEN NEW.type := NULLIF(NEW.data->>'type', ''); END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_sync_docs_contacts_doc BEFORE INSERT OR UPDATE ON docs_contacts FOR EACH ROW EXECUTE FUNCTION sync_contact_metadata();
      
      CREATE OR REPLACE FUNCTION sync_basic_metadata() RETURNS TRIGGER AS $$
      DECLARE v_val TEXT;
      BEGIN
        IF NEW.data IS NOT NULL THEN
          IF (NEW.data ? 'companyId') THEN
            v_val := COALESCE(NEW.data->>'companyId', NEW.data->'companyIds'->>0);
            IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
          ELSIF (NEW.data ? 'companyIds') THEN
            v_val := NEW.data->'companyIds'->>0;
            IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_sync_docs_accounts_doc BEFORE INSERT OR UPDATE ON docs_accounts FOR EACH ROW EXECUTE FUNCTION sync_basic_metadata();
      CREATE TRIGGER trg_sync_docs_roles_doc BEFORE INSERT OR UPDATE ON docs_roles FOR EACH ROW EXECUTE FUNCTION sync_basic_metadata();
      CREATE TRIGGER trg_sync_docs_categories_doc BEFORE INSERT OR UPDATE ON docs_categories FOR EACH ROW EXECUTE FUNCTION sync_basic_metadata();
      CREATE TRIGGER trg_sync_docs_brands_doc BEFORE INSERT OR UPDATE ON docs_brands FOR EACH ROW EXECUTE FUNCTION sync_basic_metadata();
    `);
    console.log("Recreated specific sync triggers!");
  } catch (e) {
    console.error(e.message);
  }
  await client.end();
}
main();
