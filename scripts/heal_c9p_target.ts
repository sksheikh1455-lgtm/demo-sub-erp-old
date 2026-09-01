import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const sku = 'C9P';
    const res = await client.query("SELECT id, name, sku, quantity_on_hand, data FROM docs_products WHERE sku = $1", [sku]);
    const product = res.rows[0];
    if (!product) {
      console.log('Sku not found');
      return;
    }
    const pid = product.id;
    console.log("Found product:", product.name, "id:", pid);

    const companyTotalsQuery = await client.query(`
      SELECT company_id, SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END) as company_qty
      FROM docs_inventory_transactions
      WHERE product_id = $1
      GROUP BY company_id;
    `, [pid]);

    let calculatedTotal = 0;
    const stockLevels: Record<string, number> = {};

    companyTotalsQuery.rows.forEach(row => {
      const q = Number(row.company_qty || 0);
      stockLevels[row.company_id] = q;
      calculatedTotal += q;
    });

    console.log("Calculated stock levels per company:", stockLevels);
    console.log("Calculated total:", calculatedTotal);

    const updatedData = {
      ...product.data,
      stockLevels: stockLevels,
      quantityOnHand: calculatedTotal
    };

    const upRes = await client.query(`
      UPDATE docs_products
      SET quantity_on_hand = $1,
          data = $2,
          updated_at = NOW()
      WHERE id = $3;
    `, [calculatedTotal, JSON.stringify(updatedData), pid]);

    console.log("Update complete! Status:", upRes.rowCount);

    const verify = await client.query("SELECT id, name, sku, quantity_on_hand, data FROM docs_products WHERE sku = $1", [sku]);
    console.log("Verified updated row column qoh:", verify.rows[0].quantity_on_hand);
    console.log("Verified updated row JSON qoh:", verify.rows[0].data?.quantityOnHand);
    console.log("Verified updated row JSON stock levels:", verify.rows[0].data?.stockLevels);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
