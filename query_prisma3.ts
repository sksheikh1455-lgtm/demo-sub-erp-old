import { PrismaClient } from '@prisma/client';

const dbUrl = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres';

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

async function main() {
  try {
    const res = await prisma.$queryRawUnsafe(`SELECT 1;`);
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
