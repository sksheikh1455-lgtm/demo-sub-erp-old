import { StateCreator } from 'zustand';
import { Company, User, PermissionKey, RoleDefinition } from '../types';
import { AccountingStoreState } from './types';

export interface CompanySliceState {
  companies: Company[];
  activeCompanyIds: string[];
  isCompaniesLoading: boolean;

  setCompanies: (companies: Company[]) => void;
  setActiveCompanyIds: (ids: string[]) => void;
  switchCompany: (companyId: string) => void;
  toggleCompany: (companyId: string, currentUser: User | null) => void;
  selectAllCompanies: (currentUser: User | null) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  getTenantIsolationState: () => { activeCompanyIds: string[]; tenant_id: string };
}

export const createCompanySlice: StateCreator<
  AccountingStoreState & CompanySliceState,
  [],
  [],
  CompanySliceState
> = (set, get) => ({
  companies: [],
  activeCompanyIds: [],
  isCompaniesLoading: false,

  setCompanies: (companies: Company[]) => set({ companies }),
  
  setActiveCompanyIds: (ids: string[]) => {
    // Audit active company selection to prevent zero active companies if we have any
    const finalIds = ids.length === 0 && get().companies.length > 0
      ? [get().companies[0].id]
      : ids;
    set({ activeCompanyIds: finalIds });
  },

  switchCompany: (companyId: string) => {
    set({ activeCompanyIds: [companyId] });
  },

  toggleCompany: (companyId: string, currentUser: User | null) => {
    // Guard: Prevent selection of unassociated companies for non-admins
    if (currentUser && currentUser.roleId !== 'role-admin' && !(currentUser?.companyIds || []).includes(companyId)) {
      console.warn(`[SECURITY ACCORD] Access denied to company ${companyId}`);
      return;
    }

    const currentIds = get().activeCompanyIds;
    let nextIds: string[];
    if (currentIds.includes(companyId)) {
      // Ensure we don't deactivate the last remaining company
      nextIds = currentIds.length > 1 ? currentIds.filter(id => id !== companyId) : currentIds;
    } else {
      nextIds = [...currentIds, companyId];
    }
    set({ activeCompanyIds: nextIds });
  },

  selectAllCompanies: (currentUser: User | null) => {
    const { companies } = get();
    if (!currentUser) return;
    const allIds = companies
      .filter(c => currentUser.roleId === 'role-admin' || (currentUser?.companyIds || []).includes(c.id))
      .map(c => c.id);
    set({ activeCompanyIds: allIds });
  },

  updateCompany: (id: string, updates: Partial<Company>) => {
    set((state) => ({
      companies: state.companies.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  },

  getTenantIsolationState: () => {
    const { activeCompanyIds } = get();
    return {
      activeCompanyIds,
      tenant_id: activeCompanyIds[0] || 'global',
    };
  },
});
