
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  COST_OF_REVENUE = 'COST_OF_REVENUE',
  EXPENSE = 'EXPENSE',
  OTHER_REVENUE = 'OTHER_REVENUE',
  OTHER_EXPENSE = 'OTHER_EXPENSE'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  AUDITOR = 'AUDITOR',
  VIEWER = 'VIEWER'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  DEACTIVATED = 'DEACTIVATED'
}

export enum ContactType {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
  EMPLOYEE = 'EMPLOYEE',
  LOAN = 'LOAN',
  LENDER = 'LENDER'
}

export type PermissionKey = 
  // Sales & Receivables
  | 'invoice_view' | 'invoice_create' | 'invoice_edit' | 'invoice_void' | 'invoice_delete'
  | 'credit_note_view' | 'credit_note_create' | 'credit_note_edit' | 'credit_note_void'
  | 'customer_view' | 'customer_create' | 'customer_edit' | 'customer_delete'
  
  // Purchases & Payables
  | 'bill_view' | 'bill_create' | 'bill_edit' | 'bill_void' | 'bill_delete'
  | 'expense_view' | 'expense_create' | 'expense_edit' | 'expense_delete'
  | 'vendor_view' | 'vendor_create' | 'vendor_edit' | 'vendor_delete'
  
  // Payments & Banking
  | 'payment_view' | 'payment_create' | 'payment_edit' | 'payment_delete' | 'payment_post'
  | 'bank_reconcile' | 'bank_statement_import'
  | 'loan_view' | 'loan_create' | 'loan_edit' | 'loan_delete' | 'loan_payment_record'
  
  // Inventory & Products
  | 'inventory_view' | 'inventory_edit' | 'inventory_delete' | 'inventory_valuation_view'
  | 'product_view' | 'product_create' | 'product_edit' | 'product_delete'
  | 'category_manage' | 'brand_manage'
  | 'inventory_adjustment_view' | 'inventory_adjustment_create' | 'inventory_adjustment_edit'
  
  // Accounting & Ledger
  | 'ledger_view' | 'ledger_post' | 'ledger_edit' | 'ledger_reverse'
  | 'journal_view' | 'journal_create' | 'journal_edit' | 'journal_void'
  | 'chart_of_accounts_manage' | 'opening_balance_edit'
  
  // Reporting
  | 'report_financial' | 'report_tax' | 'report_audit' | 'report_sales' | 'report_purchase' | 'report_inventory'
  
  // Human Resources & Payroll
  | 'employee_view' | 'employee_create' | 'employee_edit' | 'employee_delete'
  | 'payroll_view' | 'payroll_process' | 'payroll_settings'
  | 'attendance_view' | 'attendance_manage' | 'leave_manage'
  
  // Administration
  | 'team_manage' | 'role_manage' | 'settings_manage' | 'data_import' | 'data_export' | 'company_setup' | 'audit_log_view'
  
  // Integrations
  | 'integration_quickbooks' | 'integration_xero' | 'integration_api' | 'integration_webhooks';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionKey[];
  customPermissions?: string[];
  color: string;
}

export interface Contact {
  id: string;
  externalId?: string;
  name: string;
  email: string;
  type: ContactType;
  phone?: string;
  address?: string;
  taxId?: string;
  companyIds: string[]; 
  openingBalances?: Record<string, number>; // companyId -> balance
  assignedUserId?: string;
  srId?: string;
  monthlyFixedSalary?: number;
  designation?: string;
  faceDescriptor?: number[]; // Biometric template (128 float values)
  createdAt?: string;
  updatedAt?: string;
  isCustomer?: boolean;
  isVendor?: boolean;
  isLender?: boolean;
  is_customer?: boolean;
  is_vendor?: boolean;
  is_lender?: boolean;
}

export interface AdvanceSalary {
  id: string;
  number: string;
  employeeId: string;
  date: string;
  amount: number;
  description?: string;
  status: 'DRAFT' | 'POSTED' | 'VOID' | 'DELETED';
  journalEntryId?: string;
  companyId: string;
  createdById?: string;
  preparedBy?: string;
}

export interface Message {
  id: string;
  authorId: string;
  body: string;
  date: string;
  type: 'comment' | 'notification';
}

export interface Payment {
  updatedAt?: string;
  createdAt?: string;
  id: string;
  number?: string;
  date: string;
  contactId: string;
  amount: number;
  reference: string;
  method: 'CASH' | 'BANK' | 'CREDIT_CARD' | 'ADVANCE';
  type: 'RECEIPT' | 'PAYMENT';
  paymentCategory?: string;
  status: 'DRAFT' | 'POSTED' | 'VOID' | 'DELETED';
  clearingStatus?: 'PENDING' | 'CLEARED' | 'REJECTED';
  clearedAt?: string;
  clearedById?: string;
  journalEntryId?: string;
  companyId: string;
  createdById?: string;
  invoiceId?: string;
  billId?: string;
  salesperson?: string;
  liquidityAccountId?: string;
  accountId?: string;
  account_id?: string;
  partnerAccountId?: string;
  partner_account_id?: string;
  appliedInvoices?: { invoiceId: string; invoiceNumber?: string; amount: number; remaining?: number }[];
  appliedBills?: { billId: string; billNumber?: string; amount: number; remaining?: number }[];
  messages?: Message[];
}

export interface UserRule {
  allowedIPs?: string[];
  allowedLocation?: { lat: number; lng: number; radius: number };
  shiftStart?: string; // HH:mm
  shiftEnd?: string; // HH:mm
  requireFaceAuth?: boolean;
  requireGeoLocation?: boolean;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password?: string;
  pin?: string;
  roleId: string;
  status: UserStatus;
  avatarUrl?: string;
  lastActive?: string;
  companyIds: string[];
  isCashier?: boolean;
  rules?: UserRule;
  invitationToken?: string;
  resetToken?: string;
  emailConfirmed?: boolean;
  userUuid?: string;
}

export interface Company {
  id: string;
  name: string;
  code: string; // Company Code (e.g. CO1, SAP, etc.)
  address?: string;
  registrationNumber?: string;
  taxId?: string;
  currency: string;
  industry: string;
  logoColor: string;
  isCashierEnabled?: boolean;
  latitude?: number;
  longitude?: number;
  geoFenceRadius?: number; // in meters
  standardWorkingHours?: number;
  gracePeriodMinutes?: number;
  weeklyHolidays?: number[]; // 0-6 (Sun-Sat)
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType?: string;
  description?: string;
  parentId?: string;
  companyId: string;
}

export interface JournalLine {
  id: string;
  accountId: string;
  contactId?: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference: string;
  lines: JournalLine[];
  status: 'DRAFT' | 'POSTED' | 'REVERSED' | 'DELETED';
  expenseType?: string;
  reversedEntryId?: string;
  companyId: string;
  createdById?: string;
  isNonCash?: boolean;
  journalType?: string;
  preparedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  messages?: Message[];
}

export type ProductType = 'Goods' | 'Service' | 'Combo';
export type TrackingType = 'NONE' | 'SERIAL';

export interface Product {
  id: string;
  externalId: string; 
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  lastPurchasePrice: number;
  lastPurchaseRate?: number;
  stockLevels: Record<string, number>; // companyId -> quantity
  quantityOnHand?: number; // Computed for UI
  taxCode: string;
  purchaseTax?: string;
  description?: string;
  category?: string;
  companyIds: string[];
  type: ProductType;
  trackingType: TrackingType;
  serialNumbers?: string[];
  uom?: string;
  invoicingPolicy: string;
  trackInventory: boolean;
  brand?: string;
  barcode?: string;
  canBeSold: boolean;
  canBeExpensed: boolean;
  canBePurchased: boolean;
  isInPos: boolean;
  messages?: Message[];
  adjustmentContactId?: string;
  initialStockLevels?: Record<string, number>;
  initialCost?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type InvoiceItemType = 'PRODUCT' | 'SERVICE' | 'TAX' | 'SUBTOTAL' | 'DISCOUNT' | 'SECTION' | 'NOTE';
export type DiscountMode = 'PERCENT' | 'FIXED';

export interface InvoiceItem {
  id: string;
  type: InvoiceItemType;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountRate?: number;
  discountMode?: DiscountMode;
  uom?: string;
  manualValue?: number;
  lineValue?: number;
  accountId?: string;
  serialNumbers?: string[];
  note?: string;
  previousAvgCost?: number;
  netUnitCost?: number;
}

export interface Invoice {
  updatedAt?: string;
  createdAt?: string;
  type?: string;
  preparedBy?: string;
  id: string;
  number: string;
  customerId: string;
  date: string;
  dueDate: string;
  reference?: string;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'REFUNDED' | 'VOID' | 'POSTED' | 'FULL_REFUNDED' | 'PARTIAL_REFUNDED' | 'IN_PAYMENT' | 'DELETED';
  journalEntryId?: string;
  companyId: string;
  createdById: string;
  customerNote?: string;
  messages?: Message[];
  salesperson?: string;
  deliveryPerson?: string;
  srId?: string;
  paymentMethod?: string;
  paymentDetails?: string;
  attachmentUrl?: string;
}

export interface CreditNote extends Omit<Invoice, 'status'> {
  status: 'DRAFT' | 'POSTED' | 'OPEN' | 'CLOSED' | 'VOID' | 'DELETED';
  originInvoiceId?: string;
  appliedInvoices?: { invoiceId: string; amount: number }[];
}

export interface Bill {
  updatedAt?: string;
  createdAt?: string;
  preparedBy?: string;
  id: string;
  number: string;
  vendorId: string;
  date: string;
  dueDate: string;
  reference?: string;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
  status: 'DRAFT' | 'POSTED' | 'PAID' | 'PARTIAL' | 'VOID' | 'IN_PAYMENT' | 'DELETED';
  journalEntryId?: string;
  companyId: string;
  createdById: string;
  messages?: Message[];
}

export interface DashboardStats {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
}

export type LoanType = 'GIVEN' | 'RECEIVED';
export type LoanStatus = 'DRAFT' | 'ACTIVE' | 'PAID' | 'VOID' | 'DELETED';
export type InterestType = 'FIXED' | 'REDUCING';

export interface AmortizationEntry {
  period: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';
  interestPaid?: boolean;
  principalPaid?: boolean;
  isEdited?: boolean;
  recalculated?: boolean;
}

export interface Loan {
  id: string;
  number: string;
  name: string;
  contactId: string; // Bank or Vendor
  contact_id?: string;
  type: LoanType;
  principalAmount: number;
  interestRate: number; // Annual percentage
  termMonths: number;
  startDate: string;
  interestType: InterestType;
  status: LoanStatus;
  amortizationSchedule: AmortizationEntry[];
  companyId: string;
  journalEntryId?: string;
  paidPeriods: number[];
  createdById?: string;
  preparedBy?: string;
  notes?: string;
  messages?: Message[];
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED'
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface InventoryAdjustmentItem {
  productId: string;
  productName: string;
  sku: string;
  brand?: string;
  currentQty: number;
  newQty: number;
  difference: number;
  reason: string;
}

export interface InventoryAdjustment {
  id: string;
  number: string;
  date: string;
  contactId: string; // Responsible Employee
  warehouseId?: string; // Target Warehouse
  items: InventoryAdjustmentItem[];
  status: 'DRAFT' | 'POSTED' | 'VOID';
  companyId: string;
  createdById: string;
  preparedBy?: string;
  notes?: string;
  messages?: Message[];
}

export enum SalaryComponentType {
  BASIC = 'BASIC',
  ALLOWANCE = 'ALLOWANCE',
  DEDUCTION = 'DEDUCTION',
  BONUS = 'BONUS',
  OVERTIME = 'OVERTIME',
  LOAN_REPAYMENT = 'LOAN_REPAYMENT',
  TAX = 'TAX'
}

export interface SalaryComponent {
  id: string;
  name: string;
  type: SalaryComponentType;
  amount: number;
  isFixed: boolean; // true if fixed amount, false if percentage of basic
  percentageOf?: string; // ID of another component (e.g. BASIC)
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HALF_DAY';
  overtimeHours: number;
  lateMinutes: number;
  companyId: string;
  isImportantDay?: boolean;
  checkInPhoto?: string; // Base64 log
  checkOutPhoto?: string;
  checkInLocation?: { lat: number; lng: number; isWithinFence?: boolean; address?: string };
  checkOutLocation?: { lat: number; lng: number; isWithinFence?: boolean; address?: string };
  checkInDevice?: string;
  checkOutDevice?: string;
  checkInLiveness?: number;
  checkOutLiveness?: number;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  type: 'SICK' | 'ANNUAL' | 'UNPAID' | 'OTHER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  days: number;
  companyId: string;
}

export interface Payslip {
  id: string;
  number: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  basicSalary: number;
  earnings: { name: string; amount: number; type: SalaryComponentType }[];
  deductions: { name: string; amount: number; type: SalaryComponentType }[];
  commission?: number;
  advanceDeduction?: number;
  netSalary: number;
  status: 'DRAFT' | 'POSTED' | 'PAID';
  journalEntryId?: string;
  companyId: string;
  attendanceSummary: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    halfDay: number;
    importantDayAbsences: number;
    overtimeHours: number;
  };
}

export interface CommissionTarget {
  id: string;
  companyId: string;
  type: 'PRODUCT' | 'BRAND' | 'CATEGORY' | 'GLOBAL';
  targetId?: string; // productId, brandName, or categoryName
  targetAmount: number;
  commissionRate: number; // percentage
  commissionType: 'GROSS_SALE' | 'PROFIT';
  period: string; // YYYY-MM
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: 'WEEKLY' | 'PUBLIC' | 'EVENT';
  isWorkingDay: boolean;
  isImportantDay: boolean;
  companyId: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  assignedUserId?: string;
  createdById: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address?: string;
  isDefault: boolean;
}

export interface ProductCost {
  id: string; // companyId:productId:warehouseId
  companyId: string;
  productId: string;
  warehouseId: string;
  avgCost: number;
  totalQty: number;
  totalValue: number;
  updatedAt: string;
}
