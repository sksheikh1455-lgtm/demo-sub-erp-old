import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const connStr = env.DATABASE_URL.replace('5432', '6543'); 
console.log("Connecting to:", connStr.replace(/postgres:[^@]+@/, 'postgres:***@'));

const client = new Client({
  connectionString: connStr
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully to PostgreSQL!");
    
    // Find all JE-CPAY and JE-VPAY
    const { rows: cpays } = await client.query(`
        SELECT id FROM docs_journals 
        WHERE id LIKE 'JE-CPAY-%' OR id LIKE 'JE-VPAY-%'
    `);
    
    console.log(`Found ${cpays.length} CPAY/VPAY journals.`);
    
    let deletedCount = 0;
    for (const row of cpays) {
        const baseId = row.id.replace('JE-CPAY-', '').replace('JE-VPAY-', '');
        const targetId = 'JE-PAY-' + baseId;
        
        // Delete the matching JE-PAY- if it exists
        const res = await client.query(`DELETE FROM docs_journals WHERE id = $1 RETURNING id`, [targetId]);
        if (res.rowCount > 0) {
            deletedCount += res.rowCount;
            console.log("Deleted duplicate:", targetId);
        }
    }
    
    console.log(`Finished. Deleted ${deletedCount} duplicate journals.`);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
