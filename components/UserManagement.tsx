import { getOpDateBST } from '../constants';
import React, { useState } from 'react';
import { User, UserStatus, RoleDefinition, PermissionKey, Task, TaskStatus, TaskPriority, Contact } from '../types';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';

interface PermissionGroup {
  label: string;
  items: { key: PermissionKey; label: string; description: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: 'Sales & Accounts Receivable',
    items: [
      { key: 'invoice_view', label: 'View Invoices', description: 'Access the list and search functionality for all customer invoices.' },
      { key: 'invoice_create', label: 'Create Invoices', description: 'Draft and submit new invoices for products and services.' },
      { key: 'invoice_edit', label: 'Modify Invoices', description: 'Update data in existing invoice records before they are posted.' },
      { key: 'invoice_void', label: 'Void Invoices', description: 'Cancel active invoices while maintaining an audit trail.' },
      { key: 'invoice_delete', label: 'Delete Invoices', description: 'Permanently remove draft or incorrect invoice records.' },
      { key: 'credit_note_view', label: 'View Credit Notes', description: 'Monitor customer returns, discounts, and credit history.' },
      { key: 'credit_note_create', label: 'Issue Credit Notes', description: 'Generate credit adjustments for customer accounts.' },
      { key: 'customer_view', label: 'Browse Customers', description: 'Access customer directory and contact information.' },
      { key: 'customer_manage', label: 'Manage Customers', description: 'Add, update, or archive customer profiles.' } as any, // fallback for grouping
    ]
  },
  {
    label: 'Purchases & Accounts Payable',
    items: [
      { key: 'bill_view', label: 'View Vendor Bills', description: 'Track incoming bills and liabilities from suppliers.' },
      { key: 'bill_create', label: 'Record Vendor Bills', description: 'Input new billing data from supplier invoices.' },
      { key: 'bill_void', label: 'Void/Cancel Bills', description: 'Invalidate bills that should not be processed for payment.' },
      { key: 'expense_view', label: 'View Direct Expenses', description: 'Monitor cash and bank-based expense transactions.' },
      { key: 'expense_create', label: 'Log New Expenses', description: 'Quickly record out-of-pocket or direct costs.' },
      { key: 'vendor_view', label: 'Browse Vendors', description: 'Access supplier directory and procurement history.' },
      { key: 'vendor_manage', label: 'Manage Vendors', description: 'Maintain vendor profiles and trade terms.' } as any,
    ]
  },
  {
    label: 'Banking & Treasury',
    items: [
      { key: 'payment_view', label: 'View Transactions', description: 'Audit all incoming receipts and outgoing payments.' },
      { key: 'payment_create', label: 'Register Payments', description: 'Apply payments to outstanding invoices or bills.' },
      { key: 'payment_post', label: 'Finalize Payments', description: 'Post payments to the general ledger for reconciliation.' },
      { key: 'bank_reconcile', label: 'Bank Reconciliation', description: 'Match bank statements with internal accounting records.' },
      { key: 'loan_view', label: 'Monitor Financing', description: 'Track loan balances, interest rates, and maturity dates.' },
      { key: 'loan_manage', label: 'Manage Loans', description: 'Administer loan agreements and amortization schedules.' },
    ]
  },
  {
    label: 'Inventory & Stock Control',
    items: [
      { key: 'inventory_view', label: 'Monitor Stock Levels', description: 'Real-time tracking of product availability and locations.' },
      { key: 'inventory_edit', label: 'Update Quantities', description: 'Manually override or update stock counts.' },
      { key: 'inventory_valuation_view', label: 'Asset Valuation', description: 'Access inventory value reports and COGS analysis.' },
      { key: 'inventory_adjustment_create', label: 'Log Adjustments', description: 'Record waste, theft, or count corrections.' },
      { key: 'product_manage', label: 'Manage Catalog', description: 'Add or update items, categories, and brands.' } as any,
    ]
  },
  {
    label: 'Accounting & Ledger Control',
    items: [
      { key: 'ledger_view', label: 'View General Ledger', description: 'Comprehensive access to the chart of accounts and all journals.' },
      { key: 'ledger_post', label: 'Executive Posting', description: 'Authorized power to commit journals to the formal ledger.' },
      { key: 'ledger_reverse', label: 'Corrective Reversals', description: 'Issue GAAP-compliant journal reversals for corrections.' },
      { key: 'journal_create', label: 'Draft Journal Entries', description: 'Create manual adjustments and depreciation entries.' },
      { key: 'opening_balance_edit', label: 'Edit Opening Balances', description: 'Configure initial account balances during setup.' },
      { key: 'chart_of_accounts_manage', label: 'Structure COA', description: 'Add, edit, or disable accounts in the system structure.' },
    ]
  },
  {
    label: 'Executive Reporting',
    items: [
      { key: 'report_financial', label: 'Core Financials', description: 'Generate Profit & Loss, Balance Sheet, and Trial Balance.' },
      { key: 'report_tax', label: 'Tax & Compliance', description: 'Access VAT, GST, and corporate tax liability reports.' },
      { key: 'report_audit', label: 'Activity Audit Logs', description: 'Track user activity and transaction history logs.' },
      { key: 'report_sales', label: 'Revenue Analytics', description: 'Analyze sales by product, customer, or salesperson.' },
      { key: 'report_inventory', label: 'Stock Analytics', description: 'Deep dive into stock turnover and aging reports.' },
    ]
  },
  {
    label: 'Human Resources & Payroll',
    items: [
      { key: 'employee_view', label: 'View Employee Files', description: 'Access staff directory and basic profiles.' },
      { key: 'employee_manage', label: 'Personnel Admin', description: 'Manage sensitive employee contracts and personal data.' },
      { key: 'payroll_process', label: 'Run Payroll', description: 'Calculate and generate monthly payslips and tax dues.' },
      { key: 'attendance_manage', label: 'Oversee Attendance', description: 'Review and approve staff timesheets and biometric logs.' },
      { key: 'leave_manage', label: 'Manage Absence', description: 'Approve or reject leave and vacation requests.' },
    ]
  },
  {
    label: 'External Integrations',
    items: [
      { key: 'integration_quickbooks', label: 'QuickBooks Sync', description: 'Authorize data synchronization with QuickBooks Online.' },
      { key: 'integration_xero', label: 'Xero Integration', description: 'Manage connection and data push to Xero Accounting.' },
      { key: 'integration_api', label: 'API Access', description: 'Generate and manage Developer API keys for headless access.' },
      { key: 'integration_webhooks', label: 'Manage Webhooks', description: 'Configure outbound webhooks for event streaming.' },
    ]
  },
  {
    label: 'System Administration',
    items: [
      { key: 'team_manage', label: 'Security & Access', description: 'Global power to add users and define security profiles.' },
      { key: 'settings_manage', label: 'Global Configuration', description: 'Modify company-wide defaults and system settings.' },
      { key: 'data_import', label: 'Bulk Data Loading', description: 'Authority to upload Excel/CSV legacy data.' },
      { key: 'company_setup', label: 'Modify Entities', description: 'Create or update legal entities and branches.' },
      { key: 'audit_log_view', label: 'Global Audit Access', description: 'Highest level read access to all system logs.' },
    ]
  }
];

const UserManagement: React.FC<{ store: any }> = ({ store }) => {
  const [activeView, setActiveView] = useState<'users' | 'profiles'>('users');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);

  const [columns, setColumns] = useColumns('user_list', [
    { id: 'name', label: 'Name', visible: true },
    { id: 'email', label: 'Email', visible: true },
    { id: 'role', label: 'Role', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'lastLogin', label: 'Last Login', visible: true },
  ]);

  const [selectedRole, setSelectedRole] = useState<RoleDefinition | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    dueDate: getOpDateBST()
  });
  
  const [inviteData, setInviteData] = useState({ id: '', name: '', username: '', email: '', pin: '', roleId: 'role-accountant', companyIds: ['comp-1'] as string[], isCashier: false, rules: { shiftStart: '', shiftEnd: '', requireFaceAuth: false, requireGeoLocation: false } as any });
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const [newCustomPermission, setNewCustomPermission] = useState('');
  const [roleFormData, setRoleFormData] = useState<Partial<RoleDefinition>>({ 
    name: '', 
    description: '', 
    permissions: [], 
    customPermissions: [],
    color: 'bg-indigo-600' 
  });

  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteData?.companyIds.length === 0) {
      setInviteError('Please select at least one company');
      return;
    }
    setIsInviting(true);
    setInviteError(null);
    try {
      if (isEditingUser && inviteData.id) {
        await store.updateUser(inviteData.id, inviteData);
      } else {
        await store.inviteUser(inviteData);
      }
      setShowInviteModal(false);
      setIsEditingUser(false);
      setInviteData({ id: '', name: '', username: '', email: '', pin: '', roleId: 'role-accountant', companyIds: ['comp-1'], isCashier: false, rules: { shiftStart: '', shiftEnd: '', requireFaceAuth: false, requireGeoLocation: false } as any });
    } catch (error: any) {
      setInviteError(error.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    store.addTask({
      ...taskFormData,
      assignedUserId: selectedUser.id
    });
    setShowTaskModal(false);
    setTaskFormData({
      title: '',
      description: '',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDate: getOpDateBST()
    });
  };

  const handleAssignPartner = (partnerId: string) => {
    if (!selectedUser) return;
    store.updateContact(partnerId, { assignedUserId: selectedUser.id });
  };

  const handleUnassignPartner = (partnerId: string) => {
    store.updateContact(partnerId, { assignedUserId: undefined });
  };

  const handleToggleCompany = (companyId: string) => {
    if (!selectedUser) return;
    const currentIds = selectedUser?.companyIds || [];
    const newIds = currentIds.includes(companyId)
      ? currentIds.filter(id => id !== companyId)
      : [...currentIds, companyId];
    
    if (newIds.length === 0) return; // Must have at least one company
    store.updateUser(selectedUser.id, { companyIds: newIds });
    setSelectedUser({ ...selectedUser, companyIds: newIds });
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole) {
      store.updateRole(selectedRole.id, roleFormData);
    } else {
      store.addRole(roleFormData as any);
    }
    setShowRoleModal(false);
    setSelectedRole(null);
  };

  const openEditRole = (role: RoleDefinition) => {
    setSelectedRole(role);
    setRoleFormData({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
      customPermissions: [...(role.customPermissions || [])],
      color: role.color
    });
    setShowRoleModal(true);
  };

  const addCustomPermission = () => {
    if (!newCustomPermission.trim()) return;
    const current = roleFormData.customPermissions || [];
    if (current.includes(newCustomPermission.trim())) return;
    setRoleFormData({
      ...roleFormData,
      customPermissions: [...current, newCustomPermission.trim()]
    });
    setNewCustomPermission('');
  };

  const removeCustomPermission = (perm: string) => {
    setRoleFormData({
      ...roleFormData,
      customPermissions: (roleFormData.customPermissions || []).filter(p => p !== perm)
    });
  };

  const togglePermissionInForm = (permKey: PermissionKey) => {
    const currentPerms = roleFormData.permissions || [];
    const newPerms = currentPerms.includes(permKey)
      ? currentPerms.filter(p => p !== permKey)
      : [...currentPerms, permKey];
    setRoleFormData({ ...roleFormData, permissions: newPerms });
  };

  const togglePermissionGlobal = (roleId: string, permKey: PermissionKey) => {
    const role = (store.roles || []).find((r: any) => r.id === roleId);
    if (!role || role.id === 'role-admin') return;
    
    const newPermissions = role.permissions.includes(permKey)
      ? role.permissions.filter((p: string) => p !== permKey)
      : [...role.permissions, permKey];
      
    store.updateRole(roleId, { permissions: newPermissions });
  };

  const openEditUser = (user: User) => {
    setInviteData({
      id: user.id || '',
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      pin: user.pin || '',
      roleId: user.roleId || '',
      companyIds: [...(user?.companyIds || [])],
      isCashier: user.isCashier || false,
      rules: user.rules || { shiftStart: '', shiftEnd: '', requireFaceAuth: false, requireGeoLocation: false }
    });
    setIsEditingUser(true);
    setShowInviteModal(true);
  };

  const colors = [
    'bg-indigo-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 
    'bg-sky-600', 'bg-purple-600', 'bg-slate-700', 'bg-orange-600'
  ];

  return (
    <div className="space-y-10 max-w-[95%] mx-auto p-4 lg:p-10 pb-24">
      {selectedUser ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => setSelectedUser(null)}
              className="flex items-center text-slate-500 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest transition-all"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Back to Team
            </button>
            <div className="flex space-x-3">
              <button 
                onClick={() => openEditUser(selectedUser)}
                className="px-6 py-2 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg"
              >Edit User Profile</button>
              <button className="px-6 py-2 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-rose-100 transition-all">Deactivate</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* User Profile Card */}
            <div className="lg:col-span-4 space-y-8">
              <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-32 bg-slate-900"></div>
                <div className="relative pt-12">
                  <div className="w-32 h-32 rounded-[2.5rem] bg-white p-2 shadow-2xl mx-auto mb-6">
                    <div className={`w-full h-full rounded-[2rem] flex items-center justify-center text-4xl font-black text-white shadow-inner ${(store.roles || []).find((r: any) => r.id === selectedUser.roleId)?.color || 'bg-slate-900'}`}>
                      {String(selectedUser.name || '').split(' ').map(n => n[0]).join('')}
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{selectedUser.name}</h3>
                  <p className="text-slate-400 font-bold text-sm mb-6">{selectedUser.email}</p>
                  
                  <div className="flex justify-center space-x-2 mb-4">
                    <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-indigo-100">
                      {(store.roles || []).find((r: any) => r.id === selectedUser.roleId)?.name || 'Member'}
                    </span>
                    <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border ${selectedUser.status === UserStatus.ACTIVE ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {selectedUser.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-center space-x-3 mb-8">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cashier Role</span>
                    <button 
                      onClick={() => {
                        const newIsCashier = !selectedUser.isCashier;
                        store.updateUser(selectedUser.id, { isCashier: newIsCashier });
                        setSelectedUser({ ...selectedUser, isCashier: newIsCashier });
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        selectedUser.isCashier ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        selectedUser.isCashier ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-8 border-t border-slate-50">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Assigned Tasks</p>
                      <p className="text-2xl font-black text-slate-900">{(store.tasks || []).filter((t: Task) => t.assignedUserId === selectedUser.id).length}</p>
                    </div>
                    <div className="text-center border-l border-slate-50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Managed Partners</p>
                      <p className="text-2xl font-black text-slate-900">{(store.contacts || []).filter((c: Contact) => c.assignedUserId === selectedUser.id).length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl">
                <h4 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center">
                  <svg className="w-5 h-5 mr-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Access Profile
                </h4>
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map(group => {
                    const role = (store.roles || []).find((r: any) => r.id === selectedUser.roleId);
                    const groupPerms = (group.items || []).filter(item => role?.permissions.includes(item.key));
                    if (groupPerms.length === 0) return null;
                    return (
                      <div key={group.label}>
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">{group.label}</p>
                        <div className="flex flex-wrap gap-2">
                          {groupPerms.map(p => (
                            <span key={p.key} className="px-2 py-1 bg-white/10 rounded text-[9px] font-bold text-white/80">{p.label}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tasks & Partners Column */}
            <div className="lg:col-span-8 space-y-10">
              {/* Tasks Section */}
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Assigned Tasks</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Operational Directives</p>
                  </div>
                  <button 
                    onClick={() => setShowTaskModal(true)}
                    className="px-6 py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                  >Assign New Task</button>
                </div>
                <div className="p-8">
                  <div className="space-y-4">
                    {((store.tasks || []).filter((t: Task) => t.assignedUserId === selectedUser.id)).length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <p className="text-slate-400 font-bold italic text-sm">No active tasks assigned to this user.</p>
                      </div>
                    ) : (
                      (store.tasks || []).filter((t: Task) => t.assignedUserId === selectedUser.id).map((task: Task) => (
                        <div key={task.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all group">
                          <div className="flex items-center space-x-5">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${
                              task.status === TaskStatus.DONE ? 'bg-emerald-100 text-emerald-600' : 
                              task.status === TaskStatus.IN_PROGRESS ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'
                            }`}>
                              {task.status === TaskStatus.DONE ? (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                              ) : (
                                <span className="text-xs font-black">{task.priority[0]}</span>
                              )}
                            </div>
                            <div>
                              <h5 className="font-black text-slate-800 uppercase tracking-tight">{task.title}</h5>
                              <div className="flex items-center space-x-3 mt-1">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                                  task.priority === TaskPriority.CRITICAL ? 'bg-rose-100 text-rose-700' :
                                  task.priority === TaskPriority.HIGH ? 'bg-orange-100 text-orange-700' :
                                  task.priority === TaskPriority.MEDIUM ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                                }`}>{task.priority} Priority</span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Due: {task.dueDate}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <select 
                              value={task.status || ''}
                              onChange={(e) => store.updateTask(task.id, { status: e.target.value as TaskStatus })}
                              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            >
                              <option value={TaskStatus.TODO}>To Do</option>
                              <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                              <option value={TaskStatus.DONE}>Completed</option>
                              <option value={TaskStatus.CANCELLED}>Cancelled</option>
                            </select>
                            <button 
                              onClick={() => store.deleteTask(task.id)}
                              className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Partners Section */}
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Managed Partners</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Assigned Accounts</p>
                  </div>
                  <div className="relative group">
                    <button className="px-6 py-2.5 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg">Assign Partner</button>
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-100 shadow-2xl rounded-2xl p-4 hidden group-hover:block z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Select Partner to Assign</p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {(store.contacts || []).filter((c: Contact) => c.assignedUserId !== selectedUser.id).map((c: Contact) => (
                          <button 
                            key={c.id}
                            onClick={() => handleAssignPartner(c.id)}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-between"
                          >
                            <span>{c.name}</span>
                            <span className="text-[8px] uppercase text-slate-400">{c.type}</span>
                          </button>
                        ))}
                        {(store.contacts || []).filter((c: Contact) => c.assignedUserId !== selectedUser.id).length === 0 && (
                          <p className="text-[10px] text-slate-400 italic py-2">All partners assigned</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(store.contacts || []).filter((c: Contact) => c.assignedUserId === selectedUser.id).length === 0 ? (
                      <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <p className="text-slate-400 font-bold italic text-sm">No partners assigned to this user.</p>
                      </div>
                    ) : (
                      (store.contacts || []).filter((c: Contact) => c.assignedUserId === selectedUser.id).map((contact: Contact) => (
                        <div key={contact.id} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                          <div className="flex items-center space-x-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm ${contact.type === 'CUSTOMER' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                              {contact.name[0]}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{contact.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{contact.type}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleUnassignPartner(contact.id)}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                            title="Unassign Partner"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Companies Section */}
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Internal Companies</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Authorized Entities</p>
                  </div>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(store.companies || []).map((company: any) => {
                      const isAssigned = (selectedUser?.companyIds || []).includes(company.id);
                      return (
                        <button 
                          key={company.id}
                          onClick={() => handleToggleCompany(company.id)}
                          className={`p-5 rounded-3xl border flex items-center justify-between transition-all ${
                            isAssigned 
                              ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                              : 'bg-white border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center space-x-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm ${
                              isAssigned ? 'bg-indigo-600' : 'bg-slate-200'
                            }`}>
                              {company.name[0]}
                            </div>
                            <div className="text-left">
                              <p className={`text-xs font-black uppercase tracking-tight ${isAssigned ? 'text-indigo-900' : 'text-slate-600'}`}>
                                {company.name}
                              </p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                {isAssigned ? 'Access Granted' : 'No Access'}
                              </p>
                            </div>
                          </div>
                          {isAssigned && (
                            <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h3 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Security & Team</h3>
              <p className="text-slate-500 font-medium mt-1">Granular role-based access control and custom security profiles.</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex bg-slate-200/50 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                <button 
                  onClick={() => setActiveView('users')}
                  className={`px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeView === 'users' ? 'bg-white text-indigo-600 shadow-xl scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                >Team Members</button>
                <button 
                  onClick={() => setActiveView('profiles')}
                  className={`px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeView === 'profiles' ? 'bg-white text-indigo-600 shadow-xl scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                >Security Profiles</button>
              </div>
              {activeView === 'users' ? (
                <button 
                  onClick={() => setShowInviteModal(true)}
                  className="px-8 py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                >Invite Member</button>
              ) : (
                <button 
                  onClick={() => { setSelectedRole(null); setRoleFormData({ name: '', description: '', permissions: [], color: 'bg-indigo-600' }); setShowRoleModal(true); }}
                  className="px-8 py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95"
                >New Profile</button>
              )}
            </div>
          </div>

          {activeView === 'users' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {(store.filteredUsers || []).map((user: User) => {
                const role = (store.roles || []).find((r: any) => r.id === user.roleId);
                const userTasks = (store.tasks || []).filter((t: Task) => t.assignedUserId === user.id);
                return (
                  <div key={user.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-8 hover:shadow-2xl transition-all relative overflow-hidden group cursor-pointer" onClick={() => setSelectedUser(user)}>
                    <div className="absolute top-0 right-0 p-4">
                      <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full ${user.status === UserStatus.ACTIVE ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {user.status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 mb-6">
                      <div className={`w-14 h-14 rounded-2xl text-white flex items-center justify-center text-xl font-black shadow-lg ${role?.color || 'bg-slate-900'}`}>
                        {String(user.name || '').split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="font-black text-slate-800 uppercase tracking-tight truncate">{user.name}</h4>
                        <p className="text-xs text-slate-400 font-medium truncate">@{user.username} • {user.email}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Assigned Entities</p>
                      <div className="flex flex-wrap gap-1">
                        {(user?.companyIds || []).map(cid => {
                          const comp = store.companies.find((c: any) => c.id === cid);
                          return (
                            <span key={cid} className={`px-2 py-0.5 rounded text-[8px] font-black text-white uppercase ${comp?.logoColor || 'bg-slate-400'}`}>
                              {comp?.code || cid}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Assigned Profile</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-black text-indigo-600 uppercase tracking-tight">{role?.name || 'Custom'}</span>
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Active</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tasks</p>
                        <p className="text-sm font-black text-slate-800">{userTasks.length}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Partners</p>
                        <p className="text-sm font-black text-slate-800">{(store.contacts || []).filter((c: Contact) => c.assignedUserId === user.id).length}</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                      <span>Last: {user.lastActive}</span>
                      <button className="text-indigo-600 hover:text-indigo-800 transition-colors font-black">View Details →</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] sticky top-0 z-20">
                    <tr>
                      <th className="px-8 py-6 w-80 sticky left-0 bg-slate-900 shadow-xl">Permission Descriptor</th>
                      {(store.roles || []).map((role: RoleDefinition) => (
                        <th key={role.id} className="px-6 py-6 text-center border-l border-slate-800 relative group min-w-[140px]">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-lg ${role.color} mb-2 flex items-center justify-center text-[10px] font-black shadow-lg`}>
                              {role.name[0]}
                            </div>
                            <span className="block truncate max-w-[120px]">{role.name}</span>
                            {!role.isSystem && (
                              <button 
                                onClick={() => openEditRole(role)}
                                className="mt-2 text-[8px] opacity-100 transition-opacity transition-opacity bg-white/10 px-2 py-0.5 rounded hover:bg-white/20"
                              >Edit Details</button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PERMISSION_GROUPS.map((group) => (
                      <React.Fragment key={group.label}>
                        <tr className="bg-slate-50">
                          <td colSpan={(store.roles || []).length + 1} className="px-8 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0">
                            {group.label}
                          </td>
                        </tr>
                        {group.items.map((perm) => (
                          <tr key={perm.key} className="hover:bg-indigo-50/20 transition-colors group">
                            <td className="px-8 py-4 sticky left-0 bg-white z-10 shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                              <h6 className="text-xs font-black text-slate-800 uppercase tracking-tight">{perm.label}</h6>
                              <p className="text-[10px] text-slate-400 font-medium leading-tight">{perm.description}</p>
                            </td>
                            {(store.roles || []).map((role: RoleDefinition) => {
                              const hasPerm = role.permissions.includes(perm.key);
                              const isAdmin = role.id === 'role-admin';
                              return (
                                <td key={role.id} className="px-6 py-4 text-center border-l border-slate-50">
                                  <button
                                    disabled={isAdmin}
                                    onClick={() => togglePermissionGlobal(role.id, perm.key)}
                                    className={`w-6 h-6 rounded-lg mx-auto flex items-center justify-center transition-all ${
                                      hasPerm 
                                        ? 'bg-emerald-100 text-emerald-600' 
                                        : 'bg-slate-100 text-slate-300'
                                    } ${isAdmin ? 'cursor-not-allowed opacity-50' : 'hover:scale-110 active:scale-95'}`}
                                  >
                                    {hasPerm ? (
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                    ) : (
                                      <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Task Assignment Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <form onSubmit={handleAddTask}>
              <div className="p-8 border-b bg-slate-50">
                <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Assign Directive</h4>
                <p className="text-sm text-slate-500 font-medium">Create a new task for {selectedUser?.name}.</p>
              </div>
              <div className="p-8 space-y-5 max-h-[60vh] overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Task Title</label>
                  <input 
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="e.g. Audit Q1 Receivables"
                    value={taskFormData.title || ''}
                    onChange={(e) => setTaskFormData({...taskFormData, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Description</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium h-24 resize-none" 
                    placeholder="Provide context for this task..."
                    value={taskFormData.description || ''}
                    onChange={(e) => setTaskFormData({...taskFormData, description: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Priority</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                      value={taskFormData.priority || ""}
                      onChange={(e) => setTaskFormData({...taskFormData, priority: e.target.value as TaskPriority})}
                    >
                      <option value={TaskPriority.LOW}>Low</option>
                      <option value={TaskPriority.MEDIUM}>Medium</option>
                      <option value={TaskPriority.HIGH}>High</option>
                      <option value={TaskPriority.CRITICAL}>Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Due Date</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                      value={taskFormData.dueDate}
                      onChange={(e) => setTaskFormData({...taskFormData, dueDate: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex justify-end space-x-3">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors">Cancel</button>
                <button 
                  type="submit"
                  className="px-8 py-2.5 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-slate-800 transition-all active:scale-95"
                >Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Management Modal (Create/Edit) */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in duration-300">
            <div className="p-10 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h4 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">
                  {selectedRole ? 'Refine Profile' : 'Forge New Security Profile'}
                </h4>
                <p className="text-sm text-slate-500 font-medium">Define module-level access for {selectedRole?.name || 'the new role'}.</p>
              </div>
              <button onClick={() => setShowRoleModal(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleSaveRole} className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Left Column: Details */}
                <div className="lg:col-span-4 space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Profile Name</label>
                    <input 
                      required
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold transition-all" 
                      placeholder="e.g. Regional Controller"
                      value={roleFormData.name || ''}
                      onChange={(e) => setRoleFormData({...roleFormData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Strategic Purpose</label>
                    <textarea 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-medium h-32 resize-none transition-all" 
                      placeholder="Describe the scope of this security profile..."
                      value={roleFormData.description || ''}
                      onChange={(e) => setRoleFormData({...roleFormData, description: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">Iconic Identification</label>
                    <div className="flex flex-wrap gap-2">
                      {colors.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setRoleFormData({...roleFormData, color})}
                          className={`w-10 h-10 rounded-xl ${color} transition-all ${roleFormData.color === color ? 'ring-4 ring-offset-4 ring-slate-900 scale-110' : 'opacity-40 hover:opacity-100'}`}
                        ></button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Permission Selection */}
                <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
                  <div className="flex items-center justify-between border-b pb-4 mb-6">
                    <h5 className="text-xs font-black uppercase tracking-widest text-slate-800">Capabilities Config</h5>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Search permissions..."
                        className="pl-8 pr-4 py-2 bg-slate-100 border-none rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                        value={roleSearch}
                        onChange={(e) => setRoleSearch(e.target.value)}
                      />
                      <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="3" strokeLinecap="round"/></svg>
                    </div>
                  </div>

                  <div className="space-y-10 overflow-y-auto pr-4 pb-10 flex-1">
                    {PERMISSION_GROUPS.map(group => {
                      const filteredItems = (group.items || []).filter(item => 
                        item.label.toLowerCase().includes(roleSearch.toLowerCase()) || 
                        item.description.toLowerCase().includes(roleSearch.toLowerCase())
                      );

                      if (filteredItems.length === 0) return null;

                      return (
                        <div key={group.label} className="space-y-4">
                          <h6 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center">
                            <span className="mr-2 opacity-50">#</span>
                            {group.label}
                          </h6>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredItems.map(item => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => togglePermissionInForm(item.key)}
                                className={`w-full flex flex-col p-4 rounded-3xl border transition-all text-left relative overflow-hidden group ${
                                  roleFormData.permissions?.includes(item.key)
                                    ? 'bg-indigo-50 border-indigo-200'
                                    : 'bg-white border-slate-100 hover:border-slate-200'
                                }`}
                              >
                                <div className="flex items-center mb-1">
                                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center mr-3 transition-colors ${
                                    roleFormData.permissions?.includes(item.key) ? 'bg-indigo-600 text-white' : 'bg-slate-100'
                                  }`}>
                                    {roleFormData.permissions?.includes(item.key) && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                                  </div>
                                  <span className={`text-[11px] font-black uppercase tracking-tight ${roleFormData.permissions?.includes(item.key) ? 'text-indigo-900' : 'text-slate-700'}`}>
                                    {item.label}
                                  </span>
                                </div>
                                <p className={`text-[9px] font-medium leading-relaxed ml-8 ${roleFormData.permissions?.includes(item.key) ? 'text-indigo-500' : 'text-slate-400'}`}>
                                  {item.description}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Custom Permission Section */}
                    <div className="space-y-4 pt-6 border-t border-dashed border-slate-200">
                      <div className="flex items-center justify-between">
                        <h6 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center">
                          <span className="mr-2 opacity-50">★</span>
                          Custom Permission Descriptors
                        </h6>
                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest italic">Optional annotations</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(roleFormData.customPermissions || []).map((perm, idx) => (
                          <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl group">
                            <span className="text-[10px] font-bold text-slate-700">{perm}</span>
                            <button 
                              type="button"
                              onClick={() => removeCustomPermission(perm)}
                              className="text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </div>
                        ))}
                        <div className="p-4 bg-white border-2 border-dashed border-slate-100 rounded-2xl flex items-center space-x-2 focus-within:border-indigo-200 transition-all">
                          <input 
                            type="text"
                            placeholder="Add custom descriptor (e.g. Can Bypass MFA)"
                            className="bg-transparent border-none focus:ring-0 text-[10px] font-bold flex-1"
                            value={newCustomPermission}
                            onChange={(e) => setNewCustomPermission(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomPermission())}
                          />
                          <button 
                            type="button"
                            onClick={addCustomPermission}
                            className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-10 bg-slate-900 border-t flex justify-end items-center space-x-6">
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest italic mr-auto">
                  {roleFormData.permissions?.length || 0} active module permissions
                </p>
                <button type="button" onClick={() => setShowRoleModal(false)} className="text-white/60 font-black text-xs uppercase tracking-widest hover:text-white transition-colors">Discard</button>
                <button 
                  type="submit"
                  className="px-12 py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
                >
                  {selectedRole ? 'Update Security Profile' : 'Create & Register Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <form onSubmit={handleInvite}>
              <div className="p-8 border-b bg-slate-50">
                <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">
                  {isEditingUser ? 'Update Professional' : 'Onboard Professional'}
                </h4>
                <p className="text-sm text-slate-500 font-medium">
                  {isEditingUser ? 'Modify existing team member details.' : 'Invite a new team member to your ledger.'}
                </p>
              </div>
              <div className="p-8 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col">
                {inviteError && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold">
                    {inviteError}
                  </div>
                )}
                {!store.emailSettings.configured && (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs font-medium">
                    Warning: SMTP is not configured. Invitations will be created in the system but emails will not be sent. Configure SMTP in Settings.
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Full Legal Name</label>
                  <input 
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="e.g. Sarah Jenkins"
                    value={inviteData.name || ''}
                    onChange={(e) => setInviteData({...inviteData, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Username</label>
                  <input 
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="e.g. sarahj"
                    value={inviteData.username || ''}
                    onChange={(e) => setInviteData({...inviteData, username: e.target.value.toLowerCase()})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Enterprise Email</label>
                  <input 
                    required
                    type="email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="sarah@company.com"
                    value={inviteData.email || ''}
                    onChange={(e) => setInviteData({...inviteData, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Security PIN (Min 4 digits)</label>
                  <input 
                    required
                    type="password"
                    pattern="\d{4,}"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="••••"
                    value={inviteData.pin || ''}
                    onChange={(e) => setInviteData({...inviteData, pin: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Assign Security Profile</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    value={inviteData.roleId || ""}
                    onChange={(e) => setInviteData({...inviteData, roleId: e.target.value})}
                  >
                    {(store.roles || []).map((role: RoleDefinition) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Assign Companies</label>
                  <div className="grid grid-cols-1 gap-2">
                    {store.availableCompanies.map((company: any) => (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => {
                          const current = inviteData?.companyIds;
                          if (current.includes(company.id)) {
                            setInviteData({ ...inviteData, companyIds: current.filter(id => id !== company.id) });
                          } else {
                            setInviteData({ ...inviteData, companyIds: [...current, company.id] });
                          }
                        }}
                        className={`flex items-center p-3 rounded-xl border transition-all text-left ${
                          inviteData?.companyIds.includes(company.id)
                            ? 'bg-indigo-50 border-indigo-200'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${
                          inviteData?.companyIds.includes(company.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'
                        }`}>
                          {inviteData?.companyIds.includes(company.id) && <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                        </div>
                        <span className={`text-xs font-bold ${inviteData?.companyIds.includes(company.id) ? 'text-indigo-900' : 'text-slate-600'}`}>
                          {company.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 bg-indigo-50 border border-indigo-100 rounded-2xl">
                  <div>
                    <h5 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-0.5">Cashier Interface</h5>
                    <p className="text-[10px] text-indigo-600 font-bold opacity-70">Enable dedicated POS terminal access.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInviteData({ ...inviteData, isCashier: !inviteData.isCashier })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${inviteData.isCashier ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${inviteData.isCashier ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="p-4 border border-slate-200 rounded-2xl space-y-4">
                  <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-2">Attendance & Shifts Rules (Modern)</h5>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <label className="block text-[9px] font-black text-slate-400 mb-1 uppercase tracking-widest">Shift Start</label>
                      <input 
                        type="time" 
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-bold"
                        value={inviteData.rules?.shiftStart || ''}
                        onChange={(e) => setInviteData({...inviteData, rules: {...inviteData.rules, shiftStart: e.target.value} as any})}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[9px] font-black text-slate-400 mb-1 uppercase tracking-widest">Shift End</label>
                      <input 
                        type="time" 
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs font-bold"
                        value={inviteData.rules?.shiftEnd || ''}
                        onChange={(e) => setInviteData({...inviteData, rules: {...inviteData.rules, shiftEnd: e.target.value} as any})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                     <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={inviteData.rules?.requireFaceAuth || false}
                          onChange={(e) => setInviteData({...inviteData, rules: {...inviteData.rules, requireFaceAuth: e.target.checked} as any})}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-bold text-slate-700">Require Facial Authentication</span>
                     </label>
                     <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={inviteData.rules?.requireGeoLocation || false}
                          onChange={(e) => setInviteData({...inviteData, rules: {...inviteData.rules, requireGeoLocation: e.target.checked} as any})}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-bold text-slate-700">Require Geo-Location Fencing</span>
                     </label>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex justify-end space-x-3">
                <button type="button" onClick={() => {
                  setShowInviteModal(false);
                  setIsEditingUser(false);
                  setInviteData({ id: '', name: '', username: '', email: '', pin: '', roleId: 'role-accountant', companyIds: ['comp-1'], isCashier: false, rules: { shiftStart: '', shiftEnd: '', requireFaceAuth: false, requireGeoLocation: false } as any });
                }} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors">Cancel</button>
                <button 
                  type="submit"
                  disabled={isInviting}
                  className={`px-8 py-2.5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 flex items-center ${isInviting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isInviting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {isEditingUser ? 'Updating...' : 'Sending...'}
                    </>
                  ) : (isEditingUser ? 'Update User' : 'Send Invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;