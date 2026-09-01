import fs from 'fs';
const sqls = fs.readdirSync('.').filter(f => f.endsWith('.sql'));
for (const f of sqls) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('create_journal_entry')) {
    console.log(f);
  }
}
