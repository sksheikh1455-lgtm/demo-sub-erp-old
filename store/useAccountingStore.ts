import { get, set } from 'idb-keyval';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { reportingService } from '../services/reportingService';
import { dbService, mapDatabaseRowToFrontend } from '../services/db';
import { useAccountingStoreBase } from './index';
import { 
  Account, JournalEntry, Invoice, AccountType, JournalLine, 
  Product, Company, User, UserRole, UserStatus, Contact, 
  ContactType, Payment, RoleDefinition, PermissionKey, Bill, CreditNote,
  InvoiceItem,
  Loan, AmortizationEntry, InterestType, Message, Task, TaskStatus, TaskPriority,
  InventoryAdjustment, SalaryComponentType, SalaryComponent, AttendanceRecord, LeaveRecord, Payslip, CommissionTarget, AdvanceSalary, Holiday,
  Warehouse, ProductCost
} from '../types';
import {INITIAL_ACCOUNTS, formatDateTime, getOpDateBST} from '../constants';

const fetchCacheMap = new Map<string, { isFetching: boolean; lastFetched: number }>();
const generalLedgerPromiseCache = new Map<string, Promise<any>>();

const clearFetchCache = (prefix?: string) => {
  if (prefix) {
    for (const key of fetchCacheMap.keys()) {
      if (key.startsWith(prefix)) {
        fetchCacheMap.delete(key);
      }
    }
  } else {
    fetchCacheMap.clear();
  }
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const calculateAmortization = (principal: number, annualRate: number, months: number, startDate: any, type: InterestType = 'REDUCING'): AmortizationEntry[] => {
  const monthlyRate = (annualRate / 100) / 12;
  const schedule: AmortizationEntry[] = [];
  
  // ALWAYS USE TODAY'S DATE FOR FIRST PAYMENT
  let start = new Date();
  
  const monthsCount = isNaN(months) || months <= 0 ? 1 : months;
  let balance = principal;

  if (type === 'REDUCING') {
    let monthlyPayment = 0;
    if (monthlyRate > 0) {
      monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, monthsCount)) / (Math.pow(1 + monthlyRate, monthsCount) - 1);
    } else {
      monthlyPayment = principal / monthsCount;
    }

    for (let i = 1; i <= monthsCount; i++) {
      const interest = balance * monthlyRate;
      const principalPaid = monthlyPayment - interest;
      balance -= principalPaid;
      
      const date = new Date(start);
      date.setMonth(start.getMonth() + (i - 1));

      let dateStr = '';
      try {
        dateStr = date.toISOString().split('T')[0];
      } catch (e) {
        dateStr = new Date().toISOString().split('T')[0];
      }

      schedule.push({
        period: i,
        date: dateStr,
        payment: monthlyPayment,
        principal: principalPaid,
        interest: interest,
        balance: Math.max(0, balance),
        status: 'PENDING',
        interestPaid: false,
        principalPaid: false
      });
    }
  } else {
    // Flat Rate (FIXED)
    const totalInterest = principal * (annualRate / 100) * (monthsCount / 12);
    const monthlyInterest = totalInterest / monthsCount;
    const monthlyPrincipal = principal / monthsCount;
    const monthlyPayment = monthlyInterest + monthlyPrincipal;

    for (let i = 1; i <= monthsCount; i++) {
      balance -= monthlyPrincipal;
      const date = new Date(start);
      date.setMonth(start.getMonth() + (i - 1));

      let dateStr = '';
      try {
        dateStr = date.toISOString().split('T')[0];
      } catch (e) {
        dateStr = new Date().toISOString().split('T')[0];
      }

      schedule.push({
        period: i,
        date: dateStr,
        payment: monthlyPayment,
        principal: monthlyPrincipal,
        interest: monthlyInterest,
        balance: Math.max(0, balance),
        status: 'PENDING',
        interestPaid: false,
        principalPaid: false
      });
    }
  }
  return schedule;
};

// --- HELPER FOR RETRIES ---
const withRetry = async <T = any>(
  fn: () => PromiseLike<T> | Promise<T>,
  maxAttempts = 3,
  delay = 500
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await fn();
      // If result is a Supabase response with an error, throw it so we retry
      if (result && typeof result === 'object' && (result as any).error) {
        const error = (result as any).error;
        // Only retry on network-like or server errors
        const isRetryable = error.message?.includes('fetch') || 
                           error.message?.includes('Load failed') ||
                           error.status === 429 || 
                           error.status >= 500 ||
                           error.code === '42703';
        
        if (isRetryable) {
          throw error;
        }
        return result as T;
      }
      return result as T;
    } catch (err: any) {
      lastError = err;
      if (err?.message?.includes('Failed to fetch') || err?.message?.includes('Load failed') || (err?.status && err.status >= 500)) {
         if (i < maxAttempts - 1) {
            const backoff = delay * Math.pow(2, i);
            console.warn(`Database attempt ${i + 1} failed, retrying in ${backoff}ms...`, err.message || err);
            await new Promise(r => setTimeout(r, backoff));
            continue;
         }
      }
      throw err;
    }
  }
  throw lastError;
};

// --- HELPER FOR REAL-TIME DOC SYNC ---
function getChanges<T extends { id: string }>(prev: T[], next: T[]) {
  const prevMap = new Map(prev.map(i => [i.id, i]));
  const nextMap = new Map(next.map(i => [i.id, i]));
  const upserts: T[] = [];
  const deletes: string[] = [];
  
  for (const item of next) {
    const old = prevMap.get(item.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
      upserts.push(item);
    }
  }
  for (const item of prev) {
    if (!nextMap.has(item.id)) deletes.push(item.id);
  }
  return { upserts, deletes };
}





const syncDocChanges = async (table: string, upserts: any[], deletes: string[]) => {
  try {
    if (upserts.length > 0) {
      // Chunk upserts to avoid payload size limits
      const CHUNK_SIZE = 500;
      for (let i = 0; i < upserts.length; i += CHUNK_SIZE) {
        const chunk = upserts.slice(i, i + CHUNK_SIZE);
        const payload = chunk.map(u => {
          let cid = u?.companyId || (u?.companyIds && u?.companyIds[0]);
          if (!cid && typeof u.id === 'string' && u.id.startsWith('comp-')) {
            cid = u.id;
          }
          
          const row: any = { 
            id: u.id, 
            data: u, 
            company_id: cid,
            updated_at: new Date().toISOString() 
          };

          // Auto-map relational columns if they exist in u
          if (table === 'docs_invoices') {
            row.date = u.date;
            row.customer_id = u.customerId;
            row.status = u.status;
            row.total = u.total;
            row.invoice_number = u.number || null;
            row.sr_id = u.srId;
          } else if (table === 'docs_bills') {
            row.date = u.date;
            row.vendor_id = u.vendorId || u.supplierId;
            row.status = u.status;
            row.total = u.total;
            row.bill_number = u.number || null;
          } else if (table === 'docs_journals') {
            row.date = u.date;
            row.journal_type = u.journalType || 'JOURNAL';
            row.status = u.status;
            row.reference_number = u.reference || null;
          } else if (table === 'docs_payments') {
            row.date = u.date;
            row.payment_number = u.number || null;
            row.total = u.amount;
          } else if (table === 'docs_loans') {
            row.loan_number = u.number || null;
            row.status = u.status;
          } else if (table === 'docs_credit_notes') {
            row.credit_note_number = u.number || null;
            row.status = u.status;
            row.total = u.total;
          } else if (table === 'docs_products') {
            row.name = u.name;
            row.sku = u.sku;
            row.price = u.price;
            row.cost_price = u.costPrice;
          } else if (table === 'docs_contacts') {
            row.name = u.name;
            row.type = u.type;
            row.sr_id = u.srId;
          } else if (table === 'docs_accounts') {
            row.name = u.name;
            row.code = u.code;
          }

          return row;
        });
        const { error } = await withRetry(() => supabase.from(table).upsert(payload));
        if (error) {
           console.error(`Supabase Upsert Error for ${table} (chunk ${i/CHUNK_SIZE}):`, error.message, error.details);
        }
      }
    }
    if (deletes.length > 0) {
      const validDeletes = deletes.filter(isValidUUID);
      if (validDeletes.length > 0) {
        const { error } = await supabase.from(table).delete().in('id', validDeletes);
        if (error) {
           console.error(`Supabase Delete Error for ${table}:`, error.message, error.details);
        }
      }
    }
  } catch (err) {
    console.error(`Failed to sync changes to ${table}:`, err);
  }
};

const SYSTEM_ROLES: RoleDefinition[] = [
  {
    id: 'role-admin',
    name: 'Administrator',
    description: 'Full access to all modules and system settings.',
    isSystem: true,
    color: 'bg-slate-900',
    permissions: [
      'invoice_view', 'invoice_create', 'invoice_edit', 'invoice_void', 'invoice_delete',
      'credit_note_view', 'credit_note_create', 'credit_note_edit', 'credit_note_void',
      'customer_view', 'customer_create', 'customer_edit', 'customer_delete',
      'bill_view', 'bill_create', 'bill_edit', 'bill_void', 'bill_delete',
      'expense_view', 'expense_create', 'expense_edit', 'expense_delete',
      'vendor_view', 'vendor_create', 'vendor_edit', 'vendor_delete',
      'payment_view', 'payment_create', 'payment_edit', 'payment_delete', 'payment_post',
      'bank_reconcile', 'bank_statement_import',
      'loan_view', 'loan_create', 'loan_edit', 'loan_delete', 'loan_payment_record',
      'inventory_view', 'inventory_edit', 'inventory_delete', 'inventory_valuation_view',
      'product_view', 'product_create', 'product_edit', 'product_delete',
      'category_manage', 'brand_manage',
      'inventory_adjustment_view', 'inventory_adjustment_create', 'inventory_adjustment_edit',
      'ledger_view', 'ledger_post', 'ledger_edit', 'ledger_reverse',
      'journal_view', 'journal_create', 'journal_edit', 'journal_void',
      'chart_of_accounts_manage', 'opening_balance_edit',
      'report_financial', 'report_tax', 'report_audit', 'report_sales', 'report_purchase', 'report_inventory',
      'employee_view', 'employee_create', 'employee_edit', 'employee_delete',
      'payroll_view', 'payroll_process', 'payroll_settings',
      'attendance_view', 'attendance_manage', 'leave_manage',
      'team_manage', 'role_manage', 'settings_manage', 'data_import', 'data_export', 'company_setup', 'audit_log_view',
      'integration_quickbooks', 'integration_xero', 'integration_api', 'integration_webhooks'
    ]
  },
  {
    id: 'role-accountant',
    name: 'Senior Accountant',
    description: 'Full transaction access. Includes sensitive financial reporting but excludes system administration.',
    isSystem: true,
    color: 'bg-indigo-600',
    permissions: [
      'invoice_view', 'invoice_create', 'invoice_edit', 'invoice_void', 'credit_note_view', 'credit_note_create',
      'customer_view', 'customer_create', 'customer_edit',
      'bill_view', 'bill_create', 'bill_edit', 'bill_void',
      'expense_view', 'expense_create', 'expense_edit',
      'vendor_view', 'vendor_create', 'vendor_edit',
      'payment_view', 'payment_create', 'payment_edit', 'payment_post',
      'bank_reconcile',
      'loan_view', 'loan_payment_record',
      'inventory_view', 'inventory_valuation_view',
      'product_view', 'product_create', 'product_edit',
      'category_manage', 'brand_manage',
      'ledger_view', 'ledger_post', 'ledger_edit',
      'journal_view', 'journal_create', 'journal_edit',
      'chart_of_accounts_manage',
      'report_financial', 'report_tax', 'report_sales', 'report_purchase', 'report_inventory'
    ]
  },
  {
    id: 'role-auditor',
    name: 'Compliance Auditor',
    description: 'Read-only access to all financial records and audit logs for verification purposes.',
    isSystem: true,
    color: 'bg-emerald-700',
    permissions: [
      'invoice_view', 'credit_note_view', 'customer_view',
      'bill_view', 'expense_view', 'vendor_view',
      'payment_view', 'loan_view',
      'inventory_view', 'inventory_valuation_view', 'product_view',
      'ledger_view', 'journal_view', 'report_financial', 'report_tax', 'report_audit', 'report_sales', 'report_purchase', 'report_inventory',
      'inventory_adjustment_view', 'employee_view', 'attendance_view', 'audit_log_view'
    ]
  },
  {
    id: 'role-hr-manager',
    name: 'HR & Payroll Manager',
    description: 'Specialized access for team management, attendance, and payroll processing.',
    isSystem: true,
    color: 'bg-rose-600',
    permissions: [
      'employee_view', 'employee_create', 'employee_edit', 'employee_delete',
      'payroll_view', 'payroll_process', 'payroll_settings',
      'attendance_view', 'attendance_manage', 'leave_manage',
      'team_manage', 'report_financial'
    ]
  },
  {
    id: 'role-inventory-manager',
    name: 'Stock Controller',
    description: 'Full control over inventory, products, and warehouse adjustments.',
    isSystem: true,
    color: 'bg-amber-600',
    permissions: [
      'inventory_view', 'inventory_edit', 'inventory_delete', 'inventory_valuation_view',
      'product_view', 'product_create', 'product_edit', 'product_delete',
      'category_manage', 'brand_manage',
      'inventory_adjustment_view', 'inventory_adjustment_create', 'inventory_adjustment_edit',
      'report_inventory'
    ]
  },
  {
    id: 'role-sales-executive',
    name: 'Sales Executive',
    description: 'Customer-facing role with access to invoicing, quotes, and customer contacts.',
    isSystem: true,
    color: 'bg-sky-600',
    permissions: [
      'invoice_view', 'invoice_create', 'invoice_edit', 'invoice_void',
      'credit_note_view', 'credit_note_create', 'credit_note_edit',
      'customer_view', 'customer_create', 'customer_edit',
      'payment_view', 'payment_create',
      'report_sales', 'product_view'
    ]
  },
  {
    id: 'role-integration-manager',
    name: 'Integration Manager',
    description: 'Manages third-party APIs, webhooks, Quickbooks and Xero synchronization.',
    isSystem: true,
    color: 'bg-purple-600',
    permissions: [
      'integration_quickbooks', 'integration_xero', 'integration_api', 'integration_webhooks',
      'report_financial', 'report_sales', 'invoice_view', 'bill_view', 'customer_view', 'vendor_view'
    ]
  }
];

const DEFAULT_USERS: User[] = [
  { 
    id: 'user-1', 
    name: 'Anisur Rahman', 
    username: 'anis',
    email: 'anis@ledgermaster.bd', 
    pin: '1234',
    roleId: 'role-admin', 
    status: UserStatus.ACTIVE, 
    companyIds: [],
    lastActive: 'Just now'
  },
  { 
    id: 'user-admin-raihan', 
    name: 'Raihan Sheikh', 
    username: 'raihan',
    email: 'raihansheikh145@gmail.com', 
    pin: '4321',
    roleId: 'role-admin', 
    status: UserStatus.ACTIVE, 
    companyIds: [],
    lastActive: 'Just now'
  },
  { 
    id: 'user-inventory', 
    name: 'Inventory Manager', 
    username: 'inventory',
    email: 'stock@suborno.bd', 
    pin: '1111',
    roleId: 'role-inventory-manager', 
    status: UserStatus.ACTIVE, 
    companyIds: [],
    lastActive: 'Just now'
  },
  { 
    id: 'user-sales', 
    name: 'Sales Rep', 
    username: 'sales',
    email: 'sales@suborno.bd', 
    pin: '2222',
    roleId: 'role-sales-executive', 
    status: UserStatus.ACTIVE, 
    companyIds: [],
    lastActive: '2h ago'
  }
];

let subscriptionCounter = 0;

const isValidUUID = (id: string) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
};

    const generateDraftRef = (baseId: string) => {
      const parts = baseId.split('-');
      const ts = parts[1] || generateUUID();
      const rand = parts[2] || generateUUID();
      return `DRAFT-${ts}-${rand}`;
    };
export const useAccountingStore = () => {
  const isBootingRef = useRef(true);
  const lastFetchedCompanyIdsRef = useRef<string[]>([]);
  const searchTimeoutRef = useRef<any>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const useDocumentState = <T extends { id: string }>(initial: T[] | (() => T[]), table: string) => {
    const [state, setState] = useState<T[]>(initial);
    const prevRef = useRef<T[]>(state);
    const isRemoteUpdateRef = useRef(false);

    const queueRef = useRef<{ upserts: Map<string, any>; deletes: Set<string> } | null>(null);
    if (!queueRef.current) {
      queueRef.current = {
        upserts: new Map(),
        deletes: new Set()
      };
    }
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const flushQueue = useCallback(() => {
      if (!queueRef.current) return;
      const { upserts, deletes } = queueRef.current;
      if (upserts.size === 0 && deletes.size === 0) return;

      const upsertMap = new Map(upserts);
      const deleteSet = new Set(deletes);
      upserts.clear();
      deletes.clear();

      isRemoteUpdateRef.current = true;
      setState(prev => {
        let hasChanges = false;
        
        // 1. Handle deletes
        let filtered = prev;
        if (deleteSet.size > 0) {
          filtered = prev.filter(item => {
            if (deleteSet.has(item.id)) {
              hasChanges = true;
              return false;
            }
            return true;
          });
        }

        // 2. Handle upserts
        if (upsertMap.size > 0) {
          const remainingUpserts = new Map(upsertMap);
          
          const mapped = filtered.map(item => {
            if (remainingUpserts.has(item.id)) {
              hasChanges = true;
              const newDoc = remainingUpserts.get(item.id)!;
              remainingUpserts.delete(item.id);
              
              const existing = item as any;
              return {
                ...existing,
                ...(newDoc as any),
                items: (newDoc as any).items && (newDoc as any).items.length > 0 
                   ? (newDoc as any).items 
                   : (existing.items || []),
                lines: (newDoc as any).lines && (newDoc as any).lines.length > 0 
                   ? (newDoc as any).lines 
                   : (existing.lines || []),
                appliedInvoices: ((newDoc as any).appliedInvoices && (newDoc as any).appliedInvoices.length > 0)
                   ? (newDoc as any).appliedInvoices
                   : ((newDoc as any).applied_invoices && (newDoc as any).applied_invoices.length > 0)
                   ? (newDoc as any).applied_invoices
                   : (existing.appliedInvoices || existing.applied_invoices || []),
                appliedBills: ((newDoc as any).appliedBills && (newDoc as any).appliedBills.length > 0)
                   ? (newDoc as any).appliedBills
                   : ((newDoc as any).applied_bills && (newDoc as any).applied_bills.length > 0)
                   ? (newDoc as any).applied_bills
                   : (existing.appliedBills || existing.applied_bills || [])
              } as T;
            }
            return item;
          });

          if (remainingUpserts.size > 0) {
            hasChanges = true;
            const newDocs = Array.from(remainingUpserts.values());
            return [...mapped, ...newDocs];
          }
          return hasChanges ? mapped : prev;
        }

        return hasChanges ? filtered : prev;
      });
    }, []);

    useEffect(() => {
      if (!isBootingRef.current && state !== prevRef.current && !isRemoteUpdateRef.current) {
        const { upserts, deletes } = getChanges(prevRef.current, state);
        if (upserts.length > 0 || deletes.length > 0) {
          // Phase 3: Bulk hydration syncDocChanges removed completely
        }
      }
      prevRef.current = state;
      isRemoteUpdateRef.current = false;
    }, [state, table]);

    const subId = useMemo(() => generateUUID(), []);

    // Realtime Listener
    useEffect(() => {
       if (!sessionChecked) return;

       let channel: ReturnType<typeof supabase.channel> | null = null;
       const isCore = ['docs_invoices', 'docs_payments', 'docs_journals', 'docs_bills'].includes(table);
       
       // Fix for 100% CPU: Complete disable of all Realtime channels for now
       return;
       
       const delay = Math.random() * 2000; // spread out core connects
       
       const timer = setTimeout(() => {
         const channelName = `realtime-${table}-${subId}`;
         channel = supabase.channel(channelName);
         
         // Only add the listener and subscribe if not already joined or if it's new
         // supabase-js handles channel deduplication by name, but we must be careful with .on after .subscribe
         
         channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
               const row = payload.new;
               const { data: jsonBlob, company_id, ...rest } = row;
               
               // Convert database snake_case keys to camelCase for the frontend State
               const camelKeys: any = {};
               for (const [key, val] of Object.entries(rest)) {
                 const camelKey = key.replace(/([-_][a-z])/g, group =>
                   group.toUpperCase().replace('-', '').replace('_', '')
                 );
                 camelKeys[camelKey] = val;
               }

               const mappedNumber = rest.invoice_number || rest.bill_number || rest.payment_number || rest.credit_note_number || rest.cn_number || rest.loan_number;
               
               const newDoc = { 
                  ...(jsonBlob || {}), 
                  ...rest, 
                  ...camelKeys, 
                  ...(mappedNumber ? { number: mappedNumber } : {}),
                  ...(rest.reference_number ? { reference: rest.reference_number } : {}),
                  ...(rest.journal_type ? { journalType: rest.journal_type } : {}),
                  ...(rest.cost_price !== undefined ? { costPrice: Number(rest.cost_price) } : {}),
                  ...(rest.price !== undefined ? { price: Number(rest.price) } : {}),
                  ...(rest.created_at ? { createdAt: rest.created_at } : {}),
                  ...(rest.updated_at ? { updatedAt: rest.updated_at } : {}),
                  ...(rest.sub_type !== undefined ? { subType: rest.sub_type } : {}),
                  ...(rest.applied_invoices ? { appliedInvoices: rest.applied_invoices } : {}),
                  ...(rest.applied_bills ? { appliedBills: rest.applied_bills } : {}),
                   id: row.id, 
                   companyId: company_id 
                } as T;

               if (queueRef.current) {
                 queueRef.current.upserts.set(newDoc.id, newDoc);
                 queueRef.current.deletes.delete(newDoc.id);
               }

               if (!timeoutRef.current) {
                 timeoutRef.current = setTimeout(() => {
                   timeoutRef.current = null;
                   flushQueue();
                 }, 150);
               }
            } else if (payload.eventType === 'DELETE') {
               const docId = payload.old.id;
               if (queueRef.current) {
                 queueRef.current.deletes.add(docId);
                 queueRef.current.upserts.delete(docId);
               }

               if (!timeoutRef.current) {
                 timeoutRef.current = setTimeout(() => {
                   timeoutRef.current = null;
                   flushQueue();
                 }, 150);
               }
            }
         });

       // We use a small delay or check to ensure we don't redundantly subscribe
       // In a multi-component environment, this still might fire twice, but .on is now before .subscribe
       channel.subscribe((status: string) => {
         if (status === 'SUBSCRIBED') {
           console.log(`[Realtime] Subscribed to ${table} ${isCore ? '(Core)' : '(Delayed start)'}`);
         }
       });
       }, delay);
       
       return () => {
         clearTimeout(timer);
         if (timeoutRef.current) {
           clearTimeout(timeoutRef.current);
           timeoutRef.current = null;
         }
         if (channel) {
           supabase.removeChannel(channel);
         }
       };
    }, [table, flushQueue, subId, sessionChecked]);

    const setLocalOnlyState = useCallback((updater: React.SetStateAction<T[]>) => {
      isRemoteUpdateRef.current = true;
      setState(updater);
    }, []);

    return [state, setState, setLocalOnlyState] as const;
  };

  // Multi-tenant migration: Companies move to individual document table
  const [companies, setCompanies, setLocalOnlyCompanies] = useDocumentState<Company>([], 'docs_companies');
  const activeCompanyIds = useAccountingStoreBase(state => state.activeCompanyIds);
  const setActiveCompanyIds = useCallback((ids: string[] | ((prev: string[]) => string[])) => {
    const nextIds = typeof ids === 'function' ? ids(useAccountingStoreBase.getState().activeCompanyIds) : ids;
    useAccountingStoreBase.setState({ activeCompanyIds: nextIds });
  }, []);

  // Synchronize companies into central Zustand slice whenever they flow in
  useEffect(() => {
    useAccountingStoreBase.setState({ companies });
  }, [companies]);
  
  const [allAccounts, setAllAccounts, setLocalOnlyAccounts] = useDocumentState<Account>([], 'docs_accounts');
  const accountsRef = useRef<Account[]>(allAccounts);
  useEffect(() => { accountsRef.current = allAccounts; }, [allAccounts]);
  

  const [allEntries, setAllEntries, setLocalOnlyEntries] = useDocumentState<JournalEntry>([], 'docs_journals');
  const entriesRef = useRef<JournalEntry[]>([]);
  useEffect(() => { entriesRef.current = allEntries || []; }, [allEntries]);
  const [paginatedEntries, setPaginatedEntries] = useState<JournalEntry[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);

  const fetchEntries = useCallback(async (options: any) => {
    const cacheKey = 'fetchEntries_' + JSON.stringify(activeCompanyIds) + '_' + JSON.stringify(options);
    const isForce = options?.forceRefresh;
    const cache = fetchCacheMap.get(cacheKey);
    const now = Date.now();
    if (!isForce && cache) {
      if (cache.isFetching) return;
      if (now - cache.lastFetched < 5 * 60 * 1000) return;
    }
    fetchCacheMap.set(cacheKey, { isFetching: true, lastFetched: cache ? cache.lastFetched : 0 });

    setIsEntriesLoading(true);
    try {
      
      const { data, count } = await dbService.getPaginatedDocs('docs_journals', {
        ...options,
        companyIds: activeCompanyIds,
      });
      setPaginatedEntries(data);
      setEntryCount(count);
    } catch (err) {
      console.error('fetchEntries failed:', err);
    } finally {
      fetchCacheMap.set(cacheKey, { isFetching: false, lastFetched: Date.now() });
      setIsEntriesLoading(false);
    }
  }, [activeCompanyIds]);
  const [allJournalLines, setAllJournalLines, setLocalOnlyLines] = useDocumentState<JournalLine>([], 'docs_journal_lines');
  const [accountBalances, setAccountBalances] = useState<Record<string, number>>({});
  const [partnerBalances, setPartnerBalances] = useState<Record<string, number>>({});

  const refreshBalances = useCallback(async () => {
    if (activeCompanyIds.length === 0) return;
    try {
      
      const [accBals, partBals] = await Promise.all([
        dbService.getAccountBalances(activeCompanyIds),
        dbService.getPartnerBalances(activeCompanyIds)
      ]);
      setAccountBalances(accBals);
      setPartnerBalances(partBals);
    } catch (err) {
      console.error('refreshBalances failed:', err);
    }
  }, [activeCompanyIds]);

  useEffect(() => {
    if (sessionChecked) {
      refreshBalances();
    }
  }, [refreshBalances, sessionChecked]);
  const [allInvoices, setAllInvoices, setLocalOnlyInvoices] = useDocumentState<Invoice>([], 'docs_invoices');
  const [paginatedInvoices, setPaginatedInvoices] = useState<Invoice[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [isInvoicesLoading, setIsInvoicesLoading] = useState(false);

  const [allBills, setAllBills, setLocalOnlyBills] = useDocumentState<Bill>([], 'docs_bills');
  const [paginatedBills, setPaginatedBills] = useState<Bill[]>([]);
  const [billCount, setBillCount] = useState(0);
  const [isBillsLoading, setIsBillsLoading] = useState(false);

  // Multi-tenant isolation: Ensure activeCompanyIds only contains valid companies
  useEffect(() => {
    if (companies.length > 0 && activeCompanyIds.length > 0) {
      const validIds = companies.map(c => c.id);
      const filtered = activeCompanyIds.filter(id => validIds.includes(id));
      if (filtered.length !== activeCompanyIds.length) {
        console.log('[Store] Filtering out invalid company IDs from active set');
        setActiveCompanyIds(filtered);
      }
    }
  }, [companies, activeCompanyIds]);

  const getGeneralLedger = useCallback(async (companyId: string | null, accountId: string, startDate: string, endDate: string) => {
    const cacheKey = `${companyId}-${accountId}-${startDate}-${endDate}`;
    if (generalLedgerPromiseCache.has(cacheKey)) {
      return generalLedgerPromiseCache.get(cacheKey);
    }
    
    const promise = reportingService.getGeneralLedger(companyId, accountId, startDate, endDate);
    generalLedgerPromiseCache.set(cacheKey, promise);
    try {
      const res = await promise;
      setTimeout(() => generalLedgerPromiseCache.delete(cacheKey), 2000);
      return res;
    } catch (e) {
      generalLedgerPromiseCache.delete(cacheKey);
      throw e;
    }
  }, []);

  const getGeneralLedgerByCode = useCallback(async (companyIds: string[], accountCode: string, startDate: string, endDate: string) => {
    
    const { data: accounts, error: accError } = await supabase
      .from('docs_accounts')
      .select('id, company_id')
      .eq('code', accountCode)
      .in('company_id', companyIds);
    
    if (accError || !accounts || accounts.length === 0) {
      return [];
    }

    const allResults = await Promise.all(accounts.map(acc => 
      getGeneralLedger(acc.company_id, acc.id, startDate, endDate)
    ));

    const flattened = allResults.flat().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    return flattened.map(tx => {
      runningBalance += (tx.debit - tx.credit);
      return { ...tx, running_balance: runningBalance };
    });
  }, [getGeneralLedger]);

  // Real-time synchronization back/to paginated arrays so lists refresh reactively on database updates
  useEffect(() => {
    if (!allBills || allBills.length === 0) return;
    setPaginatedBills(prev => prev.map(pb => {
      const updated = allBills.find(b => b.id === pb.id);
      return updated ? updated : pb;
    }));
  }, [allBills]);

  useEffect(() => {
    if (!allInvoices || allInvoices.length === 0) return;
    setPaginatedInvoices(prev => prev.map(pi => {
      const updated = allInvoices.find(inv => inv.id === pi.id);
      return updated ? updated : pi;
    }));
  }, [allInvoices]);

  const [allCreditNotes, setAllCreditNotes, setLocalOnlyCreditNotes] = useDocumentState<CreditNote>([], 'docs_credit_notes');
  const [allProducts, setAllProducts, setLocalOnlyProducts] = useDocumentState<Product>([], 'docs_products');
  const productsRef = useRef<Product[]>([]);
  useEffect(() => { productsRef.current = allProducts || []; }, [allProducts]);
  const [paginatedProducts, setPaginatedProducts] = useState<Product[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [isProductsLoading, setIsProductsLoading] = useState(false);

  const fetchProducts = useCallback(async (options: any) => {
    const cacheKey = 'fetchProducts_' + JSON.stringify(activeCompanyIds) + '_' + JSON.stringify(options);
    const isForce = options?.forceRefresh;
    const cache = fetchCacheMap.get(cacheKey);
    const now = Date.now();
    if (!isForce && cache) {
      if (cache.isFetching) return;
      if (now - cache.lastFetched < 5 * 60 * 1000) return;
    }
    fetchCacheMap.set(cacheKey, { isFetching: true, lastFetched: cache ? cache.lastFetched : 0 });

    setIsProductsLoading(true);
    try {
      
      const { data, count } = await dbService.getPaginatedDocs('docs_products', {
        ...options,
        companyIds: activeCompanyIds,
        countType: 'exact',
      });
      setPaginatedProducts(data);
      setProductCount(count);
      setTotalProductsCount(count);

      if (data && data.length > 0) {
        setAllProducts(prev => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const existingIds = new Set(prevArr.map(p => p.id));
          const newItems = data.filter((p: any) => p && !existingIds.has(p.id));
          if (newItems.length === 0) return prevArr;
          return [...prevArr, ...newItems];
        });
      }
    } catch (err) {
      console.error('fetchProducts failed:', err);
    } finally {
      fetchCacheMap.set(cacheKey, { isFetching: false, lastFetched: Date.now() });
      setIsProductsLoading(false);
    }
  }, [activeCompanyIds]);

  const fetchProductsOnDemand = useCallback(async (force = false) => {
    const cacheKey = 'fetchProductsOnDemand_' + JSON.stringify(activeCompanyIds);
    const isForce = force;
    const cache = fetchCacheMap.get(cacheKey);
    const now = Date.now();
    if (!isForce && cache) {
      if (cache.isFetching) return;
      if (now - cache.lastFetched < 5 * 60 * 1000) return;
    }
    fetchCacheMap.set(cacheKey, { isFetching: true, lastFetched: cache ? cache.lastFetched : 0 });

    const activeCids = activeCompanyIds && activeCompanyIds.length > 0 
      ? activeCompanyIds 
      : (companies && companies.length > 0 ? [companies[0].id] : []);
    
    if (activeCids.length === 0) return;

    if (!force) {
      // Find if we already have some loaded products for these companies
      const productsForActiveCids = (allProducts || []).filter(p => {
        if (!p) return false;
        const pCompanyIds = Array.isArray(p?.companyIds) ? p?.companyIds : [];
        if (pCompanyIds.length > 0) {
            return pCompanyIds.some((id: any) => activeCids.includes(id));
        }
        if (p?.companyId) {
          return activeCids.includes(p?.companyId);
        }
        return true;
      });
      if (productsForActiveCids.length > 0) {
        console.log("[Store] Products already loaded for these companies, skipping on-demand fetch.");
        return;
      }
    }

    setIsProductsLoading(true);
    try {
      
      console.log("[Store] Fetching products on-demand for companies:", activeCids);
      const { data } = await dbService.getPaginatedDocs('docs_products', {
        companyIds: activeCids,
        limit: 5000,
      });
      if (data && data.length > 0) {
        setAllProducts(prev => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const prodMap = new Map(prevArr.map(p => [p.id, p]));
          data.forEach(p => {
            if (p) prodMap.set(p.id, p);
          });
          return Array.from(prodMap.values());
        });
      }
    } catch (err) {
      console.error("[Store] fetchProductsOnDemand failed:", err);
    } finally {
      fetchCacheMap.set(cacheKey, { isFetching: false, lastFetched: Date.now() });
      setIsProductsLoading(false);
    }
  }, [activeCompanyIds, companies, setAllProducts]);

  const searchProductsOnDemand = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) return;
    const activeCids = activeCompanyIds && activeCompanyIds.length > 0 
      ? activeCompanyIds 
      : (companies && companies.length > 0 ? [companies[0].id] : []);
    
    if (activeCids.length === 0) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        
        
        console.log("[Store] Searching products on-demand for:", query);
        
        let supaQuery = supabase.from('docs_products').select('*');
        let terms = query.trim().split(/\s+/).filter(Boolean);
        if (terms.length > 5 || query.trim().length > 50) terms = [query.trim()];
        terms.forEach(term => {
          const cleanT = term.replace(/['"]/g, '');
          if (cleanT) {
            const orFilter = `name.ilike.%${cleanT}%,sku.ilike.%${cleanT}%,data->>name.ilike.%${cleanT}%,data->>sku.ilike.%${cleanT}%,data->>barcode.ilike.%${cleanT}%,data->>category.ilike.%${cleanT}%`;
            supaQuery = supaQuery.or(orFilter);
          }
        });
        
        const { data, error } = await supaQuery.limit(200);
          
        if (error) {
          console.error("[Store] searchProductsOnDemand Supabase error:", error);
          return;
        }

        if (data && data.length > 0) {
          const mappedItems = data.map(row => mapDatabaseRowToFrontend(row)).filter(Boolean);
          setAllProducts(prev => {
            const prevArr = Array.isArray(prev) ? prev : [];
            const existingMap = new Map(prevArr.map(p => [p.id, p]));
            mappedItems.forEach(item => {
              if (item && item.id) {
                existingMap.set(item.id, { ...existingMap.get(item.id), ...item });
              }
            });
            return Array.from(existingMap.values());
          });
        }
      } catch (err) {
        console.error("[Store] searchProductsOnDemand error:", err);
      }
    }, 250);
  }, [activeCompanyIds, companies, setAllProducts]);

  const [allContacts, setAllContacts, setLocalOnlyContacts] = useDocumentState<Contact>([], 'docs_contacts');

  const searchContactsOnDemand = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) return;
    const activeCids = activeCompanyIds && activeCompanyIds.length > 0 
      ? activeCompanyIds 
      : (companies && companies.length > 0 ? [companies[0].id] : []);
    
    if (activeCids.length === 0) return;

    try {
      
      
      console.log("[Store] Searching contacts on-demand for:", query);
      
      let supaQuery = supabase.from('docs_contacts').select('*');
      let terms = query.trim().split(/\s+/).filter(Boolean);
      if (terms.length > 5 || query.trim().length > 50) terms = [query.trim()];
      terms.forEach(term => {
        const cleanT = term.replace(/['"]/g, '');
        if (cleanT) {
          const orFilter = `name.ilike.%${cleanT}%,phone.ilike.%${cleanT}%,data->>email.ilike.%${cleanT}%,data->>code.ilike.%${cleanT}%,data->>companyName.ilike.%${cleanT}%`;
          supaQuery = supaQuery.or(orFilter);
        }
      });
      
      const { data, error } = await supaQuery.limit(200);
        
      if (error) {
        console.error("[Store] searchContactsOnDemand Supabase error:", error);
        return;
      }

      if (data && data.length > 0) {
        const mappedItems = data.map(row => mapDatabaseRowToFrontend(row)).filter(Boolean);
        setAllContacts(prev => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const existingMap = new Map(prevArr.map(p => [p.id, p]));
          mappedItems.forEach(item => {
            if (item && item.id) {
              existingMap.set(item.id, { ...existingMap.get(item.id), ...item });
            }
          });
          return Array.from(existingMap.values());
        });
      }
    } catch (err) {
      console.error("[Store] searchContactsOnDemand error:", err);
    }
  }, [activeCompanyIds, companies, setAllContacts]);

  const contactsRef = useRef<Contact[]>([]);
  useEffect(() => { contactsRef.current = allContacts || []; }, [allContacts]);
  const [paginatedContacts, setPaginatedContacts] = useState<Contact[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [isContactsLoading, setIsContactsLoading] = useState(false);

  const fetchContacts = useCallback(async (options: any) => {
    const cacheKey = 'fetchContacts_' + JSON.stringify(activeCompanyIds) + '_' + JSON.stringify(options);
    const isForce = options?.forceRefresh;
    const cache = fetchCacheMap.get(cacheKey);
    const now = Date.now();
    if (!isForce && cache) {
      if (cache.isFetching) return;
      if (now - cache.lastFetched < 5 * 60 * 1000) return;
    }
    fetchCacheMap.set(cacheKey, { isFetching: true, lastFetched: cache ? cache.lastFetched : 0 });

    setIsContactsLoading(true);
    try {
      
      const { data, count } = await dbService.getPaginatedDocs('docs_contacts', {
        ...options,
        ...( (options?.type === 'EMPLOYEE' || options?.filters?.type === 'EMPLOYEE') ? { companyIds: activeCompanyIds } : {} )
      });
      
      // Deduplicate paginated contacts to hide legacy CT-IMP records if real UUID exists
      const filteredData = (data || []).filter((c) => {
        if (!c.id.startsWith('CT-IMP-')) return true;
        return !(data || []).some(other => !other.id.startsWith('CT-IMP-') && String(other.name||'').toLowerCase().trim() === String(c.name||'').toLowerCase().trim());
      });
      setPaginatedContacts(filteredData);
    
      setContactCount(count);
      
      if (data && data.length > 0) {
        setAllContacts(prev => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const existingIds = new Set(prevArr.map(p => p.id));
          const newItems = data.filter((p: any) => p && !existingIds.has(p.id));
          if (newItems.length === 0) return prevArr;
          return [...prevArr, ...newItems];
        });
      }
    } catch (err) {
      console.error('fetchContacts failed:', err);
    } finally {
      fetchCacheMap.set(cacheKey, { isFetching: false, lastFetched: Date.now() });
      setIsContactsLoading(false);
    }
  }, [activeCompanyIds]);

  const ensureEntitiesMetadata = useCallback(async (contactIds: string[], productIds: string[]) => {
    try {
      
      const activeContactIds = (allContacts || []).map(c => c.id);
      const activeProductIds = (allProducts || []).map(p => p.id);

      const missingContactIds = Array.from(new Set(contactIds.filter(id => id && !activeContactIds.includes(id) && !id.startsWith('contact-cash-sale') && isValidUUID(id))));
      const missingProductIds = Array.from(new Set(productIds.filter(id => id && !activeProductIds.includes(id) && isValidUUID(id))));

      if (missingContactIds.length > 0) {
        console.log('[Store] Loading missing contacts for display:', missingContactIds.length);
        
        const chunkedContacts = [];
        for (let i = 0; i < missingContactIds.length; i += 50) {
           chunkedContacts.push(missingContactIds.slice(i, i + 50));
        }
        
        let allFetchedContacts = [];
        for (const chunk of chunkedContacts) {
           const { data: fetchCon, error } = await supabase
             .from('docs_contacts')
             .select('*')
             .in('id', chunk);
           if (!error && fetchCon) allFetchedContacts.push(...fetchCon);
        }

        if (allFetchedContacts.length > 0) {
          setLocalOnlyContacts(prev => {
            const prevArr = Array.isArray(prev) ? prev : [];
            const existing = new Set(prevArr.map(c => c.id));
            const filtered = allFetchedContacts.filter(c => c && !existing.has(c.id));
            return [...prevArr, ...filtered];
          });
        }
      }

      if (missingProductIds.length > 0) {
        console.log('[Store] Loading missing products for display:', missingProductIds.length);
        
        const chunkedProducts = [];
        for (let i = 0; i < missingProductIds.length; i += 50) {
           chunkedProducts.push(missingProductIds.slice(i, i + 50));
        }

        let allFetchedProducts = [];
        for (const chunk of chunkedProducts) {
           const { data: fetchProd, error } = await supabase
             .from('docs_products')
             .select('id, name, sku, category, brand, quantity_on_hand, cost_price, price, company_id, data')
             .in('id', chunk);
           if (!error && fetchProd) allFetchedProducts.push(...fetchProd);
        }

        if (allFetchedProducts.length > 0) {
          const mapped = allFetchedProducts.map((p) => {
            const qty = p.quantity_on_hand !== undefined ? p.quantity_on_hand : 0;
            const cost = p.cost_price !== undefined ? p.cost_price : 0;
            const companyIdVal = p.company_id;
            return {
              ...p,
              id: p.id,
              name: p.name,
              sku: p.sku,
              category: p.category,
              brand: p.brand,
              quantityOnHand: Number(qty || 0),
              costPrice: Number(cost || 0),
              price: Number(p.price || 0),
              companyId: companyIdVal,
              company_id: companyIdVal,
              stockLevels: p.data?.stockLevels || p.stock_levels || { [companyIdVal]: Number(qty || 0) }
            };
          });

          setLocalOnlyProducts(prev => {
            const prevArr = Array.isArray(prev) ? prev : [];
            const existing = new Set(prevArr.map(p => p.id));
            const filtered = mapped.filter(p => p && !existing.has(p.id));
            return [...prevArr, ...filtered];
          });
        }
      }
    } catch (err) {
      console.error('[Store] ensureEntitiesMetadata failed:', err);
    }
  }, [allContacts, allProducts, setLocalOnlyContacts, setLocalOnlyProducts]);



  const fetchInvoices = useCallback(async (options: any) => {
    const cacheKey = 'fetchInvoices_' + JSON.stringify(activeCompanyIds) + '_' + JSON.stringify(options);
    const isForce = options?.forceRefresh;
    const cache = fetchCacheMap.get(cacheKey);
    const now = Date.now();
    if (!isForce && cache) {
      if (cache.isFetching) return;
      if (now - cache.lastFetched < 5 * 60 * 1000) return;
    }
    fetchCacheMap.set(cacheKey, { isFetching: true, lastFetched: cache ? cache.lastFetched : 0 });

    setIsInvoicesLoading(true);
    try {
      
      const { data, count } = await dbService.getPaginatedDocs('docs_invoices', {
        ...options,
        companyIds: activeCompanyIds,
      });
      setPaginatedInvoices((prev: any[]) => {
        return data.map((newI: any) => {
          const oldI = prev.find(i => i.id === newI.id);
          if (oldI && oldI.status === 'POSTED' && (newI.status === 'DRAFT' || newI.status === 'PENDING')) {
            return { ...newI, status: 'POSTED' };
          }
          if (oldI && oldI.status === 'PAID' && (newI.status === 'DRAFT' || newI.status === 'PENDING' || newI.status === 'POSTED')) {
            return { ...newI, status: 'PAID' };
          }
          return newI;
        });
      });
      setInvoiceCount(count);

      if (data && data.length > 0) {
        const cIds = data.map((i: any) => i.customerId).filter(Boolean);
        const pIds = data.flatMap((i: any) => i.items || []).map((it: any) => it.productId).filter(Boolean);
        ensureEntitiesMetadata(cIds, pIds);
      }
    } catch (err) {
      console.error('fetchInvoices failed:', err);
    } finally {
      fetchCacheMap.set(cacheKey, { isFetching: false, lastFetched: Date.now() });
      setIsInvoicesLoading(false);
    }
  }, [activeCompanyIds, ensureEntitiesMetadata]);

  const fetchBills = useCallback(async (options: any) => {
    const cacheKey = 'fetchBills_' + JSON.stringify(activeCompanyIds) + '_' + JSON.stringify(options);
    const isForce = options?.forceRefresh;
    const cache = fetchCacheMap.get(cacheKey);
    const now = Date.now();
    if (!isForce && cache) {
      if (cache.isFetching) return;
      if (now - cache.lastFetched < 5 * 60 * 1000) return;
    }
    fetchCacheMap.set(cacheKey, { isFetching: true, lastFetched: cache ? cache.lastFetched : 0 });

    setIsBillsLoading(true);
    try {
      
      const { data, count } = await dbService.getPaginatedDocs('docs_bills', {
        ...options,
        companyIds: activeCompanyIds,
      });
      setPaginatedBills((prev: any[]) => {
        return data.map((newB: any) => {
          const oldB = prev.find(b => b.id === newB.id);
          if (oldB && oldB.status === 'POSTED' && (newB.status === 'DRAFT' || newB.status === 'PENDING')) {
            return { ...newB, status: 'POSTED' };
          }
          if (oldB && oldB.status === 'PAID' && (newB.status === 'DRAFT' || newB.status === 'PENDING' || newB.status === 'POSTED')) {
            return { ...newB, status: 'PAID' };
          }
          return newB;
        });
      });
      setBillCount(count);

      if (data && data.length > 0) {
        const cIds = data.map((b: any) => b.vendorId).filter(Boolean);
        const pIds = data.flatMap((b: any) => b.items || []).map((it: any) => it.productId).filter(Boolean);
        ensureEntitiesMetadata(cIds, pIds);
      }
    } catch (err) {
      console.error('fetchBills failed:', err);
    } finally {
      fetchCacheMap.set(cacheKey, { isFetching: false, lastFetched: Date.now() });
      setIsBillsLoading(false);
    }
  }, [activeCompanyIds, ensureEntitiesMetadata]);

  useEffect(() => {
    if (!allProducts || allProducts.length === 0) return;
    setPaginatedProducts(prev => {
      const updatedMap = prev.map(pp => {
        const u = allProducts.find(p => p.id === pp.id);
        return u ? u : pp;
      });
      // Prepend brand new products only if they belong to the active companies
      const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
      const relevantProducts = allProducts.filter(p => {
        const pCompanyIds = Array.isArray(p?.companyIds) ? p?.companyIds : [];
        if (pCompanyIds.length > 0) return pCompanyIds.some((id: any) => activeCids.includes(id));
        if (p?.companyId) return activeCids.includes(p?.companyId);
        return true;
      });
      
      relevantProducts.forEach(p => {
        if (!updatedMap.some(x => x.id === p.id)) {
          updatedMap.unshift(p);
        }
      });
      return updatedMap;
    });
  }, [allProducts]);

  useEffect(() => {
    if (!allEntries || allEntries.length === 0) return;
    setPaginatedEntries(prev => {
      const updatedMap = prev.map(pe => {
        const u = allEntries.find(e => e.id === pe.id);
        return u ? u : pe;
      });
      const newItems = allEntries.filter(e => !prev.some(pe => pe.id === e.id) && activeCompanyIds.includes(e.companyId));
      if (newItems.length > 0) {
        return [...newItems, ...updatedMap];
      }
      return updatedMap;
    });
  }, [allEntries, activeCompanyIds]);

  useEffect(() => {
    if (!allContacts || allContacts.length === 0) return;
    setPaginatedContacts(prev => {
      const updatedMap = prev.map(pc => {
        const u = allContacts.find(c => c.id === pc.id);
        return u ? u : pc;
      });
      // Prepend brand new contacts so they instantly appear at the top
      const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
      const mappedNonLegacyNames = new Set(allContacts.filter(c => c && c.id && !c.id.startsWith('CT-IMP-')).map(c => String(c.name||'').toLowerCase().trim()));
      
      const relevantContacts = allContacts.filter(c => {
         if (c && c.id && c.id.startsWith('CT-IMP-') && mappedNonLegacyNames.has(String(c.name||'').toLowerCase().trim())) return false; // Hide legacy dup
         if (c.id && String(c.id).startsWith('contact-cash-sale')) return true;
         if (c.type && c.type.toUpperCase() === 'CUSTOMER') return true;
         if (c.type && c.type.toUpperCase() === 'VENDOR') return true;
         if (c?.companyId) return activeCids.includes(c?.companyId);
         const cCompanyIds = Array.isArray(c?.companyIds) ? c?.companyIds : [];
         return cCompanyIds.some((id: any) => activeCids.includes(id));
      });

      relevantContacts.forEach(c => {
        if (!updatedMap.some(x => x.id === c.id)) {
          updatedMap.unshift(c);
        }
      });
      // Final pass to remove legacy duplicates that snuck into prev state
      return updatedMap.filter(c => {
         if (!c || !c.id) return false;
         if (c.id.startsWith('CT-IMP-') && mappedNonLegacyNames.has(String(c.name||'').toLowerCase().trim())) return false;
         return true;
      });
    });
  }, [allContacts]);

  const [allPayments, setAllPayments, setLocalOnlyPayments] = useDocumentState<Payment>([], 'docs_payments');
  const [allLoans, setAllLoans, setLocalOnlyLoans] = useDocumentState<Loan>([], 'docs_loans');
  const [allWarehouses, setAllWarehouses, setLocalOnlyWarehouses] = useDocumentState<Warehouse>([], 'docs_warehouses');
  const [allProductCosts, setAllProductCosts, setLocalOnlyProductCosts] = useDocumentState<ProductCost>([], 'docs_product_costs');
  const [allInventoryAdjustments, setAllInventoryAdjustments, setLocalOnlyInventoryAdjustments] = useDocumentState<InventoryAdjustment>([], 'docs_inventory_adjustments');
  const [allInventoryTransactions, setAllInventoryTransactions, setLocalOnlyInventoryTransactions] = useDocumentState<any>([], 'docs_inventory_transactions');
  const [allPayslips, setAllPayslips, setLocalOnlyPayslips] = useDocumentState<Payslip>([], 'docs_payslips');
  const [allAdvanceSalaries, setAllAdvanceSalaries, setLocalOnlyAdvanceSalaries] = useDocumentState<AdvanceSalary>([], 'docs_advance_salaries');
  const [allBrands, setAllBrands, setLocalOnlyBrands] = useDocumentState<{ id: string; name: string; description: string; companyId: string }>([], 'docs_brands');
  const brandsRef = useRef<any[]>([]);
  useEffect(() => { brandsRef.current = allBrands || []; }, [allBrands]);

  const [allCategories, setAllCategories, setLocalOnlyCategories] = useDocumentState<{ id: string; name: string; description: string; companyId: string }>([], 'docs_categories');
  const categoriesRef = useRef<any[]>([]);
  useEffect(() => { categoriesRef.current = allCategories || []; }, [allCategories]);
  const [allAttendance, setAllAttendance, setLocalOnlyAttendance] = useDocumentState<AttendanceRecord>([], 'docs_attendance');
  const [allCommissionTargets, setAllCommissionTargets, setLocalOnlyCommissionTargets] = useDocumentState<CommissionTarget>([], 'docs_commission_targets');
  const [allLeaves, setAllLeaves, setLocalOnlyLeaves] = useDocumentState<LeaveRecord>([], 'docs_leaves');
  const [allTasks, setAllTasks, setLocalOnlyTasks] = useDocumentState<Task>([], 'docs_tasks');
  const [allHolidays, setAllHolidays, setLocalOnlyHolidays] = useDocumentState<Holiday>([], 'docs_holidays');
  const [emailSettings, setEmailSettings] = useState({
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    configured: false
  });
  const [users, setUsers, setLocalOnlyUsers] = useDocumentState<User>(DEFAULT_USERS, 'docs_users');
  const [roles, setRoles, setLocalOnlyRoles] = useDocumentState<RoleDefinition>(SYSTEM_ROLES, 'docs_roles');

  const mergedRoles = useMemo(() => {
    const all = [...roles];
    SYSTEM_ROLES.forEach(sys => {
      if (!all.some(r => r.id === sys.id)) {
        all.push(sys);
      }
    });
    return all;
  }, [roles]);

  const currentUser = useAccountingStoreBase(state => state.currentUser);
  const setCurrentUser = useCallback((user: User | null | ((prev: User | null) => User | null)) => {
    const nextUser = typeof user === 'function' ? user(useAccountingStoreBase.getState().currentUser) : user;
    useAccountingStoreBase.setState({ currentUser: nextUser });
  }, []);
  const loginRole = useAccountingStoreBase(state => state.loginRole) as 'USER' | 'CASHIER' | null;
  const setLoginRole = useCallback((role: any) => {
    useAccountingStoreBase.setState({ loginRole: role });
  }, []);
  const [navStack, setNavStack] = useState<any[]>([]);

  const [isCashierDrawerOpen, setIsCashierDrawerOpen] = useState(false);
  const [isStoreSyncing, setIsStoreSyncing] = useState(false);
  const [storeInitialized, setStoreInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);

  const fetchInitialData = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      
      const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
      const fetchTasks = [
        () => Promise.resolve([]), // dbService.getPaginatedDocs('docs_products', { companyIds: activeCids, limit: 1000 }).then(r => r.data) as any, 
        () => Promise.resolve([]), // dbService.getPaginatedDocs('docs_contacts', { companyIds: activeCids, limit: 1000 }).then(r => r.data) as any,
        () => dbService.getPaginatedDocs('docs_invoices', { limit: 100, sortField: 'date', sortOrder: 'desc', companyIds: activeCids }).then(r => r.data), 
        () => dbService.getPaginatedDocs('docs_journals', { limit: 100, sortField: 'date', sortOrder: 'desc', companyIds: activeCids }).then(r => r.data),
        () => dbService.getPaginatedDocs('docs_bills', { limit: 100, sortField: 'date', sortOrder: 'desc', companyIds: activeCids }).then(r => r.data), 
        () => dbService.getPaginatedDocs('docs_payments', { limit: 100, sortField: 'date', sortOrder: 'desc', companyIds: activeCids }).then(r => r.data),
        () => dbService.getPaginatedDocs('docs_credit_notes', { limit: 100, companyIds: activeCids }).then(r => r.data), 
        () => dbService.getDocs('docs_companies'),
        () => dbService.getDocs('docs_users'), 
        () => dbService.getDocs('docs_roles'),
        () => dbService.getDocs('docs_accounts', activeCids), 
        () => Promise.resolve([]), // dbService.getDocs('docs_loans', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_inventory_adjustments', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_payslips', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_advance_salaries', activeCids)
        () => dbService.getDocs('docs_brands', activeCids),
        () => dbService.getDocs('docs_categories', activeCids),
        () => Promise.resolve([]), // dbService.getDocs('docs_attendance', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_commission_targets', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_leaves', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_tasks', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_holidays', activeCids)
        () => Promise.resolve([]), // dbService.getDocs('docs_inventory_transactions'), 
        () => Promise.resolve([]) // dbService.getDocs('docs_journal_lines')
      ];
      
      const results: any[] = [];
      for (let i = 0; i < fetchTasks.length; i += 4) {
        const chunk = fetchTasks.slice(i, i + 4);
        const chunkRes = await Promise.allSettled(chunk.map(fn => fn()));
        results.push(...chunkRes);
        await new Promise(r => setTimeout(r, 100)); // Yield thread for auth lock
      }

      const unwrap = (res: any) => (res && res.status === 'fulfilled' && Array.isArray(res.value)) ? res.value : undefined;
      const r0 = unwrap(results[0]); if(r0 !== undefined) setLocalOnlyProducts(r0);
      const r1 = unwrap(results[1]); if(r1 !== undefined) setLocalOnlyContacts(r1);
      const r2 = unwrap(results[2]); if(r2 !== undefined) setLocalOnlyInvoices(r2);
      const r3 = unwrap(results[3]); if(r3 !== undefined) setLocalOnlyEntries(r3);
      const r4 = unwrap(results[4]); if(r4 !== undefined) setLocalOnlyBills(r4);
      const r5 = unwrap(results[5]); if(r5 !== undefined) setLocalOnlyPayments(r5);
      const r6 = unwrap(results[6]); if(r6 !== undefined) setLocalOnlyCreditNotes(r6);
      
      const loadedCompanies = unwrap(results[7]);
      const loadedAccounts = unwrap(results[10]) || [];
      if(loadedCompanies !== undefined) {
        const comp1 = loadedCompanies.find((c: any) => c.id === 'comp-1');
        if (comp1 && comp1.name === 'Default Company') {
          comp1.name = 'SUBORNO ELECTRIC';
          comp1.code = 'SUL';
        }



        const userStateLocal = useAccountingStoreBase.getState();
        const currentUserLocal = userStateLocal.currentUser;
        if (currentUserLocal && currentUserLocal.companyIds) {
           currentUserLocal.companyIds.forEach(cid => {
              if (!loadedCompanies.find(c => c.id === cid)) {
                 loadedCompanies.push({
                    id: cid,
                    name: cid === 'comp-1' ? 'SUBORNO ELECTRIC' : cid === 'comp-1740059535071' ? 'SUBORNO NEW' : 'Company ' + cid.substring(0, 4),
                    address: "Synced via local access",
                    phone: "",
                    email: "",
                    currency: "BDT",
                    fiscalYearStart: "Jan"
                 });
              }
           });
        }
        if ((currentUserLocal as any)?.data?.allowedCompanies) {
           (currentUserLocal as any).data.allowedCompanies.forEach((ac: any) => {
              const existingIdx = loadedCompanies.findIndex(c => c.id === ac.id);
              if (existingIdx >= 0) loadedCompanies[existingIdx] = ac;
              else loadedCompanies.push(ac);
           });
        }
        setLocalOnlyCompanies(loadedCompanies);
      }
      const r8 = unwrap(results[8]); if(r8 !== undefined) setLocalOnlyUsers(r8);
      const r9 = unwrap(results[9]); if(r9 !== undefined) setLocalOnlyRoles(r9);

      // Self-healing Chart of Accounts auto-seeding for companies that have no accounts
      const missingAccountsToAdd: any[] = [];
      const updatedAccountsList = [...loadedAccounts];
      let needsSync = false;
      
      loadedCompanies.forEach((company: any) => {
        const hasAccounts = loadedAccounts.some((acc: any) => acc?.companyId === company.id); 
        const accountsNeedingFix = loadedAccounts.filter((acc: any) => acc?.companyId === company.id && !acc.code && acc.data && acc.data.code);
        if (accountsNeedingFix.length > 0) {
          needsSync = true;
          accountsNeedingFix.forEach(acc => {
            missingAccountsToAdd.push({
              id: acc.id,
              company_id: acc.companyId,
              code: acc.data.code,
              name: acc.data.name,
              type: acc.data.type,
              data: acc.data,
              updated_at: new Date().toISOString()
            });
          });
        }
        if (!hasAccounts) {
          console.log(`Auto-seeding Chart of Accounts for company: ${company.name} (${company.id})`);
          needsSync = true;
          const companyAccounts = INITIAL_ACCOUNTS.map(a => ({
            ...a,
            id: `${company.id}-${a.code}`,
            companyId: company.id
          } as Account));
          updatedAccountsList.push(...companyAccounts);
          companyAccounts.forEach(acc => {
            missingAccountsToAdd.push({
              id: acc.id,
              code: acc.code, name: acc.name, type: acc.type, data: acc,
              company_id: company.id,
              updated_at: new Date().toISOString()
            });
          });
        }
      });
      
      if (needsSync && missingAccountsToAdd.length > 0) {
        supabase.from('docs_accounts').upsert(missingAccountsToAdd).then(({ error }) => {
          if (error) {
            console.error("Auto-seeding accounts sync failed", error);
          }
        });
      }

      setLocalOnlyAccounts(updatedAccountsList);
      const r11 = unwrap(results[11]); if(r11 !== undefined) setLocalOnlyLoans(r11);
      const r12 = unwrap(results[12]); if(r12 !== undefined) setLocalOnlyInventoryAdjustments(r12);
      const r13 = unwrap(results[13]); if(r13 !== undefined) setLocalOnlyPayslips(r13);
      const r14 = unwrap(results[14]); if(r14 !== undefined) setLocalOnlyAdvanceSalaries(r14);
      const r15 = unwrap(results[15]); if(r15 !== undefined) setLocalOnlyBrands(r15);
      const r16 = unwrap(results[16]); if(r16 !== undefined) setLocalOnlyCategories(r16);
      const r17 = unwrap(results[17]); if(r17 !== undefined) setLocalOnlyAttendance(r17);
      const r18 = unwrap(results[18]); if(r18 !== undefined) setLocalOnlyCommissionTargets(r18);
      const r19 = unwrap(results[19]); if(r19 !== undefined) setLocalOnlyLeaves(r19);
      const r20 = unwrap(results[20]); if(r20 !== undefined) setLocalOnlyTasks(r20);
      const r21 = unwrap(results[21]); if(r21 !== undefined) setLocalOnlyHolidays(r21);
      const r22 = unwrap(results[22]); if(r22 !== undefined) setLocalOnlyInventoryTransactions(r22);
      const r23 = unwrap(results[23]); if(r23 !== undefined) setLocalOnlyLines(r23);

      const cIds = [];
      const pIds = [];
      if (r2) {
        cIds.push(...r2.map((i: any) => i.customerId));
        pIds.push(...r2.flatMap((i: any) => i.items || []).map((it: any) => it.productId));
      }
      if (r4) {
        cIds.push(...r4.map((b: any) => b.vendorId));
        pIds.push(...r4.flatMap((b: any) => b.items || []).map((it: any) => it.productId));
      }
      if (r6) {
        cIds.push(...r6.map((cn: any) => cn.customerId));
        pIds.push(...r6.flatMap((cn: any) => cn.items || []).map((it: any) => it.productId));
      }
      const uniqueCIds = Array.from(new Set(cIds.filter(Boolean)));
      const uniquePIds = Array.from(new Set(pIds.filter(Boolean)));
      if (uniqueCIds.length > 0 || uniquePIds.length > 0) {
        ensureEntitiesMetadata(uniqueCIds, uniquePIds);
      }
    } catch (e) {
      console.error('fetchInitialData failed:', e);
    }
  }, [
    setLocalOnlyProducts, setLocalOnlyContacts, setLocalOnlyInvoices, setLocalOnlyEntries,
    setLocalOnlyBills, setLocalOnlyPayments, setLocalOnlyCreditNotes, setLocalOnlyCompanies,
    setLocalOnlyUsers, setLocalOnlyRoles, setLocalOnlyAccounts, setLocalOnlyLoans,
    setLocalOnlyInventoryAdjustments, setLocalOnlyPayslips, setLocalOnlyAdvanceSalaries,
    setLocalOnlyBrands, setLocalOnlyCategories, setLocalOnlyAttendance, setLocalOnlyCommissionTargets,
    setLocalOnlyLeaves, setLocalOnlyTasks, setLocalOnlyHolidays, setLocalOnlyInventoryTransactions,
    setLocalOnlyLines
  ]);

  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const triggerCloudSync = useCallback(() => {
    setSyncVersion(v => v + 1);
  }, []);

  // --- SUPABASE & LOCAL PERSISTENCE ---
  useEffect(() => {
    let isMounted = true;
    
    // Failsafe to unblock UI if something critically hangs
    setTimeout(() => {
       if (isMounted) {
          setSessionChecked(true);
          setStoreInitialized(true);
       }
    }, 4000);

    const loadState = async () => {
      console.log('[Store] Starting state load');
      
      // Advanced Multi-Company: Ensure default users or logged in user handles company association in DB
      try {
        const authPromise = supabase.auth.getSession(); authPromise.catch(() => {});
        const timeoutPromise = new Promise<{data: {session: any}, error?: any}>((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 3000)
        );
        timeoutPromise.catch(() => {}); // Prevent unhandled rejection
        let session: any = null;
        let sessionError: any = null;
        try {
          const { data, error } = await Promise.race([authPromise, timeoutPromise]) as any;
          session = data?.session;
          sessionError = error;
        } catch (promiseErr) {
          sessionError = promiseErr;
        }
        
        if (session?.user) {
          // ALWAYS ensure comp-1 exists on every load!
          try { await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF' }, { onConflict: 'id', ignoreDuplicates: true }); } catch(e) {}
          
          try { await supabase.from('docs_user_company_access').upsert({
            id: `acc-${session.user.id}-comp-1`,
            user_uuid: session.user.id,
            company_id: 'comp-1',
            role: 'role-admin'
          }, { onConflict: 'id' }); } catch(e) {}
        }

        if (sessionError) {
          if (sessionError?.message?.includes('Refresh Token') || sessionError?.message?.includes('refresh') || sessionError?.message?.includes('Refresh')) {
             try {
                 await supabase.auth.signOut();
             } catch(e) {}
             // Try to clear any other sb- items just in case
             let keysToRemove = [];
             for (let i = 0; i < localStorage.length; i++) {
                 const key = localStorage.key(i);
                 if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                     keysToRemove.push(key);
                 }
             }
             keysToRemove.forEach(k => localStorage.removeItem(k));
             console.log('Cleared invalid auth tokens. Next reload will use anonymous mode or re-prompt login.');
             window.location.reload();
          }
        }
        if (session?.user) {
          console.log('[Store] Supabase Auth session found, loading user profile...');
          const profileQuery = supabase
            .from('docs_users')
            .select('*')
            .eq('user_uuid', session.user.id)
            .limit(1);
          (profileQuery as any).catch(() => {});
          const pTimeout = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Profile timeout')), 3000));
          pTimeout.catch(() => {});
          const { data: profileRows, error: profileError } = await Promise.race([profileQuery, pTimeout]);
          const profileData = profileRows?.[0];

          if (!profileError && profileData) {
            const userProfile = {
              id: profileData.id,
              name: profileData.name || '',
              email: profileData.email || '',
              username: profileData.username || '',
              pin: profileData.pin,
              roleId: profileData.role_id,
              status: profileData.status,
              companyIds: profileData.company_ids || [],
              emailConfirmed: profileData.email_confirmed,
              invitationToken: profileData.invitation_token,
            } as User;
            setCurrentUser(userProfile);
            setActiveCompanyIds(userProfile?.companyIds || []);

            if (userProfile?.companyIds && userProfile.companyIds.length > 0) {
              const accessPayload = userProfile.companyIds.map(cid => ({
                id: `acc-${session.user.id}-${cid}`,
                user_uuid: session.user.id,
                user_id: userProfile.id,
                company_id: cid,
                role: userProfile.roleId || 'role-admin'
              }));
              supabase.from('docs_user_company_access').upsert(accessPayload, { onConflict: 'id' }).then(({error}) => { if(error) console.error(error); });
            }
            
            // Removed data column update since column does not exist
          }
        }
      } catch (authErr) {
        console.warn('[Store] Auth association skip (not logged in or table missing)');
      }
      
      try {
        // 1. Try Loading activeCompanyIds from localStorage
        try {
          const storedCids = localStorage.getItem('activeCompanyIds');
          if (storedCids) {
             const parsed = JSON.parse(storedCids);
             if (Array.isArray(parsed) && parsed.length > 0) {
                 setActiveCompanyIds(parsed);
             }
          }
        } catch(e) {}
        
        let saved = null;
        
        // Load from Local IndexedDB/LocalStorage for any state not fully migrated to docs_*

        if (!saved) {
          console.log('[Store] Falling back to local storage load');
          try {
            
            const idbPromise = get('accounting_store');
            const timeoutPromise = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('IDB timeout')), 2000));
            timeoutPromise.catch(() => {});
            saved = await Promise.race([idbPromise, timeoutPromise]);
            if (saved) console.log('[Store] Loaded state from local IndexedDB');
          } catch (e) {
             console.warn('idb-keyval not available, falling back to localStorage');
             const lsSaved = localStorage.getItem('accounting_store');
             if (lsSaved) {
               try {
                 saved = JSON.parse(lsSaved);
                 console.log('[Store] Loaded state from local Storage');
               } catch (pe) { console.error('Parse error', pe); }
             }
          }
        }
        
        if (isMounted) {
          const data = saved || {};
          
          // Safe array setter
          const sa = (val: any) => Array.isArray(val) ? val : [];

          const applyDataToState = (sourceData: any) => {
            if (sourceData.companies) {
              const comps = sa(sourceData.companies);
              const comp1 = comps.find((c: any) => c.id === 'comp-1');
              if (comp1 && comp1.name === 'Default Company') {
                (async () => {
                   supabase.from('docs_companies').update({ name: 'SUBORNO ELECTRIC', code: 'SUL' }).eq('id', 'comp-1').then(() => console.log("Updated comp-1"));
                });
                comp1.name = 'SUBORNO ELECTRIC';
                comp1.code = 'SUL';
              }
              setCompanies(comps);
            }
            if (sourceData.allAccounts) setAllAccounts(sa(sourceData.allAccounts));
            if (sourceData.allEntries) setAllEntries(sa(sourceData.allEntries));
            if (sourceData.allJournalLines) setAllJournalLines(sa(sourceData.allJournalLines));
            if (sourceData.allInvoices) setAllInvoices(sa(sourceData.allInvoices));
            if (sourceData.allBills) setAllBills(sa(sourceData.allBills));
            if (sourceData.allCreditNotes) setAllCreditNotes(sa(sourceData.allCreditNotes));
            if (sourceData.allInventoryTransactions) setAllInventoryTransactions(sa(sourceData.allInventoryTransactions));
            if (sourceData.allProductCosts) setAllProductCosts(sa(sourceData.allProductCosts));
            
            if (sourceData.allProducts) {
              const repairing = sa(sourceData.allProducts).map((p: any) => {
                const validCids = (p?.companyIds || []).filter((id: any) => id && id !== 'undefined');
                return {
                  ...p,
                  companyIds: validCids.length > 0 ? validCids : (sourceData.companies?.[0]?.id ? [sourceData.companies[0].id] : [])
                };
              });
              setLocalOnlyProducts(repairing);
            }
            if (sourceData.allContacts) {
              let loadedContacts = sa(sourceData.allContacts);
              
              // FIND ALL "CASH SALE" VARIATIONS
              const cashSaleVariants = loadedContacts.filter((c: any) => 
                c.name.toLowerCase() === 'cash sale' || 
                c.id === 'contact-cash-sale-global' || 
                c.id.startsWith('contact-cash-sale-')
              );
              
              if (cashSaleVariants.length > 0) {
                const allCompIds = Array.from(new Set([
                  ...(sourceData.companies || []).map((c: any) => c.id),
                  ...cashSaleVariants.flatMap((c: any) => c?.companyIds || [])
                ]));
                
                const globalCashSale: Contact = {
                  id: 'contact-cash-sale-global',
                  name: 'Cash Sale',
                  type: ContactType.CUSTOMER,
                  email: 'cash@sale.com',
                  companyIds: allCompIds,
                  openingBalances: {}
                };
                
                loadedContacts = loadedContacts.filter((c: any) => 
                  !(c.name.toLowerCase() === 'cash sale' || c.id.startsWith('contact-cash-sale-')) || 
                  c.id === 'contact-cash-sale-global'
                );
                
                const idx = loadedContacts.findIndex(c => c.id === globalCashSale.id);
                if (idx === -1) {
                  loadedContacts.push(globalCashSale);
                } else {
                  loadedContacts[idx] = { ...loadedContacts[idx], companyIds: allCompIds };
                }
                
                // Removed automatic upsert to prevent infinite loops during hydration
              } else {
                const compIds = (sourceData.companies || []).map((c: any) => c.id);
                const cashSaleContact: Contact = {
                  id: 'contact-cash-sale-global',
                  name: 'Cash Sale',
                  type: ContactType.CUSTOMER,
                  email: 'cash@sale.com',
                  companyIds: compIds,
                  openingBalances: {}
                };
                loadedContacts.push(cashSaleContact);
                // Removed automatic upsert to prevent infinite loops during hydration
              }
              setLocalOnlyContacts(loadedContacts);
            }
            if (sourceData.allPayments) setAllPayments(sa(sourceData.allPayments));
            if (sourceData.allLoans) {
              const mappedLoans = sa(sourceData.allLoans).map((l: any) => {
                if (!l.amortizationSchedule || l.amortizationSchedule.length === 0) {
                  return {
                    ...l,
                    amortizationSchedule: calculateAmortization(
                      l.principalAmount || l.amount || 0,
                      l.interestRate || 0,
                      l.termMonths || 0,
                      l.startDate || l.date || '',
                      l.interestType || 'REDUCING'
                    )
                  };
                }
                return l;
              });
              setAllLoans(mappedLoans);
            }
            if (sourceData.allWarehouses) setAllWarehouses(sa(sourceData.allWarehouses));
            if (sourceData.allProductCosts) setAllProductCosts(sa(sourceData.allProductCosts));
            if (sourceData.allInventoryAdjustments) setAllInventoryAdjustments(sa(sourceData.allInventoryAdjustments));
            if (sourceData.allInventoryTransactions) setAllInventoryTransactions(sa(sourceData.allInventoryTransactions));
            if (sourceData.allPayslips) setAllPayslips(sa(sourceData.allPayslips));
            if (sourceData.allAdvanceSalaries) setAllAdvanceSalaries(sa(sourceData.allAdvanceSalaries));
            if (sourceData.allBrands) setAllBrands(sa(sourceData.allBrands));
            if (sourceData.allCategories) setAllCategories(sa(sourceData.allCategories));
            if (sourceData.allAttendance) setAllAttendance(sa(sourceData.allAttendance));
            if (sourceData.allCommissionTargets) setAllCommissionTargets(sa(sourceData.allCommissionTargets));
            if (sourceData.allLeaves) setAllLeaves(sa(sourceData.allLeaves));
            if (sourceData.allTasks) setAllTasks(sa(sourceData.allTasks));
            if (sourceData.allHolidays) setAllHolidays(sa(sourceData.allHolidays));
            if (sourceData.users) setUsers(sa(sourceData.users));
            if (sourceData.roles) setRoles(sa(sourceData.roles));

            // Ensure at least one company is selected if data was loaded
            if (useAccountingStoreBase.getState().activeCompanyIds.length === 0 && sa(sourceData.companies).length > 0) {
              setActiveCompanyIds([sourceData.companies[0].id]);
            }
          };

          // 1. Immediately hydrate with locally cached data
          applyDataToState(data);
          setSessionChecked(true);

          // ALWAYS attempt to load Phase 2 entities from Document DB
          try {
            
            
            // Filter by active company if available. 
            // In a truly "Advanced" setup, we might fetch everything RLS allows 
            // and filter locally, or fetch specifically what we need.
            
            const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
            const fetchTasks2 = [
              () => Promise.resolve([]), // dbService.getPaginatedDocs('docs_products', { companyIds: activeCids, limit: 1000 }).then(r => r.data) as any, 
              () => Promise.resolve([]), // dbService.getPaginatedDocs('docs_contacts', { companyIds: activeCids, limit: 1000 }).then(r => r.data) as any,
              () => dbService.getPaginatedDocs('docs_invoices', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data), 
              () => dbService.getPaginatedDocs('docs_journals', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
              () => dbService.getPaginatedDocs('docs_bills', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data), 
              () => dbService.getPaginatedDocs('docs_payments', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
              () => dbService.getPaginatedDocs('docs_credit_notes', { companyIds: activeCids, limit: 100 }).then(r => r.data), 
              () => dbService.getDocs('docs_companies'),
              () => dbService.getDocs('docs_users'), 
              () => dbService.getDocs('docs_roles'),
              () => dbService.getDocs('docs_accounts'), 
              () => Promise.resolve([]), // dbService.getDocs('docs_loans', activeCids),
              () => Promise.resolve([]), // dbService.getDocs('docs_inventory_adjustments', activeCids), 
              () => Promise.resolve([]), // dbService.getDocs('docs_payslips', activeCids),
              () => Promise.resolve([]), // dbService.getDocs('docs_advance_salaries', activeCids), 
              () => dbService.getDocs('docs_brands', activeCids),
              () => dbService.getDocs('docs_categories', activeCids), 
              () => Promise.resolve([]), // dbService.getDocs('docs_attendance', activeCids),
              () => Promise.resolve([]), // dbService.getDocs('docs_commission_targets', activeCids), 
              () => Promise.resolve([]), // dbService.getDocs('docs_leaves', activeCids),
              () => Promise.resolve([]), // dbService.getDocs('docs_tasks', activeCids), 
              () => Promise.resolve([]), // dbService.getDocs('docs_holidays', activeCids),
              () => Promise.resolve([]), // dbService.getDocs('docs_product_costs', activeCids),
              () => dbService.getPaginatedDocs('docs_inventory_transactions', { companyIds: activeCids, limit: 200, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
              () => Promise.resolve([]) // dbService.getDocs('docs_journal_lines')
            ];
            
            const results: any[] = [];
            for (let i = 0; i < fetchTasks2.length; i += 4) {
              const chunk = fetchTasks2.slice(i, i + 4);
              const chunkRes = await Promise.allSettled(chunk.map(fn => fn()));
              results.push(...chunkRes);
              await new Promise(r => setTimeout(r, 100)); // Yield thread for auth lock
            }
            
            const logResults = () => {
              const tables = [
                'products', 'contacts', 'invoices', 'journals', 'bills', 'payments', 
                'credit_notes', 'companies', 'users', 'roles', 'accounts', 'loans', 
                'adjustments', 'payslips', 'salaries', 'brands', 'categories', 
                'attendance', 'commissions', 'leaves', 'tasks', 'holidays',
                'product_costs', 'inventory_transactions', 'journal_lines'
              ];
              results.forEach((res, i) => {
                if (res.status === 'fulfilled') {
                  console.log(`[Store] Loaded ${res.value.length} items for ${tables[i]}`);
                } else {
                  if (res.reason && (res.reason.message === 'Failed to fetch' || res.reason.toString().includes('Failed to fetch'))) {
                    console.warn(`[Store] Transient network error loading ${tables[i]}`);
                  } else {
                    
              console.error(`[Store] Failed to load ${tables[i]} (companyIds: ${activeCids}):`, res.reason);

                  }
                }
              });
            };
            logResults();

            const unwrap = (res: any) => (res && res.status === 'fulfilled' && Array.isArray(res.value)) ? res.value : undefined;

            const fetchedProducts = unwrap(results[0]);
            const fetchedContacts = unwrap(results[1]);
            const fetchedInvoices = unwrap(results[2]);
            const fetchedJournals = unwrap(results[3]);
            const fetchedBills = unwrap(results[4]);
            const fetchedPayments = unwrap(results[5]);
            const fetchedCreditNotes = unwrap(results[6]);
            const fetchedComps = unwrap(results[7]);
            const fetchedUsers = unwrap(results[8]);
            const fetchedRoles = unwrap(results[9]);
            const fetchedAccounts = unwrap(results[10]);
            
            const fetchedLoans = unwrap(results[11]);
            const fetchedInventoryAdjustments = unwrap(results[12]);
            const fetchedPayslips = unwrap(results[13]);
            const fetchedAdvanceSalaries = unwrap(results[14]);
            const fetchedBrands = unwrap(results[15]);
            const fetchedCategories = unwrap(results[16]);
            const fetchedAttendance = unwrap(results[17]);
            const fetchedCommissionTargets = unwrap(results[18]);
            const fetchedLeaves = unwrap(results[19]);
            const fetchedTasks = unwrap(results[20]);
            const fetchedHolidays = unwrap(results[21]);
            const fetchedProductCosts = unwrap(results[22]);
            const fetchedInventoryTransactions = unwrap(results[23]);
            const fetchedJournalLines = unwrap(results[24]);

            const safeSet = (fetched: any, key: string, table?: string) => {
              if (fetched !== undefined) {
                if (false /* Migration disabled to prevent infinite upsert loops */) {
                   console.log(`[Store] Migrating ${saved[key].length} local ${key} to Supabase...`);
                   data[key] = saved[key];
                   setTimeout(async () => {
                     const docsToMigrate = saved[key].map((originalDoc: any) => {
                       const doc = { ...originalDoc };
                       const omitKeys = [
                         'isSyncing', 'isEditing', 'tempId', 'isTemp', '_localId',
                         'localId', 'syncState', 'syncAction', 'isOfflineOnly',
                         'tempName', 'tempCode', 'tempAmount', 'tempNotes',
                         'uiState', 'ui_state', 'isNew', 'focused', 'selected'
                       ];
                       omitKeys.forEach(k => delete doc[k]);
                       return doc;
                     });

                     (async () => {
                       if ((dbService as any).upsertDoc) {
                         for (const doc of docsToMigrate) {
                           await (dbService as any).upsertDoc(table, doc.id, doc).catch(console.error);
                         }
                       } else {
                         (async () => {
                           const batchSize = 100;
                           for (let i = 0; i < docsToMigrate.length; i += batchSize) {
                             const batch = docsToMigrate.slice(i, i + batchSize);
                             console.log(`[Store] Migrating batch ${i} to ${i + batch.length} of ${table}...`);
                             const { error } = await supabase.from(table).upsert(batch);
                             if (error) console.error(`[Store] Batch Upsert Error on ${table}:`, error);
                             await new Promise(r => setTimeout(r, 200)); // Sleep between batches
                           }
                         });
                       }
                     });
                   }, 2000);
                } else {
                   data[key] = fetched;
                }
              }
            };

            safeSet(fetchedProducts, 'allProducts', 'docs_products');
            safeSet(fetchedContacts, 'allContacts', 'docs_contacts');
            safeSet(fetchedInvoices, 'allInvoices', 'docs_invoices');
            safeSet(fetchedJournals, 'allEntries', 'docs_journals');
            safeSet(fetchedJournalLines, 'allJournalLines', 'docs_journal_lines');
            safeSet(fetchedBills, 'allBills', 'docs_bills');
            safeSet(fetchedPayments, 'allPayments', 'docs_payments');
            safeSet(fetchedCreditNotes, 'allCreditNotes', 'docs_credit_notes');
            safeSet(fetchedComps, 'companies', 'docs_companies');
            safeSet(fetchedUsers, 'users', 'docs_users');
            
            // Auto-grant Kabir access to Suborno Electric and Suborno New
            const kabir = fetchedUsers?.find((u: any) => String(u.email).toLowerCase() === 'kabir@gmail.com');
            const subornoElec = fetchedComps?.find((c: any) => String(c.name).toLowerCase().includes('electric'));
            const subornoNew = fetchedComps?.find((c: any) => String(c.name).toLowerCase().includes('new'));
            
            if (kabir && subornoElec && subornoNew) {
                const requiredIds = [subornoElec.id, subornoNew.id];
                const currentIds = kabir.company_ids || [];
                // Check if they are already exactly these two
                const needsUpdate = !requiredIds.every(id => currentIds.includes(id)) || currentIds.length !== requiredIds.length;
                if (needsUpdate) {
                    supabase.from('docs_users').update({ company_ids: requiredIds }).eq('id', kabir.id).then((res) => {
                       console.log("Updated kabir access to", requiredIds, res);
                    });
                }
            }
            safeSet(fetchedRoles, 'roles', 'docs_roles');
            safeSet(fetchedAccounts, 'allAccounts', 'docs_accounts');
            
            safeSet(fetchedLoans, 'allLoans', 'docs_loans');
            safeSet(fetchedInventoryAdjustments, 'allInventoryAdjustments', 'docs_inventory_adjustments');
            safeSet(fetchedInventoryTransactions, 'allInventoryTransactions'); // No table provided so just sets
            safeSet(fetchedProductCosts, 'allProductCosts');
            safeSet(fetchedPayslips, 'allPayslips', 'docs_payslips');
            safeSet(fetchedAdvanceSalaries, 'allAdvanceSalaries', 'docs_advance_salaries');
            safeSet(fetchedBrands, 'allBrands', 'docs_brands');
            safeSet(fetchedCategories, 'allCategories', 'docs_categories');
            safeSet(fetchedAttendance, 'allAttendance', 'docs_attendance');
            safeSet(fetchedCommissionTargets, 'allCommissionTargets', 'docs_commission_targets');
            safeSet(fetchedLeaves, 'allLeaves', 'docs_leaves');
            safeSet(fetchedTasks, 'allTasks', 'docs_tasks');
            safeSet(fetchedHolidays, 'allHolidays', 'docs_holidays');
            
            console.log('[Store] Phase 2 doc loading complete via Settled Promises.');
            // 2. Apply fresh cloud data over the hydrated UI
            if (isMounted) {
               lastFetchedCompanyIdsRef.current = activeCids;
               applyDataToState(data);
               
               const cIds: string[] = [];
               const pIds: string[] = [];
               if (fetchedInvoices) {
                 cIds.push(...fetchedInvoices.map((i: any) => i.customerId));
                 pIds.push(...fetchedInvoices.flatMap((i: any) => i.items || []).map((it: any) => it.productId));
               }
               if (fetchedBills) {
                 cIds.push(...fetchedBills.map((b: any) => b.vendorId));
                 pIds.push(...fetchedBills.flatMap((b: any) => b.items || []).map((it: any) => it.productId));
               }
               if (fetchedCreditNotes) {
                 cIds.push(...fetchedCreditNotes.map((cn: any) => cn.customerId));
                 pIds.push(...fetchedCreditNotes.flatMap((cn: any) => cn.items || []).map((it: any) => it.productId));
               }
               const uniqueCIds = Array.from(new Set(cIds.filter(Boolean)));
               const uniquePIds = Array.from(new Set(pIds.filter(Boolean)));
               if (uniqueCIds.length > 0 || uniquePIds.length > 0) {
                 ensureEntitiesMetadata(uniqueCIds, uniquePIds);
               }
            }
          } catch (e) {
            console.warn('[Store] Phase 2 doc loading failed, falling back to JSON state', e);
          }
        }
      } catch (err: any) {
        console.error('[Store] Sync Load Error:', err);
        // Do not block the app on load error if we can fail gracefully
        if (!isMounted) return;
        setLoadError(null); // Bypass critical error screen so user can use local mode
      } finally {
        if (isMounted) {
          setStoreInitialized(true);
          setSessionChecked(true);
          setTimeout(() => {
            if (isMounted) isBootingRef.current = false;
          }, 1000); // 1s buffer for React to digest the boot state
        }
      }
    };
    loadState();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync state to local whenever data changes (throttled/debounced)
  useEffect(() => {
    if (!storeInitialized) return;

    const timer = setTimeout(async () => {
      setIsStoreSyncing(true);
      try {
        const data = {
          users,
    roles,
    companies, allAccounts, allEntries, allInvoices, allBills,
          allCreditNotes, allProducts, allContacts, allPayments, allLoans,
          allInventoryAdjustments, allInventoryTransactions, allPayslips, allAdvanceSalaries, allBrands,
          allCategories, allAttendance, allCommissionTargets, allLeaves,
          allTasks, allHolidays
        };
        
        // Sanitize data
        const cleanData = JSON.parse(JSON.stringify(data));
        
        // 1. Local Persist
        try {
          
          await set('accounting_store', cleanData);
          localStorage.setItem('activeCompanyIds', JSON.stringify(activeCompanyIds));
        } catch(e) {
          localStorage.setItem('accounting_store', JSON.stringify(cleanData));
          localStorage.setItem('activeCompanyIds', JSON.stringify(activeCompanyIds));
        }

        
      } catch (err: any) {
        console.error('[Store] General Sync Error:', err);
      } finally {
        setIsStoreSyncing(false);
      }
    }, 2500); // 2.5s debounce

    return () => clearTimeout(timer);
  }, [
    storeInitialized, syncVersion, companies, allAccounts, allEntries, allInvoices, allBills,
    allCreditNotes, allProducts, allContacts, allPayments, allLoans,
    allInventoryAdjustments, allPayslips, allAdvanceSalaries, allBrands,
    allCategories, allAttendance, allCommissionTargets, allLeaves,
    allTasks, allHolidays, users, roles
  ]);

  // Anytime activeCompanyIds changes after initial load, fetch fresh company-linked documents
  useEffect(() => {
    if (!storeInitialized) return;
    
    // De-duplicate if we already fetched these company IDs during boot or previous switch
    const companyIdsStr = [...activeCompanyIds].sort().join(',');
    const lastFetchedStr = [...lastFetchedCompanyIdsRef.current].sort().join(',');
    if (companyIdsStr === lastFetchedStr) {
       console.log('[Store] Skipping redundant tenant reload - already fetched');
       return;
    }
    
    let isCurrent = true;
    const reload = async () => {
      try {
        console.log('[Store] Tenant changed, loading data for new companies:', activeCompanyIds);
        
        const activeCids = activeCompanyIds;
        
        // Fetch products, contacts, invoices, journals, bills, payments, credit notes, loans
        const results = await Promise.allSettled([
          dbService.getDocs('docs_loans', activeCids),
          dbService.getPaginatedDocs('docs_invoices', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
          dbService.getPaginatedDocs('docs_bills', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
          dbService.getPaginatedDocs('docs_payments', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
          dbService.getPaginatedDocs('docs_credit_notes', { companyIds: activeCids, limit: 100 }).then(r => r.data),
          dbService.getPaginatedDocs('docs_journals', { companyIds: activeCids, limit: 100, sortField: 'date', sortOrder: 'desc' }).then(r => r.data),
        ]);
        
        if (!isCurrent) return;
        
        lastFetchedCompanyIdsRef.current = activeCompanyIds;
        
        const loansRes = results[0];
        const invoicesRes = results[1];
        const billsRes = results[2];
        const paymentsRes = results[3];
        const creditNotesRes = results[4];
        const journalsRes = results[5];
        
        if (loansRes.status === 'fulfilled' && Array.isArray(loansRes.value)) {
          const mappedLoans = loansRes.value.map((l: any) => {
            if (!l.amortizationSchedule || l.amortizationSchedule.length === 0) {
              return {
                ...l,
                amortizationSchedule: calculateAmortization(
                  l.principalAmount || l.amount || 0,
                  l.interestRate || 0,
                  l.termMonths || 0,
                  l.startDate || l.date || '',
                  l.interestType || 'REDUCING'
                )
              };
            }
            return l;
          });
          setAllLoans(mappedLoans);
        }
        
        if (invoicesRes.status === 'fulfilled' && Array.isArray(invoicesRes.value)) {
          setAllInvoices(invoicesRes.value);
        }
        
        if (billsRes.status === 'fulfilled' && Array.isArray(billsRes.value)) {
          setAllBills(billsRes.value);
        }
        
        if (paymentsRes.status === 'fulfilled' && Array.isArray(paymentsRes.value)) {
          setAllPayments(paymentsRes.value);
        }
        
        if (creditNotesRes.status === 'fulfilled' && Array.isArray(creditNotesRes.value)) {
          setAllCreditNotes(creditNotesRes.value);
        }
        
        if (journalsRes.status === 'fulfilled' && Array.isArray(journalsRes.value)) {
          setAllEntries(journalsRes.value);
        }
        
      } catch (err) {
        console.error('[Store] Failed to reload customer/partner data:', err);
      }
    };
    
    reload();
    return () => {
      isCurrent = false;
    };
  }, [activeCompanyIds, storeInitialized]);

  const pushHistory = useCallback((entry: any) => {
    setNavStack(prev => [...prev, entry]);
  }, []);

  const popHistory = useCallback(() => {
    if (navStack.length === 0) return null;
    const last = navStack[navStack.length - 1];
    setNavStack(prev => prev.slice(0, -1));
    return last;
  }, [navStack]);

  
  const closeFiscalPeriod = useCallback(async (periodId: string) => {
    
    const { error } = await supabase.from('docs_fiscal_periods')
      .update({ is_closed: true, closed_at: new Date().toISOString(), closed_by: currentUser?.id })
      .eq('id', periodId);
    if (error) throw error;
  }, [currentUser]);

  const login = useCallback(async (username: string, pin: string) => {
    return useAccountingStoreBase.getState().login(username, pin);
  }, []);

  const signUp = useCallback(async (email: string, pin: string, name: string) => {
    return useAccountingStoreBase.getState().signUp(email, pin, name);
  }, []);

  const logout = useCallback(async () => {
    return useAccountingStoreBase.getState().logout();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    return useAccountingStoreBase.getState().resetPassword(email);
  }, []);

  const confirmPasswordReset = useCallback(async (newPassword: string) => {
    return useAccountingStoreBase.getState().confirmPasswordReset(newPassword);
  }, []);

  const accounts = useMemo(() => (allAccounts || []).filter(a => a && a?.companyId && activeCompanyIds.includes(a?.companyId)), [allAccounts, activeCompanyIds]);
  const entries = useMemo(() => {
    const rawLines = allJournalLines || [];
    return (allEntries || [])
      .filter(e => e && e?.companyId && activeCompanyIds.includes(e?.companyId))
      .map(e => {
        // Find lines for this journal
        const lines = rawLines
          .filter(l => (l as any).journalId === e.id || (l as any).journal_id === e.id)
          .map(l => ({
            ...l,
            id: l.id,
            journalId: (l as any).journalId || (l as any).journal_id || e.id,
            accountId: (l as any).accountId || (l as any).account_id,
            contactId: (l as any).contactId || (l as any).contact_id,
            debit: Number((l as any).debit || 0),
            credit: Number((l as any).credit || 0),
            description: (l as any).description || e.description
          }));
        
        // Final Fallback: If flat table lines are missing (sync/load issue), try using embedded JSON 'lines'
        const finalLines = lines.length > 0 ? lines : (e.lines || []).map((l: any) => ({
           ...l,
           debit: Number(l.debit || 0),
           credit: Number(l.credit || 0)
        }));

        return { ...e, lines: finalLines };
      });
  }, [allEntries, allJournalLines, activeCompanyIds]);
   const journalLines = useMemo(() => (allJournalLines || []).filter(l => l && (l as any).company_id && activeCompanyIds.includes((l as any).company_id)), [allJournalLines, activeCompanyIds]);
  const invoices = useMemo(() => (allInvoices || []).filter(i => i && i?.companyId && activeCompanyIds.includes(i?.companyId)), [allInvoices, activeCompanyIds]);
  const bills = useMemo(() => (allBills || []).filter(b => b && b?.companyId && activeCompanyIds.includes(b?.companyId)), [allBills, activeCompanyIds]);
  const creditNotes = useMemo(() => (allCreditNotes || []).filter(cn => cn && cn?.companyId && activeCompanyIds.includes(cn?.companyId)), [allCreditNotes, activeCompanyIds]);
  const products = useMemo(() => {
    const activeCids = activeCompanyIds.length > 0 
      ? activeCompanyIds 
      : (companies && companies.length > 0 ? [companies[0].id] : []);
    return (allProducts || [])
      .filter(p => {
        if (!p) return false;
        // Strict Company Filtering: if companyId is set, it must be in activeCompanyIds
        // If not set, check companyIds
        const pCompanyIds = Array.isArray(p?.companyIds) ? p?.companyIds : [];
        if (pCompanyIds.length > 0) {
            return pCompanyIds.some((id: any) => activeCids.includes(id));
        }
        if (p?.companyId) {
          return activeCids.includes(p?.companyId);
        }
        return true;
      })
      .map(p => {
        // Advanced Inventory: Movement-based calculation per company
        const movementsAll = (allInventoryTransactions || [])
          .filter(t => (t.product_id === p.id || t.productId === p.id));
        
        const stockLevels: Record<string, number> = {};
        
        // Initial values from p.initialStockLevels (as base)
        const baseLevels = (p as any).initialStockLevels || (p as any).data?.initialStockLevels || {};
        Object.entries(baseLevels).forEach(([cid, q]) => {
          stockLevels[cid] = Number(q || 0);
        });

        // If we have OPENING_STOCK transactions for a company, they should override the fallback for that company
        // to avoid double-counting. But usually, the trigger creates OPENING_STOCK from initialStockLevels.
        // So we'll use a safer approach: if an OPENING_STOCK transaction exists for a company, 
        // we ignore the initialStockLevels value and rely purely on transactions.
        const companiesWithOpeningTx = new Set(
          movementsAll
            .filter(t => (t.reference_type || t.referenceType) === 'OPENING_STOCK')
            .map(t => t.company_id || t?.companyId)
        );

        companiesWithOpeningTx.forEach(cid => {
          if (cid && typeof cid === 'string') stockLevels[cid] = 0; // Reset fallback if transaction exists
        });

        // Apply all movements
        movementsAll.forEach(t => {
          const cid = t.company_id || t?.companyId;
          const type = (t.transaction_type || t.transactionType || '').toUpperCase();
          const q = Number(t.quantity || 0);
          if (!cid) return;

          if (stockLevels[cid] === undefined) stockLevels[cid] = 0;
          
          if (['IN', 'PURCHASE', 'ADJUSTMENT_IN', 'STOCK_OP'].includes(type)) {
            stockLevels[cid] += q;
          } else if (['OUT', 'SALE', 'ADJUSTMENT_OUT'].includes(type)) {
            stockLevels[cid] -= q;
          }
        });

        // Prefer database-computed values since they are the single source of truth across all historical transactions (avoiding 1000 limit pagination cutoff issues in the client)
        const dbStockLevels = (p as any).stockLevels || (p as any).stock_levels || (p as any).data?.stockLevels || (p as any).data?.stock_levels;
        const dbQty = (p as any).quantity_on_hand !== undefined ? Number((p as any).quantity_on_hand) : ((p as any).quantityOnHand !== undefined ? Number((p as any).quantityOnHand) : undefined);
        const calculatedQty = activeCids.reduce((sum, cid) => sum + (stockLevels[cid] || 0), 0);
        
        const finalStockLevels = (dbStockLevels && Object.keys(dbStockLevels).length > 0) ? dbStockLevels : stockLevels;
        
        let qty = 0;
        if (finalStockLevels && Object.keys(finalStockLevels).length > 0) {
           qty = activeCids.reduce((sum, cid) => sum + (Number(finalStockLevels[cid]) || 0), 0);
        } else {
           const primaryCid = p.company_id || (p as any).companyId || p.companyIds?.[0];
           if (primaryCid && activeCids.includes(primaryCid)) {
               qty = dbQty !== undefined ? dbQty : calculatedQty;
           } else {
               qty = 0;
           }
        }
        // We already built stockLevels purely from movementsAll correctly
        if (p.sku === 'SKU-THAT-HAS-ERROR' || p.name.includes('test')) {
            console.log("Product mapping:", { id: p.id, name: p.name, activeCids, finalStockLevels, qty });
        }


        // Get average cost from product_costs table (calculated by DB triggers) or fall back to database column cost_price
        const relevantCosts = (allProductCosts || []).filter(pc => {
          if (!pc) return false;
          const pcProdId = pc.productId || (pc as any).product_id;
          const pcCompanyId = pc?.companyId || (pc as any).company_id;
          return pcProdId === p.id && pcCompanyId && activeCompanyIds.includes(pcCompanyId);
        });
        const totalValue = relevantCosts.reduce((sum, c) => sum + (Number(c.totalValue !== undefined ? c.totalValue : (c as any).total_value || 0)), 0);
        const totalQty = relevantCosts.reduce((sum, c) => sum + (Number(c.totalQty !== undefined ? c.totalQty : (c as any).total_qty || 0)), 0);
        
        const calculatedWac = totalQty > 0 ? (totalValue / totalQty) : undefined;
        const dbCost = (p as any).cost_price !== undefined ? Number((p as any).cost_price) : ((p as any).costPrice !== undefined ? Number((p as any).costPrice) : undefined);
        
        // Prioritize dynamic weighted average cost (WAC). Fallback to static cost price only when dynamic cost is unavailable or 0.
        const wac = (calculatedWac !== undefined && calculatedWac > 0)
          ? calculatedWac
          : (dbCost !== undefined && dbCost > 0 ? dbCost : (p.costPrice || dbCost || 0));
          
        return { 
          ...p, 
          quantityOnHand: qty, 
          costPrice: wac,
          stockLevels: finalStockLevels // Explicit per-company stock levels for validation logic
        } as Product & { quantityOnHand: number; stockLevels: Record<string, number> };
      });
  }, [allProducts, activeCompanyIds, allInventoryTransactions, allProductCosts, companies]);
  const resolvedPaginatedProducts = useMemo(() => {
    return (paginatedProducts || [])
      .filter(pp => pp)
      .map(pp => {
        const resolved = (products || []).find(p => p && p.id === pp.id);
        return resolved ? resolved : pp;
      })
      .filter(p => {
        if (!p) return false;
        // Enforce strict company isolation
        const activeCids = activeCompanyIds.length > 0
          ? activeCompanyIds
          : (companies && companies.length > 0 ? [companies[0].id] : []);
        const pCompanyIds = Array.isArray(p?.companyIds) ? p?.companyIds : [];
        if (pCompanyIds.length > 0) {
            return pCompanyIds.some((id: any) => activeCids.includes(id));
        }
        if (p?.companyId) {
          return activeCids.includes(p?.companyId);
        }
        return true;
      });
  }, [paginatedProducts, products, activeCompanyIds, companies]);
  const contacts = useMemo(() => {
    const activeCids = activeCompanyIds.length > 0 
      ? activeCompanyIds 
      : (companies && companies.length > 0 ? [companies[0].id] : []);
    
    // Deduplicate logic: filter out CT-IMP- duplicates if a modern UUID exists with same name
    const validContacts = allContacts || [];
    const nonLegacyNames = new Set(
      validContacts
        .filter(c => c && c.id && !String(c.id).startsWith('CT-IMP-'))
        .map(c => String(c.name || '').toLowerCase().trim())
    );

    return validContacts.map(c => {
      if (c && c.id && String(c.id).startsWith('contact-cash-sale')) {
        return { ...c, name: 'Cash Sale' };
      }
      return c;
    }).filter(c => {
      if (!c) return false;
      const cIdStr = String(c.id);
      if (cIdStr.startsWith('CT-IMP-') && nonLegacyNames.has(String(c.name || '').toLowerCase().trim())) {
        return false; // Skip legacy duplicate
      }
      return (
        cIdStr.startsWith('contact-cash-sale') || 
        (c.type && c.type.toUpperCase() === 'CUSTOMER') || // Show all customers everywhere as per request
        (c.type && c.type.toUpperCase() === 'VENDOR') || // Show all vendors everywhere as per request
        ((c?.companyId || c?.company_id) && activeCids.includes(c?.companyId || c?.company_id)) || 
        (c?.companyIds || c?.company_ids || []).some(id => activeCids.includes(id))
      );
    });
  }, [allContacts, activeCompanyIds, companies]);
  const employees = useMemo(() => contacts.filter(c => c.type?.toUpperCase() === 'EMPLOYEE'), [contacts]);
   const payments = useMemo(() => (allPayments || []).filter(p => p && (activeCompanyIds.length === 0 || activeCompanyIds.includes(p?.companyId))), [allPayments, activeCompanyIds]);
  const loans = useMemo(() => (allLoans || []).filter(l => l && (activeCompanyIds.length === 0 || activeCompanyIds.includes(l?.companyId || l?.company_id))), [allLoans, activeCompanyIds]);
  const inventoryAdjustments = useMemo(() => (allInventoryAdjustments || []).filter(ia => ia && (activeCompanyIds.length === 0 || activeCompanyIds.includes(ia?.companyId))), [allInventoryAdjustments, activeCompanyIds]);
  const payslips = useMemo(() => (allPayslips || []).filter(p => p && (activeCompanyIds.length === 0 || activeCompanyIds.includes(p?.companyId))), [allPayslips, activeCompanyIds]);
  const attendance = useMemo(() => (allAttendance || []).filter(a => a && (activeCompanyIds.length === 0 || activeCompanyIds.includes(a?.companyId))), [allAttendance, activeCompanyIds]);
  const leaves = useMemo(() => (allLeaves || []).filter(l => l && (activeCompanyIds.length === 0 || activeCompanyIds.includes(l?.companyId))), [allLeaves, activeCompanyIds]);
  const tasks = useMemo(() => (allTasks || []).filter(t => t && (activeCompanyIds.length === 0 || activeCompanyIds.includes(t?.companyId))), [allTasks, activeCompanyIds]);
  const brands = useMemo(() => (allBrands || []).filter(b => b && (activeCompanyIds.length === 0 || activeCompanyIds.includes(b?.companyId))), [allBrands, activeCompanyIds]);
  const categories = useMemo(() => (allCategories || []).filter(c => c && (activeCompanyIds.length === 0 || activeCompanyIds.includes(c?.companyId))), [allCategories, activeCompanyIds]);
  const filteredUsers = useMemo(() => {
    if (!currentUser) return [];
    // Ensure uniqueness by ID to prevent duplicate key errors in UI
    const uniqueUsers = Array.from(new Map((users || []).map(u => [u.id, u])).values()) as User[];
    return uniqueUsers.filter(u => activeCompanyIds.length === 0 || (u?.companyIds || []).some(id => activeCompanyIds.includes(id)));
  }, [users, activeCompanyIds, currentUser]);

  const activeCompanies = useMemo(() => companies.filter(c => activeCompanyIds.includes(c.id)), [companies, activeCompanyIds]);

  const availableCompanies = useMemo(() => {
    if (!currentUser || currentUser.roleId === 'role-admin') return companies;
    const user = currentUser as User;
    return companies.filter(c => (user?.companyIds || []).includes(c.id));
  }, [companies, currentUser]);

  const hasPermission = useCallback((permission: PermissionKey) => {
    return useAccountingStoreBase.getState().hasPermission(permission, mergedRoles);
  }, [mergedRoles]);

  const selectAllCompanies = useCallback(() => {
    useAccountingStoreBase.getState().selectAllCompanies(currentUser);
  }, [currentUser]);


  const resolveUserName = useCallback((id?: string) => {
    if (!id) return '';
    const user = (users || []).find(u => u.id === id);
    if (user) return user.name || user.username || user.email || id;
    return id;
  }, [users]);

  const toggleCompany = useCallback((companyId: string) => {
    useAccountingStoreBase.getState().toggleCompany(companyId, currentUser);
  }, [currentUser]);

  const getChangeLog = useCallback((oldObj: any, updates: any, fields: string[]) => {
    const changes: string[] = [];
    
    // Track field changes
    fields.forEach(f => {
      if (updates[f] !== undefined && updates[f] !== oldObj[f]) {
        const label = f.charAt(0).toUpperCase() + f.slice(1).replace(/([A-Z])/g, ' $1');
        changes.push(`${label}: ${oldObj[f]} → ${updates[f]}`);
      }
    });

    // Track line item changes
    if (updates.items && Array.isArray(updates.items) && Array.isArray(oldObj.items)) {
      const oldItems = oldObj.items;
      const newItems = updates.items;

      newItems.forEach((newItem: any) => {
        const oldItem = oldItems.find((oi: any) => oi.id === newItem.id);
        if (oldItem) {
          const itemChanges: string[] = [];
          if (newItem.quantity !== oldItem.quantity) {
            itemChanges.push(`Qty: ${oldItem.quantity} → ${newItem.quantity}`);
          }
          if (newItem.unitPrice !== oldItem.unitPrice) {
            itemChanges.push(`Rate: ${oldItem.unitPrice} → ${newItem.unitPrice}`);
          }
          if (itemChanges.length > 0) {
            changes.push(`${newItem.description || 'Item'}: ${itemChanges.join(', ')}`);
          }
        } else {
          changes.push(`Added: ${newItem.description || 'New Item'}`);
        }
      });

      oldItems.forEach((oldItem: any) => {
        if (!newItems.find((ni: any) => ni.id === oldItem.id)) {
          changes.push(`Removed: ${oldItem.description || 'Item'}`);
        }
      });
    }
    return changes;
  }, []);

  const addCompany = useCallback(async (company: Omit<Company, 'id'>) => {
    const newId = generateUUID();
    const newComp = { ...company, id: newId, currency: company.currency || 'BDT', code: company.code || company.name.substring(0, 3).toUpperCase() };
    
    // Optimistic Update
    setCompanies(prev => [...prev, newComp]);
    setActiveCompanyIds(prev => [...prev, newId]);
    
    const newCompanyAccounts = INITIAL_ACCOUNTS.map(a => ({ ...a, id: `${newId}-${a.code}`, companyId: newId } as Account));
    setAllAccounts(prev => [...prev, ...newCompanyAccounts]);

    const defaultWarehouse: Warehouse = {
      id: `wh-${newId}-main`,
      name: 'Main Warehouse',
      code: 'MAIN',
      address: company.address || 'Company Location',
      companyId: newId,
      isDefault: true
    };
    setAllWarehouses(prev => [...prev, defaultWarehouse]);

    const globalCashSaleId = 'contact-cash-sale-global';
    const existingCashSale = (allContacts || []).find(c => c.id === globalCashSaleId);
    
    if (existingCashSale) {
      const updatedCashSale = { 
        ...existingCashSale, 
        companyIds: Array.from(new Set([...(existingCashSale?.companyIds || []), newId]))
      };
      setAllContacts(prev => prev.map(c => c.id === globalCashSaleId ? updatedCashSale : c));
      supabase.from('docs_contacts').upsert({
        id: globalCashSaleId,
        data: updatedCashSale,
        company_id: newId,
        name: 'Cash Sale',
        type: 'CUSTOMER'
      }).then(({error}) => { if (error) console.error(error); });
    } else {
      const cashSaleContact: Contact = {
        id: globalCashSaleId,
        name: 'Cash Sale',
        type: ContactType.CUSTOMER,
        companyIds: [newId],
        address: '',
        phone: '',
        email: 'cash@sale.com',
        openingBalances: { [newId]: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setAllContacts(prev => [...prev, cashSaleContact]);
      supabase.from('docs_contacts').upsert({
        id: globalCashSaleId,
        data: cashSaleContact,
        company_id: newId,
        name: 'Cash Sale',
        type: 'CUSTOMER'
      }).then(({error}) => { if (error) console.error(error); });
    }

    if (currentUser) {
      setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, companyIds: [...(u?.companyIds || []), newId] } : u));
      setCurrentUser(prev => prev ? { ...prev, companyIds: [...(prev.companyIds || []), newId] } : null);
      
      try {
        // Insert to docs_user_company_access to satisfy RLS
        try {
          const authUser = await supabase.auth.getUser();
          const authUid = authUser?.data?.user?.id;
          if (authUid) {
             await supabase.from('docs_user_company_access').upsert({
               user_uuid: authUid,
               company_id: newId,
               role_id: 'role-admin'
             });
             
             // ALSO update docs_users so check_company_access passes!
             const { data: profile } = await supabase.from('docs_users').select('*').eq('user_uuid', authUid).single();
             if (profile) {
               const currentIds = profile.data?.companyIds || profile.company_ids || [];
               const newIds = Array.from(new Set([...currentIds, newId]));
               await supabase.from('docs_users').update({
                 company_ids: newIds
               }).eq('id', profile.id);
             }
          }
        } catch(e) { console.error('docs_user_company_access upsert error', e); }
        
        await supabase.from('company_users').upsert({
          user_id: currentUser.id,
          company_id: newId,
          role: 'ADMIN'
        });
        console.log('[Store] Associated current user with new company in DB');
      } catch (err) {
        console.error('[Store] Failed to associate user with company:', err);
      }
    }
  }, [currentUser, setActiveCompanyIds, setUsers]);

  const updateCompany = useCallback((id: string, updates: Partial<Company>) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const generateNextNumber = useCallback((type: 'INVOICE' | 'BILL' | 'CREDIT_NOTE' | 'PAYMENT' | 'ADJUSTMENT' | 'JOURNAL' | 'EXPENSE' | 'CONTACT' | 'PRODUCT' | 'CATEGORY' | 'BRAND' | 'ACCOUNT', dateStr: string, targetCompanyId?: string, subType?: string) => {
    // Rely entirely on DB sequence triggers for auto-numbering
    // We only provide DRAFT identifiers in the frontend until PostgreSQL assigns the REAL sequential number
    const isDraftable = ['INVOICE', 'BILL', 'CREDIT_NOTE', 'PAYMENT', 'ADJUSTMENT', 'JOURNAL', 'EXPENSE'].includes(type);
    
    if (isDraftable) {
      return `DRAFT-${generateUUID().substring(0, 8).toUpperCase()}`;
    }
    
    return ''; // DB triggers generate sequence numbers for items with no drafts (Contacts, Products)
  }, []);

  const switchCompany = useCallback((companyId: string) => {
    setActiveCompanyIds([companyId]);
  }, []);

  const getAccountIdByCode = useCallback((code: string, targetCompanyId?: string) => {
    const companyId = targetCompanyId || activeCompanyIds[0];
    const accounts = accountsRef.current || allAccounts || [];
    
    // exact match for company
    const account = accounts.find(a => String(a.code || '') === String(code) && a?.companyId === companyId);
    if (account) return account.id;

    // type/subType match for generic requests like 'CASH'
    const typeMatch = accounts.find(a => String(a.subType || '').toUpperCase() === String(code).toUpperCase() && a?.companyId === companyId);
    if (typeMatch) return typeMatch.id;

    // company fallback code/type
    const fallbackInCompany = accounts.find(a => a?.companyId === companyId && 
      (String(a.code || '') === String(code) || String(a.subType || '').toUpperCase() === String(code).toUpperCase())
    );
    if (fallbackInCompany) return fallbackInCompany.id;

    // cross-company code fallback (only if targetCompanyId not explicitly specified)
    if (!targetCompanyId) {
      const globalFallbackCode = accounts.find(a => String(a.code || '') === String(code));
      if (globalFallbackCode) return globalFallbackCode.id;

      const globalFallbackType = accounts.find(a => String(a.subType || '').toUpperCase() === String(code).toUpperCase());
      if (globalFallbackType) return globalFallbackType.id;
    }

    return null;
  }, [allAccounts, activeCompanyIds]);

  const addAccount = useCallback((account: Omit<Account, 'id' | 'companyId'>, targetCompanyId?: string) => {
    const companyId = targetCompanyId || activeCompanyIds[0];
    
    let code = account.code;
    if (!code) {
      const typePrefixes: Record<string, string> = {
        'ASSET': '1', 'LIABILITY': '2', 'EQUITY': '3', 'REVENUE': '4', 'EXPENSE': '5'
      };
      code = `${typePrefixes[account.type] || '9'}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    }

    const newId = generateUUID();
    const newAccount = {
      ...account,
      id: newId,
      code,
      companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setAllAccounts((prev: any) => [...prev, newAccount]);
    accountsRef.current = [...(accountsRef.current || []), newAccount];

    // Persist
    supabase.from('docs_accounts').upsert({
      id: newId,
      data: newAccount,
      company_id: companyId,
      name: newAccount.name || '',
      code: newAccount.code || '',
      type: newAccount.type || '',
      sub_type: newAccount.subType || ''
    }).then(({error}) => { if (error) console.error(error); });

    return newAccount;
  }, [activeCompanyIds, setAllAccounts]);

  const addJournalEntry = useCallback(async (entry: Omit<JournalEntry, 'id' | 'companyId'>, targetCompanyId?: string) => {
    const companyId = targetCompanyId || activeCompanyIds[0];
    const company = companies.find(c => c.id === companyId);
    const companyCode = company?.code || 'CO';
    
    // STRONG VALIDATION: Prevent transaction confirmation if any account is not assigned or invalid
    if (entry.status !== 'DRAFT') {
      entry.lines.forEach((line, index) => {
        if (!line.accountId) {
          throw new Error(`Validation Error (${company?.name || 'Unknown Company'}): Line ${index + 1} is missing an account assignment.`);
        }
        const accountExists = accountsRef.current.some(a => a.id === line.accountId);
        if (!accountExists) {
          // Check if it's already a full ID or just a code
          throw new Error(`Validation Error (${company?.name || 'Unknown Company'}): Account '${line.accountId}' on line ${index + 1} does not exist in the Chart of Accounts.`);
        }
      });
    }

    // STRONG VALIDATION: Enforce double-entry integrity (debit = credit)
    if (entry.status === 'POSTED') {
      const balanced = Math.abs(entry.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) < 0.01;
      if (!balanced) {
        throw new Error(`Accounting Integrity Error: Journal entry must be balanced (Debits must equal Credits).`);
      }
      if (entry.lines.length < 2) {
        throw new Error(`Accounting Integrity Error: Double-entry requires at least two lines.`);
      }
    }



    // Check if an entry with this reference already exists for this company
    // This allows re-posting to the same journal entry if a previous attempt failed mid-way
    let existingId: string | null = (entry as any).id || null;
    if (!existingId && entry.reference && !['NEW', '', 'DRAFT'].includes(String(entry.reference).toUpperCase())) {
      const { data: existing } = await supabase.from('docs_journals')
        .select('id')
        .eq('company_id', companyId)
        .eq('reference_number', entry.reference)
        .maybeSingle();
      if (existing) existingId = existing.id;
    }

    const newId = existingId || generateUUID(); 

    let reference = entry.reference;
    // If we have a reference but it's not the one belonging to existingId, we might have a conflict
    // The RPC handle this by update, but direct upsert might fail.
    // However, if we found existingId, we use it, so there's no conflict on (company_id, reference).
    
    if (!reference || reference === 'NEW' || reference === '' || reference === 'DRAFT' || reference.toUpperCase() === 'DRAFT') {
      reference = generateDraftRef(newId);
    }
    const newEntry: JournalEntry = { 
      ...entry, 
      id: newId, 
      reference: reference || generateDraftRef(newId),
      companyId,
      companyCode,
      createdById: (entry as any).createdById || currentUser?.id || 'user-1'
    } as JournalEntry;

    // Call Transactional RPC for atomic save of header + lines
    // Ensure payload matches expected snake_case columns if the RPC uses them
    const rpcPayload = {
      ...newEntry,
      id: newEntry.id,
      company_id: companyId,
      journal_type: newEntry.journalType || 'MISC',
      journalType: newEntry.journalType || 'MISC',
      reference_number: newEntry.reference,
      reference: newEntry.reference,
      date: newEntry.date,
      status: newEntry.status,
      description: newEntry.description,
      preparedBy: newEntry.preparedBy || currentUser?.name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'System',
      createdById: newEntry.createdById || currentUser?.id || 'user-1',
      lines: (newEntry.lines || []).map((l: any) => ({
        ...l,
        id: (l.id && l.id.length > 10 && !['debit', 'credit'].includes(l.id)) ? l.id : generateUUID(),
        account_id: l.accountId,
        accountId: l.accountId,
        contact_id: l.contactId,
        contactId: l.contactId,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || newEntry.description || ''
      }))
    };

    console.log('addJournalEntry: Attempting RPC save...', rpcPayload);
    let rpcRes: any = null;
    let rpcError: any = null;
    
    try {
      const res = await supabase.rpc('create_journal_entry', {
        p_journal_data: rpcPayload,
        p_company_id: companyId
      });
      rpcRes = res.data;
      rpcError = res.error;

      // Handle duplicate reference conflict by looking up the ID and retrying once
      const rpcErrStr = rpcError ? (typeof rpcError === 'string' ? rpcError : (rpcError.message || JSON.stringify(rpcError))) : '';
      if (rpcErrStr.includes('unq_journal_num_company') || rpcErrStr.includes('duplicate key value') || rpcErrStr.includes('23505')) {
        console.warn('addJournalEntry: Duplicate reference detected, appending random suffix to reference...');
        rpcPayload.reference = `${rpcPayload.reference}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        rpcPayload.reference_number = rpcPayload.reference;
        const retryRes = await supabase.rpc('create_journal_entry', {
          p_journal_data: rpcPayload,
          p_company_id: companyId
        });
        rpcRes = retryRes.data;
        rpcError = retryRes.error;
      }
    } catch (err) {
      console.warn('addJournalEntry: RPC call failed with exception', err);
      rpcError = err;
    }

    if (rpcError || (rpcRes && !rpcRes.success)) {
      const errorMsg = rpcError?.message || rpcRes?.error || 'Unknown RPC error';
      throw new Error(`Add Journal Entry Failed: ${errorMsg}`);
    } else {
      console.log('addJournalEntry: Completed successfully via RPC', rpcRes);
    }
    
    // Immediate local update for better UX
    const linesWithJournalId = (newEntry.lines || []).map(l => ({ 
      ...l, 
      journalId: newEntry.id, 
      journal_id: newEntry.id,
      companyId: companyId,
      company_id: companyId
    }));
    
    setLocalOnlyEntries(prev => [newEntry, ...(prev || [])]);
    if (linesWithJournalId.length > 0) {
      setLocalOnlyLines(prev => [...linesWithJournalId, ...(prev || [])]);
    }
    
    refreshBalances();

    // Refetch journals and lines after a delay to get final server state (with numbers, IDs, etc)
    setTimeout(async () => {
      const { data: latestJournal } = await supabase.from('docs_journals').select('*').eq('id', newEntry.id).single();
      const { data: latestLines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', newEntry.id).or('debit.neq.0,credit.neq.0');
      
      if (latestJournal) {
        
        const mapped = mapDatabaseRowToFrontend(latestJournal);
        
        if (latestLines) {
          const nonZeroLines = latestLines.map(l => ({
            ...l,
            id: l.id,
            accountId: l.account_id || l.accountId,
            contactId: l.contact_id || l.contactId,
            journalId: l.journal_id || l.journalId
          }));
          mapped.lines = nonZeroLines;
          setLocalOnlyLines(prev => {
            const filtered = (prev || []).filter(l => (l as any).journal_id !== mapped.id && (l as any).journalId !== mapped.id);
            return [...filtered, ...nonZeroLines];
          });
        }

        setLocalOnlyEntries(prev => {
          const arr = prev || [];
          const idx = arr.findIndex(e => e.id === mapped.id);
          if (idx >= 0) {
            const next = [...arr];
            next[idx] = mapped;
            return next;
          }
          return [mapped, ...arr];
        });
      }
    }, 500);

    return newEntry;
  }, [activeCompanyIds, currentUser, setLocalOnlyEntries, setLocalOnlyLines, allAccounts, companies]);

  const clearPayment = useCallback((paymentId: string, status: 'CLEARED' | 'REJECTED') => {
    setAllPayments(prev => prev.map(p => {
      if (p.id === paymentId) {
        const isReceipt = p.type === 'RECEIPT';
        const companyId = p?.companyId;
        const cashAccount = p.accountId || getAccountIdByCode('100100', companyId); 
        const partnerAccount = p.partnerAccountId || (isReceipt ? getAccountIdByCode('100201', companyId) : getAccountIdByCode('2100', companyId)); 
        
        let journalEntryId = p.journalEntryId;
        let paymentStatus = p.status;

        if (status === 'CLEARED') {
          paymentStatus = 'POSTED';
          // Move logic to SQL backend
          if (p.method !== 'ADVANCE') {
            
            const paymentForRPC = { ...p, status: 'POSTED' };
            if (!paymentForRPC.number || paymentForRPC.number === 'NEW') {
              
              const companyInfo = (companies || []).find((c: any) => c.id === companyId);
              const compCode = companyInfo?.code || 'DEF';
              supabase.from('docs_payments').select('payment_number').eq('company_id', companyId).like('payment_number', `PAY-${compCode}-%`).order('payment_number', { ascending: false }).limit(1).then(({data}) => {

                 let nextSeq = 1;
                 if (data && data.length > 0 && data[0].payment_number) {
                   const parts = data[0].payment_number.split('-');
                   if (parts.length === 3) {
                     nextSeq = parseInt(parts[2], 10) + 1;
                   }
                 }
                 paymentForRPC.number = `PAY-${compCode}-${String(nextSeq).padStart(6, '0')}`;
                 paymentForRPC.memo = paymentForRPC.memo || paymentForRPC.number;
                 paymentForRPC.reference = paymentForRPC.number;
                 supabase.rpc('process_payment', { p_payment: paymentForRPC }).then(({ error }) => { if (error) console.error(error); else console.log('Payment cleared via SQL backend'); });
              });
            } else {
              paymentForRPC.memo = paymentForRPC.memo || paymentForRPC.reference;
              paymentForRPC.reference = paymentForRPC.number;
              supabase.rpc('process_payment', { p_payment: paymentForRPC }).then(({ error }) => { if (error) console.error(error); else console.log('Payment cleared via SQL backend'); });
            }

          }

          // Update related invoices/bills status
          if (p.appliedInvoices && p.appliedInvoices.length > 0) {
            setAllInvoices(prevInv => prevInv.map(inv => {
              const allocation = p.appliedInvoices?.find((a: any) => a.invoiceId === inv.id);
              if (allocation) {
                // Recalculate total paid including this newly cleared payment
                const otherPostedPayments = allPayments
                  .filter(otherP => otherP.id !== paymentId && otherP.status === 'POSTED' && (otherP.invoiceId === inv.id || (otherP.appliedInvoices || []).some(a => a.invoiceId === inv.id)))
                  .reduce((s, otherP) => {
                    if (otherP.invoiceId === inv.id) return s + otherP.amount;
                    const a = (otherP.appliedInvoices || []).find(ai => ai.invoiceId === inv.id);
                    return s + (a?.amount || 0);
                  }, 0);
                
                const creditsTotal = allCreditNotes
                  .filter(cn => cn.status === 'POSTED' || cn.status === 'CLOSED')
                  .reduce((s, cn) => {
                    const appliedToThis = (cn.appliedInvoices || []).find(a => a.invoiceId === inv.id)?.amount || 0;
                    const isOrigin = cn.originInvoiceId === inv.id ? cn.total : 0;
                    return s + (appliedToThis || isOrigin);
                  }, 0);

                const newTotalPaid = otherPostedPayments + creditsTotal + allocation.amount;
                
                let newStatus = inv.status;
                if (creditsTotal >= inv.total - 0.01) {
                  newStatus = 'FULL_REFUNDED' as any;
                } else if (creditsTotal > 0) {
                  newStatus = 'PARTIAL_REFUNDED' as any;
                } else if (newTotalPaid >= inv.total - 0.01) {
                  newStatus = 'PAID' as any;
                } else if (newTotalPaid > 0) {
                  newStatus = 'PARTIAL' as any;
                }
                return { ...inv, status: newStatus };
              }
              return inv;
            }));
          }
          if (p.appliedBills && p.appliedBills.length > 0) {
            setAllBills(prevBill => prevBill.map(bill => {
              const allocation = p.appliedBills?.find((a: any) => a.billId === bill.id);
              if (allocation) {
                const otherPostedPayments = allPayments
                  .filter(otherP => otherP.id !== paymentId && otherP.status === 'POSTED' && (otherP.billId === bill.id || (otherP.appliedBills || []).some(a => a.billId === bill.id)))
                  .reduce((s, otherP) => {
                    if (otherP.billId === bill.id) return s + otherP.amount;
                    const a = (otherP.appliedBills || []).find(ai => ai.billId === bill.id);
                    return s + (a?.amount || 0);
                  }, 0);

                const newTotalPaid = otherPostedPayments + allocation.amount;
                
                let newStatus = bill.status;
                if (newTotalPaid >= bill.total - 0.01) {
                  newStatus = 'PAID' as any;
                } else if (newTotalPaid > 0) {
                  newStatus = 'PARTIAL' as any;
                }
                return { ...bill, status: newStatus };
              }
              return bill;
            }));
          }
        } else {
          paymentStatus = 'VOID';
          // If rejected, revert invoice/bill status to POSTED or PARTIAL
          if (p.appliedInvoices && p.appliedInvoices.length > 0) {
            setAllInvoices(prevInv => prevInv.map(inv => {
              const allocation = p.appliedInvoices?.find((a: any) => a.invoiceId === inv.id);
              if (allocation) {
                const otherPostedPayments = allPayments
                  .filter(otherP => otherP.id !== paymentId && otherP.status === 'POSTED' && (otherP.invoiceId === inv.id || (otherP.appliedInvoices || []).some(a => a.invoiceId === inv.id)))
                  .reduce((s, otherP) => {
                    if (otherP.invoiceId === inv.id) return s + otherP.amount;
                    const a = (otherP.appliedInvoices || []).find(ai => ai.invoiceId === inv.id);
                    return s + (a?.amount || 0);
                  }, 0);
                
                const creditsTotal = allCreditNotes
                  .filter(cn => cn.status === 'POSTED' || cn.status === 'CLOSED')
                  .reduce((s, cn) => {
                    const appliedToThis = (cn.appliedInvoices || []).find(a => a.invoiceId === inv.id)?.amount || 0;
                    const isOrigin = cn.originInvoiceId === inv.id ? cn.total : 0;
                    return s + (appliedToThis || isOrigin);
                  }, 0);

                const newTotalPaid = otherPostedPayments + creditsTotal;
                
                let newStatus = inv.status;
                if (creditsTotal >= inv.total - 0.01) {
                  newStatus = 'FULL_REFUNDED' as any;
                } else if (creditsTotal > 0) {
                  newStatus = 'PARTIAL_REFUNDED' as any;
                } else if (newTotalPaid >= inv.total - 0.01) {
                  newStatus = 'PAID' as any;
                } else if (newTotalPaid > 0) {
                  newStatus = 'PARTIAL' as any;
                } else {
                  newStatus = 'POSTED' as any; // Revert to POSTED if no payments left
                }
                return { ...inv, status: newStatus };
              }
              return inv;
            }));
          }
          if (p.appliedBills && p.appliedBills.length > 0) {
            setAllBills(prevBill => prevBill.map(bill => {
              const allocation = p.appliedBills?.find((a: any) => a.billId === bill.id);
              if (allocation) {
                const otherPostedPayments = allPayments
                  .filter(otherP => otherP.id !== paymentId && otherP.status === 'POSTED' && (otherP.billId === bill.id || (otherP.appliedBills || []).some(a => a.billId === bill.id)))
                  .reduce((s, otherP) => {
                    if (otherP.billId === bill.id) return s + otherP.amount;
                    const a = (otherP.appliedBills || []).find(ai => ai.billId === bill.id);
                    return s + (a?.amount || 0);
                  }, 0);

                const newTotalPaid = otherPostedPayments;
                
                let newStatus = bill.status;
                if (newTotalPaid >= bill.total - 0.01) {
                  newStatus = 'PAID' as any;
                } else if (newTotalPaid > 0) {
                  newStatus = 'PARTIAL' as any;
                } else {
                  newStatus = 'POSTED' as any;
                }
                return { ...bill, status: newStatus };
              }
              return bill;
            }));
          }
        }

        return { 
          ...p, 
          clearingStatus: status, 
          clearedAt: new Date().toISOString(),
          clearedById: currentUser?.id,
          status: paymentStatus,
          journalEntryId
        };
      }
      return p;
    }));
  }, [currentUser, getAccountIdByCode, addJournalEntry]);

  const recordPartnerDiscount = useCallback(async (contactId: string, amount: number, date: string, description: string) => {
    try {
      const companyId = activeCompanyIds[0];
      const contact = allContacts?.find(c => c.id === contactId);
      if (!contact) throw new Error('Contact not found');

      const isVendor = contact.type === 'VENDOR';
      const isCustomer = contact.type === 'CUSTOMER';
      if (!isVendor && !isCustomer) throw new Error('Contact is neither a vendor nor a customer');

      let primaryAccountId: string | undefined;
      let discountAccountId: string | undefined;

      if (isVendor) {
        primaryAccountId = allAccounts?.find(a => a.code === '200101' || a.code === '2100' || a.subType === 'ACCOUNTS_PAYABLE')?.id;
        let discountAcc = allAccounts?.find(a => a.code === '400400' || a.code === '400401' || (a.name || '').toLowerCase().includes('earned') || (a.name || '').toLowerCase().includes('discount received'));
        if (!discountAcc) {
          discountAcc = addAccount({
            name: 'Discount Received',
            type: 'OTHER_REVENUE',
            code: '400400',
            description: 'Discounts received from vendors'
          }, companyId);
        }
        discountAccountId = discountAcc?.id;
      } else {
        primaryAccountId = allAccounts?.find(a => a.code === '100201' || a.code === '1200' || a.subType === 'ACCOUNTS_RECEIVABLE')?.id;
        let discountAcc = allAccounts?.find(a => a.code === '400300' || a.code === '601100' || (a.name || '').toLowerCase().includes('discount given') || (a.name || '').toLowerCase().includes('discount allowed'));
        if (!discountAcc) {
          discountAcc = addAccount({
            name: 'Discount Given',
            type: 'REVENUE',
            code: '400300',
            description: 'Discounts given to customers'
          }, companyId);
        }
        discountAccountId = discountAcc?.id;
      }

      if (!primaryAccountId) throw new Error('Primary account (A/R or A/P) not found');
      if (!discountAccountId) throw new Error('Discount account not found');

      const journalNum = generateNextNumber('JOURNAL', date, companyId);
      await addJournalEntry({
        referenceNumber: journalNum,
        date: date,
        status: 'POSTED',
        description: description || `${isVendor ? 'Purchase' : 'Sales'} Discount - ${contact.name}`,
        journalType: isVendor ? 'PURCHASE_DISCOUNT' : 'SALES_DISCOUNT',
        lines: [
          {
            accountId: primaryAccountId,
            contactId: contactId,
            debit: isVendor ? amount : 0,
            credit: isCustomer ? amount : 0,
            description: `${isVendor ? 'A/P' : 'A/R'} Adjustment for Discount`
          } as any,
          {
            accountId: discountAccountId,
            contactId: contactId,
            debit: isCustomer ? amount : 0,
            credit: isVendor ? amount : 0,
            description: `${isVendor ? 'Discount Received' : 'Discount Allowed'} - ${contact.name}`
          } as any
        ]
      }, companyId);
      await fetchEntries({ limit: 1000 });
    } catch (error) {
      console.error('Partner discount registration failed:', error);
      throw error;
    }
  }, [activeCompanyIds, allContacts, allAccounts, addAccount, addJournalEntry, generateNextNumber, fetchEntries]);

  const updateJournalEntry = useCallback(async (id: string, updates: Partial<JournalEntry>) => {
    let updatedEntry: JournalEntry | null = null;
    let originalEntry: JournalEntry | undefined = allEntries.find(e => e.id === id);
    
    if (!originalEntry) {
      // Must fetch from DB to avoid overwriting with a partial payload
      try {
        
        const { data: dbEntry } = await supabase.from('docs_journals').select('*').eq('id', id).single();
        if (dbEntry) {
          
          originalEntry = mapDatabaseRowToFrontend(dbEntry) as JournalEntry;
          const { data: dbLines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', id).or('debit.neq.0,credit.neq.0');
          if (dbLines && dbLines.length > 0) {
              const nonZeroDbLines = dbLines;
              const mappedLines = nonZeroDbLines.map((row: any) => ({
                 id: row.id,
                 accountId: row.account_id,
                 contactId: row.contact_id,
                 debit: row.debit,
                 credit: row.credit,
                 description: row.description
              }));
              originalEntry.lines = mappedLines;
          }
        }
      } catch (e) {
        console.warn('Failed to fetch original journal entry before update', e);
      }
    }
    
    if (originalEntry) {
      const merged = { ...originalEntry, ...updates };
      // STRONG VALIDATION: Prevent transaction confirmation if any account is not assigned or invalid
      if (merged.status !== 'DRAFT') {
        const company = companies.find(c => c.id === (merged as JournalEntry)?.companyId);
        merged.lines.forEach((line, index) => {
          if (!line.accountId) {
            throw new Error(`Validation Error (${company?.name || 'Unknown Company'}): Line ${index + 1} is missing an account assignment.`);
          }
          const accountExists = accountsRef.current.some(a => a.id === line.accountId);
          if (!accountExists) {
            throw new Error(`Validation Error (${company?.name || 'Unknown Company'}): Account '${line.accountId}' on line ${index + 1} does not exist in the Chart of Accounts.`);
          }
        });
      }
    }

    const merged = originalEntry ? { ...originalEntry, ...updates } : (updates as JournalEntry);
    
    let reference = merged.reference;
    if (!reference || reference === 'NEW' || reference === '' || reference === 'DRAFT' || reference.toUpperCase() === 'DRAFT') {
      const parts = id.split('-');
      const ts = parts[1] || generateUUID();
      const rand = parts[2] || generateUUID();
      reference = `DRAFT-${ts}-${rand}`;
    }

    updatedEntry = originalEntry ? { ...originalEntry, ...updates, reference } : { id, ...updates, reference } as JournalEntry;

    // Direct push via RPC
    if (updatedEntry) {
      try {
        const companyId = (updatedEntry as JournalEntry).companyId;
        const entryObj = updatedEntry as JournalEntry;
        
        const rpcPayload = {
          ...entryObj,
          id: entryObj.id,
          journal_type: entryObj.journalType || 'MISC',
          reference_number: reference || generateDraftRef(entryObj.id),
          reference: reference || generateDraftRef(entryObj.id),
          status: entryObj.status,
          preparedBy: entryObj.preparedBy || currentUser?.name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'System',
          lines: (entryObj.lines || []).map((l: any) => ({
            ...l,
            id: (l.id && l.id.length > 10 && !['debit', 'credit'].includes(l.id)) ? l.id : generateUUID(),
            account_id: l.accountId,
            accountId: l.accountId,
            contact_id: l.contactId,
            contactId: l.contactId,
            debit: l.debit || 0,
            credit: l.credit || 0
          }))
        };

        const { data: rpcRes, error: rpcError } = await supabase.rpc('create_journal_entry', {
          p_journal_data: rpcPayload,
          p_company_id: companyId
        });

        if (rpcError || (rpcRes && !rpcRes.success)) {
          const errorMsg = rpcError?.message || rpcRes?.error || 'Unknown RPC error';
          throw new Error(`Update Journal Entry Failed: ${errorMsg}`);
        }

        // Apply updated entry locally only AFTER successful RPC
        setLocalOnlyEntries(prev => prev.map(e => e.id === id ? updatedEntry! : e));

        // 5. Refetch to get consistent state
        setTimeout(async () => {
          const { data: latestJournal } = await supabase.from('docs_journals').select('*').eq('id', id).single();
          const { data: latestLines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', id).or('debit.neq.0,credit.neq.0');
          if (latestJournal) {
            
            const mapped = mapDatabaseRowToFrontend(latestJournal);
            
            if (latestLines) {
              const nonZeroLines = latestLines.map(l => ({
                ...l,
                id: l.id,
                accountId: l.account_id || l.accountId,
                contactId: l.contact_id || l.contactId,
                journalId: l.journal_id || l.journalId
              }));
              mapped.lines = nonZeroLines;
              setLocalOnlyLines(prev => {
                const filtered = (prev || []).filter(l => (l as any).journal_id !== mapped.id && (l as any).journalId !== mapped.id);
                return [...filtered, ...nonZeroLines];
              });
            }
            setLocalOnlyEntries(prev => prev.map(e => e.id === id ? mapped : e));
          }
        }, 500);
      } catch (err: any) {
        console.error('updateJournalEntry: sync failed', err);
        throw err;
      }
    }
  }, [allEntries, allAccounts, setLocalOnlyEntries, companies]);

  const resetJournalEntryToDraft = useCallback(async (id: string) => {
    setLocalOnlyEntries(prev => prev.map(entry => entry.id === id ? { ...entry, status: 'DRAFT' } : entry));
    const { error } = await supabase.from('docs_journals').update({ status: 'DRAFT' }).eq('id', id);
    if (error) {
      // Revert optimism
      setLocalOnlyEntries(prev => prev.filter(e => true)); // forces an update, but real reverting is better
      throw new Error(`Failed to reset journal: ${error.message}`);
    }
  }, [setLocalOnlyEntries]);

  const getAccountBalance = useCallback((accountId: string, companyId?: string) => {
    return accountBalances[accountId] || 0;
  }, [accountBalances]);

  const getPartnerBalance = useCallback((contactId: string, companyId?: string) => {
    const contact = (allContacts || []).find(c => c.id === contactId);
    if (!contact) return 0;

    let balance = partnerBalances[contactId] || 0;
    if (contact.type === ContactType.VENDOR) {
      return -(Math.round(balance * 100) / 100);
    }
    return Math.round(balance * 100) / 100;
  }, [partnerBalances, allContacts]);

  const deleteInvoice = useCallback(async (id: string) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity. Use 'Cancel' or 'Reverse' instead.");
  }, []);

  const deleteBill = useCallback(async (id: string) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity. Use 'Cancel' or 'Reverse' instead.");
  }, []);

  const deletePayment = useCallback(async (id: string) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity. Use 'Cancel' or 'Reverse' instead.");
  }, []);

  const deleteCreditNote = useCallback(async (id: string) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity. Use 'Cancel' or 'Reverse' instead.");
  }, []);

  
  const reverseJournalEntry = useCallback(async (id: string) => {
    try {
      
      const { data, error } = await supabase.rpc('reverse_journal_entry', {
        p_journal_id: id,
        p_user_id: currentUser?.id
      });
      if (error) throw error;
      
      // Refresh local state
      await fetchInitialData(currentUser?.id || '');
      return data;
    } catch (err: any) {
      console.error('reverseJournalEntry failed:', err);
      throw err;
    }
  }, [currentUser, fetchInitialData]);

  const deleteJournalEntry = useCallback(async (id: string) => {
    try {
      const entry = allEntries.find(e => e.id === id);
      if (!entry) throw new Error('Entry not found locally.');
      
      const { error } = await supabase.from('docs_journals').delete().eq('id', id);
      if (error) {
         if (error.code === '23503') throw new Error('Cannot delete this journal entry because it is linked to other documents (like invoices, bills, or payments). Delete them first.');
         throw new Error(`Failed to delete journal entry: ${error.message}`);
      }
      
      setLocalOnlyEntries(prev => prev.filter(e => e.id !== id));
      setTimeout(() => {
        refreshBalances();
      }, 500);
    } catch (e: any) {
      console.error(e);
      throw e;
    }
  }, [allEntries, setLocalOnlyEntries, refreshBalances]);

  const resetCreditNoteToDraft = useCallback(async (id: string) => {
    const cn = allCreditNotes.find(c => c.id === id);
    if (!cn || cn.status !== 'POSTED') return;

    if (cn.journalEntryId) {
      setLocalOnlyEntries(prev => prev.map(e => e.id === cn.journalEntryId ? { ...e, status: 'DRAFT' } : e));
      await supabase.from('docs_journals').update({ status: 'DRAFT' }).eq('id', cn.journalEntryId);
    }
    setLocalOnlyCreditNotes(prev => prev.map(c => c.id === id ? { ...c, status: 'DRAFT' } : c));
await supabase.from('docs_credit_notes').update({ status: 'DRAFT' }).eq('id', id);
  }, [allCreditNotes, setLocalOnlyEntries, setLocalOnlyCreditNotes]);

  const addInvoice = useCallback(async (invoice: Omit<Invoice, 'id' | 'companyId' | 'createdById'>, targetCompanyId?: string) => {
    const companyId = targetCompanyId || (invoice as any).companyId || activeCompanyIds[0];
    const company = companies.find(c => c.id === companyId);
    const companyCode = company?.code || 'CO';
    const newId = generateUUID();
    
    // Auto-seed Cash Sale contact if it's being used and missing
    const cashSaleId = `contact-cash-sale-global`;
    if (invoice.customerId === 'contact-cash-sale' || invoice.customerId === cashSaleId || String(invoice.customerId).includes('cash-sale')) {
      const cashSaleExists = (allContacts || []).some(o => o.id === cashSaleId);
      if (!cashSaleExists) {
        console.log('addInvoice: Seeding Global Cash Sale contact');
        const cashSaleContact: Contact = {
          id: cashSaleId,
          name: 'Cash Sale',
          type: ContactType.CUSTOMER,
          email: 'cash@sale.com',
          companyIds: Array.from(new Set([...activeCompanyIds, companyId])),
          openingBalances: {}
        };
        // Background push to DB
        supabase.from('docs_contacts').upsert({
          id: cashSaleContact.id,
          data: cashSaleContact,
          company_id: companyId,
          name: 'Cash Sale',
          type: 'CUSTOMER',
          updated_at: new Date().toISOString()
        }).then(({error}) => {
          if (error) console.error("Failed to seed Cash Sale contact:", error);
        });
        setAllContacts(prev => [...(prev || []), cashSaleContact]);
      } else {
        // Ensure current company is in the global contact's companyIds
        const existing = (allContacts || []).find(c => c.id === cashSaleId);
        if (existing && !existing.companyIds.includes(companyId)) {
          const updated = { ...existing, companyIds: [...existing.companyIds, companyId] };
          setAllContacts(prev => prev.map(c => c.id === cashSaleId ? updated : c));
          supabase.from('docs_contacts').update({ data: updated }).eq('id', cashSaleId);
        }
      }
      // Ensure the invoice uses the global cash sale ID
      (invoice as any).customerId = cashSaleId;
    }

    // Auto-generate number if not provided or if it's 'DRAFT'
    
    let number = invoice.number;
    const isDraft = !number || number === 'DRAFT' || number === 'NEW' || String(number).startsWith('DRAFT-');
    if (isDraft) {
      
      const companyInfo = (companies || []).find((c: any) => c.id === companyId);
      const compCode = companyInfo?.code || 'DEF';
      const { data } = await supabase.from('docs_invoices').select('invoice_number').eq('company_id', companyId).like('invoice_number', `INV-${compCode}-%`).order('invoice_number', { ascending: false }).limit(1);
      let nextSeq = 1;
      if (data && data.length > 0 && data[0].invoice_number) {
        const parts = data[0].invoice_number.split('-');
        if (parts.length === 3) nextSeq = parseInt(parts[2], 10) + 1;
      }
    
      number = `INV-${compCode}-${String(nextSeq).padStart(6, '0')}`;
    }


    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const isCashSaleAdd = invoice.customerId && (
      String(invoice.customerId).toLowerCase().includes('cash-sale') ||
      (allContacts || []).some(c => c.id === invoice.customerId && String(c.name || '').toLowerCase().trim() === 'cash sale')
    );
    const typeValue = (isCashSaleAdd && (!invoice.paymentMethod || invoice.paymentMethod === 'CASH')) ? 'CASH_SALE' : (isCashSaleAdd ? 'STANDARD' : (invoice as any).type);
    const newInvoice: any = {
      ...invoice,
      type: typeValue,
      id: newId, 
      number: isDraft ? `DRAFT-${newId.split('-')[1]}` : number, // Use unique draft number for state/trigger
      companyId,
      companyCode,
      createdById: currentUser?.id || 'user-1',
      preparedBy: (invoice as any).preparedBy || currentUser?.name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'System',
      messages: [{
        id: generateUUID(),
        authorId: currentUser?.id || 'user-1',
        body: `Invoice created`,
        date: formatDateTime(new Date()),
        type: 'notification'
      }]
    };

    let attempts = 0;
    let success = false;
    let savedNumber = '';

    while (attempts < 2 && !success) {
      try {
        attempts++;
        console.log(`addInvoice: Insert attempt ${attempts} for ${newId} with number ${number}`);
        // Bypass process_invoice for drafts to prevent backend overwriting
        const draftInvoice = { ...newInvoice, status: 'DRAFT' };
        const { error: insertErr } = await supabase.from('docs_invoices').insert({
          id: draftInvoice.id,
          data: draftInvoice,
          company_id: draftInvoice.companyId,
          date: draftInvoice.date,
          customer_id: draftInvoice.customerId,
          status: 'DRAFT',
          subtotal: draftInvoice.subtotal || 0,
          discount_total: draftInvoice.discountTotal || 0,
          tax_total: draftInvoice.taxTotal || 0,
          total: draftInvoice.total || 0,
          invoice_number: draftInvoice.number,
          updated_at: new Date().toISOString()
        });

        let error = insertErr;
        let rpcData = { processed_invoice: draftInvoice };
        
        if (!error) {
          const lines = (draftInvoice.items || []).map((item: any) => ({
            id: item.id || generateUUID(),
            invoice_id: draftInvoice.id,
            company_id: draftInvoice.companyId,
            product_id: item.productId,
            quantity: item.quantity || 0,
            unit_price: item.unitPrice || 0,
            discount: item.discountAmount || 0,
            tax: item.taxAmount || 0,
            total: item.total || 0,
            description: item.description || '',
            line_value: item.lineValue || 0,
            discount_rate: item.discountRate || 0,
            discount_mode: item.discountMode || 'PERCENT',
            type: item.type || 'PRODUCT',
            updated_at: new Date().toISOString()
          }));
          if (lines.length > 0) {
            await supabase.from('docs_invoice_lines').insert(lines);
          }
        }
        
        if (error) {
          console.error(`addInvoice: Supabase insert error:`, error.message, error.details);
          throw new Error(`Database Error (Add Invoice): ${error.message}`);
        }
        
        const processedInvoice = rpcData?.processed_invoice;
        if (processedInvoice) {
            Object.assign(newInvoice, processedInvoice);
        }
        // Fetch fully calculated data
        const { data: fetchReq } = await supabase.from('docs_invoices').select('data').eq('id', newInvoice.id).single();
        if (fetchReq && fetchReq.data) {
             Object.assign(newInvoice, fetchReq.data);
        }
        success = true;
        savedNumber = newInvoice.number || '';
        console.log(`addInvoice: Successfully saved with number: ${savedNumber}`);
        newInvoice.number = savedNumber;
        if (newInvoice.messages && newInvoice.messages[0]) {
           newInvoice.messages[0].body = `Invoice created with number ${savedNumber}`;
        }
      } catch (err) {
        console.error(`Invoice insert attempt ${attempts} failed:`, err);
        if (attempts >= 2) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Call setLocalOnlyInvoices to avoid double database sync
    setLocalOnlyInvoices(prev => [newInvoice, ...prev]);
    setPaginatedInvoices(prev => [newInvoice, ...prev]);
    return newInvoice;
  }, [activeCompanyIds, currentUser, setLocalOnlyInvoices]);

  const postPayment = useCallback(async (payment: any) => {
    const paymentId = payment.id || generateUUID();
    const existingPayment = allPayments.find((p: any) => p.id === paymentId);
    
    // Prevent saving as POSTED if RPC hasn't run yet, to avoid limbo state on network failure
    const isIntendedPost = (payment.status === 'POSTED' || payment.status === 'CLEARED');
    const originalStatus = existingPayment?.status || 'DRAFT';
    const safeStatus = payment.status || existingPayment?.status || 'DRAFT';

    let payNum = payment.number || existingPayment?.number;
    const isDraftNum = !payNum || payNum === 'DRAFT' || payNum === 'NEW' || String(payNum).startsWith('DRAFT-');
    if (isDraftNum) payNum = null as any; // db sequencing trigger
    
    let paymentToSave = {
      ...existingPayment,
      ...payment,
      id: paymentId,
      number: payNum,
      status: safeStatus,
      preparedBy: payment.preparedBy || existingPayment?.preparedBy || currentUser?.name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'System',
      createdById: payment.createdById || existingPayment?.createdById || currentUser?.id || 'user-1'
    };

    const companyId = paymentToSave?.companyId || paymentToSave.company_id || activeCompanyIds[0];
    if (paymentToSave) paymentToSave.companyId = companyId;

    // Auto-resolve missing liquidityAccountId (account_id) based on the payment method
    let resolvedLiquidityAccountId = paymentToSave.liquidityAccountId || paymentToSave.accountId || paymentToSave.account_id;
    if (!resolvedLiquidityAccountId) {
      const accountsList = (accounts || []).filter((a: any) => a.company_id === companyId || a?.companyId === companyId);
      const cash100100 = accountsList.find((acc: any) => acc.code === '100100');
      if (cash100100 && (!paymentToSave.method || paymentToSave.method === 'CASH')) {
        resolvedLiquidityAccountId = cash100100.id;
      } else {
        const isBank = paymentToSave.method === 'BANK' || (paymentToSave.reference && paymentToSave.reference.toLowerCase().includes('bank')) || (paymentToSave.memo && paymentToSave.memo.toLowerCase().includes('bank'));
        const matched = accountsList.find((acc: any) => 
          !isBank 
            ? (acc.subType === 'CASH' || (acc.name || '').toLowerCase().includes('cash'))
            : (acc.subType === 'BANK' || (acc.name || '').toLowerCase().includes('bank'))
        );
        if (matched) {
          resolvedLiquidityAccountId = matched.id;
        } else {
          const fallback = accountsList.find((acc: any) => acc.type === 'ASSET' && (acc.subType === 'CASH' || acc.subType === 'BANK' || (acc.name || '').toLowerCase().includes('cash') || (acc.name || '').toLowerCase().includes('bank')));
          if (fallback) {
            resolvedLiquidityAccountId = fallback.id;
          }
        }
      }
    }
    paymentToSave.liquidityAccountId = resolvedLiquidityAccountId;
    paymentToSave.accountId = resolvedLiquidityAccountId;
    paymentToSave.account_id = resolvedLiquidityAccountId;

    // Resolve partner_account_id - enforce strong logic: Customers always route to Accounts Receivable, Vendors to Accounts Payable.
    const isReceipt = paymentToSave.type === 'RECEIPT' || paymentToSave.type === 'COLLECTION' || paymentToSave.type === 'REFUND';
    const accountsList = (accounts || []).filter((a: any) => a.company_id === companyId || a?.companyId === companyId);
    const matchedPartner = accountsList.find((acc: any) => 
      isReceipt 
        ? (acc.code === '100201' || acc.sub_type === 'ACCOUNTS_RECEIVABLE' || acc.subType === 'ACCOUNTS_RECEIVABLE')
        : (acc.code === '200101' || acc.sub_type === 'ACCOUNTS_PAYABLE' || acc.subType === 'ACCOUNTS_PAYABLE' || acc.code === '2100')
    );
    let resolvedPartnerAccountId = matchedPartner?.id || (isReceipt ? `${companyId}-100201` : `${companyId}-200101`);
    paymentToSave.partnerAccountId = resolvedPartnerAccountId;
    paymentToSave.partner_account_id = resolvedPartnerAccountId;

    // Auto-allocation moved to backend trigger/rpc

        
    let retries = 0;
    const maxRetries = 3;
    let paymentSuccess = false;
    let lastError = null;
    
    while (retries < maxRetries && !paymentSuccess) {
      const paymentAttempt = { ...paymentToSave };
      if (!paymentAttempt.number || paymentAttempt.number === 'NEW') {
        
        const companyInfo = (companies || []).find((c: any) => c.id === companyId);
        const compCode = companyInfo?.code || 'DEF';
        const { data } = await supabase
          .from('docs_payments')
          .select('payment_number')
          .eq('company_id', companyId)
          .like('payment_number', `PAY-${compCode}-%`)
          .order('payment_number', { ascending: false })
          .limit(1);
          
        let nextSeq = 1;
        if (data && data.length > 0 && data[0].payment_number) {
          const parts = data[0].payment_number.split('-');
          if (parts.length === 3) {
            nextSeq = parseInt(parts[2], 10) + 1;
          }
        }
    
        
        paymentAttempt.number = `PAY-${compCode}-${String(nextSeq).padStart(6, '0')}`;
      }
      
      paymentAttempt.memo = paymentAttempt.memo || paymentAttempt.reference;
      paymentAttempt.reference = paymentAttempt.number;
      
      try {
        const resp = await supabase.rpc('process_payment', { p_payment: paymentAttempt });
        if (resp.error) throw resp.error;
        if (resp.data && !resp.data.success) throw new Error(resp.data.error || 'Posting failed');
        paymentSuccess = true;
      } catch (e: any) {
        lastError = e;
        if (e.code === '23505' || (e.message && e.message.includes('unique constraint'))) {
          retries++;
          // Wait a bit before retrying
          await new Promise(r => setTimeout(r, Math.random() * 500));
          continue;
        }
        throw new Error(`Payment processing failed on the server: ${e.message || 'Unknown error'}`);
      }
    }
    
    if (!paymentSuccess) {
      throw new Error(`Payment processing failed after retries: ${lastError?.message || 'Unknown error'}`);
    }


    if (existingPayment) {
      setLocalOnlyPayments(prev => prev.map(p => p.id === paymentId ? paymentToSave : p));
    } else {
      setLocalOnlyPayments(prev => [paymentToSave, ...prev]);
    }

    if (isIntendedPost) {
      // Update local state to reflect successful POSTED status
      paymentToSave.status = payment.status;
      setLocalOnlyPayments(prev => prev.map(p => p.id === paymentId ? paymentToSave : p));
      
      // Removed global fetchInitialData
    }

    if (isIntendedPost) {
      setTimeout(async () => {
        try {
          
          const cIds = [activeCompanyIds[0]];
          
          const { data: latestJournals } = await dbService.getPaginatedDocs('docs_journals', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
          if (latestJournals) setLocalOnlyEntries(prev => { const n = new Set(latestJournals.map(i=>i.id)); return [...latestJournals, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
          
          const { data: latestInvoices } = await dbService.getPaginatedDocs('docs_invoices', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
          if (latestInvoices) console.log('first invoice createdAt:', latestInvoices[0]?.createdAt, latestInvoices[0]?.created_at);
setLocalOnlyInvoices(prev => { const n = new Set(latestInvoices.map(i=>i.id)); return [...latestInvoices, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
  
          const { data: latestBills } = await dbService.getPaginatedDocs('docs_bills', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
          if (latestBills) setLocalOnlyBills(prev => { const n = new Set(latestBills.map(i=>i.id)); return [...latestBills, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });

          const { data: latestPayments } = await dbService.getPaginatedDocs('docs_payments', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
          if (latestPayments) setLocalOnlyPayments(prev => { const n = new Set(latestPayments.map(i=>i.id)); return [...latestPayments, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
        } catch (e) { console.warn('postPayment: Refresh failed', e); }
      }, 800);
    }
    
    return paymentToSave;
  }, [allPayments, activeCompanyIds, currentUser, fetchInitialData, setLocalOnlyPayments, accounts, allInvoices, allBills, setLocalOnlyEntries, setLocalOnlyInvoices, setLocalOnlyBills]);

  const postInvoice = useCallback(async (invoice: Invoice) => {
    let invoiceToSave = { ...invoice };
    const companyId = invoiceToSave?.companyId || activeCompanyIds[0];
    if (invoiceToSave) invoiceToSave.companyId = companyId;

    const isCashSale = invoiceToSave.customerId && (
      String(invoiceToSave.customerId).toLowerCase().includes('cash-sale') ||
      (allContacts || []).some(c => c.id === invoiceToSave.customerId && String(c.name || '').toLowerCase().trim() === 'cash sale')
    );

    if (isCashSale && (!invoiceToSave.paymentMethod || invoiceToSave.paymentMethod === 'CASH')) {
      invoiceToSave.type = 'CASH_SALE';
    } else if (isCashSale) {
      invoiceToSave.type = 'STANDARD';
    }

    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const initialStatus = invoiceToSave.status;
    const step2Status = isCashSale ? 'POSTED' : initialStatus;

    try {
      // Call the RPC to post the invoice
      const { data: rpcData, error: rpcError } = await supabase.rpc('post_invoice', { p_invoice_id: invoiceToSave.id, p_company_id: invoiceToSave.companyId });
      
      if (rpcError) throw rpcError;

      // Fetch the updated record
      const { data: updatedRecords, error: updError } = await supabase.from('docs_invoices')
        .select('invoice_number, status, data, journal_entry_id')
        .eq('id', invoiceToSave.id);
      
      if (updError) throw updError;
      
      if (updatedRecords && updatedRecords.length > 0) {
        const dbRecord = updatedRecords[0];
        
        // Merge the freshly calculated backend data into our local object
        if (dbRecord.data) {
           invoiceToSave = { ...invoiceToSave, ...dbRecord.data };
        }
        
        const finalNumber = dbRecord.invoice_number || invoiceToSave.number;
        invoiceToSave.number = finalNumber;
        (invoiceToSave as any).invoice_number = finalNumber;
        invoiceToSave.status = dbRecord.status as any;
      } else {
        invoiceToSave.status = step2Status as any;
      }
    } catch (err: any) {
      console.error('Invoice update failed:', err);
      throw new Error(`Invoice posting failed on the server: ${err.message || 'Unknown error'}`);
    }

    // Immediately update local store invoices state with the posted invoice
    setLocalOnlyInvoices(prev => prev.map(i => i.id === invoiceToSave.id ? invoiceToSave : i));
    setPaginatedInvoices((prev: any[]) => prev.map((i: any) => i.id === invoiceToSave.id ? invoiceToSave : i));

    // Refresh Local State (Timeout) to catch asynchronous DB updates like ledger entries, updated inventory, products, etc., etc.
    setTimeout(async () => {
      try {
        const { data: latestInv } = await (async () => {
          let allData = [];
          for (let offset = 0; offset < 20000; offset += 1000) {
            const res = await supabase.from('docs_inventory_transactions').select('*').order('id').range(offset, offset + 1000 - 1);
            if (!res.data) break;
            allData = allData.concat(res.data);
            if (res.data.length < 1000) break;
          }
          return { data: allData };
        })();
        if (latestInv) setLocalOnlyInventoryTransactions(latestInv.map(row => ({ ...(row.data || {}), ...row, id: row.id, company_id: row.company_id })));
        
        const { data: latestProds } = await supabase.from('docs_products').select('*').or(`company_id.eq."${companyId}",company_ids.cs.{${companyId}}`);
        if (latestProds) setLocalOnlyProducts(latestProds.map(row => ({ ...(row.data || {}), ...row, id: row.id, companyId: row.company_id })));
        
        
        const cIds = [companyId];
        
        const { data: latestJournals } = await dbService.getPaginatedDocs('docs_journals', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
        if (latestJournals) setLocalOnlyEntries(prev => { const n = new Set(latestJournals.map(i=>i.id)); return [...latestJournals, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
        
        const { data: latestInvoices } = await dbService.getPaginatedDocs('docs_invoices', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
        if (latestInvoices) {
          setLocalOnlyInvoices(prev => { const n = new Set(latestInvoices.map(i=>i.id)); return [...latestInvoices, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
          setPaginatedInvoices(latestInvoices);
        }

        const { data: latestPayments } = await dbService.getPaginatedDocs('docs_payments', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
        if (latestPayments) setLocalOnlyPayments(prev => { const n = new Set(latestPayments.map(i=>i.id)); return [...latestPayments, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
      } catch (e) { console.warn('postInvoice: Refresh failed', e); }
    }, 800);
    
    refreshBalances();
    return invoiceToSave;
  }, [activeCompanyIds, currentUser, fetchInitialData, setLocalOnlyInvoices, setLocalOnlyInventoryTransactions, setLocalOnlyProducts, setLocalOnlyEntries, setLocalOnlyPayments, refreshBalances, getPartnerBalance, postPayment]);

  const updateInvoice = useCallback(async (id: string, updates: Partial<Invoice>) => {
    const inv = allInvoices.find((i: any) => i.id === id) || paginatedInvoices.find((i: any) => i.id === id);
    if (!inv) return;

    let diffText = '';
    if ((updates.status === 'DRAFT' || inv.status === 'DRAFT') && updates.items) {
        const oldTotal = inv.total || 0;
        const newTotal = updates.total !== undefined ? updates.total : oldTotal;
        const diffTotal = newTotal - oldTotal;
        if (Math.abs(diffTotal) > 0.01) {
           diffText += ` Total changed by ${diffTotal > 0 ? '+' : ''}${diffTotal.toLocaleString()} (New: ${newTotal.toLocaleString()}).`;
        }
        
        const oldItems = inv.items || [];
        const newItems = updates.items || oldItems;
        
        const itemChanges: string[] = [];
        newItems.forEach((ni: any) => {
            if (ni.type !== 'PRODUCT') return;
            const oi = oldItems.find((o: any) => o.id === ni.id);
            if (!oi) {
                itemChanges.push(`Added ${ni.displayDescription || ni.description || 'product'} (Qty: ${ni.quantity})`);
            } else if (oi.quantity !== ni.quantity || oi.unitPrice !== ni.unitPrice || oi.productId !== ni.productId) {
                itemChanges.push(`Updated ${ni.displayDescription || ni.description || 'product'} (Qty: ${oi.quantity}->${ni.quantity}, Price: ${oi.unitPrice}->${ni.unitPrice})`);
            }
        });
        oldItems.forEach((oi: any) => {
            if (oi.type !== 'PRODUCT') return;
            if (!newItems.find((ni: any) => ni.id === oi.id)) {
                itemChanges.push(`Removed ${oi.displayDescription || oi.description || 'product'}`);
            }
        });
        if (itemChanges.length > 0) {
            diffText += ` Items: ${itemChanges.join(', ')}.`;
        }
    }
    
    if (updates.status && updates.status !== inv.status) {
        diffText += ` Status changed from ${inv.status} to ${updates.status}.`;
    }

    if (diffText && !updates.messages) {
       updates.messages = [...(inv.messages || []), {
         id: generateUUID(),
         authorId: currentUser?.id || 'user-1',
         body: `Invoice updated.${diffText}`,
         date: new Date().toISOString(),
         type: 'notification'
       }];
    }

    const companyId = inv?.companyId || activeCompanyIds[0];
    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const updatedInvoice = { ...inv, ...updates, id };
    const isCashSaleUpdate = updatedInvoice.customerId && (
      String(updatedInvoice.customerId).toLowerCase().includes('cash-sale') ||
      (allContacts || []).some(c => c.id === updatedInvoice.customerId && String(c.name || '').toLowerCase().trim() === 'cash sale')
    );
    if (isCashSaleUpdate && (!updatedInvoice.paymentMethod || updatedInvoice.paymentMethod === 'CASH')) {
      updatedInvoice.type = 'CASH_SALE';
    } else if (isCashSaleUpdate) {
      updatedInvoice.type = 'STANDARD';
    }

    if (updatedInvoice.status === 'DRAFT') {
      // Bypass process_invoice for drafts to prevent backend overwriting custom unit prices
      const { error: dbErr } = await supabase.from('docs_invoices').update({
        data: updatedInvoice,
        company_id: updatedInvoice.companyId,
        date: updatedInvoice.date,
        customer_id: updatedInvoice.customerId,
        subtotal: updatedInvoice.subtotal,
        discount_total: updatedInvoice.discountTotal,
        tax_total: updatedInvoice.taxTotal,
        total: updatedInvoice.total,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (dbErr) throw dbErr;

      await supabase.from('docs_invoice_lines').delete().eq('invoice_id', id);
      
      const lines = (updatedInvoice.items || []).map((item: any) => ({
        id: item.id || generateUUID(),
        invoice_id: id,
        company_id: updatedInvoice.companyId,
        product_id: item.productId,
        quantity: item.quantity || 0,
        unit_price: item.unitPrice || 0,
        discount: item.discountAmount || 0,
        tax: item.taxAmount || 0,
        total: item.total || 0,
        description: item.description || '',
        line_value: item.lineValue || 0,
        discount_rate: item.discountRate || 0,
        discount_mode: item.discountMode || 'PERCENT',
        type: item.type || 'PRODUCT',
        updated_at: new Date().toISOString()
      }));
      if (lines.length > 0) {
        await supabase.from('docs_invoice_lines').insert(lines);
      }
    } else {
      // Call process_invoice RPC for non-drafts
      const { error: rpcError, data: rpcData } = await supabase.rpc('process_invoice', { p_invoice: updatedInvoice });
      if (rpcError) throw rpcError;
      const processedInvoice = rpcData?.processed_invoice;
      if (processedInvoice) Object.assign(updatedInvoice, processedInvoice);
      const { data: fetchReq } = await supabase.from('docs_invoices').select('data').eq('id', id).single();
      if (fetchReq && fetchReq.data) Object.assign(updatedInvoice, fetchReq.data);
    }

    setLocalOnlyInvoices(prev => prev.map(i => i.id === id ? updatedInvoice : i));
    setPaginatedInvoices(prev => prev.map(i => i.id === id ? updatedInvoice : i));
    if (typeof clearFetchCache === 'function') clearFetchCache();

    return updatedInvoice;
  }, [allInvoices, paginatedInvoices, activeCompanyIds, setLocalOnlyInvoices]);

  const payInvoice = useCallback(async (invoiceId: string, paymentDetails: any) => {
    let inv = allInvoices.find((i: any) => i.id === invoiceId) || paginatedInvoices.find((i: any) => i.id === invoiceId);
    if (!inv) {
        const { data } = await supabase.from('docs_invoices').select('*').eq('id', invoiceId).single();
        if (data && data.data) inv = data.data as Invoice;
    }
    if (!inv) return;

    const payment = await postPayment({
      status: paymentDetails.status || 'POSTED',
      ...paymentDetails,
      contactId: inv.customerId,
      companyId: inv?.companyId,
      type: 'RECEIPT',
      reference: `CPAY/${inv.number}`,
      invoiceId: inv.id,
      appliedInvoices: [{
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        amount: paymentDetails.amount,
        remaining: 0
      }]
    });

    const { data: updatedInvData } = await supabase.from('docs_invoices').select('*').eq('id', invoiceId).single();
    if (updatedInvData && updatedInvData.data) {
        setLocalOnlyInvoices(prev => prev.map(i => i.id === invoiceId ? updatedInvData.data as Invoice : i));
        setPaginatedInvoices(prev => prev.map(i => i.id === invoiceId ? updatedInvData.data as Invoice : i));
    }
    
    refreshBalances();
    return payment;
  }, [allInvoices, paginatedInvoices, postPayment, setLocalOnlyInvoices, setPaginatedInvoices]);

  const addCreditNote = useCallback(async (cn: Omit<CreditNote, 'id' | 'companyId' | 'createdById'>) => {
    const newId = generateUUID();
    const companyId = activeCompanyIds[0];
    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    
    let cnNumber = cn.number;
    const isDraft = !cnNumber || cnNumber === 'DRAFT' || cnNumber === 'NEW' || String(cnNumber).startsWith('DRAFT-');
    if (isDraft) {
      
      const companyInfo = (companies || []).find((c: any) => c.id === companyId);
      const compCode = companyInfo?.code || 'DEF';
      const { data } = await supabase.from('docs_credit_notes').select('cn_number').eq('company_id', companyId).like('cn_number', `CN-${compCode}-%`).order('cn_number', { ascending: false }).limit(1);
      let nextSeq = 1;
      if (data && data.length > 0 && data[0].cn_number) {
        const parts = data[0].cn_number.split('-');
        if (parts.length === 3) nextSeq = parseInt(parts[2], 10) + 1;
      }
    
      cnNumber = `CN-${compCode}-${String(nextSeq).padStart(6, '0')}`;
    }


    const newCn = { 
      ...cn,
      number: cnNumber,
      id: newId, 
      companyId, 
      status: cn.status || 'DRAFT', 
      createdById: (cn as any).createdById || currentUser?.id || 'user-1',
      preparedBy: (cn as any).preparedBy || currentUser?.name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'System'
    };
    
    if (newCn.items && newCn.items.length > 0) {
      newCn.items = newCn.items.map((item: any, mapIdx: number) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const gross = qty * price;
        const discRate = Number(item.discountRate || 0);
        const discMode = item.discountMode || 'PERCENT';
        const calculatedDisc = discMode === 'FIXED' ? discRate : Math.round((gross * (discRate / 100)) * 100) / 100;
        const calculatedTax = item.taxValue || 0;
        const calculatedTotal = item.lineValue !== undefined ? item.lineValue : Math.round((gross - calculatedDisc + calculatedTax) * 100) / 100;
        return {
          ...item,
          id: item.id || generateUUID(),
          quantity: qty,
          unitPrice: price,
          discount: calculatedDisc,
          taxValue: calculatedTax,
          lineValue: calculatedTotal,
          total: calculatedTotal,
          display_index: mapIdx
        };
      });
    }
    
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_credit_note', { p_cn: newCn });
    if (rpcErr) {
        throw new Error('Database Error (Add Credit Note): ' + rpcErr.message);
    }
    if (rpcRes && rpcRes.credit_note_number) {
        newCn.number = rpcRes.credit_note_number;
    }
    
    setLocalOnlyCreditNotes(prev => [...prev, newCn as CreditNote]);
    return newCn as CreditNote;
  }, [activeCompanyIds, setLocalOnlyCreditNotes, currentUser]);

  const updateCreditNote = useCallback(async (id: string, updates: Partial<CreditNote>) => {
    const cn = allCreditNotes.find(c => c.id === id);
    if (!cn) return;
    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const updated = { ...cn, ...updates };
    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const companyId = cn?.companyId || activeCompanyIds[0];

    if (updated.items && updated.items.length > 0) {
      updated.items = updated.items.map((item: any, mapIdx: number) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const gross = qty * price;
        const discRate = Number(item.discountRate || 0);
        const discMode = item.discountMode || 'PERCENT';
        const calculatedDisc = discMode === 'FIXED' ? discRate : Math.round((gross * (discRate / 100)) * 100) / 100;
        const calculatedTax = item.taxValue || 0;
        const calculatedTotal = item.lineValue !== undefined ? item.lineValue : Math.round((gross - calculatedDisc + calculatedTax) * 100) / 100;
        return {
          ...item,
          id: item.id || generateUUID(),
          quantity: qty,
          unitPrice: price,
          discount: calculatedDisc,
          taxValue: calculatedTax,
          lineValue: calculatedTotal,
          total: calculatedTotal,
          display_index: mapIdx
        };
      });
    }
    
    const { error: rpcErr } = await supabase.rpc('create_credit_note', { p_cn: updated });
    if (rpcErr) {
        throw new Error('Database Error (Update Credit Note): ' + rpcErr.message);
    }

    setLocalOnlyCreditNotes(prev => prev.map(c => c.id === id ? updated : c));
  }, [allCreditNotes, activeCompanyIds, setLocalOnlyCreditNotes]);

  const registerBatchPayment = useCallback(async (details: any) => {
    try {
      if (!details.date) {
        details.date = new Date().toISOString().split('T')[0];
      }
      if (!details.companyId) {
        const state = useAccountingStoreBase.getState();
        details.companyId = state.activeCompanyIds?.[0] || state.companies?.[0]?.id || '';
      }
      if (!details.accountId) {
        const state = useAccountingStoreBase.getState();
        const cashAcc = (allAccounts || []).find(a => a.companyId === details.companyId && (a.code === '1011' || a.name.toLowerCase().includes('cash')));
        if (cashAcc) {
          details.accountId = cashAcc.id;
        }
      }

      
      const { data, error } = await supabase.rpc('register_batch_payment', { payload: details });
      if (error) throw error;

      if (data && data.payment_id && details.paymentCategory) {
        await supabase.from('docs_payments').update({ data: { paymentCategory: details.paymentCategory } }).eq('id', data.payment_id);
      }
      
      // Refresh local state
      await fetchInitialData(currentUser?.id || '');
      return data;
    } catch (err: any) {
      console.error('registerBatchPayment failed:', err);
      throw err;
    }
  }, [fetchInitialData, currentUser]);

  const postCreditNote = useCallback(async (cn: CreditNote) => {
    if (cn.status === 'POSTED' || cn.status === 'OPEN' || cn.status === 'CLOSED' || cn.status === 'VOID') return cn;

    const companyId = cn?.companyId || activeCompanyIds[0];
    const finalCNData = { ...cn, status: 'POSTED', companyId };

    console.log('postCreditNote: Attempting process_credit_note RPC...', cn.id);
    let rpcRes: any;
    let rpcError: any;

    try {
      const resp = await supabase.rpc('process_credit_note', {
        p_cn: finalCNData
      });
      rpcRes = resp.data;
      rpcError = resp.error;
    } catch (e) {
      rpcError = e;
    }

    if (rpcError || (rpcRes && !rpcRes.success)) {
      console.error('postCreditNote: process_credit_note RPC failed', rpcError || rpcRes?.error);
      throw new Error(`Posting failed: ${rpcError?.message || rpcRes?.error || 'Unknown error'}`);
    }

    console.log('postCreditNote: Completed successfully', rpcRes);
    
    const jeIdToFinalize = rpcRes?.journal_id;

    // Fetch the updated record from DB to get trigger-generated values (like sequence number)
    const { data: updatedRow } = await supabase.from('docs_credit_notes').select('*').eq('id', cn.id).single();
    let finalCN: any;
    
    if (updatedRow) {
      finalCN = { 
        ...(updatedRow.data || {}), 
        ...updatedRow, 
        id: updatedRow.id, 
        companyId: updatedRow.company_id,
        status: updatedRow.status || 'POSTED',
        journalEntryId: jeIdToFinalize
      };
      // Ensure the number from data matches the flat column if data is missing it
      if (!finalCN.number && updatedRow.credit_note_number) {
        finalCN.number = updatedRow.credit_note_number;
      }
    } else {
      finalCN = { ...cn, status: 'POSTED' as any, journalEntryId: jeIdToFinalize, number: cn.number };
    }

    setLocalOnlyCreditNotes(prev => prev.map(item => item.id === cn.id ? finalCN : item));

    // Update the reference in the linked Journal Entry if it exists (Handled database-level by post_credit_note RPC, removed redundant create_journal_entry call to prevent duplicate journal lines)

    // Refresh inventory for all products in the credit note
    for (const item of (cn.items || [])) {
      if (item.type === 'PRODUCT' && item.productId) {
        // // // recalculateProductInventory(item.productId);
      }
    }

    // Refresh state
    setTimeout(async () => {
      fetchInitialData(currentUser?.id || '');
    }, 1000);

    return finalCN;
  }, [activeCompanyIds, allAccounts, allProducts, addJournalEntry, setLocalOnlyCreditNotes, fetchInitialData, currentUser]);

  const resetInvoiceToDraft = useCallback(async (invoiceId: string) => {
    const invoice = (allInvoices || []).find((i: any) => i.id === invoiceId) || paginatedInvoices.find((i: any) => i.id === invoiceId);
    if (!invoice || invoice.status !== 'POSTED') return;

    // Local updates for immediate UI feedback
    if (invoice.journalEntryId) {
      setLocalOnlyEntries(prev => prev.map(e => e.id === invoice.journalEntryId ? { ...e, status: 'DRAFT' } : e));
    }
    setLocalOnlyInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'DRAFT' } : inv));

    // DB updates
    if (invoice.journalEntryId) {
      const { error: jeError } = await supabase.from('docs_journals').update({ status: 'DRAFT' }).eq('id', invoice.journalEntryId);
      if (jeError) throw new Error(`Failed to reset journal: ${jeError.message}`);
    }
    const { error: invError } = await supabase.from('docs_invoices').update({ status: 'DRAFT', data: { ...invoice, status: 'DRAFT' } }).eq('id', invoiceId);
    if (invError) throw new Error(`Failed to reset invoice: ${invError.message}`);
    
    // Recalculate stock - this might be complex to do manually, but we can try
    (invoice.items || []).filter(i => i.type === 'PRODUCT').forEach(item => {
      if (item.productId) {
        setLocalOnlyProducts(prev => prev.map(p => p.id === item.productId ? { 
          ...p, 
          stockLevels: {
            ...(p.stockLevels || {}),
            [invoice?.companyId]: (p.stockLevels?.[invoice?.companyId] || 0) + item.quantity
          }
        } : p));
      }
    });

  }, [allInvoices, setLocalOnlyInvoices, setLocalOnlyEntries, setLocalOnlyProducts]);

  const addBill = useCallback(async (bill: Omit<Bill, 'id' | 'companyId' | 'createdById'>) => {
    const companyId = activeCompanyIds[0];
    const company = companies.find(c => c.id === companyId);
    const companyCode = company?.code || 'CO';
    const newId = generateUUID();
    
    // Auto-generate number if not provided
    
    let number = bill.number;
    const isDraft = !number || number === 'DRAFT' || number === 'NEW' || String(number).startsWith('DRAFT-');
    if (isDraft) {
      
      const companyInfo = (companies || []).find((c: any) => c.id === companyId);
      const compCode = companyInfo?.code || 'DEF';
      const { data } = await supabase.from('docs_bills').select('bill_number').eq('company_id', companyId).like('bill_number', `BIL-${compCode}-%`).order('bill_number', { ascending: false }).limit(1);
      let nextSeq = 1;
      if (data && data.length > 0 && data[0].bill_number) {
        const parts = data[0].bill_number.split('-');
        if (parts.length === 3) nextSeq = parseInt(parts[2], 10) + 1;
      }
    
      number = `BIL-${compCode}-${String(nextSeq).padStart(6, '0')}`;
    }


    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const newBill: any = { 
      ...bill, 
      id: newId, 
      number: isDraft ? `DRAFT-${newId.split('-')[1]}` : number,
      companyId, 
      companyCode,
      createdById: currentUser?.id || 'user-1',
      preparedBy: (bill as any).preparedBy || currentUser?.name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'System'
    };

    if (newBill.items && newBill.items.length > 0) {
      newBill.items = newBill.items.map((item: any, mapIdx: number) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const gross = qty * price;
        const discRate = Number(item.discountRate || 0);
        const discMode = item.discountMode || 'PERCENT';
        const calculatedDisc = discMode === 'FIXED' ? discRate : Math.round((gross * (discRate / 100)) * 100) / 100;
        const calculatedTax = item.taxValue || 0;
        const calculatedTotal = item.lineValue !== undefined ? item.lineValue : Math.round((gross - calculatedDisc + calculatedTax) * 100) / 100;
        return {
            ...item,
            id: item.id || generateUUID(),
            quantity: qty,
            unitPrice: price,
            discount: calculatedDisc,
            taxValue: calculatedTax,
            lineValue: calculatedTotal,
            total: calculatedTotal,
            display_index: mapIdx
        };
      });
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_bill', { p_bill: newBill });
    if (rpcErr) {
        console.error('create_bill RPC failed:', rpcErr);
        throw rpcErr;
    }
    if (rpcRes && rpcRes.bill_number) {
        newBill.number = rpcRes.bill_number;
    }

    setLocalOnlyBills(prev => [...prev, newBill]);
    setPaginatedBills((prev: any[]) => [newBill, ...prev]);
    clearFetchCache();
    return newBill;
  }, [activeCompanyIds, currentUser, setLocalOnlyBills]);

  const postBill = useCallback(async (bill: Bill) => {
    if (bill.status === 'POSTED' || bill.status === 'PAID') return bill; // Prevent re-posting

    console.log('postBill: Attempting to process_bill...', bill.id);

    let finalBillData = { ...bill };
    if (!['POSTED', 'PAID', 'PARTIAL', 'VOID'].includes(finalBillData.status)) {
      finalBillData.status = 'POSTED' as any;
    }
    const companyId = finalBillData?.companyId || activeCompanyIds[0];
    if (finalBillData) finalBillData.companyId = companyId;

    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    try {
      const { data: rpcRes, error: rpcError } = await supabase.rpc('process_bill', {
        p_bill: finalBillData
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'RPC process_bill failed');
      }

      if (!rpcRes?.success) {
         throw new Error(rpcRes?.error || 'RPC process_bill returned false');
      }

      console.log('postBill: RPC succeeded');
      
      // Fetch the updated bill with its generated number and status from the database immediately
      const { data: updatedDoc } = await supabase
        .from('docs_bills')
        .select('*')
        .eq('id', finalBillData.id)
        .single();
      
      if (updatedDoc) {
        const fetchedStatus = updatedDoc.status || (updatedDoc.data || {}).status;
        const finalStatus = (fetchedStatus === 'DRAFT' || fetchedStatus === 'PENDING') ? 'POSTED' : fetchedStatus;
        finalBillData = {
          ...(updatedDoc.data || {}),
          ...updatedDoc,
          id: updatedDoc.id,
          companyId: updatedDoc.company_id,
          number: updatedDoc.bill_number,
          status: finalStatus
        };
      } else {
        finalBillData.status = 'POSTED';
      }

    } catch (err: any) {
      console.warn('postBill: RPC Exception', err);
      throw new Error(`Posting failed: ${err.message || 'Unknown error'}.`);
    }

    // Immediately update local store bills state with the posted bill
    setLocalOnlyBills(prev => prev.map(b => b.id === finalBillData.id ? finalBillData : b));
    setPaginatedBills((prev: any[]) => prev.map((b: any) => b.id === finalBillData.id ? finalBillData : b));
    clearFetchCache();

    // Refresh Local State
    setTimeout(async () => {
      try {
        const { data: latestInv } = await supabase.from('docs_inventory_transactions').select('*').order('id', { ascending: false }).limit(100);
        if (latestInv) setLocalOnlyInventoryTransactions(latestInv.map(row => ({ ...(row.data || {}), ...row, id: row.id, companyId: row.company_id })));
        
        const { data: latestProds } = await supabase.from('docs_products').select('*').or(`company_id.eq."${companyId}",company_ids.cs.{${companyId}}`);
        if (latestProds) setLocalOnlyProducts(latestProds.map(row => ({ ...(row.data || {}), ...row, id: row.id, companyId: row.company_id })));
        
        
        const cIds = [companyId];
        
        const { data: latestJournals } = await dbService.getPaginatedDocs('docs_journals', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
        if (latestJournals) setLocalOnlyEntries(prev => { const n = new Set(latestJournals.map(i=>i.id)); return [...latestJournals, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
        
        const { data: latestBills } = await dbService.getPaginatedDocs('docs_bills', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
        if (latestBills) setLocalOnlyBills(prev => { const n = new Set(latestBills.map(i=>i.id)); return [...latestBills, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });

        const { data: latestPayments } = await dbService.getPaginatedDocs('docs_payments', { companyIds: cIds, limit: 100, sortField: 'updated_at', sortOrder: 'desc' });
        if (latestPayments) setLocalOnlyPayments(prev => { const n = new Set(latestPayments.map(i=>i.id)); return [...latestPayments, ...prev.filter(i => !n.has(i.id))].sort((a,b)=>new Date(b.date).getTime() - new Date(a.date).getTime()); });
      } catch (e) { console.warn('postBill: Refresh failed', e); }
    }, 800);

    return finalBillData;
  }, [setLocalOnlyInventoryTransactions, setLocalOnlyProductCosts, setLocalOnlyProducts, setLocalOnlyBills, setLocalOnlyEntries, setLocalOnlyLines, allProducts, allProductCosts, allContacts, addJournalEntry]);

  const getDefaultWarehouse = useCallback((companyId: string) => {
    const warehouse = (allWarehouses || []).find(w => w && w?.companyId === companyId && w.isDefault);
    if (warehouse) return warehouse;
    
    const mainWh: Warehouse = {
      id: `wh-${companyId}-main`,
      name: 'Main Warehouse',
      code: 'MAIN',
      address: '',
      companyId: companyId,
      isDefault: true
    };
    return mainWh;
  }, [allWarehouses]);

  const updateBill = useCallback(async (id: string, updates: Partial<Bill>) => {
    // Frontend logic removed. Calculation moved to Supabase DB Triggers.

    const bill = (allBills || []).find(b => b.id === id) || (paginatedBills || []).find(b => b.id === id);
    if (!bill) return;

    if (bill.status === 'POSTED') {
      // 1. Reverse Stock and WAC
      const productUpdates = new Map<string, { qty: number, cost: number, serials: string[] }>();
      
      // Process in reverse order to correctly revert WAC if multiple items of same product exist
      [...bill.items].reverse().forEach(item => {
        if (item.type === 'PRODUCT' && item.productId) {
          const prod = allProducts.find(p => p.id === item.productId);
          if (!prod) return;

          const existingUpdate = productUpdates.get(item.productId);
          const currentQty = existingUpdate ? existingUpdate.qty : (prod.stockLevels?.[bill?.companyId] || 0);
          const currentCost = existingUpdate ? existingUpdate.cost : (prod.costPrice || 0);
          const currentSerials = existingUpdate ? existingUpdate.serials : (prod.serialNumbers || []);

          const newQty = currentQty - item.quantity;
          const revertedCost = item.previousAvgCost !== undefined ? item.previousAvgCost : currentCost;
          
          let updatedSerialNumbers = currentSerials;
          if (prod.trackingType === 'SERIAL' && item.serialNumbers) {
            updatedSerialNumbers = updatedSerialNumbers.filter(sn => !item.serialNumbers?.includes(sn));
          }

          productUpdates.set(item.productId, {
            qty: newQty,
            cost: revertedCost,
            serials: updatedSerialNumbers
          });
        }
      });

      // Apply all product updates in one go
      if (productUpdates.size > 0) {
        setLocalOnlyProducts(prev => prev.map(p => {
          const update = productUpdates.get(p.id);
          if (update) {
            return {
              ...p,
              stockLevels: {
                ...(p.stockLevels || {}),
                [bill?.companyId]: update.qty
              },
              costPrice: update.cost,
              serialNumbers: update.serials
            };
          }
          return p;
        }));
        
        for (const [productId, update] of productUpdates.entries()) {
           const prod = allProducts.find(p => p.id === productId);
           const totalBillQty = [...bill.items].filter((i:any) => i.productId === productId).reduce((s:number, i:any) => s + (i.quantity || 0), 0);
           const reversedGlobalQty = (prod?.quantityOnHand || 0) - totalBillQty;
        }
        await supabase.from('docs_inventory_transactions').delete().eq('reference_id', bill.id);
      }

      // 2. Remove Journal Entry is handled by the backend RPC.
      // We do not modify the journal here.
      
      const updatedBill = { ...bill, ...updates };
      try {
        await postBill({ ...updatedBill, status: 'DRAFT' as any });
      } catch (error: any) {
        setLocalOnlyBills(prev => prev.map(b => b.id === id ? { ...b, ...updates, status: 'DRAFT', journalEntryId: undefined } : b));
        throw error;
      }
    } else {
      setLocalOnlyBills(prev => prev.map(bill => {
        if (bill.id !== id) return bill;
        const changes = getChangeLog(bill, updates, ['vendorId', 'date', 'dueDate', 'status', 'total']);
        if (changes.length === 0) return { ...bill, ...updates };
        return { 
          ...bill, 
          ...updates,
          messages: [...(bill.messages || []), {
            id: generateUUID(),
            authorId: currentUser?.id || 'user-1',
            body: `Bill updated: ${changes.join(', ')}`,
            date: formatDateTime(new Date()),
            type: 'notification'
          }]
        };
      }));

      // SYNC TO SUPABASE
      const updatedBillSync = { ...bill, ...updates };
      if (updatedBillSync.items && updatedBillSync.items.length > 0) {
        updatedBillSync.items = updatedBillSync.items.map((item: any, mapIdx: number) => {
            const qty = Number(item.quantity || 0);
            const price = Number(item.unitPrice || 0);
            const gross = qty * price;
            const discRate = Number(item.discountRate || 0);
            const discMode = item.discountMode || 'PERCENT';
            const calculatedDisc = discMode === 'FIXED' ? discRate : Math.round((gross * (discRate / 100)) * 100) / 100;
            const calculatedTax = item.taxValue || 0;
            const calculatedTotal = item.lineValue !== undefined ? item.lineValue : Math.round((gross - calculatedDisc + calculatedTax) * 100) / 100;
            return {
                ...item,
                id: item.id || generateUUID(),
                quantity: qty,
                unitPrice: price,
                discount: calculatedDisc,
                taxValue: calculatedTax,
                lineValue: calculatedTotal,
                total: calculatedTotal,
                display_index: mapIdx
            };
        });
      }
      
      const { error: rpcErr } = await supabase.rpc('create_bill', { p_bill: updatedBillSync });
      if (rpcErr) {
          console.error('updateBill: create_bill RPC failed:', rpcErr);
          throw rpcErr;
      }

      if (updates.status === 'POSTED') {
         setTimeout(async () => {
           const { data } = await supabase.from('docs_bills').select('bill_number, data').eq('id', id).single();
           const fetchedNumber = data?.bill_number || data?.data?.number;
           if (fetchedNumber) {
             setLocalOnlyBills(prev => prev.map(b => b.id === id ? { ...b, number: fetchedNumber } : b));
           }
         }, 1000);
      }
    }
    clearFetchCache();
  }, [allBills, postBill, getChangeLog, currentUser, setLocalOnlyBills]);

  const resetBillToDraft = useCallback(async (billId: string) => {
    const bill = (allBills || []).find(b => b.id === billId);
    if (!bill || bill.status !== 'POSTED') return;

    // ... (stock validation logic remains same) ...
    const stockErrors: string[] = [];
    const productQuantities: Record<string, number> = {};
    
    (bill.items || []).filter(i => i.type === 'PRODUCT').forEach(item => {
      if (item.productId) {
        productQuantities[item.productId] = (productQuantities[item.productId] || 0) + (item.quantity || 0);
      }
    });

    Object.entries(productQuantities).forEach(([productId, reducingQty]) => {
      const prod = allProducts.find(p => p.id === productId);
      if (reducingQty <= 0) {
        stockErrors.push(`${prod?.name || productId}: Quantity must be greater than 0`);
      }
    });

    if (stockErrors.length > 0) {
      throw new Error(`Validation Error: ${stockErrors.join(', ')}`);
    }

    const productReversals = new Map<string, { qty: number, cost: number, serials: string[] }>();
    
    [...bill.items].reverse().forEach(item => {
      if (item.type === 'PRODUCT' && item.productId) {
        const prod = allProducts.find(p => p.id === item.productId);
        if (!prod) return;

        const existingUpdate = productReversals.get(item.productId);
        const currentQty = existingUpdate ? existingUpdate.qty : (prod.stockLevels?.[bill?.companyId] || 0);
        const currentSerials = existingUpdate ? existingUpdate.serials : (prod.serialNumbers || []);
        const revertedCost = item.previousAvgCost !== undefined ? item.previousAvgCost : (prod.costPrice || 0);

        let updatedSerialNumbers = currentSerials;
        if (prod.trackingType === 'SERIAL' && item.serialNumbers && item.serialNumbers.length > 0) {
          updatedSerialNumbers = updatedSerialNumbers.filter(sn => !item.serialNumbers?.includes(sn));
        }

        productReversals.set(item.productId, {
          qty: currentQty - item.quantity,
          cost: revertedCost,
          serials: updatedSerialNumbers
        });
      }
    });

    if (productReversals.size > 0) {
      setLocalOnlyProducts(prev => prev.map(p => {
        const update = productReversals.get(p.id);
        if (update) {
          return {
            ...p,
            stockLevels: {
              ...(p.stockLevels || {}),
              [bill?.companyId]: update.qty
            },
            costPrice: update.cost,
            serialNumbers: update.serials
          };
        }
        return p;
      }));
      
      for (const [productId, update] of productReversals.entries()) {
         const prod = allProducts.find(p => p.id === productId);
         const totalBillQty = [...bill.items].filter((i:any) => i.productId === productId).reduce((s:number, i:any) => s + (i.quantity || 0), 0);
         const reversedGlobalQty = (prod?.quantityOnHand || 0) - totalBillQty;
      }
      await supabase.from('docs_inventory_transactions').delete().eq('reference_id', bill.id);
    }
    if (bill.journalEntryId) {
      setLocalOnlyEntries(prev => prev.map(e => e.id === bill.journalEntryId ? { ...e, status: 'DRAFT' } : e));
      const { error: jeError } = await supabase.from('docs_journals').update({ status: 'DRAFT' }).eq('id', bill.journalEntryId);
      if (jeError) throw new Error(`Failed to reset journal: ${jeError.message}`);
    }
    setLocalOnlyBills(prev => prev.map(b => b.id === billId ? { ...b, status: 'DRAFT' } : b));
    const { error: billError } = await supabase.from('docs_bills').update({ status: 'DRAFT', data: { ...bill, status: 'DRAFT' } }).eq('id', billId);
    if (billError) throw new Error(`Failed to reset bill: ${billError.message}`);
    clearFetchCache();
  }, [allBills, allProducts, setLocalOnlyProducts, setLocalOnlyEntries, setLocalOnlyBills]);

  const payBill = useCallback(async (billId: string, paymentDetails: any) => {
    let bill = (allBills || []).find(b => b.id === billId) || (paginatedBills || []).find(b => b.id === billId);
    if (!bill) {
        const { data } = await supabase.from('docs_bills').select('*').eq('id', billId).single();
        if (data && data.data) bill = data.data as Bill;
    }
    if (!bill) return;

    const payment = await postPayment({
      status: paymentDetails.status || 'POSTED',
      ...paymentDetails,
      contactId: bill.vendorId,
      companyId: bill?.companyId,
      type: 'PAYMENT',
      reference: `BPAY/${bill.number}`,
      billId: bill.id,
      appliedBills: [{
        billId: bill.id,
        billNumber: bill.number,
        amount: paymentDetails.amount,
        remaining: 0
      }]
    });

    const { data: updatedBillData } = await supabase.from('docs_bills').select('*').eq('id', billId).single();
    if (updatedBillData && updatedBillData.data) {
        setLocalOnlyBills(prev => prev.map(b => b.id === billId ? updatedBillData.data as Bill : b));
    }

    clearFetchCache();
    return payment;
  }, [allBills, paginatedBills, postPayment, setLocalOnlyBills]);

  const addProduct = useCallback(async (product: any) => {
    const dbId = generateUUID();
    // Restrict inventory to be company-wise separated
    const initialCompanyIds = (product?.companyIds && product?.companyIds.length > 0) 
      ? product?.companyIds 
      : [activeCompanyIds[0] || companies[0]?.id].filter(Boolean);
    const primaryCompanyId = initialCompanyIds[0];
    const externalId = product.externalId || generateNextNumber('PRODUCT', new Date().toISOString(), primaryCompanyId);
    

    const newProduct: Product = { 
      // Default values for required fields
      taxCode: 'TAX-0',
      invoicingPolicy: 'Ordered quantities',
      trackInventory: true,
      canBeSold: true,
      canBeExpensed: false,
      canBePurchased: true,
      isInPos: true,
      type: 'Goods',
      uom: 'Pcs',
      trackingType: 'NONE',
      serialNumbers: [],
      lastPurchasePrice: Number(product.costPrice) || 0,
      ...product, 
      id: dbId, 
      sku: product.sku || externalId,
      externalId,
      companyId: primaryCompanyId,
      companyIds: initialCompanyIds,
      stockLevels: { [initialCompanyIds[0]]: Number(product.quantityOnHand) || 0 },
      initialStockLevels: { [initialCompanyIds[0]]: Number(product.quantityOnHand) || 0 },
      initialCost: Number(product.costPrice) || 0,
    };

    const qoh = Number(product.quantityOnHand) || 0;

    // Generate serial numbers if tracking is enabled and quantity exists
    if (newProduct.trackingType === 'SERIAL' && qoh > 0 && (!newProduct.serialNumbers || newProduct.serialNumbers.length === 0)) {
      newProduct.serialNumbers = Array.from({ length: qoh }, (_, i) => generateUUID());
    }
    
    // Record initial inventory valuation if quantity > 0
    if (qoh > 0) {
      const targetCompanyId = newProduct?.companyIds[0];
      supabase.from('docs_inventory_transactions').upsert({
        id: generateUUID(),
        company_id: targetCompanyId,
        product_id: dbId,
        warehouse_id: `wh-${targetCompanyId}`,
        transaction_type: 'IN',
        quantity: qoh,
        reference_id: `INIT-${dbId}`,
        reference_type: 'ADJUSTMENT',
        date: getOpDateBST(),
        cost_price: newProduct.costPrice || 0,
        unit_price: newProduct.costPrice || 0,
        updated_at: new Date().toISOString()
      }).then();

      const valuation = qoh * (newProduct.costPrice || 0);
      if (valuation > 0) {
        // Record in the first company by default for initial stock
        const targetCompanyId = newProduct?.companyIds[0];
        const invAccount = getAccountIdByCode('100502', targetCompanyId) || 
                           getAccountIdByCode('100501', targetCompanyId) || 
                           getAccountIdByCode('100500', targetCompanyId) || 
                           (allAccounts || []).find(a => a && (a.subType === 'INVENTORY' || a.type === 'ASSET') && a?.companyId === targetCompanyId)?.id || 
                           (allAccounts || [])[0]?.id;
        const equityAccount = getAccountIdByCode('300000', targetCompanyId) || 
                              getAccountIdByCode('300001', targetCompanyId) || 
                              (allAccounts || []).find(a => a && (a.subType === 'EQUITY' || a.type === 'EQUITY') && a?.companyId === targetCompanyId)?.id || 
                              (allAccounts || [])[0]?.id;
        
        addJournalEntry({
          date: getOpDateBST(),
          description: `Initial Inventory: ${newProduct.name}`,
          reference: `INIT-${newProduct.sku || dbId}`,
          status: 'POSTED',
          lines: [
            { 
              id: `INV-DR-${dbId}`, 
              accountId: invAccount, 
              debit: valuation, 
              credit: 0, 
              description: `Initial Stock: ${newProduct.name}` 
            },
            { 
              id: `eq-cr-${dbId}`, 
              accountId: equityAccount, 
              contactId: newProduct.adjustmentContactId,
              debit: 0, 
              credit: valuation, 
              description: `Opening Balance Equity` 
            }
          ]
        }, targetCompanyId).catch(err => {
          console.error("Failed to post initial stock journal entry during product creation:", err);
        });
      }
    }

    // Extract brand and category
    if (newProduct.brand) {
      setAllBrands(prev => {
         if (prev.some(b => b.name === newProduct.brand && b?.companyId === initialCompanyIds[0])) return prev;
         return [...prev, { id: generateUUID(), name: newProduct.brand as string, description: '', companyId: initialCompanyIds[0] }];
      });
    }
    if (newProduct.category) {
      setAllCategories(prev => {
         if (prev.some(c => c.name === newProduct.category && c?.companyId === initialCompanyIds[0])) return prev;
         return [...prev, { id: generateUUID(), name: newProduct.category as string, description: '', companyId: initialCompanyIds[0] }];
      });
    }

    // SYNC TO SUPABASE
    const { stockLevels, initialStockLevels, ...newProductRest } = newProduct as any;
    const { error } = await supabase.from('docs_products').upsert({
      id: newProduct.id,
      data: newProductRest,
      company_id: newProduct?.companyIds[0],
      company_ids: newProduct.companyIds,
      name: newProduct.name,
      sku: newProduct.sku,
      price: Number(newProduct.price) || 0,
      description: newProduct.description || '',
      category: newProduct.category || 'All',
      brand: newProduct.brand || '',
      type: newProduct.type || 'Goods',
      uom: newProduct.uom || 'Units',
      track_inventory: newProduct.trackInventory !== false,
      can_be_sold: newProduct.canBeSold !== false,
      can_be_purchased: newProduct.canBePurchased !== false,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error("Failed to sync new product to Supabase:", JSON.stringify(error, null, 2));
      throw new Error(error.message || JSON.stringify(error));
    }

    setLocalOnlyProducts(prev => [...prev, newProduct]);
    setPaginatedProducts(prev => {
      if (prev.some(p => p.id === newProduct.id)) return prev;
      return [newProduct, ...prev];
    });
    setProductCount(prev => prev + 1);

    return newProduct;
  }, [activeCompanyIds, addJournalEntry, getAccountIdByCode, setLocalOnlyProducts, setAllBrands, setAllCategories, setPaginatedProducts, setProductCount]);

  const bulkAddProducts = useCallback((newProducts: any[]) => {
    const timestamp = Date.now();
    const preparedProducts = newProducts.map((p, idx) => {
      const initialQty = Number(p.quantityOnHand) || 0;
      const targetCid = p?.companyIds?.[0] || activeCompanyIds[0];
      return {
        ...p,
        id: generateUUID(),
        externalId: p.externalId || generateUUID(),
        stockLevels: { [targetCid]: initialQty },
        initialStockLevels: { [targetCid]: initialQty },
        initialCost: Number(p.costPrice) || 0,
        lastPurchasePrice: p.costPrice || 0,
        companyIds: p?.companyIds || [activeCompanyIds[0]]
      };
    });

    // Record initial inventory valuation for each product with quantity > 0
    preparedProducts.forEach(p => {
      const qoh = p.stockLevels[p?.companyIds[0]] || 0;
      if (qoh > 0) {
        const valuation = qoh * (p.costPrice || 0);
        if (valuation > 0) {
          const targetCompanyId = p?.companyIds[0];
          const invAccount = getAccountIdByCode('100502', targetCompanyId) || 
                             getAccountIdByCode('100501', targetCompanyId) || 
                             getAccountIdByCode('100500', targetCompanyId) || 
                             (allAccounts || []).find(a => a && (a.subType === 'INVENTORY' || a.type === 'ASSET') && a?.companyId === targetCompanyId)?.id || 
                             (allAccounts || [])[0]?.id;
          const equityAccount = getAccountIdByCode('300000', targetCompanyId) || 
                                getAccountIdByCode('300001', targetCompanyId) || 
                                (allAccounts || []).find(a => a && (a.subType === 'EQUITY' || a.type === 'EQUITY') && a?.companyId === targetCompanyId)?.id || 
                                (allAccounts || [])[0]?.id;

          addJournalEntry({
            date: getOpDateBST(),
            description: `Initial Inventory (Bulk): ${p.name}`,
            reference: `INIT-${p.sku || p.id}`,
            status: 'POSTED',
            lines: [
              { id: `INV-DR-${p.id}`, accountId: invAccount, debit: valuation, credit: 0, description: `Initial Stock: ${p.name}` },
              { id: `eq-cr-${p.id}`, accountId: equityAccount, debit: 0, credit: valuation, description: `Opening Balance Equity` }
            ]
          }, targetCompanyId).catch(err => {
            console.error("Failed to post bulk initial stock journal entry:", err);
          });
        }
      }
    });

    setLocalOnlyProducts(prev => [...prev, ...preparedProducts]);
    setPaginatedProducts(prev => [...preparedProducts, ...prev]);
    setProductCount(prev => prev + preparedProducts.length);

    // SYNC TO SUPABASE
    const productsToUpsert = preparedProducts.map(p => {
      const { quantityOnHand, costPrice, initialCost, stockLevels, initialStockLevels, ...rest } = p as any;
      return {
      id: p.id,
      data: rest,
      company_id: p?.companyIds[0],
      name: p.name,
      sku: p.sku,
      price: p.price,
      updated_at: new Date().toISOString()
    }; });

    if (productsToUpsert.length > 0) {
      supabase.from('docs_products').upsert(productsToUpsert).then(({ error }) => {
        if (error) console.error("bulkAddProducts: Sync Failed", error);
      });
    }
  }, [activeCompanyIds, addJournalEntry, getAccountIdByCode, setLocalOnlyProducts, setPaginatedProducts, setProductCount]);

  const bulkImportProducts = useCallback(async (importedProducts: any[]) => {
    console.log('bulkImportProducts: starting for', importedProducts.length, 'items');
    const fallbackCompanyId = activeCompanyIds[0] || (companies && companies[0]?.id);
    const defaultCompanyIds = fallbackCompanyId ? [fallbackCompanyId] : [];
    const timestamp = Date.now();
    
    
    const updatedProductsList = [...(productsRef.current || [])];
    const uniqueBrandsMap = new Set<string>();
    const uniqueCategoriesMap = new Set<string>();
    
    const productsToUpsert: any[] = [];

    importedProducts.forEach((p, idx) => {
      let existingIdx = -1;
      if (p.externalId) {
        existingIdx = updatedProductsList.findIndex(ep => ep.externalId === p.externalId);
      }
      if (existingIdx === -1 && p.sku) {
        existingIdx = updatedProductsList.findIndex(ep => ep.sku && String(ep.sku).trim() !== '' && String(ep.sku).toLowerCase().trim() === String(p.sku).toLowerCase().trim());
      }
      if (existingIdx === -1 && p.name) {
        existingIdx = updatedProductsList.findIndex(ep => ep.name && String(ep.name).toLowerCase().trim() === String(p.name).toLowerCase().trim());
      }
      
      if (p.brand) uniqueBrandsMap.add(p.brand);
      if (p.category) uniqueCategoriesMap.add(p.category);

      const productId = existingIdx >= 0 ? updatedProductsList[existingIdx].id : generateUUID();
      const initialQty = Number(p.quantityOnHand) || 0;
      
      let rawCompanyIds = p?.companyIds || defaultCompanyIds;
      let resolvedCompanyIds: string[] = [];
      
      if (Array.isArray(rawCompanyIds)) {
        resolvedCompanyIds = rawCompanyIds.map(cid => {
          if (!cid) return '';
          const found = (companies || []).find(c => 
            c.id === cid || 
            (c.name && String(cid).toLowerCase() === c.name.toLowerCase())
          );
          return found ? found.id : '';
        }).filter(Boolean);
      }
      
      if (resolvedCompanyIds.length === 0) {
        resolvedCompanyIds = defaultCompanyIds;
      }

      const targetCid = resolvedCompanyIds[0] || fallbackCompanyId;

      const productData: Product = {
        ...p,
        id: productId,
        externalId: p.externalId || (existingIdx >= 0 ? updatedProductsList[existingIdx].externalId : generateUUID()),
        companyIds: resolvedCompanyIds,
        stockLevels: { [targetCid]: initialQty },
        initialStockLevels: { [targetCid]: initialQty },
        initialCost: Number(p.costPrice) || 0,
        price: Number(p.price) || 0,
        costPrice: Number(p.costPrice) || 0,
        purchasePrice: Number(p.costPrice) || 0,
        lastPurchasePrice: Number(p.costPrice) || 0,
        lastPurchaseRate: Number(p.costPrice) || 0,
        trackInventory: p.trackInventory !== undefined ? p.trackInventory : true,
        type: p.type || 'Goods',
        canBeSold: p.canBeSold !== undefined ? p.canBeSold : true,
        canBePurchased: p.canBePurchased !== undefined ? p.canBePurchased : true
      };

      if (existingIdx >= 0) {
        const oldProduct = updatedProductsList[existingIdx];
        const merged = { ...oldProduct, ...productData, externalId: oldProduct.externalId };
        updatedProductsList[existingIdx] = merged;
        const { ...mergedRest } = merged as any;
        mergedRest.costPrice = oldProduct.costPrice;
        mergedRest.quantityOnHand = oldProduct.quantityOnHand;
        mergedRest.initialCost = oldProduct.initialCost;
        productsToUpsert.push({
          id: merged.id,
          data: mergedRest,
          company_id: merged?.companyIds[0] || fallbackCompanyId,
          name: merged.name,
          sku: merged.sku,
          price: Number(merged.price) || 0,
          updated_at: new Date().toISOString()
        });
      } else {
        const newProduct = {
          ...productData,
          id: productId,
        };
        updatedProductsList.push(newProduct as Product);
        const { stockLevels, initialStockLevels, ...newProductRest } = newProduct as any;
        productsToUpsert.push({
          id: newProduct.id,
          data: newProductRest,
          company_id: targetCid,
          name: newProduct.name,
          sku: newProduct.sku,
          price: Number(newProduct.price) || 0,
          updated_at: new Date().toISOString()
        });
        
        const qoh = newProduct.stockLevels?.[targetCid] || 0;
        
      }
    });

    
    // Process unique brands and categories first, grouped by target company
    const brandsToUpsert: any[] = [];
    const updatedBrands = [...(brandsRef.current || [])];
    const categoriesToUpsert: any[] = [];
    const updatedCategories = [...(categoriesRef.current || [])];

    importedProducts.forEach((p) => {
      let rawCompanyIds = p?.companyIds || defaultCompanyIds;
      let resolvedCompanyIds: string[] = [];
      if (Array.isArray(rawCompanyIds)) {
        resolvedCompanyIds = rawCompanyIds.map((cid: any) => {
          if (!cid) return '';
          const found = (companies || []).find(c => 
            c.id === cid || 
            (c.name && String(cid).toLowerCase() === c.name.toLowerCase())
          );
          return found ? found.id : '';
        }).filter(Boolean);
      }
      if (resolvedCompanyIds.length === 0) {
        resolvedCompanyIds = defaultCompanyIds;
      }
      const targetCid = resolvedCompanyIds[0] || fallbackCompanyId;
      if (!targetCid) return;

      if (p.brand) {
        const brandName = String(p.brand).trim();
        if (brandName && !updatedBrands.some(x => x.name.toLowerCase() === brandName.toLowerCase() && x?.companyId === targetCid)) {
          const newBrand = { id: generateUUID(), name: brandName, description: '', companyId: targetCid };
          updatedBrands.push(newBrand);
          brandsToUpsert.push({ id: newBrand.id, data: newBrand, company_id: targetCid });
        }
      }

      if (p.category) {
        const catName = String(p.category).trim();
        if (catName && !updatedCategories.some(x => x.name.toLowerCase() === catName.toLowerCase() && x?.companyId === targetCid)) {
          const newCat = { id: generateUUID(), name: catName, description: '', companyId: targetCid };
          updatedCategories.push(newCat);
          categoriesToUpsert.push({ id: newCat.id, data: newCat, company_id: targetCid });
        }
      }
    });

    // Direct Supabase pushes
    try {
      if (brandsToUpsert.length > 0) {
        const finalBrandsToUpsertMap = new Map<string, any>();
        brandsToUpsert.forEach(b => finalBrandsToUpsertMap.set(b.id, b));
        const finalBrandsToUpsert = Array.from(finalBrandsToUpsertMap.values());

        const res = await withRetry(() => supabase.from('docs_brands').upsert(finalBrandsToUpsert));
        if (res.error) throw new Error(`Brands sync failed: ${res.error.message}`);
      }
      if (categoriesToUpsert.length > 0) {
        const finalCategoriesToUpsertMap = new Map<string, any>();
        categoriesToUpsert.forEach(c => finalCategoriesToUpsertMap.set(c.id, c));
        const finalCategoriesToUpsert = Array.from(finalCategoriesToUpsertMap.values());

        const res = await withRetry(() => supabase.from('docs_categories').upsert(finalCategoriesToUpsert));
        if (res.error) throw new Error(`Categories sync failed: ${res.error.message}`);
      }
      if (productsToUpsert.length > 0) {
        const finalProductsToUpsertMap = new Map<string, any>();
        productsToUpsert.forEach(pr => finalProductsToUpsertMap.set(pr.id, pr));
        const finalProductsToUpsert = Array.from(finalProductsToUpsertMap.values());

        // Chunk products
        for (let i = 0; i < finalProductsToUpsert.length; i += 1000) {
          const res = await withRetry(() => supabase.from('docs_products').upsert(finalProductsToUpsert.slice(i, i + 1000)));
          if (res.error) throw new Error(`Products sync failed: ${res.error.message}`);
        }
      }
    } catch (dbErr: any) {
      console.error('bulkImportProducts: DB push failed', dbErr);
      throw dbErr;
    }

    // Finally update local state and refs!
    brandsRef.current = updatedBrands;
    categoriesRef.current = updatedCategories;
    productsRef.current = updatedProductsList;

    setLocalOnlyBrands(updatedBrands);
    setLocalOnlyCategories(updatedCategories);
    setLocalOnlyProducts(updatedProductsList);
    
    console.log('bulkImportProducts: completed');
  }, [activeCompanyIds, allProducts, allBrands, allCategories, companies, getAccountIdByCode, setLocalOnlyBrands, setLocalOnlyCategories, setLocalOnlyProducts, setLocalOnlyEntries, allAccounts]);

  const bulkImportContacts = useCallback(async (importedContacts: any[]) => {
    console.log('bulkImportContacts: starting for', importedContacts.length, 'records');
    const defaultCompanyId = activeCompanyIds[0] || (companies && companies[0]?.id);
    const timestamp = Date.now();
    
    const updatedContactsList = [...(contactsRef.current || [])];
    const contactsToUpsertMap: Record<string, any> = {};

    importedContacts.forEach(c => {
      const contactId = c.id || generateUUID();
      const existingIdx = updatedContactsList.findIndex(ec => 
        (ec.id === contactId) || 
        (ec.externalId && c.externalId && ec.externalId === c.externalId) ||
        (ec.name && c.name && ec.name.toLowerCase() === c.name.toLowerCase())
      );

      const contactData = {
        ...c,
        id: existingIdx >= 0 ? updatedContactsList[existingIdx].id : contactId,
        companyIds: c.companyIds?.length ? c.companyIds : [defaultCompanyId].filter(Boolean),
      };

      if (existingIdx >= 0) {
        const oldContact = updatedContactsList[existingIdx];
        const merged = { ...oldContact, ...contactData };
        updatedContactsList[existingIdx] = merged;
        contactsToUpsertMap[merged.id] = {
            id: merged.id,
            data: merged,
          company_id: merged.companyIds[0] || defaultCompanyId,
          name: merged.name,
          updated_at: new Date().toISOString()
        };
      } else {
        updatedContactsList.push(contactData as any);
        contactsToUpsertMap[contactData.id] = {
          id: contactData.id,
          data: contactData,
          company_id: contactData.companyIds[0] || defaultCompanyId,
          name: contactData.name,
          updated_at: new Date().toISOString()
        };
      }
    });

    try {
      const contactsToUpsert = Object.values(contactsToUpsertMap);
      if (contactsToUpsert.length > 0) {
        for (let i = 0; i < contactsToUpsert.length; i += 1000) {
          const res = await withRetry(() => supabase.from('docs_contacts').upsert(contactsToUpsert.slice(i, i + 1000)));
          if (res.error) throw new Error(`Contacts sync failed: ${res.error.message}`);
        }
      }
    } catch (err: any) {
      console.error('bulkImportContacts: DB push failed', err);
      throw err;
    }

    // Finally update local state and refs!
    contactsRef.current = updatedContactsList;
    setLocalOnlyContacts(updatedContactsList);
    
  }, [activeCompanyIds, allContacts, companies, getAccountIdByCode, setLocalOnlyContacts, setLocalOnlyEntries, allAccounts]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    const product = (allProducts || []).find(p => p.id === id) || (paginatedProducts || []).find(p => p.id === id);
    if (!product) return;

    // Extract brand and category
    const initialCompanyIds = (updates?.companyIds && updates?.companyIds.length > 0) 
      ? updates?.companyIds 
      : product.companyIds || [activeCompanyIds[0] || companies[0]?.id].filter(Boolean);
    const primaryCompanyId = initialCompanyIds[0];

    if (updates.brand && updates.brand !== product.brand) {
      setAllBrands(prev => { 
         if (prev.some(b => b.name === updates.brand && b?.companyId === primaryCompanyId)) return prev; 
         return [...prev, { id: generateUUID(), name: updates.brand as string, description: '', companyId: primaryCompanyId }];
      });
    }
    if (updates.category && updates.category !== product.category) {
      setAllCategories(prev => { 
         if (prev.some(c => c.name === updates.category && c?.companyId === primaryCompanyId)) return prev; 
         return [...prev, { id: generateUUID(), name: updates.category as string, description: '', companyId: primaryCompanyId }];
      });
    }

    const changes = getChangeLog(product, updates, ['name', 'price', 'costPrice', 'sku', 'category', 'type']);
    
    // Handle Inventory Adjustment via Movement (Transaction)
    const targetCompanyId = (updates as any)?.companyId || (product as any).companyId || (product as any).company_id || product?.companyIds?.[0] || activeCompanyIds[0] || companies?.[0]?.id;
    const qohUpdate = (updates as any).quantityOnHand;
    
    // We get current QOH from the database value first, falling back to calculation
    const currentQtyForAdjustment = product.quantityOnHand !== undefined 
      ? Number(product.quantityOnHand) 
      : ((allInventoryTransactions || [])
          .filter(t => t.product_id === id && t.company_id === targetCompanyId)
          .reduce((sum, t) => sum + (t.transaction_type === 'IN' ? t.quantity : -t.quantity), 0)
        );

    if (qohUpdate !== undefined && qohUpdate !== currentQtyForAdjustment) {
      const diff = Number(qohUpdate) - currentQtyForAdjustment;
      const valuation = Math.abs(diff * (updates.costPrice || product.costPrice || 0));
      
      // Emit Inventory Transaction for Adjustment
      const adjTransaction = {
        id: generateUUID(),
        company_id: targetCompanyId,
        product_id: id,
        transaction_type: diff > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(diff),
        reference_id: `ADJ-${id}`,
        reference_type: 'ADJUSTMENT',
        date: getOpDateBST(),
        cost_price: product.costPrice || 0,
        updated_at: new Date().toISOString()
      };

      supabase.from('docs_inventory_transactions').insert(adjTransaction).then(({ error }) => {
        if (error) console.error('Inventory Adjustment Sync Failed:', error);
      });
      setAllInventoryTransactions(prev => [...prev, adjTransaction]);

      // Sync serial numbers if tracking is enabled
      if (product.trackingType === 'SERIAL' || updates.trackingType === 'SERIAL') {
        const currentSerials = (updates as any).serialNumbers || product.serialNumbers || [];
        if (qohUpdate > currentSerials.length) {
          const needed = qohUpdate - currentSerials.length;
          const newSerials = Array.from({ length: needed }, (_, i) => generateUUID());
          updates.serialNumbers = [...currentSerials, ...newSerials];
        } else if (qohUpdate < currentSerials.length) {
          updates.serialNumbers = currentSerials.slice(0, qohUpdate);
        }
      }

      if (valuation > 0 && (updates as any).adjustmentContactId) {
        addJournalEntry({
          date: getOpDateBST(),
          description: `Inventory Adjustment: ${product.name} (${diff > 0 ? '+' : ''}${diff} Units)`,
          reference: `ADJ-${product.sku || product.id}`,
          status: 'POSTED',
          lines: [
            { 
              id: generateUUID(), 
              accountId: getAccountIdByCode('100502', targetCompanyId), 
              debit: diff > 0 ? valuation : 0, 
              credit: diff < 0 ? valuation : 0, 
              description: `Stock Adjustment: ${product.name}` 
            },
            { 
              id: generateUUID(), 
              accountId: getAccountIdByCode('500501', targetCompanyId), 
              contactId: (updates as any).adjustmentContactId,
              debit: diff < 0 ? valuation : 0, 
              credit: diff > 0 ? valuation : 0, 
              description: `Inventory Adjustment Expense` 
            }
          ]
        }, targetCompanyId);
      }
    }

    const body = (updates as any).reason 
      ? `Inventory Adjustment: ${(updates as any).reason} (New Qty: ${(updates as any).quantityOnHand})`
      : changes.length > 0 ? `Product updated: ${changes.join(', ')}` : '';

    const newMessages = body ? [...(product.messages || []), {
      id: generateUUID(),
      authorId: currentUser?.id || 'user-1',
      body,
      date: formatDateTime(new Date()),
      type: 'notification'
    }] : (product.messages || []);

    setLocalOnlyProducts(prevProducts => {
      return prevProducts.map(p => {
        if (p.id !== id) return p;
        const { adjustmentContactId, reason, ...rest } = updates as any;
        return { 
          ...p, 
          ...rest,
          messages: newMessages
        };
      });
    });

    setPaginatedProducts(prevProducts => {
      return prevProducts.map(p => {
        if (p.id !== id) return p;
        const { adjustmentContactId, reason, ...rest } = updates as any;
        return { 
          ...p, 
          ...rest,
          messages: newMessages
        };
      });
    });

    // SYNC TO SUPABASE
    try {
      const updatedProd = { ...product, ...updates };
      
      const { 
        adjustmentContactId, 
        reason, 
        ...restSync 
      } = updatedProd as any;
      
      
      const payload: any = {
        name: restSync.name,
        sku: restSync.sku,
        price: Number(restSync.price) || 0,
        description: restSync.description || '',
        category: restSync.category || 'All',
        brand: restSync.brand || '',
        type: restSync.type || 'Goods',
        uom: restSync.uom || 'Units',
        track_inventory: restSync.trackInventory !== false,
        can_be_sold: restSync.canBeSold !== false,
        can_be_purchased: restSync.canBePurchased !== false,
        can_be_expensed: restSync.canBeExpensed === true,
        updated_at: new Date().toISOString(),
        data: restSync
      };
      
      if (restSync.isInPos !== undefined) payload.is_in_pos = restSync.isInPos;
      if (restSync.taxCode !== undefined) payload.tax_code = restSync.taxCode;

      console.log('Sending update for ID:', id, 'Payload:', payload); const { data: updateData, error, count, status } = await supabase.from('docs_products').update(payload).eq('id', id).select(); console.log('Update result:', { updateData, error, count, status });
      if (!error && (!updateData || updateData.length === 0)) {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'DB Update 0 rows affected! RLS blocked or ID missing.', type: 'error' } }));
      }
      if (error) {
        console.error('Failed to sync updated product to Supabase:', error);
        throw new Error(JSON.stringify(error) + ' / ' + error.message);
      }
      console.log('Dummy close for updateProduct');
    } catch(e: any) { 
       console.error(e); 
       window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Product Update Error: ' + e.message, type: 'error' } }));
    }
  }, [allProducts, paginatedProducts, currentUser, supabase]);

  const addContact = useCallback(async (contact: Omit<Contact, 'id'>) => {
    const newContact: Contact = { 
      ...contact, 
      id: generateUUID(),
      companyIds: contact.companyIds || activeCompanyIds,
      createdAt: new Date().toISOString()
    };
    
    // Attempt local first
    setLocalOnlyContacts(prev => [newContact, ...prev]);
    setPaginatedContacts(prev => [newContact, ...prev]);
    
    // Save to DB
    const { error } = await supabase.from('docs_contacts').upsert({
      id: newContact.id,
      company_id: newContact.companyIds[0],
      company_ids: newContact.companyIds,
      name: newContact.name,
      type: newContact.type,
      email: newContact.email,
      phone: newContact.phone,
      address: newContact.address,
      is_customer: newContact.isCustomer || newContact.type === 'CUSTOMER' || (newContact.type as any) === 'PARTNER',
      is_vendor: newContact.isVendor || newContact.type === 'VENDOR' || (newContact.type as any) === 'PARTNER',
      is_lender: newContact.isLender || (newContact.type as any) === 'LENDER',
      opening_balances: newContact.openingBalances,
      data: newContact
    });
    
    if (error) {
      console.error('Failed to add contact to DB', error);
      // rollback could happen here if needed
    }
    
    return newContact;
  }, [activeCompanyIds, setLocalOnlyContacts, setPaginatedContacts]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    const existing = (allContacts || []).find(c => c.id === id);
    if (!existing) return;
    
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    
    setLocalOnlyContacts(prev => prev.map(c => c.id === id ? updated : c));
    setPaginatedContacts(prev => prev.map(c => c.id === id ? updated : c));
    
    const { error } = await supabase.from('docs_contacts').update({
      company_ids: updated.companyIds,
      name: updated.name,
      type: updated.type,
      email: updated.email,
      phone: updated.phone,
      address: updated.address,
      is_customer: updated.isCustomer || updated.type === 'CUSTOMER' || updated.type === 'PARTNER',
      is_vendor: updated.isVendor || updated.type === 'VENDOR' || updated.type === 'PARTNER',
      is_lender: updated.isLender || updated.type === 'LENDER',
      opening_balances: updated.openingBalances,
      data: updated
    }).eq('id', id);
    
    if (error) {
      console.error('Failed to update contact in DB', error);
    }
  }, [allContacts, setLocalOnlyContacts, setPaginatedContacts]);
  const mergeContacts = useCallback(async (...args: any[]) => { console.warn('Stubbed method mergeContacts called'); return {} as any; }, []);
  const addInventoryAdjustment = useCallback(async (...args: any[]) => { console.warn('Stubbed method addInventoryAdjustment called'); return {} as any; }, []);
  const updateInventoryAdjustment = useCallback(async (...args: any[]) => { console.warn('Stubbed method updateInventoryAdjustment called'); return {} as any; }, []);
  const postInventoryAdjustment = useCallback(async (...args: any[]) => { console.warn('Stubbed method postInventoryAdjustment called'); return {} as any; }, []);
  const deleteInventoryAdjustment = useCallback(async (...args: any[]) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity.");
  }, []);
  const resetInventoryAdjustmentToDraft = useCallback(async (...args: any[]) => { console.warn('Stubbed method resetInventoryAdjustmentToDraft called'); return {} as any; }, []);
const addExpense = useCallback(async (expenseData: any) => {
    let finalRef = expenseData.reference;
    if (expenseData.status === 'POSTED' && (!finalRef || String(finalRef).startsWith('DRAFT-'))) {
       finalRef = generateNextNumber('EXPENSE', expenseData.date, activeCompanyIds[0]);
    }
    const entry = await addJournalEntry({
      date: expenseData.date,
      description: `Expense: ${expenseData.description}`,
      reference: finalRef,
      journalType: 'EXPENSE',
      expenseType: expenseData.expenseType,
      status: expenseData.status,
      lines: [
        { id: generateUUID(), accountId: expenseData.toAccountId, debit: expenseData.amount, credit: 0, description: expenseData.description },
        { id: generateUUID(), accountId: expenseData.fromAccountId, debit: 0, credit: expenseData.amount, contactId: expenseData.contactId, description: expenseData.description }
      ]
    });
    return entry;
  }, [addJournalEntry, activeCompanyIds, generateNextNumber]);
  
  const updateLoanAmortizationEntry = useCallback(async (loanId, period, updates) => {
    try {
      const loan = (allLoans || []).find(l => l.id === loanId);
      if (!loan) throw new Error("Loan not found");
      const sched = loan.amortizationSchedule || loan.amortization_schedule || [];
      const updatedSched = sched.map(s => s.period === period ? { ...s, ...updates } : s);
      
      await dbService.upsertDoc('docs_loans', loanId, { ...loan, amortizationSchedule: updatedSched, amortization_schedule: updatedSched });
      setLocalOnlyLoans(prev => prev.map(l => l.id === loanId ? { ...l, amortizationSchedule: updatedSched, amortization_schedule: updatedSched } : l));
    } catch(e) {
      console.error("updateLoanAmortizationEntry error:", e);
    }
  }, [allLoans, setLocalOnlyLoans]);

  const updateLoan = useCallback(async (loanId, data) => {
    
    
    const existing = (allLoans || []).find((l: any) => l.id === loanId) || {};
    await dbService.upsertDoc('docs_loans', loanId, { ...existing, ...data });
    // Fetch the updated loan from DB because trigger might have regenerated amortization_schedule
    const res = await supabase.from('docs_loans').select('*').eq('id', loanId).single();
    if (res.data) {
      const updatedLoan = { ...existing, ...data, ...res.data, amortizationSchedule: res.data.amortization_schedule || res.data.data?.amortizationSchedule || [] };
      setLocalOnlyLoans(prev => prev.map(l => l.id === loanId ? updatedLoan : l));
    } else {
      setLocalOnlyLoans(prev => prev.map(l => l.id === loanId ? { ...l, ...data } : l));
    }
  }, [allLoans, setLocalOnlyLoans]);

  const addLoan = useCallback(async (data) => {
    
    
    const newLoanId = generateUUID();
    await dbService.upsertDoc('docs_loans', newLoanId, { id: newLoanId,
        ...data,
        status: 'DRAFT',
        company_id: data.companyId || activeCompanyIds[0],
        amortization_schedule: data.amortizationSchedule || []
    });
    const res = await supabase.from('docs_loans').select('*').eq('id', newLoanId).single();
    if (res.data) {
      const addedLoan = { ...data, ...res.data, id: newLoanId, amortizationSchedule: res.data.amortization_schedule || res.data.data?.amortizationSchedule || [] };
      setLocalOnlyLoans(prev => [...prev, addedLoan]);
      return addedLoan;
    }
  }, [setLocalOnlyLoans, activeCompanyIds]);

  const postLoan = useCallback(async (loanId) => {
    
    const res = await supabase.rpc('post_loan_rpc', { p_loan_id: loanId });
    if (res.error) throw new Error(res.error.message);
    const updatedLoanRes = await supabase.from('docs_loans').select('*').eq('id', loanId).single();
    if (updatedLoanRes.data) {
        setLocalOnlyLoans(prev => prev.map(l => l.id === loanId ? { ...l, ...updatedLoanRes.data, journalEntryId: res.data?.journal_id, amortizationSchedule: updatedLoanRes.data.amortization_schedule || updatedLoanRes.data.data?.amortizationSchedule || [] } : l));
    }
  }, [setLocalOnlyLoans]);

  const recordLoanPayment = useCallback(async (loanId: string, period: number, date: string, interestAmount?: number, principalAmount?: number) => {
    let interestToPay = interestAmount;
    let principalToPay = principalAmount;
    const loan = (allLoans || []).find((l: any) => l.id === loanId);
    if (!loan) throw new Error("Loan not found");

    if (interestToPay === undefined || principalToPay === undefined) {
      const sched = loan.amortizationSchedule || loan.amortization_schedule || [];
      const entry = sched.find((s: any) => s.period === period);
      if (entry) {
         if (interestToPay === undefined) interestToPay = entry.interest || 0;
         if (principalToPay === undefined) principalToPay = entry.principal || 0;
      }
    }
    interestToPay = Number(interestToPay) || 0;
    principalToPay = Number(principalToPay) || 0;

    const companyId = loan.companyId || loan.company_id || activeCompanyIds[0];
    const contactId = loan.contactId || loan.contact_id || loan.data?.contactId;
    const isReceived = (loan.type || loan.data?.type) === 'RECEIVED';
    const totalAmount = principalToPay + interestToPay;

    if (totalAmount <= 0) return;

    const cashAcc = allAccounts.find(a => (a.code === '100100' || a.subType === 'CASH' || a.subType === 'BANK') && a.companyId === companyId);
    if (!cashAcc) throw new Error('Cash/Bank account not found for this company');

    let loanAcc, interestAcc;
    if (isReceived) {
        loanAcc = allAccounts.find(a => a.code === '210100' && a.companyId === companyId);
        interestAcc = allAccounts.find(a => a.code === '500208' && a.companyId === companyId) || allAccounts.find(a => a.code === '600000' && a.companyId === companyId);
    } else {
        loanAcc = allAccounts.find(a => a.code === '100601' && a.companyId === companyId);
        interestAcc = allAccounts.find(a => a.code === '500208' && a.companyId === companyId) || allAccounts.find(a => a.code === '400500' && a.companyId === companyId);
    }

    if (!loanAcc) throw new Error('Loan principal account not found for this company');
    if (interestToPay > 0 && !interestAcc) throw new Error('Interest account not found for this company');

    const loanNum = loan.loanNumber || loan.number || loan.data?.number || loan.data?.loanNumber;
    const desc = `Loan Payment Period ${period}: ${loan.name || loanNum}`;
    
    const lines: any[] = [];
    if (isReceived) {
        if (principalToPay > 0) lines.push({ accountId: loanAcc.id, contactId, debit: principalToPay, credit: 0, description: desc });
        if (interestToPay > 0) lines.push({ accountId: interestAcc!.id, contactId, debit: interestToPay, credit: 0, description: desc });
        if (totalAmount > 0) lines.push({ accountId: cashAcc.id, contactId, debit: 0, credit: totalAmount, description: desc });
    } else {
        if (totalAmount > 0) lines.push({ accountId: cashAcc.id, contactId, debit: totalAmount, credit: 0, description: desc });
        if (principalToPay > 0) lines.push({ accountId: loanAcc.id, contactId, debit: 0, credit: principalToPay, description: desc });
        if (interestToPay > 0) lines.push({ accountId: interestAcc!.id, contactId, debit: 0, credit: interestToPay, description: desc });
    }

    const refSuffix = (interestToPay === 0 ? '-PRIN' : (principalToPay === 0 ? '-INT' : ''));
    
    const payload = {
        date,
        journalDate: date,
        type: 'LOAN_PAYMENT',
        status: 'POSTED',
        reference: `${loanNum}/P${period}${refSuffix}`,
        notes: desc,
        lines
    };
    
    await addJournalEntry(payload as any, companyId);
    
    const currentPaid = loan.paidPeriods || loan.paid_periods || [];
    const newPaid = [...new Set([...currentPaid, period.toString()])];
    const isPaidOff = newPaid.length >= (loan.termMonths || loan.term_months || loan.data?.termMonths || 0);

    await supabase.from('docs_loans').update({
        paid_periods: newPaid,
        status: isPaidOff ? 'PAID' : loan.status,
        updated_at: new Date().toISOString()
    }).eq('id', loanId);

    const updatedLoanRes = await supabase.from('docs_loans').select('*').eq('id', loanId).single();
    if (updatedLoanRes.data) {
        setLocalOnlyLoans(prev => prev.map(l => {
           if (l.id === loanId) {
             return { ...l, ...updatedLoanRes.data, paidPeriods: updatedLoanRes.data.paid_periods || [], paid_periods: updatedLoanRes.data.paid_periods || [], amortizationSchedule: updatedLoanRes.data.amortization_schedule || updatedLoanRes.data.data?.amortizationSchedule || [] };
           }
           return l;
        }));
    }
  }, [allLoans, activeCompanyIds, allAccounts, addJournalEntry, setLocalOnlyLoans]);

  const recordInterestOnlyPayment = useCallback(async (loanId, period, date) => {
    const loan = (allLoans || []).find((l: any) => l.id === loanId);
    if (!loan) return;
    const sched = loan.amortizationSchedule || loan.amortization_schedule || [];
    const entry = sched.find(s => s.period === period);
    if (entry) {
        await recordLoanPayment(loanId, period, date, entry.interest, 0);
    }
  }, [allLoans, recordLoanPayment]);

  const deleteLoan = useCallback(async (loanId: string) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity. Use 'Cancel' or 'Reverse' instead.");
  }, []);

              const restoreRecord = useCallback(async (...args: any[]) => { console.warn('Stubbed method restoreRecord called'); return {} as any; }, []);
  const permanentDeleteRecord = useCallback(async (...args: any[]) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity.");
  }, []);
  const updateEmailSettings = useCallback(async (...args: any[]) => { console.warn('Stubbed method updateEmailSettings called'); return {} as any; }, []);
  const addCategory = useCallback(async (name: string) => {
    
    const dbId = generateUUID();
    const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
    const newCategory = {
      id: dbId,
      companyIds: activeCids,
      name
    };
    try {
      
      await dbService.upsertDoc('docs_categories', newCategory.id, newCategory);
      setLocalOnlyCategories((prev: any[]) => [newCategory, ...prev]);
      return newCategory;
    } catch (e) {
      console.error(e);
      alert('Failed to add category');
    }
  }, [setLocalOnlyCategories]);
  const autoGeneratePayslips = useCallback(async (...args: any[]) => { console.warn('Stubbed method autoGeneratePayslips called'); return {} as any; }, []);
  const calculatePayslip = useCallback(async (...args: any[]) => { console.warn('Stubbed method calculatePayslip called'); return {} as any; }, []);
  const postPayslip = useCallback(async (payslipId: string) => {
    const payslip = (allPayslips || []).find(p => p.id === payslipId);
    if (!payslip || payslip.status === 'POSTED') return;
    
    // Call backend RPC to handle journal entry creation and status update securely
    const res = await supabase.rpc('process_payroll', { p_payslip_id: payslipId, p_company_id: payslip.companyId });
    
    if (res.error || !res.data?.success) {
        console.error('Failed to post payslip via RPC:', res.error || res.data);
        return;
    }
    
    setLocalOnlyPayslips(prev => prev.map(p => p.id === payslipId ? { ...p, status: 'POSTED' } : p));
  }, [allPayslips]);
  const addAttendance = useCallback(async (...args: any[]) => { console.warn('Stubbed method addAttendance called'); return {} as any; }, []);
  const deleteHoliday = useCallback(async (...args: any[]) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity.");
  }, []);
  const addHoliday = useCallback(async (...args: any[]) => { console.warn('Stubbed method addHoliday called'); return {} as any; }, []);
  const deleteCommissionTarget = useCallback(async (...args: any[]) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity.");
  }, []);
  const addCommissionTarget = useCallback(async (...args: any[]) => { console.warn('Stubbed method addCommissionTarget called'); return {} as any; }, []);
  const postAdvanceSalary = useCallback(async (...args: any[]) => { console.warn('Stubbed method postAdvanceSalary called'); return {} as any; }, []);
  const addAdvanceSalary = useCallback(async (...args: any[]) => { console.warn('Stubbed method addAdvanceSalary called'); return {} as any; }, []);
  const applyCreditToInvoice = useCallback(async (...args: any[]) => { console.warn('Stubbed method applyCreditToInvoice called'); return {} as any; }, []);
  const setActiveTab = useCallback(async (...args: any[]) => { console.warn('Stubbed method setActiveTab called'); return {} as any; }, []);
  const resetPaymentToDraft = useCallback(async (...args: any[]) => { console.warn('Stubbed method resetPaymentToDraft called'); return {} as any; }, []);
  const updatePayment = useCallback(async (...args: any[]) => { console.warn('Stubbed method updatePayment called'); return {} as any; }, []);
  const updateAccount = useCallback(async (...args: any[]) => { console.warn('Stubbed method updateAccount called'); return {} as any; }, []);
  const targetMode = useCallback(async (...args: any[]) => { console.warn('Stubbed method targetMode called'); return {} as any; }, []);
      const updateUser = useCallback(async (id: string, updates: any) => {
    try {
      const existingUser = users.find(u => u.id === id) || ({} as any);
      const merged = { ...existingUser, ...updates };
      const payload = {
        name: merged.name,
        username: merged.username,
        email: merged.email,
        pin: merged.pin,
        role_id: merged.roleId,
        company_ids: merged.companyIds,
        company_id: merged.companyIds?.[0] || 'comp-1',
        data: merged
      };
      await dbService.upsertDoc('docs_users', id, payload);
      
      // Attempt to sync docs_user_company_access
      try {
         const { data: userData } = await supabase.from('docs_users').select('user_uuid').eq('id', id).maybeSingle();
         if (userData?.user_uuid) {
             const accessPayload = (updates.companyIds || []).map((cid: string) => ({
                 user_uuid: userData.user_uuid,
                 company_id: cid,
                 role_id: updates.roleId || 'role-accountant'
             }));
             await supabase.from('docs_user_company_access').delete().eq('user_uuid', userData.user_uuid);
             if (accessPayload.length > 0) {
                 await supabase.from('docs_user_company_access').upsert(accessPayload);
             }
         }
      } catch(e) {
         console.warn("Could not sync user company access, relies on next login:", e);
      }

      setLocalOnlyUsers((prev: any[]) => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      return { id, ...updates };
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [setLocalOnlyUsers]);
    const inviteUser = useCallback(async (userData: any) => {
    try {
      const id = 'user-' + Date.now();
      const payload = {
        id,
        name: userData.name,
        username: userData.username,
        email: userData.email,
        pin: userData.pin || '1234',
        role_id: userData.roleId,
        company_ids: userData.companyIds,
        company_id: userData.companyIds?.[0] || 'comp-1',
        status: 'ACTIVE',
        data: userData
      };
      await dbService.upsertDoc('docs_users', id, payload);
      const newUser = { id, ...userData };
      setLocalOnlyUsers((prev: any[]) => [newUser, ...prev]);
      return newUser;
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [setLocalOnlyUsers]);
  const addTask = useCallback(async (...args: any[]) => { console.warn('Stubbed method addTask called'); return {} as any; }, []);
  const updateTask = useCallback(async (...args: any[]) => { console.warn('Stubbed method updateTask called'); return {} as any; }, []);
  const deleteTask = useCallback(async (...args: any[]) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity.");
  }, []);
  const updateRole = useCallback(async (...args: any[]) => { console.warn('Stubbed method updateRole called'); return {} as any; }, []);
  const addRole = useCallback(async (...args: any[]) => { console.warn('Stubbed method addRole called'); return {} as any; }, []);
  const addBrand = useCallback(async (brand: any) => {
    
    const dbId = generateUUID();
    const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
    const newBrand = {
      id: dbId,
      companyIds: activeCids,
      ...brand
    };
    try {
      
      await dbService.upsertDoc('docs_brands', newBrand.id, newBrand);
      setLocalOnlyBrands((prev: any[]) => [newBrand, ...prev]);
      return newBrand;
    } catch (e) {
      console.error(e);
      alert('Failed to add brand');
    }
  }, [setLocalOnlyBrands]);
  const deleteProducts = useCallback(async (...args: any[]) => {
    alert("Deletion is restricted by backend policy to maintain audit integrity.");
  }, []);
  const mergeProducts = useCallback(async (...args: any[]) => { console.warn('Stubbed method mergeProducts called'); return {} as any; }, []);
  const recalculateProductInventory = useCallback(async (productId: string) => {}, []);

  return {
    allContacts,
    allLoans,
    allAccounts,
    addContact,
    updateContact,
    mergeContacts,
    addInventoryAdjustment,
    updateInventoryAdjustment,
    postInventoryAdjustment,
    deleteInventoryAdjustment,
    resetInventoryAdjustmentToDraft,
    addExpense,
    updateLoanAmortizationEntry,
    updateLoan,
    addLoan,
    postLoan,
    recordLoanPayment,
    recordInterestOnlyPayment,
    deleteLoan,
    restoreRecord,
    permanentDeleteRecord,
    updateEmailSettings,
    addCategory,
    autoGeneratePayslips,
    calculatePayslip,
    postPayslip,
    addAttendance,
    deleteHoliday,
    addHoliday,
    deleteCommissionTarget,
    addCommissionTarget,
    postAdvanceSalary,
    addAdvanceSalary,
    applyCreditToInvoice,
    setActiveTab,
    resetPaymentToDraft,
    updatePayment,
    updateAccount,
    targetMode,
    updateUser,
    inviteUser,
    addTask,
    updateTask,
    deleteTask,
    updateRole,
    addRole,
    addBrand,
    deleteProducts,
    mergeProducts,
    sessionChecked,
    setSessionChecked,
    activeCompanyIds,
    setActiveCompanyIds,
    paginatedEntries,
    setPaginatedEntries,
    entryCount,
    setEntryCount,
    isEntriesLoading,
    setIsEntriesLoading,
    fetchEntries,
    accountBalances,
    setAccountBalances,
    partnerBalances,
    setPartnerBalances,
    refreshBalances,
    paginatedInvoices,
    setPaginatedInvoices,
    invoiceCount,
    setInvoiceCount,
    isInvoicesLoading,
    setIsInvoicesLoading,
    paginatedBills,
    setPaginatedBills,
    billCount,
    setBillCount,
    isBillsLoading,
    setIsBillsLoading,
    getGeneralLedger,
    getGeneralLedgerByCode,
    paginatedProducts: resolvedPaginatedProducts,
    setPaginatedProducts,
    productCount,
    setProductCount,
    totalProductsCount,
    setTotalProductsCount,
    isProductsLoading,
    setIsProductsLoading,
    fetchProducts,
    fetchProductsOnDemand,
    searchProductsOnDemand,
    searchContactsOnDemand,
    paginatedContacts,
    setPaginatedContacts,
    contactCount,
    setContactCount,
    isContactsLoading,
    setIsContactsLoading,
    fetchEmployees: async () => {
      try {
        
        const { data, error } = await supabase
          .from('docs_contacts')
          .select('*')
          .eq('type', 'EMPLOYEE');
        if (!error && data) {
          setAllContacts(prev => {
            const prevArr = Array.isArray(prev) ? prev : [];
            const existing = new Set(prevArr.map(c => c.id));
            const filtered = data.filter(c => c && !existing.has(c.id));
            if (filtered.length === 0) return prevArr;
            return [...prevArr, ...filtered];
          });
        }
      } catch(e) { console.error('fetchEmployees error', e); }
    },
    fetchContacts,
    ensureEntitiesMetadata,
    resolveUserName,
    fetchInvoices,
    fetchBills,
    emailSettings,
    setEmailSettings,
    mergedRoles,
    currentUser,
    setCurrentUser,
    loginRole,
    setLoginRole,
    navStack,
    setNavStack,
    isCashierDrawerOpen,
    setIsCashierDrawerOpen,
    isStoreSyncing,
    setIsStoreSyncing,
    storeInitialized,
    setStoreInitialized,
    loadError,
    setLoadError,
    syncVersion,
    setSyncVersion,
    fetchInitialData,
    lastSyncTime,
    setLastSyncTime,
    triggerCloudSync,
    pushHistory,
    popHistory,
    closeFiscalPeriod,
    login,
    signUp,
    logout,
    resetPassword,
    confirmPasswordReset,
    accounts,
    entries,
    invoices,
    payments,
    warehouses: allWarehouses,
    productCosts: allProductCosts,
    inventoryTransactions: allInventoryTransactions,
    advanceSalaries: allAdvanceSalaries,
    commissionTargets: allCommissionTargets,
    holidays: allHolidays,
    bills,
    creditNotes,
    products,
    resolvedPaginatedProducts,
    contacts,
    employees,
    loans,
    inventoryAdjustments,
    payslips,
    attendance,
    leaves,
    tasks,
    brands,
    categories,
    users,
    roles,
    companies,
    filteredUsers,
    activeCompanies,
    availableCompanies,
    currentCompany: activeCompanies[0] || companies[0] || { id: '', name: 'Company', currency: 'USD', code: 'CO' },
    hasPermission,
    selectAllCompanies,
    toggleCompany,
    getChangeLog,
    addCompany,
    updateCompany,
    generateNextNumber,
    switchCompany,
    getAccountIdByCode,
    addAccount,
    addJournalEntry,
    clearPayment,
    recordPartnerDiscount,
    updateJournalEntry,
    resetJournalEntryToDraft,
    getAccountBalance,
    getPartnerBalance,
    deleteInvoice,
    deleteBill,
    deletePayment,
    deleteCreditNote,
    reverseJournalEntry,
    deleteJournalEntry,
    resetCreditNoteToDraft,
    addInvoice,
    postPayment,
    postInvoice,
    updateInvoice,
    payInvoice,
    addCreditNote,
    updateCreditNote,
    registerBatchPayment,
    postCreditNote,
    resetInvoiceToDraft,
    addBill,
    postBill,
    getDefaultWarehouse,
    updateBill,
    resetBillToDraft,
    payBill,
    addProduct,
    bulkAddProducts,
    bulkImportProducts,
    bulkImportContacts,
    updateProduct
  };

};
