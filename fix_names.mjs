import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/c\.name === 'SUBORNO NEW'/g, "c.name?.toLowerCase() === 'suborno new'");
content = content.replace(/c\.name === 'SUBORNO ELECTRIC'/g, "c.name?.toLowerCase() === 'suborno electric'");

fs.writeFileSync(path, content);
console.log('Fixed names!');
