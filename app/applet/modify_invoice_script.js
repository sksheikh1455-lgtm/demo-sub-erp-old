const fs = require('fs');
let code = fs.readFileSync('components/InvoiceManager.tsx', 'utf8');

const targetStr = `                         return (
                          <div 
                            key={item.id} 
                            className={\`grid gap-4 py-3 items-center px-2 group \${isSubtotal ? 'bg-slate-50 font-bold' : isDiscount ? 'bg-rose-50/40' : ''}\`}
                            style={{ gridTemplateColumns: colWidths.map(w => \`\${w}%\`).join(' ') }}
                          >
                              <div className="overflow-visible">`;

const replaceStr = `                         const isDragged = draggedItemIndex === idx;
                         const isDragOver = dragOverItemIndex === idx;

                         return (
                          <div 
                            key={item.id} 
                            draggable={isEditable}
                            onDragStart={(e) => handleDragStartItem(e, idx)}
                            onDragEnter={(e) => handleDragEnterItem(e, idx)}
                            onDragOver={(e) => handleDragOverItem(e, idx)}
                            onDrop={(e) => handleDropItem(e, idx)}
                            onDragEnd={handleDragEndItem}
                            className={\`grid gap-4 py-3 items-center px-2 group \${isSubtotal ? 'bg-slate-50 font-bold' : isDiscount ? 'bg-rose-50/40' : ''} \${isDragged ? 'opacity-40' : ''} \${isDragOver ? 'border-t-2 border-indigo-500' : 'border-t-2 border-transparent'}\`}
                            style={{ gridTemplateColumns: colWidths.map(w => \`\${w}%\`).join(' ') }}
                          >
                              <div className="overflow-visible relative flex items-start">
                                <div 
                                    className={\`absolute -left-5 top-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 opacity-0 transition-opacity \${isEditable ? 'group-hover:opacity-100' : 'hidden'}\`}
                                >
                                     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                                </div>
                                <div className="flex-1 w-full relative">`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);

    // Now find the `                             </div>` right before `<div className="text-right">` 
    // inside this mapping function and insert the extra `</div>`
    
    // Using string slice logic
    const closePattern = `                                )}
                             </div>
                             <div className="text-right">`;
                             
    const closeReplace = `                                )}
                             </div>
                             </div>
                             <div className="text-right">`;
                             
    if(code.includes(closePattern)){
        code = code.replace(closePattern, closeReplace);
        fs.writeFileSync('components/InvoiceManager.tsx', code);
        console.log('Modified InvoiceManager.tsx successfully');
    } else {
        console.log('closePattern not found');
    }
} else {
    console.log("targetStr not found.");
}
