const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});
client.connect().then(() => {
  return client.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_partner_summary'");
}).then(res => {
  console.log(res.rows[0].prosrc);
  client.end();
}).catch(console.error);
