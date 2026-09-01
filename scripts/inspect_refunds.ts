import { Client } from 'pg';

const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
    const client = new Client({ connectionString });
    await client.connect();
    
    try {
        const { rows: payments } = await client.query("SELECT * FROM docs_payments WHERE type = 'REFUND' OR type = 'refund' LIMIT 10;");
        console.log('--- REFUND PAYMENTS ---');
        console.log(payments);
        
        for (const pay of payments) {
            const jeId = 'JE-CPAY-' + pay.id.toUpperCase().replace('PAY-', '');
            const { rows: journals } = await client.query('SELECT * FROM docs_journals WHERE id = $1;', [jeId]);
            console.log(`Matching journal for ${pay.id}:`, journals);
            
            const { rows: lines } = await client.query('SELECT * FROM docs_journal_lines WHERE journal_id = $1;', [jeId]);
            console.log(`Journal lines for ${jeId}:`, lines);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
main();
