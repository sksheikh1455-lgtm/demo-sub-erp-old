import pkg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  const filesToDeploy = [
    'post_invoice.sql',
    'post_bill.sql',
    'post_credit_note.sql',
    'post_inventory_adjustment.sql'
  ];

  try {
    for (const fileName of filesToDeploy) {
      console.log(`Reading SQL file: ${fileName}...`);
      const filePath = path.join(process.cwd(), fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Deploying function defined in ${fileName} into Database...`);
      await client.query(sql);
      console.log(`Successfully deployed ${fileName}!`);
    }

    console.log("All procedures redeployed successfully!");
  } catch (error) {
    console.error("Failed to redeploy procedures:", error);
  } finally {
    await client.end();
  }
}

main();
