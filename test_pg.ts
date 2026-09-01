import { Client } from 'pg';

const client = new Client({
  host: 'db.buspgzsamhfmjrmmwpmo.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'sk445@raihan',
  database: 'postgres',
});

client.connect()
  .then(() => console.log('Connected'))
  .catch(e => console.error('Error:', e.message))
  .finally(() => client.end());
