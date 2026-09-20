import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { Building2, LogOut, User, Shield, Stethoscope, HeartPulse, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenArchitecture: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenArchitecture,
}) => {
  const { user, signOut, isConfigured, switchDemoRole } = useAuth();

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
            <Shield className="w-3 h-3 text-purple-600" />
            Admin
          </span>
        );
      case 'doctor':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
            <Stethoscope className="w-3 h-3 text-teal-600" />
            Doctor
          </span>
        );
      case 'patient':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <HeartPulse className="w-3 h-3 text-blue-600" />
            Patient
          </span>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => {
            if (user) {
              onNavigate(`${user.role}-dashboard`);
            } else {
              onNavigate('login');
            }
          }}
          className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-lg tracking-tight text-slate-900 leading-tight">
                Nowshera Family Clinic
              </h1>
              <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200">
                Phase 3 Operations
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Healthcare Patient & Appointment Management
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Architecture Blueprint Button */}
          <button
            onClick={onOpenArchitecture}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 transition-colors"
            title="View Phase 1 & System Architecture Plan"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span className="hidden sm:inline">Architecture Plan</span>
          </button>

          {/* User authenticated vs unauthenticated */}
          {user ? (
            <div className="flex items-center gap-2 sm:gap-3 border-l border-slate-200 pl-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-900 leading-tight flex items-center gap-1.5 justify-end">
                  <span>{user.full_name}</span>
                  {getRoleBadge(user.role)}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {user.email}
                </div>
              </div>

              {/* Quick Role Switcher (When Supabase is not configured, provides easy role testing) */}
              {!isConfigured && (
                <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 px-1">Role:</span>
                  {(['patient', 'doctor', 'admin'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        switchDemoRole(r);
                        onNavigate(`${r}-dashboard`);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-all ${
                        user.role === r
                          ? 'bg-white text-teal-700 shadow-2xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={async () => {
                  await signOut();
                  onNavigate('login');
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('login')}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  currentView === 'login'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => onNavigate('register')}
                className={`text-xs font-medium px-3.5 py-1.5 rounded-lg shadow-xs transition-colors ${
                  currentView === 'register'
                    ? 'bg-teal-700 text-white'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                Register Patient
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
