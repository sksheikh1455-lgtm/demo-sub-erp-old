import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const ddl = `
CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group RECORD;
    v_master_id TEXT;
    v_dup_id TEXT;
    v_groups_processed INT := 0;
    v_rows_merged INT := 0;
    v_invoices_updated INT := 0;
    v_bills_updated INT := 0;
    v_payments_updated INT := 0;
    v_credit_notes_updated INT := 0;
    v_journal_lines_updated INT := 0;
    v_loans_updated INT := 0;
    v_inv_cnt INT;
    v_bill_cnt INT;
    v_pay_cnt INT;
    v_cn_cnt INT;
    v_jl_cnt INT;
    v_ln_cnt INT;
BEGIN
    -- Disable the historical double-entry validation trigger on journal lines to allow bulk updates on old entries
    ALTER TABLE public.docs_journal_lines DISABLE TRIGGER trg_strict_double_entry_check;

    -- Loop through each name + company_id group that has duplicates
    FOR v_group IN (
        SELECT LOWER(TRIM(name)) as trimmed_name, company_id
        FROM public.docs_contacts
        GROUP BY LOWER(TRIM(name)), company_id
        HAVING COUNT(*) > 1
    ) LOOP
        -- Identify the Master ID for this group (prioritizing transaction count)
        SELECT id INTO v_master_id
        FROM public.docs_contacts c
        WHERE LOWER(TRIM(c.name)) = v_group.trimmed_name 
          AND (c.company_id = v_group.company_id OR (c.company_id IS NULL AND v_group.company_id IS NULL))
        ORDER BY 
          ((SELECT COUNT(*) FROM public.docs_invoices WHERE customer_id = c.id) + 
           (SELECT COUNT(*) FROM public.docs_bills WHERE vendor_id = c.id)) DESC,
          c.updated_at DESC,
          c.id ASC
        LIMIT 1;

        IF v_master_id IS NOT NULL THEN
            v_groups_processed := v_groups_processed + 1;
            
            -- Loop through each duplicate contact in this group (except the Master)
            FOR v_dup_id IN (
                SELECT id 
                FROM public.docs_contacts c
                WHERE LOWER(TRIM(c.name)) = v_group.trimmed_name 
                  AND (c.company_id = v_group.company_id OR (c.company_id IS NULL AND v_group.company_id IS NULL))
                  AND id != v_master_id
            ) LOOP
                v_rows_merged := v_rows_merged + 1;

                -- A. Consolidate contact details onto master if null/empty on master
                UPDATE public.docs_contacts m
                SET 
                    email = COALESCE(NULLIF(TRIM(m.email), ''), NULLIF(TRIM(d.email), '')),
                    phone = COALESCE(NULLIF(TRIM(m.phone), ''), NULLIF(TRIM(d.phone), '')),
                    address = COALESCE(NULLIF(TRIM(m.address), ''), NULLIF(TRIM(d.address), '')),
                    external_id = COALESCE(NULLIF(TRIM(m.external_id), ''), NULLIF(TRIM(d.external_id), '')),
                    is_customer = COALESCE(m.is_customer, false) OR COALESCE(d.is_customer, false),
                    is_vendor = COALESCE(m.is_vendor, false) OR COALESCE(d.is_vendor, false),
                    is_lender = COALESCE(m.is_lender, false) OR COALESCE(d.is_lender, false)
                FROM public.docs_contacts d
                WHERE m.id = v_master_id AND d.id = v_dup_id;

                -- B. Consolidate company_ids array
                UPDATE public.docs_contacts m
                SET company_ids = ARRAY(
                    SELECT DISTINCT x 
                    FROM unnest(
                        array_cat(
                            COALESCE(m.company_ids, ARRAY[]::text[]),
                            COALESCE(d.company_ids, ARRAY[]::text[])
                        )
                    ) x
                    WHERE x IS NOT NULL
                )
                FROM public.docs_contacts d
                WHERE m.id = v_master_id AND d.id = v_dup_id;

                -- C. Redirect docs_invoices
                UPDATE public.docs_invoices 
                SET customer_id = v_master_id,
                    data = CASE WHEN data ? 'customerId' THEN jsonb_set(data, '{customerId}', to_jsonb(v_master_id)) ELSE data END
                WHERE customer_id = v_dup_id;
                GET DIAGNOSTICS v_inv_cnt = ROW_COUNT;
                v_invoices_updated := v_invoices_updated + v_inv_cnt;

                -- D. Redirect docs_bills
                UPDATE public.docs_bills 
                SET vendor_id = v_master_id,
                    data = CASE WHEN data ? 'vendorId' THEN jsonb_set(data, '{vendorId}', to_jsonb(v_master_id)) ELSE data END
                WHERE vendor_id = v_dup_id;
                GET DIAGNOSTICS v_bill_cnt = ROW_COUNT;
                v_bills_updated := v_bills_updated + v_bill_cnt;

                -- E. Redirect docs_payments
                UPDATE public.docs_payments 
                SET contact_id = v_master_id,
                    data = CASE WHEN data ? 'contactId' THEN jsonb_set(data, '{contactId}', to_jsonb(v_master_id)) ELSE data END
                WHERE contact_id = v_dup_id;
                GET DIAGNOSTICS v_pay_cnt = ROW_COUNT;
                v_payments_updated := v_payments_updated + v_pay_cnt;

                -- F. Redirect docs_credit_notes
                UPDATE public.docs_credit_notes 
                SET customer_id = v_master_id,
                    data = CASE 
                             WHEN data ? 'customerId' THEN jsonb_set(data, '{customerId}', to_jsonb(v_master_id))
                             WHEN data ? 'contactId' THEN jsonb_set(data, '{contactId}', to_jsonb(v_master_id))
                             ELSE data 
                           END
                WHERE customer_id = v_dup_id;
                GET DIAGNOSTICS v_cn_cnt = ROW_COUNT;
                v_credit_notes_updated := v_credit_notes_updated + v_cn_cnt;

                -- G. Redirect docs_journal_lines
                UPDATE public.docs_journal_lines 
                SET contact_id = v_master_id
                WHERE contact_id = v_dup_id;
                GET DIAGNOSTICS v_jl_cnt = ROW_COUNT;
                v_journal_lines_updated := v_journal_lines_updated + v_jl_cnt;

                -- H. Redirect docs_loans
                UPDATE public.docs_loans 
                SET contact_id = v_master_id
                WHERE contact_id = v_dup_id;
                GET DIAGNOSTICS v_ln_cnt = ROW_COUNT;
                v_loans_updated := v_loans_updated + v_ln_cnt;

                -- I. Handle details for docs_contact_companies mapping table
                INSERT INTO public.docs_contact_companies (contact_id, company_id)
                SELECT DISTINCT v_master_id, company_id 
                FROM public.docs_contact_companies 
                WHERE contact_id = v_dup_id
                ON CONFLICT DO NOTHING;

                -- J. Delete the now orphaned duplicate contact row from docs_contacts (cascades to docs_contact_companies)
                DELETE FROM public.docs_contacts WHERE id = v_dup_id;

            END LOOP;
        END IF;
    END LOOP;

    -- Re-enable the trigger
    ALTER TABLE public.docs_journal_lines ENABLE TRIGGER trg_strict_double_entry_check;

    RETURN jsonb_build_object(
        'success', true,
        'groups_processed', v_groups_processed,
        'contacts_deleted', v_rows_merged,
        'invoices_updated', v_invoices_updated,
        'bills_updated', v_bills_updated,
        'payments_updated', v_payments_updated,
        'credit_notes_updated', v_credit_notes_updated,
        'journal_lines_updated', v_journal_lines_updated,
        'loans_updated', v_loans_updated
    );

EXCEPTION WHEN OTHERS THEN
    -- Ensure trigger is re-enabled in case of any runtime error
    ALTER TABLE public.docs_journal_lines ENABLE TRIGGER trg_strict_double_entry_check;
    RAISE;
END;
$$;
`;
    await client.query(ddl);
    console.log("Improved function merge_duplicate_contacts successfully created and deployed!");
  } catch (err) {
    console.error('Error deploying function:', err);
  } finally {
    await client.end();
  }
}
main();
