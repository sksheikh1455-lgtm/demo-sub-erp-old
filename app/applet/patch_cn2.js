const fs = require('fs');
let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

code = code.replace(/await supabase\.from\('docs_credit_notes'\)\.insert\(\{[\s\S]*?status: newCn\.status\n    \}\);/, 
`const { error: insertErr } = await supabase.from('docs_credit_notes').insert({ id: newId, data: newCn, company_id: companyId, status: newCn.status }); if (insertErr) throw new Error('Database Error (Add Credit Note): ' + insertErr.message);`);

code = code.replace(/await supabase\.from\('docs_credit_notes'\)\.update\(\{\n      data: updated,\n      status: updated\.status\n    \}\)\.eq\('id', id\);/,
`const { error: updateErr } = await supabase.from('docs_credit_notes').update({ data: updated, status: updated.status }).eq('id', id); if (updateErr) throw new Error('Database Error (Update Credit Note): ' + updateErr.message);`);

fs.writeFileSync('store/useAccountingStore.ts', code);
