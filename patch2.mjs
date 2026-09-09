import fs from 'fs';
let content = fs.readFileSync('services/db.ts', 'utf-8');
content = content.replace(
  /if \(allowed\.includes\('name'\)\) orClauses\.push\(`name\.ilike\.\$\{tMatch\}`\);\s*if \(allowed\.includes\('sku'\)\) orClauses\.push\(`sku\.ilike\.\$\{tMatch\}`\);/g,
  `if (allowed.includes('name')) {
                orClauses.push(\`name.ilike.\${tMatch}\`);
                orClauses.push(\`data->>name.ilike.\${tMatch}\`);
              }
              if (allowed.includes('sku')) {
                orClauses.push(\`sku.ilike.\${tMatch}\`);
                orClauses.push(\`data->>sku.ilike.\${tMatch}\`);
              }`
);
fs.writeFileSync('services/db.ts', content);
