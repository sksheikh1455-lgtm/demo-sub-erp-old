import { dbService } from './src/services/db.js';

(async () => {
    try {
        const res = await dbService.getDocs('docs_loans');
        console.log('Docs loans returned count:', res?.length);
    } catch(e) {
        console.error('Error fetching docs_loans:', e.message);
    }
})();
