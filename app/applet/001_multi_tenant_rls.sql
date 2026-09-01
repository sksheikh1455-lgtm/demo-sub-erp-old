-- 1. Enforce NOT NULL constraints on company_id to prevent orphan records
ALTER TABLE public.docs_invoices ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.docs_payments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.docs_journals ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.docs_journal_lines ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.docs_accounts ALTER COLUMN company_id SET NOT NULL;

-- 2. Enable Row-Level Security (RLS) on all multi-tenant tables
ALTER TABLE public.docs_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_accounts ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies (if any) to avoid conflict
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.docs_invoices;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.docs_payments;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.docs_journals;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.docs_journal_lines;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.docs_accounts;

-- 4. Create Strict Multi-Tenant Policies based on auth.jwt() ->> 'company_id'

-- docs_invoices
CREATE POLICY "tenant_isolation_policy"
ON public.docs_invoices
FOR ALL
USING (company_id = (auth.jwt() ->> 'company_id'))
WITH CHECK (company_id = (auth.jwt() ->> 'company_id'));

-- docs_payments
CREATE POLICY "tenant_isolation_policy"
ON public.docs_payments
FOR ALL
USING (company_id = (auth.jwt() ->> 'company_id'))
WITH CHECK (company_id = (auth.jwt() ->> 'company_id'));

-- docs_journals
CREATE POLICY "tenant_isolation_policy"
ON public.docs_journals
FOR ALL
USING (company_id = (auth.jwt() ->> 'company_id'))
WITH CHECK (company_id = (auth.jwt() ->> 'company_id'));

-- docs_journal_lines
CREATE POLICY "tenant_isolation_policy"
ON public.docs_journal_lines
FOR ALL
USING (company_id = (auth.jwt() ->> 'company_id'))
WITH CHECK (company_id = (auth.jwt() ->> 'company_id'));

-- docs_accounts
CREATE POLICY "tenant_isolation_policy"
ON public.docs_accounts
FOR ALL
USING (company_id = (auth.jwt() ->> 'company_id'))
WITH CHECK (company_id = (auth.jwt() ->> 'company_id'));
