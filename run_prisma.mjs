import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const result = await prisma.$queryRaw`SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_partner_summary';`;
  console.log(result[0].prosrc);
}
run();
