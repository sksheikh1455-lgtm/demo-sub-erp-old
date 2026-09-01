import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
async function test() {
  try {
    const c = await prisma.company.count();
    console.log("Connected! Companies:", c);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
test();
