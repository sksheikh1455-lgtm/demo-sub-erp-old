import fs from 'fs';
let content = fs.readFileSync('services/db.ts', 'utf-8');
content = content.replace(
  /const cleanRest = Object\.fromEntries\(Object\.entries\(rest\)\.filter\(\(\[_, v\]\) => v !== null && v !== undefined\)\);/g,
  `const cleanRest = Object.fromEntries(Object.entries(rest).filter(([_, v]) => v !== null && v !== undefined && v !== ""));`
);
fs.writeFileSync('services/db.ts', content);
