const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'lib/supabase.ts');
if (!fs.existsSync(file)) {
    console.error('File not found', file);
    process.exit(1);
}

let content = fs.readFileSync(file, 'utf8');

// Insert docs_inventory_transactions into normalizedTables
content = content.replace(/'docs_inventory_adjustments',/g, "'docs_inventory_adjustments',\n  'docs_inventory_transactions',");

// Insert docs_inventory_transactions into TABLE_COLUMNS
const t2 = '"docs_attendance": ["id", "updated_at", "company_id", "attendance_date", "status", "employee_id", "late_minutes", "overtime_hours", "is_important_day"],';
const r2 = t2 + '\n  "docs_inventory_transactions": ["id", "company_id", "product_id", "transaction_type", "quantity", "reference_id", "reference_type", "date", "cost_price", "unit_price", "updated_at", "warehouse_id", "created_at", "created_by_id"],';
content = content.replace(t2, r2);

// Add to hasDataCol if not there
// But docs_inventory_transactions does NOT have data column, so we shouldn't add it to hasDataCol!
// Wait! `docs_inventory_transactions` DOES NOT have a data column, which is good.

fs.writeFileSync(file, content);
console.log('Done!');
