import pg from 'pg';
const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const client = new Client({ connectionString });
async function main() {
    await client.connect();
    const res = await client.query(`
        SELECT routine_name, routine_definition
        FROM information_schema.routines
        WHERE specific_schema = 'public'
        AND routine_name IN ('post_bill');
    `);
    console.log(res.rows[0]?.routine_definition);
    await client.end();
}
main();
