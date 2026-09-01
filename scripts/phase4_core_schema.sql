-- Phase 4: Enterprise Hardening Schema
-- 1. Detailed Audit Logging
CREATE TABLE IF NOT EXISTS docs_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'POST', 'VOID', 'REVERSE'
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    before_data JSONB,
    after_data JSONB,
    client_info JSONB, -- { ip, ua, device }
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_company ON docs_audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_record ON docs_audit_logs(table_name, record_id);

-- 2. Financial Period Management
CREATE TABLE IF NOT EXISTS docs_fiscal_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL, -- e.g. 'FY 2024 - Q1'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, name)
);
CREATE INDEX idx_fiscal_company ON docs_fiscal_periods(company_id);

-- 3. System Health & Performance Monitoring
CREATE TABLE IF NOT EXISTS docs_system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level TEXT DEFAULT 'INFO', -- 'DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'
    category TEXT, -- 'DATABASE', 'API', 'AUTH', 'INVENTORY', 'RECONCILIATION'
    message TEXT,
    payload JSONB,
    trace_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_syslog_level ON docs_system_logs(level, created_at DESC);

-- 4. Idempotency & Request Tracing
CREATE TABLE IF NOT EXISTS docs_idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    user_id TEXT,
    response_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

-- 5. Enhanced Journals for Immutability
ALTER TABLE docs_journals ADD COLUMN IF NOT EXISTS is_immutable BOOLEAN DEFAULT false;
ALTER TABLE docs_journals ADD COLUMN IF NOT EXISTS reversal_of_id TEXT;
ALTER TABLE docs_journals ADD COLUMN IF NOT EXISTS reversed_by_id TEXT;
ALTER TABLE docs_journals ADD COLUMN IF NOT EXISTS fiscal_period_id UUID REFERENCES docs_fiscal_periods(id);

-- Add composite indexes for high-volume performance
CREATE INDEX IF NOT EXISTS idx_journal_lines_composite ON docs_journal_lines(account_id, company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON docs_invoices(company_id, (data->>'customerId'), status);
CREATE INDEX IF NOT EXISTS idx_bills_vendor_status ON docs_bills(company_id, (data->>'vendorId'), status);
