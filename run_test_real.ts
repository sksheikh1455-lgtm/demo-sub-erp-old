import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { dbService } = await import('./services/db.ts');
  try {
    const res = await dbService.getPaginatedDocs('docs_invoices', { companyIds: ['comp-1'], limit: 10, sortField: 'date', sortOrder: 'desc' });
    console.log("Success:", res.data?.length);
  } catch(e) {
    console.error("Failed:", e);
  }
}
main();
