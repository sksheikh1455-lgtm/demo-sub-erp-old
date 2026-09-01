import fs from 'fs';
const path = 'services/db.ts';
let code = fs.readFileSync(path, 'utf8');

const oldCode = `        const orQuery = options.companyIds.map(id => 
          \`company_id.eq."\${id}",company_ids.cs.["\${id}"],company_ids.cd.["\${id}"],company_ids.cs.{\${id}},company_ids.ov.{\${id}}\`
        ).join(',');`;

const newCode = `        const orQuery = options.companyIds.map(id => 
          \`company_id.eq."\${id}",company_ids.cs.{\${id}}\`
        ).join(',');`;

if (code.includes(oldCode)) {
  code = code.replace(oldCode, newCode);
  fs.writeFileSync(path, code);
  console.log("Fixed db.ts");
} else {
  console.log("Could not find code to patch in db.ts");
}
