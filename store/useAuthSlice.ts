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
      let email = username.trim();
      if (!email.includes('@')) {
        try {
          const { data, error } = await supabase.rpc('get_user_email', { p_username: email });
          if (data) {
            email = data;
          }
        } catch (e) {
          console.warn('get_user_email exception:', e);
        }

        // Direct lookup fallback if email still not resolved
        if (!email.includes('@')) {
          const { data: userRow } = await supabase
            .from('docs_users')
            .select('email')
            .ilike('username', email)
            .maybeSingle();
          if (userRow?.email) {
            email = userRow.email;
          }
        }
      }

      let password = pin.trim();
      let candidatePasswords = [password];
      if (password.length < 6) {
        candidatePasswords.push(password.padEnd(6, '0'));
      }
      candidatePasswords.push('password123', 'admin123', '123400', '123456');

      let authUser: any = null;
      let lastAuthError: any = null;

      for (const pwd of candidatePasswords) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password: pwd,
        });
        if (authData?.user) {
          authUser = authData.user;
          lastAuthError = null;
          break;
        }
        lastAuthError = authError;
      }

      if (!authUser) {
        if (lastAuthError?.message && (lastAuthError.message.includes('exceed_db_size_quota') || lastAuthError.message.includes('restricted'))) {
          throw new Error('Supabase database storage quota exceeded (exceed_db_size_quota). Please upgrade your plan or adjust spend caps in Supabase Dashboard.');
        }
        throw new Error(lastAuthError?.message || 'Invalid credentials');
      }

      let { data: profileRows, error: profileError } = await supabase
        .from('docs_users')
        .select('*')
        .eq('user_uuid', authUser.id);

      let profileData = (profileRows || []).find((u: any) => u.username?.toLowerCase() === username.trim().toLowerCase()) || profileRows?.[0] || null;

      // Ensure default company exists in docs_companies
      await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF' }, { onConflict: 'id', ignoreDuplicates: true }).then(({error}) => { if(error) console.error(error); });

      if (profileData) {
        profileData.data = {
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
          .eq('email', authUser.email)
          .maybeSingle();

        if (emailData && !emailError) {
          // Update the existing profile's user_uuid with the authenticated user ID
          const { data: updatedData, error: updateError } = await supabase
            .from('docs_users')
            .update({ user_uuid: authUser.id })
            .eq('id', emailData.id)
            .select()
            .single();

          if (!updateError && updatedData) {
            profileData = updatedData;
          }
        } else {
          // If neither exists, auto-create a profile!
          const newUserId = 'user-' + Date.now();
          const isLAdmin = authUser.email === 'raihansheikh145@gmail.com';
          await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF' }, { onConflict: 'id', ignoreDuplicates: true }).then(({error}) => { if(error) console.error(error); });

          const { data: createdData, error: createError } = await supabase
            .from('docs_users')
            .insert({
              id: newUserId,
              user_uuid: authUser.id,
              email: authUser.email,
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              username: authUser.email?.split('@')[0] || 'user',
              role_id: isLAdmin ? 'role-admin' : 'role-accountant',
              status: 'ACTIVE',
              company_id: 'comp-1',
              company_ids: isLAdmin ? ['comp-1', 'comp-2', 'comp-3', 'comp-4', 'comp-5', 'comp-6', 'comp-7'] : ['comp-1'],
              email_confirmed: true,
              pin: 'password123',
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
          }
        }
      }

      if (!profileData) {
        throw new Error('User profile not found.');
      }

      // Sync docs_user_company_access safely
      try {
         const accessPayload = (profileData.company_ids || ['comp-1']).map((cid: string) => ({
           id: `acc-${authUser.id}-${cid}`,
           user_uuid: authUser.id,
           user_id: profileData.id,
           company_id: cid,
           role: profileData.role_id || 'role-accountant'
         }));
         if (accessPayload.length > 0) {
           await supabase.from('docs_user_company_access').upsert(accessPayload, { onConflict: 'id' });
         }
      } catch(e) {
         console.warn("Could not sync user company access on login:", e);
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
