const fs = require('fs');
let s = fs.readFileSync('services/db.ts', 'utf8');

// Replace tMatch definition
s = s.replace(
  /const tMatch = \`%\$\{term\}%\`;\s*if \(table === 'docs_journals'\) \{/g,
  `const safeTerm = term.replace(/"/g, '""');
            const tMatch = \`"%\${safeTerm}%"\`;
            if (table === 'docs_journals') {`
);

// Replace exact match logic for journals
s = s.replace(
  /if \(idx === 0 && terms\.length === 1\) jOr = \`id\.eq\.\$\{sEscaped\},\` \+ jOr;/g,
  `if (idx === 0 && terms.length === 1) jOr = \`id.eq."\${sEscaped.replace(/"/g, '""')}",id.ilike."%\${sEscaped.replace(/"/g, '""')}%",\` + jOr;`
);

// Remove parenthesis stripping
s = s.replace(
  /const sEscaped = s\.replace\(\/\[,\(\)\]\/g, ''\);/g,
  `const sEscaped = s;`
);

// Replace exact match for other tables
s = s.replace(
  /if \(allowed\.includes\('id'\) && idx === 0 && terms\.length === 1\) orClauses\.push\(\`id\.eq\.\$\{sEscaped\}\`\);/g,
  `if (allowed.includes('id') && idx === 0 && terms.length === 1) orClauses.push(\`id.eq."\${sEscaped.replace(/"/g, '""')}"\`);`
);

fs.writeFileSync('services/db.ts', s);
console.log('Fixed services/db.ts');
