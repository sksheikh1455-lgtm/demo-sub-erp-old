import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// Inject import
if (!content.includes("import { supabase } from '../lib/supabase';")) {
  content = content.replace(
    "import { reportingService } from '../services/reportingService';",
    "import { reportingService } from '../services/reportingService';\nimport { supabase } from '../lib/supabase';"
  );
}

const migrationScript = `
  useEffect(() => {
    const runMigration = async () => {
      const isDone = localStorage.getItem('migrated_suborno_products_brands_cats_2');
      if (isDone) return;
      
      try {
        console.log("Starting full migration for brands, categories, and products...");
        const companies = store.companies || [];
        const sourceComp = companies.find((c: any) => c.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
        const targetComp = companies.find((c: any) => c.name === 'SUBORNO NEW');
        
        if (!sourceComp || !targetComp) return;

        // 1. Fetch Source Brands
        // Since company_ids is not present, let's just fetch all and filter by data->companyIds if needed
        const { data: sBrands } = await supabase.from('docs_brands').select('*');
        const sourceBrands = (sBrands || []).filter(b => b.company_ids?.includes(sourceComp.id) || b.data?.companyIds?.includes(sourceComp.id) || b.company_id === sourceComp.id || b.data?.companyId === sourceComp.id);
        
        // 2. Fetch Source Categories
        const { data: sCats } = await supabase.from('docs_categories').select('*');
        const sourceCats = (sCats || []).filter(c => c.company_ids?.includes(sourceComp.id) || c.data?.companyIds?.includes(sourceComp.id) || c.company_id === sourceComp.id || c.data?.companyId === sourceComp.id);

        // 3. Fetch Source Products
        const { data: sProducts } = await supabase.from('docs_products').select('*');
        const sourceProducts = (sProducts || []).filter(p => p.company_id === sourceComp.id || p.data?.companyId === sourceComp.id || p.data?.companyIds?.includes(sourceComp.id));

        if (!sourceProducts || sourceProducts.length === 0) {
          console.log("No products to copy in source:", sourceComp.name);
          return;
        }

        const brandMap = {} as any;
        const catMap = {} as any;

        // Migrate Brands
        const newBrands = sourceBrands.map((b: any) => {
           const newId = crypto.randomUUID();
           brandMap[b.id] = newId;
           const newData = { ...b.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
           return { id: newId, data: newData, company_id: targetComp.id };
        });

        // Migrate Categories
        const newCats = sourceCats.map((c: any) => {
           const newId = crypto.randomUUID();
           catMap[c.id] = newId;
           const newData = { ...c.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
           return { id: newId, data: newData, company_id: targetComp.id };
        });

        // Migrate Products
        const newProducts = sourceProducts.map((p: any) => {
           const newId = crypto.randomUUID();
           const d = p.data || {};
           const newData = { 
               ...d, 
               id: newId, 
               companyId: targetComp.id, 
               companyIds: [targetComp.id],
               brandId: brandMap[d.brandId] || d.brandId,
               categoryId: catMap[d.categoryId] || d.categoryId,
               stock: 0, openingStock: 0, quantity: 0, quantityOnHand: 0, openingBalance: 0, balance: 0,
               stockLevels: { [targetComp.id]: 0 },
               initialStockLevels: { [targetComp.id]: 0 }
           };
           // Delete old properties that shouldn't leak
           delete newData.company_id;
           delete newData.company_ids;

           return { id: newId, data: newData, company_id: targetComp.id };
        });

        console.log(\`Copying \${newBrands.length} brands, \${newCats.length} cats, \${newProducts.length} products\`);

        if (newBrands.length > 0) await supabase.from('docs_brands').upsert(newBrands);
        if (newCats.length > 0) await supabase.from('docs_categories').upsert(newCats);
        
        // Chunk products
        for (let i = 0; i < newProducts.length; i += 500) {
           await supabase.from('docs_products').upsert(newProducts.slice(i, i + 500));
        }

        console.log(\`Migration successful! Copied \${newProducts.length} products.\`);
        localStorage.setItem('migrated_suborno_products_brands_cats_2', 'true');
        alert(\`সফলভাবে \${newProducts.length} টি প্রোডাক্ট, ব্র্যান্ড এবং ক্যাটাগরি 'SUBORNO NEW' কোম্পানিতে কপি করা হয়েছে! (স্টক 0)\`);
      } catch (e: any) {
        console.error("Migration Error: ", e);
      }
    };
    if (store.companies?.length > 0) {
        runMigration();
    }
  }, [store.companies]);
`;

content = content.replace(
  "const fetchDashboardData = useCallback(async () => {",
  `${migrationScript}\n  const fetchDashboardData = useCallback(async () => {`
);

fs.writeFileSync(path, content);
console.log("Injected Migration Script");
