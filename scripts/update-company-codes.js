
import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

const codeMap = {
  'comp-1': 'SUL',
  'comp-2': 'SUN',
  'comp-3': 'GLE',
  'comp-4': 'SLH',
  'comp-5': 'GLM',
  'comp-6': 'SBT',
  'comp-7': 'SSM'
};

async function updateCodes() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to DB. Updating codes...');
    
    for (const [id, code] of Object.entries(codeMap)) {
      const res = await client.query('SELECT data FROM docs_companies WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const companyData = res.rows[0].data;
        companyData.code = code;
        
        await client.query(
          'UPDATE docs_companies SET data = $1 WHERE id = $2',
          [JSON.stringify(companyData), id]
        );
        console.log(`Updated company ${id} with code ${code}`);
      } else {
        console.warn(`Company ${id} not found.`);
      }
    }
    console.log('Update finished.');
  } catch (err) {
    console.error('Error updating codes:', err);
  } finally {
    await client.end();
  }
}

updateCodes();
