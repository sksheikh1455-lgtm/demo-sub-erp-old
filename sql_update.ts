import { Client } from 'pg';
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});
async function main() {
  await client.connect();
  const res = await client.query(`UPDATE docs_companies SET name = 'SUBORNO ELECTRIC', code = 'SUL' WHERE id = 'comp-1'`);
  console.log(res.rowCount, "rows updated");
  const check = await client.query(`SELECT * FROM docs_companies`);
  console.log(check.rows);
  await client.end();
}
main();
