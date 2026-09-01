import fs from 'fs';
let content = fs.readFileSync('bulletproof.sql', 'utf8');
content = content.replace(/\s+/g, ' ');
console.log(content.substring(0, 1000));
console.log("...");
console.log(content.substring(content.length - 1000));
