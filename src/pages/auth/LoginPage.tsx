import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import {
  Building2,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  HeartPulse,
  Stethoscope,
  CheckCircle2,
  Info
} from 'lucide-react';

interface LoginPageProps {
  onNavigate: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { signIn, error, clearError, isConfigured } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('patient');
  const [email, setEmail] = useState('patient@nowsheraclinic.pk');
  const [password, setPassword] = useState('password123');
  const [submitting, setSubmitting] = useState(false);
  const [doctorNotice, setDoctorNotice] = useState<string | null>(null);

  const handleRoleTabChange = (role: UserRole) => {
    setSelectedRole(role);
    clearError();
    setDoctorNotice(null);
    if (role === 'patient') {
      setEmail('patient@nowsheraclinic.pk');
      setPassword('password123');
    } else if (role === 'doctor') {
      setEmail('dr.shams@nowsheraclinic.pk');
      setPassword('password123');
    } else if (role === 'admin') {
      setEmail('admin@nowsheraclinic.pk');
      setPassword('password123');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setSubmitting(true);
    setDoctorNotice(null);

    const result = await signIn(email.trim(), password);
    setSubmitting(false);

    if (result.success) {
      // Step 5: The selected login tab must NOT determine authorization or destination.
      // Authorization strictly originates from the authenticated user's verified profile role.
      const destinationRole = result.role || 'patient';
      onNavigate(`${destinationRole}-dashboard`);
    } else {
      if (selectedRole === 'doctor' && result.error?.includes('not found')) {
        setDoctorNotice('Doctor account not found. Please contact the clinic administrator.');
      }
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-md w-full space-y-4">
        {/* Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Clinic Portal Sign In</h2>
              <p className="text-xs text-slate-500">
                Nowshera Family Clinic Medical Portal
              </p>
            </div>
          </div>

          {/* Role Selection Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mb-5 text-xs">
            <button
              type="button"
              onClick={() => handleRoleTabChange('patient')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold transition-all ${
                selectedRole === 'patient'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5 text-blue-600" />
              <span>Patient</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabChange('doctor')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold transition-all ${
                selectedRole === 'doctor'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              <span>Doctor</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabChange('admin')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold transition-all ${
                selectedRole === 'admin'
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>Admin</span>
            </button>
          </div>

          {/* Doctor Onboarding Note */}
          {selectedRole === 'doctor' && (
            <div className="mb-4 p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-900 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <span>
                Physicians must be onboarded by the Clinic Administrator before logging in.
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{doctorNotice || error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    clearError();
                    setDoctorNotice(null);
                    setEmail(e.target.value);
                  }}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-slate-50/50 hover:bg-white focus:bg-white"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    clearError();
                    setPassword(e.target.value);
                  }}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-slate-50/50 hover:bg-white focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white shadow-xs transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50 ${
                selectedRole === 'admin'
                  ? 'bg-purple-700 hover:bg-purple-800'
                  : selectedRole === 'doctor'
                  ? 'bg-teal-700 hover:bg-teal-800'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {submitting ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Patient Register Link */}
          {selectedRole === 'patient' && (
            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-600">
                New patient at Nowshera Clinic?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                >
                  Create a patient account
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Doctor quick logins helper for test evaluators */}
        {selectedRole === 'doctor' && (
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Test Practicing Doctors
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('dr.shams@nowsheraclinic.pk');
                  setPassword('password123');
                }}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left"
              >
                <div className="font-bold text-slate-800">Dr. Shams</div>
                <div className="text-[10px] text-slate-500">Family Medicine</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('dr.ayesha@nowsheraclinic.pk');
                  setPassword('password123');
                }}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left"
              >
                <div className="font-bold text-slate-800">Dr. Ayesha</div>
                <div className="text-[10px] text-slate-500">Pediatrics</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
