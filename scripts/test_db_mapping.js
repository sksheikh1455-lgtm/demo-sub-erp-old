export function mapDatabaseRowToFrontend(row) {
  if (!row) return row;
  const { company_id, ...rest } = row;
  
  const mappedNumber = rest.invoice_number || rest.bill_number || rest.payment_number || 
                       rest.credit_note_number || rest.cn_number || rest.loan_number;

  return {
    ...(rest.data || {}),
    ...rest,
    id: row.id,
    companyId: company_id || row.companyId,
    customerId: rest.customer_id || rest.customerId || null,
    vendorId: rest.vendor_id || rest.vendorId || null,
    costPrice: rest.cost_price !== undefined ? Number(rest.cost_price) : (rest.costPrice ? Number(rest.costPrice) : 0),
    price: rest.price !== undefined ? Number(rest.price) : (rest.price ? Number(rest.price) : 0),
    total: rest.total !== undefined ? Number(rest.total) : 0,
    subtotal: rest.subtotal !== undefined ? Number(rest.subtotal) : 0,
    number: mappedNumber || rest.number || null,
    // Loan specific mapping
    principalAmount: rest.principal_amount !== undefined ? Number(rest.principal_amount) : (rest.principalAmount ? Number(rest.principalAmount) : 0),
    interestRate: rest.interest_rate !== undefined ? Number(rest.interest_rate) : (rest.interestRate ? Number(rest.interestRate) : 0),
    termMonths: rest.term_months !== undefined ? Number(rest.term_months) : (rest.termMonths ? Number(rest.termMonths) : 1),
    interestType: rest.interest_type || rest.interestType || 'REDUCING',
    startDate: rest.start_date || rest.startDate || null,
    paidPeriods: rest.paid_periods || rest.paidPeriods || [],
    amortizationSchedule: rest.amortization_schedule || rest.amortizationSchedule || [],
    journalEntryId: rest.journal_entry_id || rest.journalEntryId || null,
  };
}
console.log(mapDatabaseRowToFrontend({
  id: 'loan-1',
  company_id: 'comp-1',
  loan_number: 'LOAN-1',
  principal_amount: '1000'
}));
