import fs from 'fs';
const path = 'services/db.ts';
let code = fs.readFileSync(path, 'utf8');

const oldCode = `    if (options.companyIds && options.companyIds.length > 0) {
      query = query.in('company_id', options.companyIds);
    }`;

const newCode = `    if (options.companyIds && options.companyIds.length > 0) {
      if (table === 'docs_products' || table === 'docs_contacts' || table === 'docs_users') {
        const idList = options.companyIds.map(id => \`"\${id}"\`).join(',');
        const textArrayFormat = options.companyIds.join(',');
        // For array overlap, PostgREST uses ov. For JSONB contains, cs.
        // We will do a generic OR that catches company_id or company_ids as jsonb or text array.
        const orQuery = options.companyIds.map(id => 
          \`company_id.eq."\${id}",company_ids.cs.["\${id}"],company_ids.cd.["\${id}"],company_ids.cs.{\${id}},company_ids.ov.{\${id}}\`
        ).join(',');
        query = query.or(orQuery);
      } else {
        query = query.in('company_id', options.companyIds);
      }
    }`;

if (code.includes(oldCode)) {
  code = code.replace(oldCode, newCode);
  fs.writeFileSync(path, code);
  console.log("Patched db.ts");
} else {
  console.log("Could not find code to patch in db.ts");
}
