import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function checkGlobalInventory() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('--- Global Inventory Transaction Summary ---');
    
    const { rows: globalStats } = await client.query(`
      SELECT 
        transaction_type, 
        SUM(quantity) as total_quantity
      FROM docs_inventory_transactions
      GROUP BY transaction_type
    `);

    console.log('Global Transaction Totals:');
    globalStats.forEach(stat => {
      console.log(`${stat.transaction_type}: ${parseFloat(stat.total_quantity).toLocaleString()} units`);
    });

    const { rows: companyStats } = await client.query(`
      SELECT 
        c.data->>'name' as company_name,
        it.transaction_type,
        SUM(it.quantity) as total_quantity
      FROM docs_inventory_transactions it
      JOIN docs_companies c ON it.company_id = c.id
      GROUP BY company_name, it.transaction_type
      ORDER BY company_name, it.transaction_type
    `);

    console.log('\nPer-Company Transaction Totals:');
    companyStats.forEach(stat => {
      console.log(`${stat.company_name} | ${stat.transaction_type}: ${parseFloat(stat.total_quantity).toLocaleString()} units`);
    });

    const { rows: productQoh } = await client.query(`
      SELECT SUM((data->>'quantityOnHand')::numeric) as total_qoh
      FROM docs_products
    `);

    console.log('\nTotal Quantity on Hand (Current State):', parseFloat(productQoh[0].total_qoh).toLocaleString());

  } catch (err) {
    console.error('Error checking inventory:', err);
  } finally {
    await client.end();
  }
}

checkGlobalInventory();
