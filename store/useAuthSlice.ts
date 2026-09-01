import { StateCreator } from 'zustand';
import { supabase } from '../lib/supabase';
import { User, UserStatus, RoleDefinition, PermissionKey } from '../types';
import { AccountingStoreState } from './types';

export interface AuthSliceState {
  currentUser: User | null;
  userRole: RoleDefinition | null;
  permissions: PermissionKey[];
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  loginRole: string; // fallback or UI role selection
  setLoginRole: (role: string) => void;

  login: (username: string, pin: string) => Promise<User>;
  logout: () => Promise<void>;
  signUp: (email: string, pin: string, name: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  confirmPasswordReset: (newPassword: string) => Promise<boolean>;
  hasPermission: (permission: PermissionKey, roles: RoleDefinition[]) => boolean;
}

export const createAuthSlice: StateCreator<
  AccountingStoreState & AuthSliceState,
  [],
  [],
  AuthSliceState
> = (set, get) => ({
  currentUser: null,
  userRole: null,
  permissions: [],
  isAuthenticated: false,
  isAuthenticating: false,
  authError: null,
  loginRole: 'role-admin', // fallback

  setLoginRole: (role: string) => set({ loginRole: role }),

  login: async (username: string, pin: string) => {
    set({ isAuthenticating: true, authError: null });
    try {
      let email = username;
      if (!username.includes('@')) {
        const { data, error } = await supabase.rpc('get_user_email', { p_username: username });
        if (error || !data) {
          throw new Error('Invalid credentials');
        }
        email = data;
      }

      let password = pin;
      if (password.length < 6) {
        password = password.padEnd(6, '0');
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Invalid credentials');
      }

      let { data: profileData, error: profileError } = await supabase
        .from('docs_users')
        .select('*')
        .eq('user_uuid', authData.user.id)
        .maybeSingle();

      // ALWAYS Ensure default company exists in docs_companies to avoid RLS isolation failures!
      await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF', currency: 'USD' }, { onConflict: 'id', ignoreDuplicates: true }).then(({error}) => { if(error) console.error(error); });

      // Ensure data JSON column is populated for backward compatibility
      if (!profileError && profileData && (!profileData.data || !profileData.data.companyIds)) {
         await supabase.from('docs_users').update({
           data: {
             ...(profileData.data || {}),
             companyId: profileData.company_id || 'comp-1',
             companyIds: profileData.company_ids || ['comp-1'],
             roleId: profileData.role_id || 'role-accountant'
           }
         }).eq('id', profileData.id);
         profileData.data = {
           ...(profileData.data || {}),
           companyId: profileData.company_id || 'comp-1',
           companyIds: profileData.company_ids || ['comp-1'],
           roleId: profileData.role_id || 'role-accountant'
         };
      }

      if (profileError || !profileData) {
        // Look up by email to merge/associate
        const { data: emailData, error: emailError } = await supabase
          .from('docs_users')
          .select('*')
          .eq('email', authData.user.email)
          .maybeSingle();

        if (emailData && !emailError) {
          // Update the existing profile's user_uuid with the authenticated user ID
          const { data: updatedData, error: updateError } = await supabase
            .from('docs_users')
            .update({ user_uuid: authData.user.id })
            .eq('id', emailData.id)
            .select()
            .single();

          if (!updateError && updatedData) {
            profileData = updatedData;
            
            // Ensure data JSON column is populated for backward compatibility
            if (!profileData.data || !profileData.data.companyIds) {
               await supabase.from('docs_users').update({
                 data: {
                   ...(profileData.data || {}),
                   companyId: profileData.company_id || 'comp-1',
                   companyIds: profileData.company_ids || ['comp-1'],
                   roleId: profileData.role_id || 'role-accountant'
                 }
               }).eq('id', profileData.id);
            }
          }
        } else {
          // If neither exists, auto-create a profile!
          const newUserId = 'user-' + Date.now();
          const isLAdmin = authData.user.email === 'raihansheikh145@gmail.com';
          // Ensure default company exists in docs_companies to pass tenant_isolation_policy!
          await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF', currency: 'USD' }, { onConflict: 'id', ignoreDuplicates: true }).then(({error}) => { if(error) console.error(error); });

          const { data: createdData, error: createError } = await supabase
            .from('docs_users')
            .insert({
              id: newUserId,
              user_uuid: authData.user.id,
              email: authData.user.email,
              name: authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || 'User',
              username: authData.user.email?.split('@')[0] || 'user',
              role_id: isLAdmin ? 'role-admin' : 'role-accountant',
              status: 'ACTIVE',
              company_id: 'comp-1',
              company_ids: isLAdmin ? ['comp-1', 'comp-2', 'comp-3', 'comp-4', 'comp-5', 'comp-6', 'comp-7'] : ['comp-1'],
              email_confirmed: true,
              pin: '1234',
              data: {
                companyId: 'comp-1',
                companyIds: isLAdmin ? ['comp-1', 'comp-2', 'comp-3', 'comp-4', 'comp-5', 'comp-6', 'comp-7'] : ['comp-1'],
                roleId: isLAdmin ? 'role-admin' : 'role-accountant'
              }
            })
            .select()
            .single();

          if (!createError && createdData) {
            profileData = createdData;
            
            // Also insert to docs_user_company_access to bypass RLS bug
            try {
               const accessPayload = (profileData.company_ids || ['comp-1']).map(cid => ({
                 user_uuid: authData.user.id,
                 company_id: cid,
                 role_id: profileData.role_id || 'role-accountant'
               }));
               supabase.from('docs_user_company_access').upsert(accessPayload).then(() => {});
            } catch(e) {}
          }
        }
      }

      if (!profileData) {
        throw new Error('User profile not found.');
      }

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

      if (userProfile.status !== UserStatus.ACTIVE && userProfile.status !== undefined) {
        throw new Error('User account is disabled');
      }

      set({
        currentUser: userProfile,
        isAuthenticated: true,
        isAuthenticating: false,
        activeCompanyIds: userProfile?.companyIds || [],
      });

      return userProfile;
    } catch (err: any) {
      set({ authError: err.message || 'Login failed', isAuthenticating: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('SignOut error ignored during local cleanup:', e);
    }
    set({
      currentUser: null,
      isAuthenticated: false,
      permissions: [],
      activeCompanyIds: [],
    });
  },

  signUp: async (email: string, pin: string, name: string) => {
    let password = pin;
    if (password.length < 6) {
      password = password.padEnd(6, '0');
    }
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://sub-erp-gxnlk.ondigitalocean.app';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: redirectUrl,
      },
    });
    if (error) throw error;
    return true;
  },

  resetPassword: async (email: string) => {
    const redirectUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://sub-erp-gxnlk.ondigitalocean.app') + '?type=recovery';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) throw error;
    return true;
  },

  confirmPasswordReset: async (newPassword: string) => {
    let password = newPassword;
    if (password.length < 6) {
      password = password.padEnd(6, '0');
    }
    const { error } = await supabase.auth.updateUser({
      password,
    });
    if (error) throw error;

    // Additionally sync with the user's profile pin in docs_users
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase
        .from('docs_users')
        .update({ pin: password })
        .eq('user_uuid', userData.user.id);
    }
    return true;
  },

  hasPermission: (permission: PermissionKey, roles: RoleDefinition[]) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    if (currentUser.roleId === 'role-admin') return true; // Administrator bypass
    if (!roles || !Array.isArray(roles)) return false;
    const roleDef = roles.find(r => r.id === currentUser.roleId);
    if (!roleDef) return false;
    return (roleDef.permissions || []).includes(permission);
  },
});
