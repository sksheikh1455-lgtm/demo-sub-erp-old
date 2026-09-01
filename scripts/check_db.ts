import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  console.log("Checking Prisma database connection...");
  try {
    const start = Date.now();
    const count = await prisma.$queryRaw`SELECT 1 as result`;
    console.log("Database response:", count);
    console.log("Database check took:", Date.now() - start, "ms");
  } catch (err: any) {
    console.error("Database check failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
