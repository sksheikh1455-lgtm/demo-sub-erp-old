import { 
  Account, JournalEntry, Invoice, AccountType, JournalLine, 
  Product, Company, User, UserRole, UserStatus, Contact, 
  ContactType, Payment, RoleDefinition, PermissionKey, Bill, CreditNote,
  Loan, AttendanceRecord, LeaveRecord, Payslip, CommissionTarget, 
  AdvanceSalary, Holiday, Warehouse, ProductCost
} from '../types';

/**
 * Enterprise ERP Multi-Tenant SaaS Context
 */
export interface TenantContext {
  activeCompanyIds: string[];
  currentCompany: Company | null;
  availableCompanies: Company[];
}

/**
 * Immutable Accounting Fiscal Lock Definition
 */
export interface FiscalPeriod {
  id: string;
  startDate: string;
  endDate: string;
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
}

/**
 * Audit Log Signature for Transactional Integrity
 */
export interface AuditContext {
  userId: string;
  action: string;
  recordId: string;
  table: string;
  timestamp: string;
  previousState?: any;
  newState?: any;
  reason?: string;
}

/**
 * Paged Results Generic Metadata
 */
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  limit: number;
  offset: number;
}

/**
 * 1. Authentication & Security Slice
 */
export interface AuthSlice {
  currentUser: User | null;
  userRole: RoleDefinition | null;
  permissions: PermissionKey[];
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  loginRole: string;
  setLoginRole: (role: string) => void;

  // Actions
  login: (username: string, pin: string) => Promise<User>;
  logout: () => Promise<void>;
  signUp: (email: string, pin: string, name: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  confirmPasswordReset: (newPassword: string) => Promise<boolean>;
  hasPermission: (permission: PermissionKey, roles: RoleDefinition[]) => boolean;
}

/**
 * 2. Multi-Corporate & Tenant Slice
 */
export interface CompaniesSlice {
  companies: Company[];
  activeCompanyIds: string[];
  isCompaniesLoading: boolean;

  // Actions
  setCompanies: (companies: Company[]) => void;
  setActiveCompanyIds: (ids: string[]) => void;
  switchCompany: (companyId: string) => void;
  toggleCompany: (companyId: string, currentUser: User | null) => void;
  selectAllCompanies: (currentUser: User | null) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  getTenantIsolationState: () => { activeCompanyIds: string[]; tenant_id: string };
}

/**
 * 3. Ledger & Chart of Accounts Slice
 */
export interface ChartOfAccountsSlice {
  accounts: Account[];
  isAccountsLoading: boolean;
  accountBalances: Record<string, number>; // accountId -> balance

  // Actions
  fetchAccounts: () => Promise<void>;
  createAccount: (account: Omit<Account, 'id'>) => Promise<Account>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  refreshBalances: () => Promise<void>;
  getNormalBalance: (account: Account) => 'DEBIT' | 'CREDIT';
}

/**
 * 4. General Ledger Journals & Transaction Slice
 */
export interface JournalsSlice {
  journals: JournalEntry[];
  journalLines: JournalLine[];
  paginatedJournals: PaginatedResult<JournalEntry>;
  isJournalsLoading: boolean;

  // Actions
  fetchJournals: (options: { limit?: number; offset?: number; search?: string }) => Promise<void>;
  createJournalEntry: (entry: Omit<JournalEntry, 'id' | 'status'>, lines: Omit<JournalLine, 'id'>[]) => Promise<JournalEntry>;
  updateJournalDraft: (id: string, updates: Partial<JournalEntry>, lines?: Partial<JournalLine>[]) => Promise<void>;
  postJournalEntry: (id: string) => Promise<void>;
  reverseJournalEntry: (id: string, reversalReason: string) => Promise<JournalEntry>; // Immutable reversal logic
  checkFiscalPeriodLock: (date: string) => Promise<boolean>;
}

/**
 * 5. Sales & Receivables (Invoices & Credit Notes) Slice
 */
export interface InvoicesSlice {
  invoices: Invoice[];
  creditNotes: CreditNote[];
  paginatedInvoices: PaginatedResult<Invoice>;
  isInvoicesLoading: boolean;

  // Actions
  fetchInvoices: (options: { limit?: number; offset?: number; search?: string; customerId?: string }) => Promise<void>;
  createInvoice: (invoice: Omit<Invoice, 'id' | 'companyId' | 'createdById'>, targetCompanyId?: string) => Promise<Invoice>;
  updateInvoiceDraft: (id: string, updates: Partial<Invoice>) => Promise<void>;
  postInvoice: (id: string) => Promise<void>;
  resetInvoiceToDraft: (id: string) => Promise<void>; // Guarded
  applyCreditToInvoice: (invoiceId: string, creditNoteId: string, amount: number) => Promise<void>;
}

/**
 * 6. Purchases & Payables (Bills & Supplier Expenses) Slice
 */
export interface BillsSlice {
  bills: Bill[];
  paginatedBills: PaginatedResult<Bill>;
  isBillsLoading: boolean;

  // Actions
  fetchBills: (options: { limit?: number; offset?: number; search?: string; vendorId?: string }) => Promise<void>;
  createBill: (bill: Omit<Bill, 'id' | 'companyId' | 'createdById'>) => Promise<Bill>;
  updateBillDraft: (id: string, updates: Partial<Bill>) => Promise<void>;
  postBill: (id: string) => Promise<void>;
  resetBillToDraft: (id: string) => Promise<void>; // Guarded
}

/**
 * 7. Inventory & Product Valuation Slice
 */
export interface InventorySlice {
  products: Product[];
  warehouses: Warehouse[];
  productCosts: ProductCost[];
  isInventoryLoading: boolean;

  // Actions
  fetchProducts: (options: { category?: string; query?: string }) => Promise<void>;
  createProduct: (product: Omit<Product, 'id'>) => Promise<Product>;
  updateProductDetails: (id: string, updates: Partial<Product>) => Promise<void>;
  adjustStockLevel: (productId: string, warehouseId: string, quantityDiff: number, reason: string) => Promise<void>;
  calculateWeightedAverageCost: (productId: string, companyId: string) => number;
}

/**
 * 8. Payments & Cash/Bank Management Slice
 */
export interface PaymentsSlice {
  payments: Payment[];
  isPaymentsLoading: boolean;

  // Actions
  fetchPayments: (options: { partnerId?: string; type?: 'RECEIPT' | 'PAYMENT' }) => Promise<void>;
  postPayment: (payment: Omit<Payment, 'id' | 'status' | 'payment_number'>) => Promise<Payment>;
  resetPaymentToDraft: (id: string) => Promise<void>; // Guarded
  clearPayment: (paymentId: string, status: 'CLEARED' | 'REJECTED') => Promise<void>;
}

/**
 * 9. Contacts (Customers, Vendors, Employees) Slice
 */
export interface ContactsSlice {
  contacts: Contact[];
  isContactsLoading: boolean;

  // Actions
  fetchContacts: (options: { type?: ContactType; query?: string }) => Promise<void>;
  createContact: (contact: Omit<Contact, 'id'>) => Promise<Contact>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  partnerBalances: Record<string, number>; // contactId -> receivables/payables balance
}

/**
 * Combined Global ERP Store State
 */
export type AccountingStoreState = {
  ensureEntitiesMetadata: (cIds: string[], pIds: string[]) => Promise<void>;
  resolveUserName: (id?: string) => string;
} & AuthSlice 
  & CompaniesSlice 
  & ChartOfAccountsSlice 
  & JournalsSlice 
  & InvoicesSlice 
  & BillsSlice 
  & InventorySlice 
  & PaymentsSlice 
  & ContactsSlice;
