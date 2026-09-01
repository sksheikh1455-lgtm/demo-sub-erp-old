import fs from 'fs';

const path = 'components/Settings.tsx';
let content = fs.readFileSync(path, 'utf8');

const injection = `
  const handleCopyProducts = async () => {
    try {
      const companies = store.companies || [];
      const sourceComp = companies.find((c: any) => c.name === 'SUBORNO ELECTRIC');
      const targetComp = companies.find((c: any) => c.name === 'SUBORNO NEW');
      
      if (!sourceComp || !targetComp) {
        alert('Could not find both SUBORNO ELECTRIC and SUBORNO NEW in your active companies.');
        return;
      }

      const products = store.products.filter((p: any) => p.companyId === sourceComp.id);
      if (products.length === 0) {
        alert('No products found in SUBORNO ELECTRIC');
        return;
      }

      const confirmCopy = window.confirm(\`Found \${products.length} products in SUBORNO ELECTRIC. Copy to SUBORNO NEW with 0 stock?\`);
      if (!confirmCopy) return;

      const newProducts = products.map((p: any) => {
        const newId = crypto.randomUUID();
        return {
           ...p,
           id: newId,
           companyId: targetComp.id,
           stock: 0,
           openingStock: 0,
           quantity: 0
        };
      });

      // Insert using the store or supabase directly
      // store.addProduct might only add one, so let's call supabase directly if we can
      let added = 0;
      for (const np of newProducts) {
         // store.addProduct might handle everything
         // Wait, store.addProduct adds to the db and updates local state. Let's see if it exists.
         if (store.addProduct) {
            await store.addProduct(np);
            added++;
         }
      }
      
      alert(\`Successfully copied \${added} products!\`);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };
`;

content = content.replace(
  "return (",
  `${injection}\n  return (`
);

content = content.replace(
  `<h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">System Settings</h3>`,
  `<h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">System Settings</h3>\n          <button onClick={handleCopyProducts} className="mt-2 bg-red-600 text-white px-4 py-2 rounded">Force Copy Products (SUBORNO ELECTRIC to SUBORNO NEW)</button>`
);

fs.writeFileSync(path, content);
console.log('Modified Settings.tsx');
