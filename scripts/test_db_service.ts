import { dbService } from '../services/db.ts';

async function run() {
  try {
    const loans = await dbService.getDocs('docs_loans', ['comp-1']);
    console.log("Found loans:", loans.length);
    if(loans.length > 0) {
      console.log("First loan front-end mapped:");
      console.log(loans[0]);
    }
  } catch(e) {
    console.error(e);
  }
}
run();
