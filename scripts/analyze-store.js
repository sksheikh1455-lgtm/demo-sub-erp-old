import fs from 'fs';
const code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');
const matches = code.match(/const [a-zA-Z]+ = useCallback/g);
console.log("Total mutators:", matches ? matches.length : 0);
