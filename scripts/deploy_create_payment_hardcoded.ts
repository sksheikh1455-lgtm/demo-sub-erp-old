import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:sk445@raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres' });
  await client.connect();
  
  await client.query(`
    CREATE OR REPLACE FUNCTION process_payment(p_payment JSONB)
    RETURNS JSONB AS $$
    DECLARE
        v_company_id TEXT;
        v_payment_id TEXT;
        v_status TEXT;
        v_date DATE;
        v_amount NUMERIC;
        v_type TEXT;
        v_applied_invoices JSONB;
        v_applied_bills JSONB;
        v_account_id TEXT;
        v_partner_account_id TEXT;
        v_reference TEXT;
        v_method TEXT;
    BEGIN
        v_payment_id := p_payment->>'id';
        v_company_id := COALESCE(p_payment->>'companyId', p_payment->>'company_id');
        v_status := p_payment->>'status';
        v_date := (p_payment->>'date')::DATE;
        v_amount := (p_payment->>'amount')::NUMERIC;
        v_type := p_payment->>'type';
        v_applied_invoices := p_payment->'applied_invoices';
        IF v_applied_invoices IS NULL THEN
            v_applied_invoices := p_payment->'appliedInvoices';
        END IF;
        v_applied_bills := p_payment->'applied_bills';
        IF v_applied_bills IS NULL THEN
            v_applied_bills := p_payment->'appliedBills';
        END IF;
        
        v_account_id := COALESCE(p_payment->>'liquidityAccountId', p_payment->>'account_id');
        v_partner_account_id := COALESCE(p_payment->>'partnerAccountId', p_payment->>'partner_account_id');
        v_reference := COALESCE(p_payment->>'reference', p_payment->>'memo');
        v_method := p_payment->>'method';

        -- 1. Insert Payment Header
        INSERT INTO docs_payments (
            id, data, company_id, date, type, status, amount, 
            applied_invoices, applied_bills, account_id, partner_account_id, 
            reference, method, payment_date, payment_number, created_by_id, updated_at
        )
        VALUES (
            v_payment_id, jsonb_set(p_payment, '{status}', COALESCE(to_jsonb(v_status), '"DRAFT"')), v_company_id, v_date, v_type, COALESCE(v_status, 'DRAFT'), v_amount, 
            v_applied_invoices, v_applied_bills, v_account_id, v_partner_account_id, 
            v_reference, v_method, COALESCE(v_date, CURRENT_DATE), p_payment->>'number', p_payment->>'createdById', NOW()
        )
        ON CONFLICT (id) DO UPDATE SET 
            data = EXCLUDED.data,
            company_id = EXCLUDED.company_id,
            date = EXCLUDED.date,
            type = EXCLUDED.type,
            status = EXCLUDED.status,
            amount = EXCLUDED.amount,
            applied_invoices = EXCLUDED.applied_invoices,
            applied_bills = EXCLUDED.applied_bills,
            account_id = EXCLUDED.account_id,
            partner_account_id = EXCLUDED.partner_account_id,
            reference = EXCLUDED.reference,
            method = EXCLUDED.method,
            payment_date = EXCLUDED.payment_date,
            payment_number = EXCLUDED.payment_number,
            updated_at = NOW();

        -- 4. Transition to final status and generate journals
        IF v_status IN ('POSTED', 'CLEARED') THEN
            -- Update docs_payments to posted first
            UPDATE docs_payments SET status = v_status, data = jsonb_set(data, '{status}', to_jsonb(v_status)) WHERE id = v_payment_id;
            PERFORM post_payment(v_payment_id, v_company_id);
        END IF;

        RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);
  
  console.log("Deployed process_payment successfully");
  await client.end();
}
run();
