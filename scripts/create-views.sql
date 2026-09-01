-- Run this in your Supabase SQL Editor to create beautiful Views.
-- These views will automatically "unpack" your JSON data from erp_state
-- so you can view products, contacts, invoices, etc., as if they were regular SQL tables!

-- 1. Products View
CREATE OR REPLACE VIEW products AS
SELECT 
  p->>'id' AS id,
  p->>'name' AS name,
  p->>'sku' AS sku,
  (p->>'price')::numeric AS price,
  (p->>'costPrice')::numeric AS cost_price,
  p->>'category' AS category,
  p->>'type' AS type,
  p->>'trackInventory' AS track_inventory
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'allProducts') = 'array' THEN data->'allProducts' ELSE '[]'::jsonb END) AS p;

-- 2. Contacts (Customers & Vendors) View
CREATE OR REPLACE VIEW contacts AS
SELECT 
  c->>'id' AS id,
  c->>'name' AS name,
  c->>'email' AS email,
  c->>'phone' AS phone,
  c->>'type' AS type,
  c->>'address' AS address
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'allContacts') = 'array' THEN data->'allContacts' ELSE '[]'::jsonb END) AS c;

-- 3. Invoices View
CREATE OR REPLACE VIEW invoices AS
SELECT 
  i->>'id' AS id,
  i->>'number' AS number,
  i->>'customerId' AS customer_id,
  i->>'date' AS date,
  i->>'dueDate' AS due_date,
  (i->>'total')::numeric AS total,
  i->>'status' AS status
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'allInvoices') = 'array' THEN data->'allInvoices' ELSE '[]'::jsonb END) AS i;

-- 4. Bills View
CREATE OR REPLACE VIEW bills AS
SELECT 
  b->>'id' AS id,
  b->>'number' AS number,
  b->>'vendorId' AS vendor_id,
  b->>'date' AS date,
  b->>'dueDate' AS due_date,
  (b->>'total')::numeric AS total,
  b->>'status' AS status
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'allBills') = 'array' THEN data->'allBills' ELSE '[]'::jsonb END) AS b;

-- 5. Payments View
CREATE OR REPLACE VIEW payments AS
SELECT 
  p->>'id' AS id,
  p->>'contactId' AS contact_id,
  p->>'date' AS date,
  (p->>'amount')::numeric AS amount,
  p->>'method' AS method,
  p->>'type' AS type,
  p->>'status' AS status
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'allPayments') = 'array' THEN data->'allPayments' ELSE '[]'::jsonb END) AS p;

-- 6. Journal Entries View
CREATE OR REPLACE VIEW journal_entries AS
SELECT 
  j->>'id' AS id,
  j->>'date' AS date,
  j->>'description' AS description,
  j->>'reference' AS reference,
  j->>'status' AS status
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'allEntries') = 'array' THEN data->'allEntries' ELSE '[]'::jsonb END) AS j;

-- 7. Users View
CREATE OR REPLACE VIEW users AS
SELECT 
  u->>'id' AS id,
  u->>'name' AS name,
  u->>'username' AS username,
  u->>'email' AS email,
  u->>'roleId' AS role_id,
  u->>'status' AS status
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'users') = 'array' THEN data->'users' ELSE '[]'::jsonb END) AS u;

-- 8. Companies View
CREATE OR REPLACE VIEW companies AS
SELECT 
  c->>'id' AS id,
  c->>'name' AS name,
  c->>'code' AS code,
  c->>'currency' AS currency,
  c->>'industry' AS industry
FROM erp_state, jsonb_array_elements(CASE WHEN jsonb_typeof(data->'companies') = 'array' THEN data->'companies' ELSE '[]'::jsonb END) AS c;
