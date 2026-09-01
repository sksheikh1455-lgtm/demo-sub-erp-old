import pkg from "pg";
const { Client } = pkg;

const client = new Client({ 
  user: "postgres",
  password: "sk445%40raihan",
  host: "db.buspgzsamhfmjrmmwpmo.supabase.co",
  port: 5432,
  database: "postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB.");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}
run();
