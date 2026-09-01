import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;

const env = dotenv.parse(fs.readFileSync('.env'));
const client = new Client({
  connectionString: env.SUPABASE_DB_URL || env.DATABASE_URL
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT event_object_table AS table_name,
           trigger_name,
           event_manipulation AS event,
           action_statement AS definition
    FROM information_schema.triggers
    WHERE event_object_table = 'docs_payments';
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(e => console.log(e.message));
