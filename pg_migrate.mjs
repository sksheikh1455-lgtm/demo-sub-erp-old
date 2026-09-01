import pkg from "pg";
import crypto from "crypto";
const { Client } = pkg;

const client = new Client({ connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres' });

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB.");

    // Fetch companies
    const { rows: companies } = await client.query('SELECT id, data FROM docs_companies');
    
    const sourceComp = companies.find(c => c.data?.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
    const targetComp = companies.find(c => c.data?.name === 'SUBORNO NEW');

    if (!sourceComp || !targetComp) {
      console.log("Could not find both companies.");
      return;
    }

    console.log(`Source: ${sourceComp.data.name} (${sourceComp.id})`);
    console.log(`Target: ${targetComp.data.name} (${targetComp.id})`);

    // Fetch Brands
    const { rows: sourceBrands } = await client.query('SELECT * FROM docs_brands WHERE company_id = $1 OR data->\'companyIds\' ? $1', [sourceComp.id]);
    
    // Fetch Categories
    const { rows: sourceCats } = await client.query('SELECT * FROM docs_categories WHERE company_id = $1 OR data->\'companyIds\' ? $1', [sourceComp.id]);

    // Fetch Products
    const { rows: sourceProducts } = await client.query('SELECT * FROM docs_products WHERE company_id = $1 OR data->\'companyIds\' ? $1', [sourceComp.id]);

    console.log(`Found: ${sourceBrands.length} brands, ${sourceCats.length} cats, ${sourceProducts.length} products in Source.`);

    // Delete existing target data
    await client.query('DELETE FROM docs_brands WHERE company_id = $1', [targetComp.id]);
    await client.query('DELETE FROM docs_categories WHERE company_id = $1', [targetComp.id]);
    await client.query('DELETE FROM docs_products WHERE company_id = $1', [targetComp.id]);

    const brandMap = {};
    const catMap = {};

    // Insert Brands
    for (const b of sourceBrands) {
      const newId = crypto.randomUUID();
      brandMap[b.id] = newId;
      const newData = { ...b.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
      await client.query(
        'INSERT INTO docs_brands (id, company_id, company_ids, data, updated_at) VALUES ($1, $2, $3, $4, NOW())',
        [newId, targetComp.id, `{${targetComp.id}}`, newData]
      );
    }
    console.log("Inserted Brands.");

    // Insert Cats
    for (const c of sourceCats) {
      const newId = crypto.randomUUID();
      catMap[c.id] = newId;
      const newData = { ...c.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
      await client.query(
        'INSERT INTO docs_categories (id, company_id, company_ids, data, updated_at) VALUES ($1, $2, $3, $4, NOW())',
        [newId, targetComp.id, `{${targetComp.id}}`, newData]
      );
    }
    console.log("Inserted Categories.");

    // Insert Products
    for (const p of sourceProducts) {
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

      await client.query(
        'INSERT INTO docs_products (id, company_id, company_ids, data, updated_at) VALUES ($1, $2, $3, $4, NOW())',
        [newId, targetComp.id, `{${targetComp.id}}`, newData]
      );
    }
    console.log(`Success! Inserted ${sourceProducts.length} Products.`);

  } catch (err) {
    console.error("Migration Failed:", err);
  } finally {
    await client.end();
  }
}

run();
