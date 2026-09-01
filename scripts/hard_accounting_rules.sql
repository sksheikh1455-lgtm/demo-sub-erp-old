
-- Hard Accounting Rules: Database Enforcement of Contact Types

-- 1. Function to validate contact type for Invoices (Must be CUSTOMER)
CREATE OR REPLACE FUNCTION trg_validate_invoice_customer()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_type TEXT;
BEGIN
    -- Get contact type from docs_contacts or from the JSON data if not yet synced
    SELECT type INTO v_contact_type FROM docs_contacts WHERE id = NEW.customer_id;
    
    IF v_contact_type IS NULL THEN
        -- Fallback: check NEW.data in case it's a batch insert not yet in contacts (unlikely but safe)
        v_contact_type := NEW.data->>'customerType'; 
    END IF;

    IF v_contact_type IS NOT NULL AND v_contact_type != 'CUSTOMER' THEN
        RAISE EXCEPTION 'Accounting Violation: Invoice % must be assigned to a CUSTOMER. Selected partner is a %.', 
            NEW.id, v_contact_type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to validate contact type for Bills (Must be VENDOR)
CREATE OR REPLACE FUNCTION trg_validate_bill_vendor()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_type TEXT;
BEGIN
    SELECT type INTO v_contact_type FROM docs_contacts WHERE id = NEW.vendor_id;
    
    IF v_contact_type IS NOT NULL AND v_contact_type != 'VENDOR' THEN
        RAISE EXCEPTION 'Accounting Violation: Bill % must be assigned to a VENDOR. Selected partner is a %.', 
            NEW.id, v_contact_type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Apply triggers
DROP TRIGGER IF EXISTS trg_enforce_invoice_customer ON docs_invoices;
CREATE TRIGGER trg_enforce_invoice_customer
BEFORE INSERT OR UPDATE ON docs_invoices
FOR EACH ROW EXECUTE FUNCTION trg_validate_invoice_customer();

DROP TRIGGER IF EXISTS trg_enforce_bill_vendor ON docs_bills;
CREATE TRIGGER trg_enforce_bill_vendor
BEFORE INSERT OR UPDATE ON docs_bills
FOR EACH ROW EXECUTE FUNCTION trg_validate_bill_vendor();

-- 4. Payment Rules: Receipt must be from CUSTOMER, Payment must be to VENDOR
CREATE OR REPLACE FUNCTION trg_validate_payment_partner()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_type TEXT;
    v_payment_type TEXT; -- 'RECEIPT' or 'PAYMENT'
BEGIN
    SELECT type INTO v_contact_type FROM docs_contacts WHERE id = NEW.contact_id;
    v_payment_type := NEW.data->>'type';

    IF v_payment_type = 'RECEIPT' AND v_contact_type IS NOT NULL AND v_contact_type != 'CUSTOMER' THEN
        RAISE EXCEPTION 'Accounting Violation: Receipt % must be from a CUSTOMER.', NEW.id;
    ELSIF v_payment_type = 'PAYMENT' AND v_contact_type IS NOT NULL AND v_contact_type != 'VENDOR' THEN
        RAISE EXCEPTION 'Accounting Violation: Payment % must be to a VENDOR.', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_payment_partner ON docs_payments;
CREATE TRIGGER trg_enforce_payment_partner
BEFORE INSERT OR UPDATE ON docs_payments
FOR EACH ROW EXECUTE FUNCTION trg_validate_payment_partner();
