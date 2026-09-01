import re

with open('components/ContactManager.tsx', 'r') as f:
    content = f.read()

# Add state for showDiscountListModal
content = re.sub(
    r'const \[showDiscountModal, setShowDiscountModal\] = useState<string \| null>\(null\);',
    r'const [showDiscountModal, setShowDiscountModal] = useState<string | null>(null);\n  const [showDiscountListModal, setShowDiscountListModal] = useState<string | null>(null);',
    content
)

# Add button for View Discounts
content = re.sub(
    r'(\{contact\.type === ContactType\.VENDOR && \(\s*<button \s*onClick=\{\(\) => setShowDiscountModal\(contact\.id\)\})',
    r'{contact.type === ContactType.VENDOR && (\n                          <>\n                          <button \n                            onClick={() => setShowDiscountListModal(contact.id)}\n                            className="mb-2 mr-1 p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"\n                            title="View Discounts"\n                          >\n                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>\n                          </button>\n                          <button \n                            onClick={() => setShowDiscountModal(contact.id)}',
    content
)

content = re.sub(
    r'(</button>\s*)\)(}\s*<p className="text-\[10px\] font-black)',
    r'\1</>\n                        \2',
    content
)

# Now add the modal for viewing discounts at the end, just before the showDiscountModal
modal_code = """
      {showDiscountListModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Vendor Discounts</h4>
                <p className="text-sm text-slate-500 font-medium">History of discounts received from this vendor</p>
              </div>
              <button onClick={() => setShowDiscountListModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {(() => {
                const contact = store.contacts.find(c => c.id === showDiscountListModal);
                // Find journal entries related to this contact where journalType is PURCHASE_DISCOUNT
                // docs_journal_lines has contactId, docs_journals has journalType
                const discountEntries = store.allEntries.filter(entry => 
                  entry.data?.journalType === 'PURCHASE_DISCOUNT' && 
                  entry.lines.some(line => line.contactId === showDiscountListModal)
                ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (discountEntries.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                      </div>
                      <p className="text-slate-500 font-medium">No discounts recorded yet.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {discountEntries.map(entry => {
                      const amount = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
                      return (
                        <div key={entry.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-200 hover:shadow-md transition-all group relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-wider">
                                  {entry.data?.journalType?.replace('_', ' ')}
                                </span>
                                <span className="text-xs font-bold text-slate-400">
                                  {formatDateTime(entry.date)}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-700 mt-2">{entry.data?.description || 'Vendor Discount'}</p>
                              
                              <div className="mt-3 flex items-center space-x-2 text-xs">
                                <span className="text-slate-400">Journal Ref:</span>
                                <button 
                                  onClick={() => {
                                    setShowDiscountListModal(null);
                                    if (onNavigateToLedger) {
                                      // Normally we'd navigate to journal view, but ContactManager receives onNavigateToLedger
                                      // Or we can just show the ID
                                    }
                                  }}
                                  className="font-mono text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer"
                                  title="We would navigate to journal view here"
                                >
                                  {entry.referenceNumber}
                                </button>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-black text-emerald-600">
                                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'BDT' }).format(amount)}
                              </p>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                {entry.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
"""

content = re.sub(
    r'(\{showDiscountModal && \()',
    lambda m: modal_code + '\n      ' + m.group(1),
    content
)

with open('components/ContactManager.tsx', 'w') as f:
    f.write(content)
