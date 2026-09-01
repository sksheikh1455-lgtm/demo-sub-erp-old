-- Create some fetching RPCs to replace frontend logic
CREATE OR REPLACE FUNCTION get_unpaid_invoices(p_customer_id TEXT, p_company_id TEXT)
RETURNS JSONB AS $$
DECLARE
    res JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb) INTO res
    FROM docs_invoices 
    WHERE company_id = p_company_id 
    AND data->>'customerId' = p_customer_id 
    AND status IN ('POSTED', 'PARTIAL', 'SENT', 'IN_PAYMENT');
    RETURN res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_unpaid_bills(p_vendor_id TEXT, p_company_id TEXT)
RETURNS JSONB AS $$
DECLARE
    res JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb) INTO res
    FROM docs_bills 
    WHERE company_id = p_company_id 
    AND (data->>'vendorId' = p_vendor_id OR data->>'supplierId' = p_vendor_id) 
    AND status IN ('POSTED', 'PARTIAL', 'SENT', 'IN_PAYMENT');
    RETURN res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
