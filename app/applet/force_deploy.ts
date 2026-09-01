import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  const text = fs.readFileSync('execute_rpc.ts', 'utf8');
  let sqlText = text.split('const sqlText = `')[1].split('`;\n\nasync function main')[0];
  
  if (!sqlText || sqlText.length < 100) {
      console.log("Failed to parse sqlText from execute_rpc.ts");
      return process.exit(1);
  }

  console.log("SQL starts with:", sqlText.slice(0, 100).replace(/\n/g, ' '));
  console.log("SQL ends with:", sqlText.slice(-100).replace(/\n/g, ' '));

  try {
      await client.query(sqlText);
      console.log('SUCCESS executed function definition');
  } catch(e) {
      console.log('ERROR:', e.message);
  }

  client.end();
}
main();
