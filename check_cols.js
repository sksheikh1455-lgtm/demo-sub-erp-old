import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/)[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/)[1];

async function checkCol(col) {
  const res = await fetch(`${url}/rest/v1/docs_products`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test', data: {}, [col]: null })
  });
  const text = await res.text();
  if (text.includes("schema cache")) {
    console.log(`❌ ${col} DOES NOT exist`);
  } else {
    console.log(`✅ ${col} EXISTS`);
  }
}

async function run() {
  const cols = ["id", "updated_at", "company_id", "name", "sku", "price", "cost_price", "is_locked", "last_reconciled_at", "uom", "type", "brand", "tax_code", "category", "external_id", "description", "tracking_type", "invoicing_policy", "initial_cost", "last_purchase_rate", "last_purchase_price", "quantity_on_hand", "is_in_pos", "can_be_sold", "can_be_purchased", "can_be_expensed", "track_inventory", "company_ids", "serial_numbers"];
  for (const col of cols) {
    await checkCol(col);
  }
}
run();
