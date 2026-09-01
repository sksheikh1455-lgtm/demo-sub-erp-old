-- Function to process partner discount
CREATE OR REPLACE FUNCTION process_partner_discount(
    p_contact_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_description TEXT,
    p_company_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_contact RECORD;
    v_is_vendor BOOLEAN;
    v_is_customer BOOLEAN;
    v_primary_account_id UUID;
    v_discount_account_id UUID;
    v_journal_id UUID;
    v_journal_num TEXT;
    v_system_user_id UUID;
BEGIN
    -- 1. Get contact details
    SELECT * INTO v_contact FROM docs_contacts WHERE id = p_contact_id AND company_id = p_company_id;
    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found for the given company';
    END IF;

    -- Infer type from jsonb data if contact_type is missing or to double check
    v_is_vendor := (v_contact.data->>'type' = 'VENDOR');
    v_is_customer := (v_contact.data->>'type' = 'CUSTOMER');

    IF NOT v_is_vendor AND NOT v_is_customer THEN
        RAISE EXCEPTION 'Contact is neither a vendor nor a customer';
    END IF;

    -- 2. Resolve accounts
    IF v_is_vendor THEN
        -- Vendor Discount (Received/Earned)
        -- Debit: Accounts Payable
        -- Credit: Discount Received
        SELECT id INTO v_primary_account_id FROM docs_accounts 
        WHERE company_id = p_company_id 
        AND (code IN ('200101', '2100') OR data->>'subType' = 'ACCOUNTS_PAYABLE') 
        LIMIT 1;

        SELECT id INTO v_discount_account_id FROM docs_accounts 
        WHERE company_id = p_company_id 
        AND (code IN ('400400', '400401') OR LOWER(name) LIKE '%earned%' OR LOWER(name) LIKE '%discount received%') 
        LIMIT 1;

        IF v_discount_account_id IS NULL THEN
            v_discount_account_id := gen_random_uuid();
            INSERT INTO docs_accounts (id, company_id, name, type, code, data, created_at, updated_at)
            VALUES (v_discount_account_id, p_company_id, 'Discount Received', 'OTHER_REVENUE', '400400', 
                    jsonb_build_object('name', 'Discount Received', 'type', 'OTHER_REVENUE', 'code', '400400', 'description', 'Discounts received from vendors'),
                    NOW(), NOW());
        END IF;
    ELSE
        -- Customer Discount (Given/Allowed)
        -- Debit: Discount Given
        -- Credit: Accounts Receivable
        SELECT id INTO v_primary_account_id FROM docs_accounts 
        WHERE company_id = p_company_id 
        AND (code IN ('100201', '1200') OR data->>'subType' = 'ACCOUNTS_RECEIVABLE') 
        LIMIT 1;

        SELECT id INTO v_discount_account_id FROM docs_accounts 
        WHERE company_id = p_company_id 
        AND (code IN ('400300', '601100') OR LOWER(name) LIKE '%discount given%' OR LOWER(name) LIKE '%discount allowed%') 
        LIMIT 1;

        IF v_discount_account_id IS NULL THEN
            v_discount_account_id := gen_random_uuid();
            INSERT INTO docs_accounts (id, company_id, name, type, code, data, created_at, updated_at)
            VALUES (v_discount_account_id, p_company_id, 'Discount Given', 'REVENUE', '400300', 
                    jsonb_build_object('name', 'Discount Given', 'type', 'REVENUE', 'code', '400300', 'description', 'Discounts given to customers'),
                    NOW(), NOW());
        END IF;
    END IF;

    IF v_primary_account_id IS NULL THEN
        RAISE EXCEPTION 'Primary account (A/R or A/P) not found for company';
    END IF;

    -- 3. Generate journal number
    v_journal_num := generate_next_number('JOURNAL', p_company_id);
    
    -- Try to get system user
    SELECT id INTO v_system_user_id FROM auth_users LIMIT 1;

    -- 4. Create Journal Entry
    v_journal_id := gen_random_uuid();
    INSERT INTO docs_journals (
        id, company_id, reference_number, date, status, data, created_at, updated_at
    ) VALUES (
        v_journal_id, p_company_id, v_journal_num, p_date, 'POSTED',
        jsonb_build_object(
            'description', COALESCE(p_description, CASE WHEN v_is_vendor THEN 'Purchase' ELSE 'Sales' END || ' Discount - ' || (v_contact.data->>'name')),
            'journalType', CASE WHEN v_is_vendor THEN 'PURCHASE_DISCOUNT' ELSE 'SALES_DISCOUNT' END
        ),
        NOW(), NOW()
    );

    -- 5. Create Journal Lines
    -- Line 1: Primary Account (AR/AP)
    INSERT INTO docs_journal_lines (
        id, journal_id, company_id, account_id, contact_id, debit, credit, data, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_journal_id, p_company_id, v_primary_account_id, p_contact_id,
        CASE WHEN v_is_vendor THEN p_amount ELSE 0 END,
        CASE WHEN v_is_customer THEN p_amount ELSE 0 END,
        jsonb_build_object('description', CASE WHEN v_is_vendor THEN 'A/P' ELSE 'A/R' END || ' Adjustment for Discount'),
        NOW(), NOW()
    );

    -- Line 2: Discount Account
    INSERT INTO docs_journal_lines (
        id, journal_id, company_id, account_id, contact_id, debit, credit, data, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_journal_id, p_company_id, v_discount_account_id, p_contact_id,
        CASE WHEN v_is_customer THEN p_amount ELSE 0 END,
        CASE WHEN v_is_vendor THEN p_amount ELSE 0 END,
        jsonb_build_object('description', CASE WHEN v_is_vendor THEN 'Discount Received' ELSE 'Discount Allowed' END || ' - ' || (v_contact.data->>'name')),
        NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;
