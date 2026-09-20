import React, { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  onNavigate: (view: string) => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  onNavigate,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 font-medium">Validating clinic credentials...</span>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Authentication Required</h2>
          <p className="text-xs text-slate-600 mt-1 mb-4">
            Please sign in to access this clinic portal.
          </p>
          <button
            onClick={() => onNavigate('login')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  // Check role authorization
  if (user && allowedRoles) {
    console.log('[AUTH DIAGNOSTIC] ProtectedRoute required role:', allowedRoles.join(', '));
    console.log('[AUTH DIAGNOSTIC] ProtectedRoute current role:', user.role);
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-rose-200 shadow-xs text-center">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">403 - Access Forbidden</h2>
          <p className="text-xs text-slate-600 mt-1 mb-2">
            Your current role (<span className="font-semibold capitalize text-slate-800">{user.role}</span>) does not have permission to access this area.
          </p>
          <p className="text-[11px] text-slate-500 mb-5">
            Required authorized role(s): {allowedRoles.join(', ')}
          </p>
          <button
            onClick={() => onNavigate(`${user.role}-dashboard`)}
            className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
