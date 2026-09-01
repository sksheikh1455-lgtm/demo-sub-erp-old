const fs = require('fs');

let sql = fs.readFileSync('current_post_invoice.txt', 'utf8');

const regex1 = /-- Distribute Discount[\s\S]*?(?=v_revenue_net := ROUND\(v_item_subtotal - v_proportional_discount, 2\);)/;

const newLogic1 = `-- Distribute Discount
            v_items := COALESCE(v_invoice.data->'items', '[]'::jsonb);
            v_global_discount := COALESCE((v_invoice.data->>'discount')::numeric, 0);
            v_total_revenue_subtotal := 0;
            v_items_count := 0;
            
            BEGIN
                FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
                    IF v_item->>'type' = 'PRODUCT' OR v_item->>'type' = 'SERVICE' OR v_item->>'type' IS NULL THEN
                        v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                        IF v_item_subtotal = 0 THEN
                            v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                            IF v_item->>'discountMode' = 'FIXED' THEN
                                v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                            ELSE
                                v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0);
                            END IF;
                            v_item_subtotal := ROUND(v_item_subtotal, 2);
                        END IF;
                        IF v_item_subtotal != 0 THEN
                          v_total_revenue_subtotal := v_total_revenue_subtotal + v_item_subtotal;
                          v_items_count := v_items_count + 1;
                        END IF;
                    ELSIF v_item->>'type' = 'DISCOUNT' THEN
                        v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                        IF v_item_subtotal = 0 THEN
                            IF v_item->>'discountMode' = 'FIXED' THEN
                                v_item_subtotal := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                            ELSE
                                v_item_subtotal := -ROUND(v_total_revenue_subtotal * (COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0), 2);
                            END IF;
                        END IF;
                        -- Subtract negative so it becomes a positive global discount amount
                        v_global_discount := v_global_discount - v_item_subtotal;
                    END IF;
                END LOOP;

                FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
                    v_idx := v_idx + 1;

                    IF v_item->>'type' = 'PRODUCT' OR v_item->>'type' = 'SERVICE' OR v_item->>'type' IS NULL THEN
                        
                        v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                        IF v_item_subtotal = 0 THEN
                            v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                            IF v_item->>'discountMode' = 'FIXED' THEN
                                v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                            ELSE
                                v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0);
                            END IF;
                            v_item_subtotal := ROUND(v_item_subtotal, 2);
                        END IF;
                        
                        IF v_item_subtotal != 0 THEN
                           v_current_item_idx := v_current_item_idx + 1;
                           IF v_current_item_idx = v_items_count THEN
                               v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                           ELSE
                               v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_item_subtotal / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                               v_proportional_discount := ROUND(v_proportional_discount, 2);
                               v_discount_distributed := v_discount_distributed + v_proportional_discount;
                           END IF;
                        ELSE
                           v_proportional_discount := 0;
                        END IF;

                        `;

sql = sql.replace(regex1, newLogic1);
fs.writeFileSync('current_post_invoice.txt', sql);
console.log('Replaced.');
