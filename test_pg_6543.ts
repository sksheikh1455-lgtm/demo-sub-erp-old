import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres',
});

client.connect()
  .then(() => {
     console.log('Connected!');
     client.end();
  })
  .catch(e => {
     console.error('Error:', e.message);
  });
