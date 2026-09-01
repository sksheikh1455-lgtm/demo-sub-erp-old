import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres?pgbouncer=true';

const prisma = new PrismaClient();

async function run() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE docs_journals DROP CONSTRAINT IF EXISTS unq_journal_num_company;
  `);
  console.log("Dropped via prisma with port 6543 and valid password");
}
run().catch(console.error).finally(() => prisma.$disconnect());
