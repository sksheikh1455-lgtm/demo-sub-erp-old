import { PrismaClient } from '@prisma/client';

const dbUrl = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

async function main() {
  try {
    const users = await prisma.$queryRawUnsafe(`SELECT * FROM docs_users;`);
    console.log("Users:", JSON.stringify(users, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
