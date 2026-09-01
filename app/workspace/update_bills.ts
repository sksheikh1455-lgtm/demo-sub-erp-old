import pkg from "pg";
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  const updates = [
      { id: '8318360f-8d7f-4741-a6d1-493e780ffc89', j: 'JE-BC08780050FF4384842985CB3CFA6961' },
      { id: 'c251fd9a-1321-4aba-8b8b-f7b52394fcd0', j: 'JE-E1866D40431E4B1386FC82AE3FFAB59F' },
      { id: 'b38040b9-f012-4abf-a367-6fc89e91fade', j: 'JE-3F45B15B5D514C17A625D05E5C507873' },
      { id: '16c619b0-aa01-4732-9b75-354cf73dcdd0', j: 'JE-DBE41D184C31478FA84FD08770808649' }
  ];
  
  for(const u of updates) {
      await c.query(`
        UPDATE docs_bills 
        SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{journalEntryId}', to_jsonb($1::text))
        WHERE id = $2
      `, [u.j, u.id]);
  }
  console.log("Bills updated to link to the new posted journals!");
  
  process.exit();
}
run();
