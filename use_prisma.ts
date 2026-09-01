import { PrismaClient } from '@prisma/client';
import fs from 'fs';
let env = fs.readFileSync('.env', 'utf8');
let url = env.split('\n').find(l => l.startsWith('SUPABASE_DB_URL=')).split('=')[1].trim();
process.env.DATABASE_URL = url; // Use SUPABASE_DB_URL exactly as it is, since Prisma might parse it properly

const prisma = new PrismaClient();

async function run() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE docs_journals DROP CONSTRAINT IF EXISTS unq_journal_num_company;
  `);
  console.log("Dropped via prisma");
}
run().catch(console.error).finally(() => prisma.$disconnect());
