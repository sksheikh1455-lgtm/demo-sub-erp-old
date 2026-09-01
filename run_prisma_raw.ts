import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/SUPABASE_DB_URL=(.+)/);
const url = match[1].trim().replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan%40');
const prisma = new PrismaClient({ datasources: { db: { url } } });
async function main() {
  const result = await prisma.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE tablename = 'docs_journals';`);
  console.log(result);
}
main().finally(() => prisma.$disconnect());
