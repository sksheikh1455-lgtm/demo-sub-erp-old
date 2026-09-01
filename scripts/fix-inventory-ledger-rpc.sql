-- Fix for Inventory Valuation Report and get_inventory_ledger RPC

-- 1. Ensure the created_by_id column exists
ALTER TABLE docs_inventory_transactions ADD COLUMN IF NOT EXISTS created_by_id UUID DEFAULT auth.uid();

-- 2. Fixed get_inventory_ledger function
CREATE OR REPLACE FUNCTION get_inventory_ledger(
    p_company_ids TEXT[],
    p_product_ids TEXT[] DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    product_id TEXT,
    product_name TEXT,
    sku TEXT,
    transaction_date DATE,
    transaction_type TEXT,
    reference_id TEXT,
    reference_name TEXT,
    quantity NUMERIC,
    cost_price NUMERIC,
    warehouse_name TEXT,
    responsible_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) 
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        it.product_id,
        p.name AS product_name,
        COALESCE(p.sku, '') AS sku,
        it.date AS transaction_date,
        it.transaction_type,
        it.reference_id,
        COALESCE(it.reference_type, '') AS reference_name,
        it.quantity,
        it.cost_price,
        COALESCE(w.name, 'Default') AS warehouse_name,
        COALESCE(it.created_by_id::text, 'N/A') AS responsible_name,
        it.created_at
    FROM docs_inventory_transactions it
    JOIN docs_products p ON it.product_id = p.id
    LEFT JOIN docs_warehouses w ON it.warehouse_id = w.id
    WHERE it.company_id = ANY(p_company_ids)
      AND (p_product_ids IS NULL OR it.product_id = ANY(p_product_ids))
      AND (p_start_date IS NULL OR it.date >= p_start_date)
      AND (p_end_date IS NULL OR it.date <= p_end_date)
    ORDER BY it.date ASC, it.created_at ASC;
END;
$$ LANGUAGE plpgsql;
