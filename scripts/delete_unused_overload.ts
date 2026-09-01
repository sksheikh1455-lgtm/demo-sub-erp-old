import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("Dropping old overload post_credit_note(p_credit_note_id text)...");
    await client.query(`
      DROP FUNCTION IF EXISTS public.post_credit_note(p_credit_note_id text);
    `);
    console.log("Successfully dropped function public.post_credit_note(p_credit_note_id text)!");
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
