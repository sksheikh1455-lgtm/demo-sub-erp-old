import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function cleanup() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected! Checking stat_activity...');
  
  const activity = await client.query(`
    SELECT pid, state, query, age(clock_timestamp(), query_start) as duration
    FROM pg_stat_activity
    WHERE state != 'idle' AND pid != pg_backend_pid()
  `);
  console.log('Active queries:', JSON.stringify(activity.rows, null, 2));

  // If any query is active and running for more than 10 seconds, let's terminate it
  for (const row of activity.rows) {
    if (row.duration && row.duration.seconds && row.duration.seconds > 10) {
      console.log(`Terminating backend process ${row.pid} running: ${row.query}`);
      await client.query('SELECT pg_terminate_backend($1)', [row.pid]);
    }
  }

  await client.end();
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
