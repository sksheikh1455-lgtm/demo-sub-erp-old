-- Add get_stock_valuation RPC
CREATE OR REPLACE FUNCTION get_stock_valuation(p_company_id TEXT)
RETURNS TABLE (
    company_id TEXT,
    product_id TEXT,
    product_name TEXT,
    sku TEXT,
    unit_cost NUMERIC,
    on_hand_qty NUMERIC,
    total_value NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.company_id,
        p.id as product_id,
        p.name as product_name,
        COALESCE(p.sku, '') as sku,
        COALESCE(p.cost_price, (p.data->>'costPrice')::NUMERIC, 0) as unit_cost,
        COALESCE((p.data->>'quantityOnHand')::NUMERIC, 0) as on_hand_qty,
        (COALESCE(p.cost_price, (p.data->>'costPrice')::NUMERIC, 0) * COALESCE((p.data->>'quantityOnHand')::NUMERIC, 0)) as total_value
    FROM docs_products p
    WHERE p_company_id IS NULL OR p.company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
