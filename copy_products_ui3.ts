import fs from 'fs';

const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const migrationScript = `
  useEffect(() => {
    const runMigration = async () => {
      const isDone = localStorage.getItem('migrated_suborno_products_brands_cats_4');
      if (isDone) return;
      
      try {
        console.log("Starting advanced migration for products...");
        const companies = store.companies || [];
        const sourceComp = companies.find((c: any) => c.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
        const targetComp = companies.find((c: any) => c.name === 'SUBORNO NEW');
        
        if (!sourceComp || !targetComp) return;

        // Fetch Source Brands
        let sourceBrands = [];
        let { data: sb, error: sberr } = await supabase.from('docs_brands').select('*').eq('company_id', sourceComp.id);
        if (sb) sourceBrands = sb;

        // Fetch Source Categories
        let sourceCats = [];
        let { data: sc, error: scerr } = await supabase.from('docs_categories').select('*').eq('company_id', sourceComp.id);
        if (sc) sourceCats = sc;

        // Fetch ALL Source Products using pagination
        let sourceProducts = [];
        let page = 0;
        let limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
           const { data: sp, error: sperr } = await supabase.from('docs_products')
              .select('*')
              .eq('company_id', sourceComp.id)
              .range(page * limit, (page + 1) * limit - 1);
              
           if (sperr) {
              console.error(sperr);
              break;
           }
           if (sp && sp.length > 0) {
              sourceProducts.push(...sp);
              page++;
              if (sp.length < limit) hasMore = false;
           } else {
              hasMore = false;
           }
        }

        if (!sourceProducts || sourceProducts.length === 0) {
          console.log("No products to copy in source:", sourceComp.name);
          return;
        }

        console.log("Fetched total source products:", sourceProducts.length);

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

        // Delete existing items in target to avoid duplicates
        await supabase.from('docs_brands').delete().eq('company_id', targetComp.id);
        await supabase.from('docs_categories').delete().eq('company_id', targetComp.id);
        await supabase.from('docs_products').delete().eq('company_id', targetComp.id);

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
        localStorage.setItem('migrated_suborno_products_brands_cats_4', 'true');
        alert(\`সফলভাবে \${newProducts.length} টি প্রোডাক্ট 'SUBORNO NEW' কোম্পানিতে কপি করা হয়েছে! (স্টক 0)\`);
      } catch (e: any) {
        console.error("Migration Error: ", e);
      }
    };
    if (store.companies?.length > 0) {
        runMigration();
    }
  }, [store.companies]);
`;

// Find and replace the old useEffect migration block
const startMarker = 'useEffect(() => {\n    const runMigration = async () => {';
const startIdx = content.indexOf(startMarker);
if (startIdx !== -1) {
  const returnIdx = content.indexOf('const fetchDashboardData = useCallback(async () => {', startIdx);
  if (returnIdx !== -1) {
    content = content.substring(0, startIdx) + migrationScript + "\n  " + content.substring(returnIdx);
    fs.writeFileSync(path, content);
    console.log("Injected Advanced Migration Script");
  } else {
    console.log("Could not find fetchDashboardData");
  }
} else {
  // If not found, just inject it above fetchDashboardData
  const returnIdx = content.indexOf('const fetchDashboardData = useCallback(async () => {');
  if (returnIdx !== -1) {
     content = content.substring(0, returnIdx) + migrationScript + "\n  " + content.substring(returnIdx);
     fs.writeFileSync(path, content);
     console.log("Injected Advanced Migration Script (fresh)");
  }
}

