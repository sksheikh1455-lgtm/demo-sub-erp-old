import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  let sqlText = fs.readFileSync('execute_rpc.ts', 'utf8');
  let innerQueryStr = sqlText.split('$inner_query$')[1];
  let realQuery = innerQueryStr.replace(/\$1/g, "'comp-1'")
                               .replace(/\$2/g, "'2026-06-01'")
                               .replace(/\$3/g, "'2026-06-30'")
                               .replace(/\$4/g, "0.0::numeric");

  try {
    let check = await client.query(realQuery);
    console.log('SUCCESS, ROW COUNT:', check.rows.length);
  } catch (e) {
    console.error('ERROR:', e.message);
  }

  await client.end();
}
main();
