import pkg from "pg";
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres.buspgzsamhfmjrmmwpmo:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });
client.connect()
  .then(() => { console.log('Connected'); client.end(); })
  .catch(e => console.error(e.message));
