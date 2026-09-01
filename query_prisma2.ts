import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres"
    }
  }
});

async function run() {
  const p = await prisma.product.findUnique({
    where: { id: '244000e6-c9aa-4737-9364-6b7135f030cb' }
  });
  console.log('Product via Prisma:', p);
}
run();
