import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');
const regex = /supabase\.from\('([^']+)'\)/g;
let matches = [...content.matchAll(regex)].map(m => m[1]);
console.log([...new Set(matches)]);
