import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.docsProduct.findUnique({
    where: { id: '244000e6-c9aa-4737-9364-6b7135f030cb' }
  });
  console.log('Product via Prisma:', p);
}
run();
