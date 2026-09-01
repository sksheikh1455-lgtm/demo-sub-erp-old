
        DECLARE
          v_val TEXT;
        BEGIN
          IF NEW.data IS NOT NULL THEN
            -- Sync Company ID
            IF (NEW.data ? 'companyId') THEN
              v_val := COALESCE(NEW.data->>'companyId', NEW.data->'companyIds'->>0);
              IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
            ELSIF (NEW.data ? 'companyIds') THEN
              v_val := NEW.data->'companyIds'->>0;
              IF v_val IS NOT NULL THEN NEW.company_id := v_val; END IF;
            END IF;

            -- Sync Status
            BEGIN
               IF TG_OP = 'UPDATE' THEN
                  IF NEW.status IS DISTINCT FROM OLD.status THEN
                     NEW.data := jsonb_set(NEW.data, '{status}', to_jsonb(NEW.status));
                  ELSIF NEW.data->>'status' IS DISTINCT FROM OLD.data->>'status' THEN
                     NEW.status := NEW.data->>'status';
                  ELSE
                     IF (NEW.data ? 'status') THEN NEW.status := NEW.data->>'status'; END IF;
                  END IF;
               ELSE
                  IF NEW.status IS NOT NULL THEN
                     NEW.data := jsonb_set(NEW.data, '{status}', to_jsonb(NEW.status));
                  ELSIF (NEW.data ? 'status') THEN
                     NEW.status := NEW.data->>'status';
                  END IF;
               END IF;
            EXCEPTION WHEN undefined_column THEN END;

            -- Sync Date
            BEGIN
               IF (NEW.data ? 'date') THEN NEW.date := NULLIF(NEW.data->>'date', '')::DATE; 
               ELSIF (NEW.data ? 'createdAt') THEN NEW.date := NULLIF(NEW.data->>'createdAt', '')::DATE;
               END IF;
               
               -- Specific Dates based on table
               IF TG_TABLE_NAME = 'docs_payments' THEN
                 IF (NEW.data ? 'date') THEN NEW.payment_date := NULLIF(NEW.data->>'date', '')::DATE;
                 ELSIF (NEW.data ? 'paymentDate') THEN NEW.payment_date := NULLIF(NEW.data->>'paymentDate', '')::DATE;
                 ELSIF (NEW.data ? 'createdAt') THEN NEW.payment_date := NULLIF(NEW.data->>'createdAt', '')::DATE;
                 ELSE NEW.payment_date := CURRENT_DATE;
                 END IF;
               ELSIF TG_TABLE_NAME = 'docs_invoices' THEN
                 IF NEW.date IS NOT NULL THEN NEW.invoice_date := NEW.date;
                 ELSIF (NEW.data ? 'invoiceDate') THEN NEW.invoice_date := NULLIF(NEW.data->>'invoiceDate', '')::DATE;
                 ELSE NEW.invoice_date := CURRENT_DATE;
                 END IF;
               ELSIF TG_TABLE_NAME = 'docs_bills' THEN
                 IF NEW.date IS NOT NULL THEN NEW.bill_date := NEW.date;
                 ELSIF (NEW.data ? 'billDate') THEN NEW.bill_date := NULLIF(NEW.data->>'billDate', '')::DATE;
                 ELSE NEW.bill_date := CURRENT_DATE;
                 END IF;
               ELSIF TG_TABLE_NAME = 'docs_journals' THEN
                 IF NEW.date IS NOT NULL THEN NEW.journal_date := NEW.date;
                 ELSIF (NEW.data ? 'journalDate') THEN NEW.journal_date := NULLIF(NEW.data->>'journalDate', '')::DATE;
                 ELSE NEW.journal_date := CURRENT_DATE;
                 END IF;
               END IF;
            EXCEPTION WHEN undefined_column THEN END;

            -- Sync Totals/Amounts
            BEGIN
               IF (NEW.data ? 'total') THEN NEW.total := NULLIF(NEW.data->>'total', '')::NUMERIC; 
               ELSIF (NEW.data ? 'amount') THEN NEW.amount := NULLIF(NEW.data->>'amount', '')::NUMERIC;
               END IF;
            EXCEPTION WHEN undefined_column THEN END;

            -- Sync Partner/Contact ID
            BEGIN
               IF TG_TABLE_NAME = 'docs_invoices' THEN
                 v_val := COALESCE(NULLIF(NEW.data->>'customerId',''), NULLIF(NEW.data->>'contactId',''));
                 IF v_val IS NOT NULL THEN NEW.customer_id := v_val; END IF;
               ELSIF TG_TABLE_NAME = 'docs_bills' THEN
                 v_val := COALESCE(NULLIF(NEW.data->>'vendorId',''), NULLIF(NEW.data->>'contactId',''));
                 IF v_val IS NOT NULL THEN NEW.vendor_id := v_val; END IF;
               ELSIF TG_TABLE_NAME = 'docs_payments' THEN
                 v_val := COALESCE(NULLIF(NEW.data->>'contactId',''), NULLIF(NEW.data->>'customerId',''), NULLIF(NEW.data->>'vendorId',''));
                 IF v_val IS NOT NULL THEN NEW.contact_id := v_val; END IF;
               ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN
                 v_val := COALESCE(NULLIF(NEW.data->>'customerId',''), NULLIF(NEW.data->>'contactId',''));
                 IF v_val IS NOT NULL THEN NEW.customer_id := v_val; END IF;
               ELSE
                 IF (NEW.data ? 'contactId') THEN NEW.contact_id := NULLIF(NEW.data->>'contactId', '');
                 ELSIF (NEW.data ? 'customerId') THEN NEW.contact_id := NULLIF(NEW.data->>'customerId', '');
                 ELSIF (NEW.data ? 'vendorId') THEN NEW.contact_id := NULLIF(NEW.data->>'vendorId', '');
                 END IF;
               END IF;
            EXCEPTION WHEN undefined_column THEN END;

            -- Sync Journal ID (for cross-referencing)
            BEGIN
               IF (NEW.data ? 'journalEntryId') THEN NEW.journal_id := NULLIF(NEW.data->>'journalEntryId', ''); END IF;
            EXCEPTION WHEN undefined_column THEN END;

            -- Sync Product specific flat columns
            BEGIN
               IF TG_TABLE_NAME = 'docs_products' THEN
                 IF (NEW.data ? 'name') THEN NEW.name := NULLIF(NEW.data->>'name', ''); END IF;
                 IF (NEW.data ? 'sku') THEN NEW.sku := NULLIF(NEW.data->>'sku', ''); END IF;
                 IF (NEW.data ? 'price') THEN NEW.price := NULLIF(NEW.data->>'price', '')::NUMERIC; END IF;
                 IF (NEW.data ? 'costPrice') THEN NEW.cost_price := NULLIF(NEW.data->>'costPrice', '')::NUMERIC; END IF;
               ELSIF TG_TABLE_NAME = 'docs_contacts' THEN
                 IF (NEW.data ? 'name') THEN NEW.name := NULLIF(NEW.data->>'name', ''); END IF;
                 IF (NEW.data ? 'type') THEN NEW.type := NULLIF(NEW.data->>'type', ''); END IF;
               ELSIF TG_TABLE_NAME = 'docs_payments' THEN
                 IF (NEW.data ? 'type') THEN NEW.type := NULLIF(NEW.data->>'type', ''); END IF;
               END IF;
            EXCEPTION WHEN undefined_column THEN END;

          END IF;
          RETURN NEW;
        END;
