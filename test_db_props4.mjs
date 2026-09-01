import pkg from "pg";
const { Client } = pkg;

const client = new Client({ 
  user: "postgres.buspgzsamhfmjrmmwpmo",
  password: "sk445@raihan",
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 6543,
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
