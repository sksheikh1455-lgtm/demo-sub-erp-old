import fs from 'fs';

let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

// Replace find methods to look in paginated arrays too
code = code.replace(/const inv = allInvoices\.find\(i => i\.id === id\);/g, 
  "const inv = allInvoices.find((i: any) => i.id === id) || paginatedInvoices.find((i: any) => i.id === id);");

code = code.replace(/const inv = allInvoices\.find\(i => i\.id === invoiceId\);/g, 
  "const inv = allInvoices.find((i: any) => i.id === invoiceId) || paginatedInvoices.find((i: any) => i.id === invoiceId);");

code = code.replace(/let inv = allInvoices\.find\(i => i\.id === invoiceId\);/g, 
  "let inv = allInvoices.find((i: any) => i.id === invoiceId) || paginatedInvoices.find((i: any) => i.id === invoiceId);");

code = code.replace(/const invoice = \(allInvoices \|\| \[\]\)\.find\(i => i\.id === invoiceId\);/g, 
  "const invoice = (allInvoices || []).find((i: any) => i.id === invoiceId) || paginatedInvoices.find((i: any) => i.id === invoiceId);");

code = code.replace(/const existingBill = allBills\.find\(b => b\.id === id\);/g, 
  "const existingBill = allBills.find((b: any) => b.id === id) || paginatedBills.find((b: any) => b.id === id);");

code = code.replace(/let bill = allBills\.find\(b => b\.id === id\);/g, 
  "let bill = allBills.find((b: any) => b.id === id) || paginatedBills.find((b: any) => b.id === id);");

code = code.replace(/const existingEntry = allEntries\.find\(e => e\.id === data\.id\);/g, 
  "const existingEntry = allEntries.find((e: any) => e.id === data.id) || paginatedEntries.find((e: any) => e.id === data.id);");

code = code.replace(/const existingCn = allCreditNotes\.find\(c => c\.id === id\);/g, 
  "const existingCn = allCreditNotes.find((c: any) => c.id === id);");

code = code.replace(/const existingPayment = allPayments\.find\(p => p\.id === paymentId\);/g, 
  "const existingPayment = allPayments.find((p: any) => p.id === paymentId);");

fs.writeFileSync('store/useAccountingStore.ts', code);
