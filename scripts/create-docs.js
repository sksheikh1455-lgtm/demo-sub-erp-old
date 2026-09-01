import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function migrateToDocs() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    CREATE TABLE IF NOT EXISTS docs_products (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS docs_contacts (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS docs_invoices (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS docs_journals (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- RLS setup
    ALTER TABLE docs_products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all_products" ON docs_products FOR ALL USING (true) WITH CHECK (true);
    
    ALTER TABLE docs_contacts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all_contacts" ON docs_contacts FOR ALL USING (true) WITH CHECK (true);
    
    ALTER TABLE docs_invoices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all_invoices" ON docs_invoices FOR ALL USING (true) WITH CHECK (true);
    
    ALTER TABLE docs_journals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "all_journals" ON docs_journals FOR ALL USING (true) WITH CHECK (true);
    
    NOTIFY pgrst, 'reload schema';
  `;
  
  await client.query(sql);
  console.log("Document tables created!");
  await client.end();
}

migrateToDocs();
