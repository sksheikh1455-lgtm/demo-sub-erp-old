import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("---- docs_roles contents ----");
  const rolesRes = await client.query("select id, name, permissions from docs_roles;");
  rolesRes.rows.forEach(row => {
    console.log(`Role ID: ${row.id}`);
    console.log(`Name: ${row.name}`);
    console.log(`Permissions: ${JSON.stringify(row.permissions)}`);
    console.log("----------------------------");
  });

  console.log("\n---- docs_users contents ----");
  const usersRes = await client.query("select id, name, email, username, role_id, status from docs_users;");
  usersRes.rows.forEach(row => {
    console.log(`User ID: ${row.id}`);
    console.log(`Name: ${row.name}`);
    console.log(`Email: ${row.email}`);
    console.log(`Username: ${row.username}`);
    console.log(`Role ID: ${row.role_id}`);
    console.log(`Status: ${row.status}`);
    console.log("----------------------------");
  });

  await client.end();
}

run().catch(console.error);
