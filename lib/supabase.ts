import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using environment variables
const getEnvVar = (name: string) => {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    // @ts-ignore
    return import.meta.env[name];
  }
  return '';
};

const getSupabaseUrl = () => {
  if (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL) {
    return process.env.VITE_SUPABASE_URL;
  }
  try {
    // @ts-ignore
    return import.meta.env.VITE_SUPABASE_URL;
  } catch (e) {
    return '';
  }
};

const getSupabaseKey = () => {
  if (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY) {
    return process.env.VITE_SUPABASE_ANON_KEY;
  }
  try {
    // @ts-ignore
    return import.meta.env.VITE_SUPABASE_ANON_KEY;
  } catch (e) {
    return '';
  }
};

let rawUrl = getSupabaseUrl() || '';
let rawKey = getSupabaseKey() || '';

const FACH_ANON_KEY = 'sb_publishable_Vn4nDHSZHygpGv9hpuZXmQ_qY04jVBu';

if (!rawUrl || rawUrl.includes('buspgzsamhfmjrmmwpmo') || rawUrl.includes('hcsqqkrqfaiyduvbulox')) {
  rawUrl = 'https://fachqxrknmrgekfcldgw.supabase.co';
}
let supabaseUrl = rawUrl;

if (supabaseUrl && !supabaseUrl.startsWith('http') && !supabaseUrl.includes('.')) {
  supabaseUrl = `https://${supabaseUrl}.supabase.co`;
} else if (supabaseUrl && !supabaseUrl.startsWith('http')) {
  supabaseUrl = `https://${supabaseUrl}`;
}

if (!rawKey || 
    rawKey.includes('8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM') || 
    rawKey.includes('hcsqqkrqfaiyduvbulox') || 
    rawKey.includes('QrWJU7') || 
    rawKey.includes('buspgzsamhfmjrmmwpmo') || 
    rawKey.includes('Ic2uUZSJ') ||
    (supabaseUrl.includes('fachqxrknmrgekfcldgw') && !rawKey.startsWith('sb_publishable_Vn4nDHSZHygpGv9hpuZXmQ_qY04jVBu'))
) {
  rawKey = FACH_ANON_KEY;
}
const supabaseKey = rawKey;

console.log('SUPABASE URL BEING USED:', supabaseUrl);






const customFetch = (url, options) => {
  const isServer = typeof window === 'undefined';
  let urlStr = url instanceof URL ? url.href : (url instanceof Request ? url.url : url);
  if (!isServer && typeof urlStr === 'string' && urlStr.startsWith(supabaseUrl)) {
    const relativePath = urlStr.replace(supabaseUrl, '');
    const proxyUrl = '/api/supabase-proxy?path=' + encodeURIComponent(relativePath);
    options = options || {}; options.credentials = "include";
    return fetch(proxyUrl, options).catch(err => {
      console.error('PROXY FETCH FAILED:', proxyUrl, err);
      throw err;
    });
  }
  return fetch(url, options);
};

const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true },
   
});

client.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed successfully');
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event as string === 'USER_DELETED') {
    console.log('User deleted');
  }

  // Intercepting specific auth token related issues if they bubble up or session drops
  if (!session && event === 'SIGNED_OUT') {
    if (typeof localStorage !== 'undefined') {
       let keysToRemove = [];
       for (let i = 0; i < localStorage.length; i++) {
           const key = localStorage.key(i);
           if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
               keysToRemove.push(key);
           }
       }
       keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  }
});

// We can catch Refresh Token Not Found errors by intercepting or handling it where it occurs.

const normalizedTables = [
  'docs_accounts',
  'docs_attendance',
  'docs_bills',
  'docs_bill_lines',
  'docs_brands',
  'docs_categories',
  'docs_companies',
  'docs_contacts',
  'docs_credit_notes',
  'docs_credit_note_lines',
  'docs_invoices',
  'docs_invoice_lines',
  'docs_inventory_transactions',
  'docs_journals',
  'docs_journal_lines',
  'docs_loans',
  'docs_payments',
  'docs_products',
  'docs_roles',
  'docs_users',
  'docs_warehouses'
];

export const TABLE_COLUMNS: Record<string, string[]> = {
  "docs_accounts": ["id", "updated_at", "company_id", "name", "code", "type"],
  "docs_attendance": ["id", "updated_at", "company_id", "attendance_date", "status", "employee_id", "late_minutes", "overtime_hours", "is_important_day"],
  "docs_inventory_transactions": ["id", "company_id", "product_id", "transaction_type", "quantity", "reference_id", "reference_type", "date", "cost_price", "unit_price", "updated_at", "warehouse_id", "created_at", "created_by_id"],
  "docs_bills": ["id", "updated_at", "bill_number", "company_id", "date", "vendor_id", "status", "total", "version", "bill_date", "due_date", "subtotal", "tax_total", "discount_total", "company_code", "created_by_id", "reference", "journal_entry_id"],
  "docs_bill_lines": ["id", "bill_id", "company_id", "product_id", "quantity", "unit_price", "discount", "tax", "total", "description", "updated_at", "type", "line_value", "discount_mode", "discount_rate", "discount_value", "serial_numbers"],
  "docs_brands": ["id", "updated_at", "company_id", "code", "name", "description"],
  "docs_categories": ["id", "updated_at", "company_id", "code", "name", "description"],
  "docs_companies": ["id", "updated_at", "company_id", "code", "name"],
  "docs_contacts": ["id", "updated_at", "company_id", "name", "type", "email", "phone", "address", "external_id", "company_ids", "opening_balances", "is_customer", "is_vendor", "is_lender"],
  "docs_credit_notes": ["id", "updated_at", "credit_note_number", "company_id", "date", "total", "status", "customer_id", "cn_number", "credit_note_date", "due_date", "subtotal", "tax_total", "discount_total", "origin_invoice_id"],
  "docs_credit_note_lines": ["id", "credit_note_id", "company_id", "product_id", "type", "uom", "description", "display_description", "quantity", "unit_price", "line_value", "total", "discount_mode", "discount_rate", "serial_numbers"],
  "docs_invoices": ["id", "updated_at", "invoice_number", "company_id", "date", "customer_id", "status", "total", "version", "invoice_date", "due_date", "subtotal", "tax_total", "discount_total", "company_code", "created_by_id", "sr_id", "reference", "salesperson", "customer_note", "delivery_person", "messages", "journal_entry_id"],
  "docs_invoice_lines": ["id", "invoice_id", "company_id", "product_id", "quantity", "unit_price", "discount", "tax", "total", "description", "updated_at", "type", "uom", "display_description", "line_value", "discount_mode", "discount_rate", "serial_numbers", "cost_price_at_sale"],
  "docs_journals": ["id", "updated_at", "reference_number", "company_id", "date", "journal_type", "status", "created_at", "is_immutable", "reversal_of_id", "reversed_by_id", "fiscal_period_id", "journal_date", "journal_number", "reference", "description", "company_code", "created_by_id", "prepared_by"],
  "docs_journal_lines": ["id", "journal_id", "company_id", "account_id", "contact_id", "debit", "credit", "description", "updated_at", "created_at"],
  "docs_loans": ["id", "updated_at", "company_id", "loan_number", "date", "amount", "status", "name", "type", "notes", "contact_id", "start_date", "term_months", "interest_rate", "interest_type", "principal_amount", "paid_periods", "journal_entry_id", "amortization_schedule", "data"],
  "docs_payments": ["id", "updated_at", "payment_number", "company_id", "date", "contact_id", "status", "amount", "payment_date", "type", "method", "account_id", "partner_account_id", "reference", "applied_invoices", "applied_bills"],
  "docs_products": ["id", "updated_at", "company_id", "name", "sku", "price", "cost_price", "is_locked", "last_reconciled_at", "uom", "type", "brand", "tax_code", "category", "external_id", "description", "tracking_type", "invoicing_policy", "initial_cost", "last_purchase_rate", "last_purchase_price", "quantity_on_hand", "is_in_pos", "can_be_sold", "can_be_purchased", "can_be_expensed", "track_inventory", "company_ids", "serial_numbers"],
  "docs_roles": ["id", "updated_at", "company_id", "name", "color", "is_system", "description", "permissions"],
  "docs_users": ["id", "updated_at", "company_id", "user_uuid", "pin", "name", "email", "username", "role_id", "status", "email_confirmed", "invitation_token", "company_ids"],
  "docs_warehouses": ["id", "updated_at", "company_id", "code", "name", "is_default"]
};

function mapPayload(table: string, item: any) {
  if (!item) return item;
  const originalData = item.data && typeof item.data === 'object' ? item.data : item;
  const cleanData = { ...originalData };
  delete cleanData.data;

  // Remove any snake_case properties from the JSON blob to avoid conflicts
  for (const k of Object.keys(cleanData)) {
    if (k.includes('_')) {
      delete cleanData[k];
    }
  }

  let merged = { ...item };
  if (item.data && typeof item.data === 'object') {
    merged = { ...merged, ...item.data };
    delete merged.data;
  }
  const mapped: any = {};
  for (const [key, val] of Object.entries(merged)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    mapped[snakeKey] = val;
  }
  
  // Table specific overrides
  const getNumber = () => {
    if (item.number !== undefined) return item.number;
    if (item.data && typeof item.data === 'object' && item.data.number !== undefined) return item.data.number;
    return undefined;
  };

  const numVal = getNumber();

  if (table === 'docs_invoices') {
    if (numVal !== undefined) {
      mapped.invoice_number = numVal || null;
    }
  } else if (table === 'docs_bills') {
    if (numVal !== undefined) {
      mapped.bill_number = numVal || null;
    }
  } else if (table === 'docs_payments') {
    if (numVal !== undefined) {
      mapped.payment_number = numVal || null;
    }
  } else if (table === 'docs_credit_notes') {
    if (numVal !== undefined) {
      mapped.credit_note_number = numVal || null;
      mapped.cn_number = numVal || null;
    }
  } else if (table === 'docs_loans') {
    if (numVal !== undefined) {
      mapped.loan_number = numVal || null;
    }
  } else if (table === 'docs_journals') {
    const getRef = () => {
      if (item.reference !== undefined) return item.reference;
      if (item.data && typeof item.data === 'object' && item.data.reference !== undefined) return item.data.reference;
      return undefined;
    };
    const refVal = getRef();
    if (refVal !== undefined) {
      mapped.reference = refVal;
    }
  }
  
  delete mapped.data;
  
  // Clean empty strings from numeric fields in cleanData
  const numericKeys = ['price', 'costPrice', 'initialCost', 'quantity', 'quantityOnHand', 'lastPurchasePrice', 'lastPurchaseRate', 'amount', 'total', 'subtotal'];
  for (const key of numericKeys) {
    if (cleanData[key] === "") {
      cleanData[key] = null;
    } else if (typeof cleanData[key] === 'string' && !isNaN(Number(cleanData[key])) && cleanData[key].trim() !== "") {
      cleanData[key] = Number(cleanData[key]);
    }
  }
  
  mapped.data = cleanData;

  // Whitelist filtering to guarantee DB schema safety
  const allowedColumns = TABLE_COLUMNS[table];
  if (allowedColumns) {
    const hasDataCol = ['docs_commission_targets', 'docs_leaves', 'docs_tasks', 'docs_holidays', 'docs_brands', 'docs_advance_salaries', 'docs_accounts', 'docs_contacts', 'docs_bills', 'docs_journals', 'docs_payments', 'docs_inventory_adjustments', 'docs_payslips', 'docs_categories', 'docs_credit_notes', 'docs_invoices', 'docs_products', 'docs_loans'].includes(table);
    const columnsWithData = hasDataCol ? (allowedColumns.includes('data') ? allowedColumns : [...allowedColumns, 'data']) : allowedColumns.filter(c => c !== 'data');
    const filtered: any = {};
    const nonTextCols = [
      'date', 'invoice_date', 'due_date', 'bill_date', 'created_at', 'updated_at', 
      'payment_date', 'credit_note_date', 'journal_date', 'start_date', 'attendance_date',
      'total', 'subtotal', 'tax_total', 'discount_total', 'amount', 'line_value', 
      'discount_value', 'discount_rate', 'quantity', 'unit_price', 'discount', 'tax', 
      'debit', 'credit', 'late_minutes', 'overtime_hours', 'term_months', 'interest_rate', 
      'principal_amount', 'paid_periods', 'price', 'cost_price', 'initial_cost', 
      'last_purchase_rate', 'last_purchase_price', 'quantity_on_hand', 'version',
      'cost_price_at_sale',
      'is_default', 'is_locked', 'is_immutable', 'track_inventory', 'is_in_pos', 
      'can_be_sold', 'can_be_purchased', 'can_be_expensed', 'is_important_day', 'last_reconciled_at'
    ];
    for (const col of columnsWithData) {
      if (mapped[col] !== undefined) {
        let val = mapped[col];
        if (val === "" && (nonTextCols.includes(col) || col.endsWith('_date') || col.endsWith('_at'))) {
          val = null;
        }
        if ((val === null || val === "") && (col === 'invoice_date' || col === 'bill_date' || col === 'credit_note_date')) {
          val = mapped['date'] || new Date().toISOString().split('T')[0];
        }
        filtered[col] = val;
      } else {
        if (col === 'invoice_date' || col === 'bill_date' || col === 'credit_note_date') {
          filtered[col] = mapped['date'] || new Date().toISOString().split('T')[0];
        }
      }
    }
    return filtered;
  }

  return mapped;
}

function mapResponseRow(table: string, row: any) {
  if (!row) return row;
  const camelRow: any = {};
  for (const [key, val] of Object.entries(row)) {
    const camelKey = key.replace(/([-_][a-z])/g, group =>
      group.toUpperCase().replace('-', '').replace('_', '')
    );
    camelRow[camelKey] = val;
  }
  
  if (table === 'docs_invoices') {
    camelRow.number = row.invoice_number;
  } else if (table === 'docs_bills') {
    camelRow.number = row.bill_number;
  } else if (table === 'docs_payments') {
    camelRow.number = row.payment_number;
  } else if (table === 'docs_credit_notes') {
    camelRow.number = row.credit_note_number || row.cn_number;
  } else if (table === 'docs_loans') {
    camelRow.number = row.loan_number;
  }
  
  const originalJsonBlob = row.data && typeof row.data === 'object' ? row.data : {};
  const cleanedJsonBlob: any = {};
  for (const [k, v] of Object.entries(originalJsonBlob)) {
    if (!k.includes('_')) {
      cleanedJsonBlob[k] = v;
    }
  }
  
  return {
    ...cleanedJsonBlob,
    ...row,
    ...camelRow,
    data: {
      ...cleanedJsonBlob,
      ...camelRow
    }
  };
}

function wrapBuilder(builder: any, table: string): any {
  if (!builder) return builder;
  if (builder.__isWrapped) return builder;

  const originalInsert = builder.insert;
  if (originalInsert) {
    builder.insert = function (values: any, options: any) {
      if (normalizedTables.includes(table)) {
        if (Array.isArray(values)) {
          values = values.map(v => mapPayload(table, v));
        } else {
          values = mapPayload(table, values);
        }
      }
      return wrapBuilder(originalInsert.call(builder, values, options), table);
    };
  }

  const originalUpsert = builder.upsert;
  if (originalUpsert) {
    builder.upsert = function (values: any, options: any) {
      if (normalizedTables.includes(table)) {
        if (Array.isArray(values)) {
          values = values.map(v => mapPayload(table, v));
        } else {
          values = mapPayload(table, values);
        }
      }
      return wrapBuilder(originalUpsert.call(builder, values, options), table);
    };
  }

  const originalUpdate = builder.update;
  if (originalUpdate) {
    builder.update = function (values: any, options: any) {
      if (normalizedTables.includes(table)) {
        values = mapPayload(table, values);
      }
      console.log('SUPABASE UPDATE INTERCEPT:', { table, values, options });
      return wrapBuilder(originalUpdate.call(builder, values, options), table);
    };
  }

  const originalSelect = builder.select;
  if (originalSelect) {
    builder.select = function (columns: any, options: any) {
      if (normalizedTables.includes(table) && typeof columns === 'string') {
        const hasDataCol = ['docs_commission_targets', 'docs_leaves', 'docs_tasks', 'docs_holidays', 'docs_brands', 'docs_advance_salaries', 'docs_accounts', 'docs_contacts', 'docs_bills', 'docs_journals', 'docs_payments', 'docs_inventory_adjustments', 'docs_payslips', 'docs_categories', 'docs_credit_notes', 'docs_invoices', 'docs_products', 'docs_loans'].includes(table);
        let parts = columns.split(',').map((p: any) => p.trim());
        if (!hasDataCol) {
          parts = parts.filter((p: any) => p !== 'data');
        }
        if (parts.length === 0) {
          columns = '*';
        } else {
          columns = parts.join(', ');
        }
      }
      return wrapBuilder(originalSelect.call(builder, columns, options), table);
    };
  }

  const originalThen = builder.then;
  if (originalThen) {
    builder.then = function (onfulfilled: any, onrejected: any) {
      return originalThen.call(builder, (res: any) => {
        if (res && res.data) {
          if (normalizedTables.includes(table)) {
            if (Array.isArray(res.data)) {
              res.data = res.data.map(row => mapResponseRow(table, row));
            } else {
              res.data = mapResponseRow(table, res.data);
            }
          }
        }
        return onfulfilled ? onfulfilled(res) : res;
      }, onrejected);
    };
  }

  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === '__isWrapped') return true;
      if (prop === 'insert') return builder.insert;
      if (prop === 'upsert') return builder.upsert;
      if (prop === 'update') return builder.update;
      if (prop === 'select') return builder.select;
      if (prop === 'then') return builder.then;

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return function (...args: any[]) {
          const res = value.apply(target, args);
          if (res === target) {
             return receiver;
          }
          if (res && res !== target && res.select && typeof res.then === 'function' && !res.__isWrapped) {
            return wrapBuilder(res, table);
          }
          return res;
        };
      }
      return value;
    }
  });
}

const originalFrom = client.from;
client.from = function (table: string) {
  const queryBuilder = originalFrom.call(client, table);
  return wrapBuilder(queryBuilder, table);
};

export const supabase = client;
