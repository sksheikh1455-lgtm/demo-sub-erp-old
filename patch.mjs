import fs from 'fs';
let content = fs.readFileSync('services/db.ts', 'utf-8');
content = content.replace(
  /const mappedNumber = rest\.invoice_number \|\| rest\.bill_number \|\| rest\.payment_number \|\|\s*rest\.credit_note_number \|\| rest\.cn_number \|\| rest\.loan_number;\s*return \{\s*\.\.\.\(rest\.data \|\| \{\}\),\s*const cleanRest = [^\n]*\n\s*\.\.\.cleanRest,/g,
  `const mappedNumber = rest.invoice_number || rest.bill_number || rest.payment_number ||
                       rest.credit_note_number || rest.cn_number || rest.loan_number;

  const cleanRest = Object.fromEntries(Object.entries(rest).filter(([_, v]) => v !== null && v !== undefined));
  return {
    ...(rest.data || {}),
    ...cleanRest,`
);
fs.writeFileSync('services/db.ts', content);
