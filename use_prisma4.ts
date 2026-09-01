import { PrismaClient } from '@prisma/client';
import fs from 'fs';
let env = fs.readFileSync('.env', 'utf8');
let url = env.split('\n').find(l => l.startsWith('SUPABASE_DB_URL=')).split('=')[1].trim();
url = url.replace('sk445@raihan@', 'sk445%40raihan%40@');
url = url.replace(':5432', ':6543');
process.env.DATABASE_URL = url;

const prisma = new PrismaClient();

async function run() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE docs_journals DROP CONSTRAINT IF EXISTS unq_journal_num_company;
  `);
  console.log("Dropped via prisma with port 6543 and fully encoded URL");
}
run().catch(console.error).finally(() => prisma.$disconnect());
