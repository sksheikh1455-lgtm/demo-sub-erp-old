
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

const INITIAL_COMPANIES = [
    { id: 'comp-1', name: 'Suborno Electric' },
    { id: 'comp-2', name: 'Suborno New' },
    { id: 'comp-3', name: 'Global Electric' },
    { id: 'comp-4', name: 'Star Light House' },
    { id: 'comp-5', name: 'Global Marketing' },
    { id: 'comp-6', name: 'Suborno Electric Tyre & Battery' },
    { id: 'comp-7', name: 'Suborno Sanitary Mart' }
];

async function recoverWarehouses() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to DB...');

    for (const c of INITIAL_COMPANIES) {
      const whId = `wh-${c.id}-main`;
      const whData = {
        id: whId,
        name: 'Main Warehouse',
        code: 'MAIN',
        address: 'Company Location',
        companyId: c.id,
        isDefault: true
      };
      console.log(`Inserting warehouse for: ${c.id}`);
      await client.query(
        `INSERT INTO docs_warehouses (id, company_id, data) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET company_id = $2, data = $3`,
        [whId, c.id, JSON.stringify(whData)]
      );
    }

    console.log('Warehouses restored!');
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

recoverWarehouses();
