import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const url = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: url
    }
  }
});

async function main() {
  try {
    const sql = fs.readFileSync('workspace/apply_rpc_fixed2.mjs', 'utf8').match(/const sql = `([\s\S]+?)`;/)[1];
    await prisma.$executeRawUnsafe(sql);
    console.log("SQL executed successfully via Prisma!");
  } catch (e) {
    console.error("Failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
