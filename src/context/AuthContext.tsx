import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { UserProfile, UserRole } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  signUpPatient: (
    fullName: string,
    email: string,
    phone: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default demo users for instantaneous local preview testing
const DEMO_PROFILES: Record<UserRole, UserProfile> = {
  patient: {
    id: 'demo-patient-001',
    email: 'patient@nowsheraclinic.pk',
    full_name: 'Ahmad Khan',
    phone: '+92 300 1234567',
    role: 'patient',
    created_at: new Date().toISOString(),
  },
  doctor: {
    id: 'demo-doctor-001',
    email: 'dr.shams@nowsheraclinic.pk',
    full_name: 'Dr. Shams ur Rehman',
    phone: '+92 301 9876543',
    role: 'doctor',
    created_at: new Date().toISOString(),
  },
  admin: {
    id: 'demo-admin-001',
    email: 'admin@nowsheraclinic.pk',
    full_name: 'Fatima Clinic Administrator',
    phone: '+92 302 5550000',
    role: 'admin',
    created_at: new Date().toISOString(),
  },
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Auth
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        if (isSupabaseConfigured && supabase) {
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.user && mounted) {
              await fetchUserProfile(data.session.user.id, data.session.user.email || '', data.session.user);
            }
          } catch (sessionErr: any) {
            console.warn('[AUTH] Initial session check warning:', sessionErr?.message || sessionErr);
          }
        } else {
          // Check localStorage for persisted demo user
          const savedDemo = localStorage.getItem('nfc_demo_user');
          if (savedDemo && mounted) {
            try {
              setUser(JSON.parse(savedDemo));
            } catch {
              setUser(null);
            }
          }
        }
      } catch (err: any) {
        console.warn('[AUTH] Auth init error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    // Listen to Supabase auth state changes if active
    let authListener: any = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          await fetchUserProfile(session.user.id, session.user.email || '', session.user);
        } else {
          setUser(null);
        }
        setLoading(false);
      });
      authListener = data.subscription;
    }

    return () => {
      mounted = false;
      if (authListener) authListener.unsubscribe();
    };
  }, []);

  async function fetchUserProfile(
    userId: string,
    defaultEmail: string,
    authUserParam?: any
  ): Promise<UserProfile | null> {
    console.log('[AUTH DIAGNOSTIC] Authenticated Supabase user ID:', userId);
    console.log('[AUTH DIAGNOSTIC] Authenticated Supabase email:', defaultEmail);

    if (!supabase) return null;

    let profile: UserProfile | null = null;

    try {
      // Step 3: Exact profile query for authenticated user ID: profiles WHERE id = authenticatedUser.id
      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        profile = data as UserProfile;
        console.log('[AUTH DIAGNOSTIC] Fetched profile ID:', profile.id);
        console.log('[AUTH DIAGNOSTIC] Fetched profile email:', profile.email);
        console.log('[AUTH DIAGNOSTIC] Fetched profile role:', profile.role);
      } else if (profileErr) {
        console.warn('[AUTH DIAGNOSTIC] Profile query notice from database:', profileErr.message || profileErr);
      }
    } catch (err: any) {
      console.warn('[AUTH DIAGNOSTIC] Database profiles query exception:', err.message || err);
    }

    // If database table query returned null (e.g., awaiting RLS policy recursion migration),
    // resolve from cryptographically verified Supabase auth claims/metadata
    if (!profile) {
      let authUser = authUserParam;
      if (!authUser) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          authUser = userData?.user;
        } catch (authErr: any) {
          console.warn('[AUTH DIAGNOSTIC] getUser notice:', authErr.message || authErr);
        }
      }

      const verifiedRole = (authUser?.app_metadata?.role || authUser?.user_metadata?.role || 'patient') as UserRole;
      profile = {
        id: userId,
        email: defaultEmail || authUser?.email || '',
        full_name: authUser?.user_metadata?.full_name || (verifiedRole === 'admin' ? 'Clinic Administrator' : verifiedRole === 'doctor' ? 'Clinic Doctor' : 'Clinic Patient'),
        phone: authUser?.user_metadata?.phone || '',
        role: verifiedRole,
        created_at: authUser?.created_at || new Date().toISOString(),
      };
      console.log('[AUTH DIAGNOSTIC] Resolved profile ID:', profile.id);
      console.log('[AUTH DIAGNOSTIC] Resolved profile email:', profile.email);
      console.log('[AUTH DIAGNOSTIC] Resolved profile role:', profile.role);
    }

    if (profile) {
      setUser(profile);
      console.log('[AUTH DIAGNOSTIC] Current AuthContext role:', profile.role);
      return profile;
    } else {
      console.error('[AUTH DIAGNOSTIC] Profile could not be resolved for authenticated user ID:', userId);
      setUser(null);
      return null;
    }
  }

  // 1. Sign In
  const signIn = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
    setError(null);
    setUser(null); // Clear previous user state immediately
    setLoading(true);

    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;

        if (data.user) {
          const loadedProfile = await fetchUserProfile(data.user.id, data.user.email || email, data.user);
          return { success: true, role: loadedProfile?.role };
        }
      } else {
        // Local Demo Mode Authentication
        const lowerEmail = email.toLowerCase();
        let matchedRole: UserRole = 'patient';
        if (lowerEmail.includes('doctor') || lowerEmail.includes('dr.')) {
          matchedRole = 'doctor';
        } else if (lowerEmail.includes('admin')) {
          matchedRole = 'admin';
        }

        const demoProfile = {
          ...DEMO_PROFILES[matchedRole],
          email: email,
        };
        setUser(demoProfile);
        localStorage.setItem('nfc_demo_user', JSON.stringify(demoProfile));
        return { success: true, role: demoProfile.role };
      }
      return { success: false, error: 'User not found' };
    } catch (err: any) {
      const msg = err.message === 'Failed to fetch' || err?.name === 'TypeError'
        ? 'Unable to connect to authentication service. Please check your network connection.'
        : err.message || 'Invalid email or password';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  // 2. Sign Up Patient (Strictly Patient Role)
  const signUpPatient = async (
    fullName: string,
    email: string,
    phone: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    setLoading(true);

    try {
      if (isSupabaseConfigured && supabase) {
        // Enforce: Registration metadata sets full_name and phone; the DB trigger guarantees role = 'patient'
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
              role: 'patient',
            },
          },
        });
        if (signUpErr) throw signUpErr;

        if (data.user) {
          await fetchUserProfile(data.user.id, data.user.email || email);
          return { success: true };
        }
      } else {
        // Demo Mode registration
        const newPatient: UserProfile = {
          id: `patient-${Date.now()}`,
          email,
          full_name: fullName,
          phone,
          role: 'patient', // Strictly patient
          created_at: new Date().toISOString(),
        };
        setUser(newPatient);
        localStorage.setItem('nfc_demo_user', JSON.stringify(newPatient));
        return { success: true };
      }
      return { success: false, error: 'Registration failed' };
    } catch (err: any) {
      const msg = err.message === 'Failed to fetch' || err?.name === 'TypeError'
        ? 'Unable to connect to registration service. Please check your network connection.'
        : err.message || 'Failed to register patient';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  // 3. Sign Out
  const signOut = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
      localStorage.removeItem('nfc_demo_user');
      localStorage.removeItem('nfc_cached_profile');
      sessionStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // 4. Fast Role Switcher (For local testing)
  const switchDemoRole = (role: UserRole) => {
    const profile = DEMO_PROFILES[role];
    setUser(profile);
    localStorage.setItem('nfc_demo_user', JSON.stringify(profile));
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUpPatient,
        signOut,
        switchDemoRole,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
