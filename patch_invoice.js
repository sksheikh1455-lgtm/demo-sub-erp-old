const fs = require('fs');
const path = 'components/InvoiceManager.tsx';
let content = fs.readFileSync(path, 'utf8');

const target1 = \`        await store.updateInvoice(editingId, updates);
          let finalInvoice: any = { ...updates, id: editingId };
          if (post) {
            const oldInvoice = (store.invoices || []).find((b: any) => b.id === editingId) || (store.paginatedInvoices || []).find((b: any) => b.id === editingId);
            if (oldInvoice) {
              const returned = await store.postInvoice({ ...oldInvoice, ...updates, status: 'DRAFT' });
              if (returned) { finalInvoice = returned; finalInvoice.status = 'POSTED'; }
            }
          }\`;
const replacement1 = \`        const result = await store.updateInvoice(editingId, updates);
          let finalInvoice: any = result || { ...existingInvoice, ...updates, id: editingId };
          if (post) {
            const returned = await store.postInvoice({ ...finalInvoice, status: 'DRAFT' });
            if (returned) { finalInvoice = returned; finalInvoice.status = 'POSTED'; }
          }\`;

if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
  console.log('Replaced update block');
} else {
  console.log('Update block not found');
}

fs.writeFileSync(path, content, 'utf8');
