import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres.buspgzsamhfmjrmmwpmo:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
});

client.connect()
  .then(() => {
     console.log('Connected to pooler!');
     client.end();
  })
  .catch(e => {
     console.error('Error:', e.message);
  });
