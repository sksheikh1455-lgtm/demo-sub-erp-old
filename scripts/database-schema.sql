-- Traditional Relational Database Schema
-- Run this in your Supabase SQL Editor if you wish to migrate to standard tables
-- NOTE: This will require refactoring the entire frontend application to read/write from these tables

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  registration_number TEXT,
  tax_id TEXT,
  currency TEXT DEFAULT 'BDT',
  industry TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  company_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT NOT NULL, -- CUSTOMER, VENDOR, EMPLOYEE
  address TEXT,
  tax_id TEXT,
  assigned_user_id TEXT,
  monthly_fixed_salary NUMERIC,
  company_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  tax_code TEXT,
  description TEXT,
  category TEXT,
  brand TEXT,
  type TEXT DEFAULT 'Goods',
  track_inventory BOOLEAN DEFAULT true,
  company_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  parent_id TEXT,
  company_id TEXT REFERENCES companies(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  customer_id TEXT REFERENCES contacts(id),
  date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_total NUMERIC NOT NULL DEFAULT 0,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  company_id TEXT REFERENCES companies(id),
  created_by_id TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  discount_mode TEXT DEFAULT 'PERCENT'
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  vendor_id TEXT REFERENCES contacts(id),
  date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_total NUMERIC NOT NULL DEFAULT 0,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  company_id TEXT REFERENCES companies(id),
  created_by_id TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT REFERENCES bills(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  discount_mode TEXT DEFAULT 'PERCENT'
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  reference TEXT,
  method TEXT NOT NULL,
  type TEXT NOT NULL, -- RECEIPT or PAYMENT
  status TEXT DEFAULT 'DRAFT',
  company_id TEXT REFERENCES companies(id),
  created_by_id TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  status TEXT DEFAULT 'DRAFT',
  company_id TEXT REFERENCES companies(id),
  created_by_id TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id),
  contact_id TEXT REFERENCES contacts(id),
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  description TEXT
);

-- Note: Several other tables would be needed for Loans, Payroll, Tasks, Adjustments, etc.
