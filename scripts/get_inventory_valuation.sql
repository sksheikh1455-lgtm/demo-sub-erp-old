CREATE OR REPLACE FUNCTION public.get_inventory_valuation(
  p_company_ids TEXT[],
  p_warehouse_id TEXT DEFAULT 'all'
)
RETURNS TABLE (
  total_items BIGINT,
  total_on_hand NUMERIC,
  total_asset_value NUMERIC,
  total_retail_value NUMERIC
) AS $$
DECLARE
  v_count BIGINT := 0;
  v_on_hand NUMERIC := 0;
  v_asset_val NUMERIC := 0;
  v_retail_val NUMERIC := 0;
BEGIN
  IF p_warehouse_id = 'all' OR p_warehouse_id IS NULL OR p_warehouse_id = '' THEN
    -- Calculate globally across all warehouses for the active companies
    SELECT 
      COALESCE(COUNT(p.id), 0),
      COALESCE(SUM(COALESCE(p.quantity_on_hand, 0)), 0),
      COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0)), 0),
      COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.price, 0)), 0)
    INTO 
      v_count, v_on_hand, v_asset_val, v_retail_val
    FROM public.docs_products p
    WHERE p.company_id::text = ANY(p_company_ids);
  ELSE
    -- Calculate specifically for the given warehouse using docs_product_costs for quantity and cost
    -- docs_product_costs contains product_id, warehouse_id, total_qty, avg_cost
    BEGIN
      SELECT 
        COALESCE(COUNT(DISTINCT p.id), 0),
        COALESCE(SUM(COALESCE(pc.total_qty, 0)), 0),
        COALESCE(SUM(COALESCE(pc.total_qty, 0) * COALESCE(pc.avg_cost, p.cost_price, 0)), 0),
        COALESCE(SUM(COALESCE(pc.total_qty, 0) * COALESCE(p.price, 0)), 0)
      INTO 
        v_count, v_on_hand, v_asset_val, v_retail_val
      FROM public.docs_products p
      LEFT JOIN public.docs_product_costs pc ON pc.product_id = p.id AND pc.warehouse_id::text = p_warehouse_id
      WHERE p.company_id::text = ANY(p_company_ids);
    EXCEPTION WHEN OTHERS THEN
      -- Fallback if comparison or anything fails (just use global)
      SELECT 
        COALESCE(COUNT(p.id), 0),
        COALESCE(SUM(COALESCE(p.quantity_on_hand, 0)), 0),
        COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.cost_price, 0)), 0),
        COALESCE(SUM(COALESCE(p.quantity_on_hand, 0) * COALESCE(p.price, 0)), 0)
      INTO 
        v_count, v_on_hand, v_asset_val, v_retail_val
      FROM public.docs_products p
      WHERE p.company_id::text = ANY(p_company_ids);
    END;
  END IF;

  RETURN QUERY SELECT v_count, v_on_hand, v_asset_val, v_retail_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
