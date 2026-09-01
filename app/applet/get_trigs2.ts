import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
    const client = new Client({ connectionString });
    await client.connect();
    
    try {
        const res = await client.query(`
            SELECT p.proname, pg_get_functiondef(p.oid) as def
            FROM pg_proc p
            WHERE p.proname = 'post_bill' OR p.proname = 'generate_inventory_movements'
               OR p.proname = 'trg_bill_inventory';
        `);
        console.log("Functions found:");
        res.rows.forEach(r => {
            console.log("--- " + r.proname + " ---");
            console.log(r.def);
        });
        
    } catch(err) {
        console.error(err);
    }
    
    await client.end();
}

main().catch(console.error);
