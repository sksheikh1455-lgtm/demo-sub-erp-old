const fs = require('fs');
const file = '/app/applet/store/useAccountingStore.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const unwrap = \(res: any\) => \(res && res.status === 'fulfilled' && Array.isArray\(res.value\)\) \? res.value : \[\];/g,
  'const unwrap = (res: any) => (res && res.status === \'fulfilled\' && Array.isArray(res.value)) ? res.value : null;'
);

code = code.replace(/setLocalOnlyProducts\(unwrap\(results\[0\]\)\);/g, 'const r0 = unwrap(results[0]); if(r0) setLocalOnlyProducts(r0);');
code = code.replace(/setLocalOnlyContacts\(unwrap\(results\[1\]\)\);/g, 'const r1 = unwrap(results[1]); if(r1) setLocalOnlyContacts(r1);');
code = code.replace(/setLocalOnlyInvoices\(unwrap\(results\[2\]\)\);/g, 'const r2 = unwrap(results[2]); if(r2) setLocalOnlyInvoices(r2);');
code = code.replace(/setLocalOnlyEntries\(unwrap\(results\[3\]\)\);/g, 'const r3 = unwrap(results[3]); if(r3) setLocalOnlyEntries(r3);');
code = code.replace(/setLocalOnlyBills\(unwrap\(results\[4\]\)\);/g, 'const r4 = unwrap(results[4]); if(r4) setLocalOnlyBills(r4);');
code = code.replace(/setLocalOnlyPayments\(unwrap\(results\[5\]\)\);/g, 'const r5 = unwrap(results[5]); if(r5) setLocalOnlyPayments(r5);');
code = code.replace(/setLocalOnlyCreditNotes\(unwrap\(results\[6\]\)\);/g, 'const r6 = unwrap(results[6]); if(r6) setLocalOnlyCreditNotes(r6);');
code = code.replace(/setLocalOnlyCompanies\(loadedCompanies\);/g, 'if(loadedCompanies) setLocalOnlyCompanies(loadedCompanies);');
code = code.replace(/setLocalOnlyUsers\(unwrap\(results\[8\]\)\);/g, 'const r8 = unwrap(results[8]); if(r8) setLocalOnlyUsers(r8);');
code = code.replace(/setLocalOnlyRoles\(unwrap\(results\[9\]\)\);/g, 'const r9 = unwrap(results[9]); if(r9) setLocalOnlyRoles(r9);');

code = code.replace(/setLocalOnlyAccounts\(updatedAccountsList\);/, 'if(updatedAccountsList) setLocalOnlyAccounts(updatedAccountsList);');
code = code.replace(/setLocalOnlyLoans\(unwrap\(results\[11\]\)\);/g, 'const r11 = unwrap(results[11]); if(r11) setLocalOnlyLoans(r11);');

code = code.replace(/setLocalOnlyInventoryAdjustments\(unwrap\(results\[12\]\)\);/g, 'const r12 = unwrap(results[12]); if(r12) setLocalOnlyInventoryAdjustments(r12);');
code = code.replace(/setLocalOnlyPayslips\(unwrap\(results\[13\]\)\);/g, 'const r13 = unwrap(results[13]); if(r13) setLocalOnlyPayslips(r13);');
code = code.replace(/setLocalOnlyAdvanceSalaries\(unwrap\(results\[14\]\)\);/g, 'const r14 = unwrap(results[14]); if(r14) setLocalOnlyAdvanceSalaries(r14);');
code = code.replace(/setLocalOnlyBrands\(unwrap\(results\[15\]\)\);/g, 'const r15 = unwrap(results[15]); if(r15) setLocalOnlyBrands(r15);');
code = code.replace(/setLocalOnlyCategories\(unwrap\(results\[16\]\)\);/g, 'const r16 = unwrap(results[16]); if(r16) setLocalOnlyCategories(r16);');
code = code.replace(/setLocalOnlyAttendance\(unwrap\(results\[17\]\)\);/g, 'const r17 = unwrap(results[17]); if(r17) setLocalOnlyAttendance(r17);');
code = code.replace(/setLocalOnlyCommissionTargets\(unwrap\(results\[18\]\)\);/g, 'const r18 = unwrap(results[18]); if(r18) setLocalOnlyCommissionTargets(r18);');
code = code.replace(/setLocalOnlyLeaves\(unwrap\(results\[19\]\)\);/g, 'const r19 = unwrap(results[19]); if(r19) setLocalOnlyLeaves(r19);');
code = code.replace(/setLocalOnlyTasks\(unwrap\(results\[20\]\)\);/g, 'const r20 = unwrap(results[20]); if(r20) setLocalOnlyTasks(r20);');
code = code.replace(/setLocalOnlyHolidays\(unwrap\(results\[21\]\)\);/g, 'const r21 = unwrap(results[21]); if(r21) setLocalOnlyHolidays(r21);');
code = code.replace(/setLocalOnlyInventoryTransactions\(unwrap\(results\[22\]\)\);/g, 'const r22 = unwrap(results[22]); if(r22) setLocalOnlyInventoryTransactions(r22);');
code = code.replace(/setLocalOnlyLines\(unwrap\(results\[23\]\)\);/g, 'const r23 = unwrap(results[23]); if(r23) setLocalOnlyLines(r23);');

code = code.replace(/data\.allLoans = fetchedLoans;/g, 'if(fetchedLoans) data.allLoans = fetchedLoans;');
code = code.replace(/data\.allInventoryAdjustments = fetchedInventoryAdjustments;/g, 'if(fetchedInventoryAdjustments) data.allInventoryAdjustments = fetchedInventoryAdjustments;');
code = code.replace(/data\.allInventoryTransactions = fetchedInventoryTransactions;/g, 'if(fetchedInventoryTransactions) data.allInventoryTransactions = fetchedInventoryTransactions;');
code = code.replace(/data\.allProductCosts = fetchedProductCosts;/g, 'if(fetchedProductCosts) data.allProductCosts = fetchedProductCosts;');
code = code.replace(/data\.allPayslips = fetchedPayslips;/g, 'if(fetchedPayslips) data.allPayslips = fetchedPayslips;');
code = code.replace(/data\.allAdvanceSalaries = fetchedAdvanceSalaries;/g, 'if(fetchedAdvanceSalaries) data.allAdvanceSalaries = fetchedAdvanceSalaries;');
code = code.replace(/data\.allBrands = fetchedBrands;/g, 'if(fetchedBrands) data.allBrands = fetchedBrands;');
code = code.replace(/data\.allCategories = fetchedCategories;/g, 'if(fetchedCategories) data.allCategories = fetchedCategories;');
code = code.replace(/data\.allAttendance = fetchedAttendance;/g, 'if(fetchedAttendance) data.allAttendance = fetchedAttendance;');
code = code.replace(/data\.allCommissionTargets = fetchedCommissionTargets;/g, 'if(fetchedCommissionTargets) data.allCommissionTargets = fetchedCommissionTargets;');
code = code.replace(/data\.allLeaves = fetchedLeaves;/g, 'if(fetchedLeaves) data.allLeaves = fetchedLeaves;');
code = code.replace(/data\.allTasks = fetchedTasks;/g, 'if(fetchedTasks) data.allTasks = fetchedTasks;');
code = code.replace(/data\.allHolidays = fetchedHolidays;/g, 'if(fetchedHolidays) data.allHolidays = fetchedHolidays;');
code = code.replace(/data\.companies = fetchedComps;/g, 'if(fetchedComps) data.companies = fetchedComps;');
code = code.replace(/data\.users = fetchedUsers;/g, 'if(fetchedUsers) data.users = fetchedUsers;');
code = code.replace(/data\.roles = fetchedRoles;/g, 'if(fetchedRoles) data.roles = fetchedRoles;');
code = code.replace(/data\.allAccounts = fetchedAccounts;/g, 'if(fetchedAccounts) data.allAccounts = fetchedAccounts;');

fs.writeFileSync(file, code);
