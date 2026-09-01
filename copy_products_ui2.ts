import fs from 'fs';

const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const injection = `
  useEffect(() => {
    const runMigration = async () => {
      const isDone = localStorage.getItem('migrated_suborno_products_3');
      if (isDone) return;
      
      try {
        console.log("Starting product migration...");
        const companies = store.companies || [];
        const sourceComp = companies.find((c: any) => c.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
        const targetComp = companies.find((c: any) => c.name === 'SUBORNO NEW');
        
        if (!sourceComp || !targetComp) {
          console.log('Migration: Could not find both companies', companies.map(c=>c.name));
          return;
        }

        const products = store.products.filter((p: any) => p.companyId === sourceComp.id);
        if (products.length === 0) {
          console.log('Migration: No products found in source company');
          localStorage.setItem('migrated_suborno_products_3', 'true');
          return;
        }

        console.log('Migration: Found ' + products.length + ' products to copy');

        const newProducts = products.map((p: any) => {
          const newId = crypto.randomUUID();
          return {
             ...p,
             id: newId,
             companyId: targetComp.id,
             companyIds: [targetComp.id],
             stock: 0,
             openingStock: 0,
             quantity: 0,
             quantityOnHand: 0,
             openingBalance: 0,
             stockLevels: { [targetComp.id]: 0 },
             initialStockLevels: { [targetComp.id]: 0 }
          };
        });

        let added = 0;
        for (const np of newProducts) {
           if (store.addProduct) {
              await store.addProduct(np);
              added++;
           }
        }
        
        console.log(\`Migration: Successfully copied \${added} products!\`);
        localStorage.setItem('migrated_suborno_products_3', 'true');
        alert(\`সফলভাবে \${added} টি প্রোডাক্ট 'SUBORNO NEW' কোম্পানিতে কপি করা হয়েছে! (স্টক 0)\`);
      } catch (e: any) {
        console.error("Migration Error: ", e);
      }
    };
    if (store.companies?.length > 0 && store.products?.length > 0) {
        runMigration();
    }
  }, [store.companies, store.products]);
`;

content = content.replace(
  "const fetchDashboardData = useCallback(async () => {",
  `${injection}\n  const fetchDashboardData = useCallback(async () => {`
);

fs.writeFileSync(path, content);
console.log('Modified Dashboard.tsx');
