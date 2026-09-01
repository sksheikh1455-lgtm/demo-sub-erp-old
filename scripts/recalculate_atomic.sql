-- Recalculate and update quantity_on_hand and JSON balances for ALL products atomically
WITH calculated_stock AS (
    SELECT 
        product_id,
        jsonb_object_agg(company_id, COALESCE(total_qty, 0)) AS stock_levels,
        SUM(COALESCE(total_qty, 0)) AS total_qoh
    FROM (
        SELECT 
            product_id, 
            company_id, 
            SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END)::numeric AS total_qty
        FROM docs_inventory_transactions
        GROUP BY product_id, company_id
    ) sub
    GROUP BY product_id
)
UPDATE docs_products p
SET 
    quantity_on_hand = COALESCE(cs.total_qoh, 0),
    data = jsonb_set(
        jsonb_set(
            COALESCE(p.data, '{}'::jsonb),
            '{stockLevels}',
            COALESCE(cs.stock_levels, '{}'::jsonb)
        ),
        '{quantityOnHand}',
        to_jsonb(COALESCE(cs.total_qoh, 0))
    ),
    updated_at = NOW()
FROM calculated_stock cs
WHERE p.id = cs.product_id;
