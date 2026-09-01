const fs = require('fs');
let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const regexFunc = /const calculateAmortization = \([\s\S]*?^};/m;
const match = code.match(regexFunc);
if (match) {
  // Can't simply regex replace easily if there are nested brackets, but let's see where it ends.
}
