import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AdminClinicStats } from '../../types';
import { getAdminStats } from '../../lib/api';
import { AdminDoctorList } from '../../components/admin/AdminDoctorList';
import { AdminAppointments } from '../../components/admin/AdminAppointments';
import { AdminPatients } from '../../components/admin/AdminPatients';
import {
  ShieldCheck,
  Stethoscope,
  Users,
  Calendar,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LayoutDashboard,
  UserPlus,
  RefreshCw
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
  initialTab?: 'overview' | 'doctors' | 'appointments' | 'patients';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigate,
  initialTab = 'overview',
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'doctors' | 'appointments' | 'patients'>(initialTab);
  const [stats, setStats] = useState<AdminClinicStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Admin Operations Banner */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-slate-950 text-white rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 border border-purple-400/30 text-purple-300 mb-2.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Nowshera Family Clinic • Administrator Portal
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Clinic Operations & Governance
            </h2>
            <p className="text-xs sm:text-sm text-purple-100/80 mt-1">
              Admin: {user?.full_name || 'Clinic Administrator'} • {user?.email}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              disabled={loadingStats}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold backdrop-blur-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
              Refresh Metrics
            </button>
            <button
              onClick={() => setActiveTab('doctors')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Onboard Doctor
            </button>
          </div>
        </div>
      </div>

      {/* Strict Privacy Notification */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-amber-900 flex items-center gap-2">
              Privacy Invariant Strictly Enforced
            </h3>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Administrators manage doctor onboarding, doctor active/inactive states, and facility appointment bookings. Administrators are <strong>strictly barred from accessing confidential patient visit notes</strong> via PostgreSQL RLS and FastAPI 403 authorization rules.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-purple-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Operations Overview
        </button>

        <button
          onClick={() => setActiveTab('doctors')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'doctors'
              ? 'bg-purple-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          Doctor Management
          {stats && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-purple-800 text-purple-200 font-mono">
              {stats.total_doctors}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('appointments')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'appointments'
              ? 'bg-purple-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Master Appointments
          {stats && stats.pending_appointments > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {stats.pending_appointments}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('patients')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'patients'
              ? 'bg-purple-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Patient Registry
          {stats && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
              {stats.total_patients}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Doctors</span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Stethoscope className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {stats?.total_doctors ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                <span className="text-emerald-600 font-semibold">{stats?.active_doctors ?? 0} Active</span> •{' '}
                {(stats?.total_doctors ?? 0) - (stats?.active_doctors ?? 0)} Inactive
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Registered Patients</span>
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {stats?.total_patients ?? 0}
              </div>
              <div className="text-[11px] text-teal-600 font-medium mt-1">
                Verified clinic accounts
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Today's Visits</span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {stats?.today_appointments ?? 0}
              </div>
              <div className="text-[11px] text-blue-600 font-medium mt-1">
                Scheduled for today
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Pending Requests</span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {stats?.pending_appointments ?? 0}
              </div>
              <div className="text-[11px] text-amber-600 font-medium mt-1">
                Awaiting doctor review
              </div>
            </div>
          </div>

          {/* Appointment Status Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Appointment Lifecycle Ledger Breakdown</span>
              <span className="text-[11px] font-normal text-slate-400">Total facility volumes</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Pending
                </div>
                <div className="mt-2 text-xl font-bold text-amber-900">
                  {stats?.pending_appointments ?? 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Confirmed
                </div>
                <div className="mt-2 text-xl font-bold text-emerald-900">
                  {stats?.confirmed_appointments ?? 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/70">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Completed
                </div>
                <div className="mt-2 text-xl font-bold text-blue-900">
                  {stats?.completed_appointments ?? 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/70">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  Cancelled
                </div>
                <div className="mt-2 text-xl font-bold text-rose-900">
                  {stats?.cancelled_appointments ?? 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/70">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-800">
                  <AlertCircle className="w-3.5 h-3.5 text-purple-600" />
                  No-Show
                </div>
                <div className="mt-2 text-xl font-bold text-purple-900">
                  {stats?.no_show_appointments ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Operations Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('doctors')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Physicians & Staff Roster</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Onboard new doctors, assign specialties, or toggle active status to regulate slot generation.
                </p>
              </div>
              <span className="text-xs font-semibold text-purple-700 pt-3 flex items-center gap-1">
                Manage Doctors &rarr;
              </span>
            </div>

            <div
              onClick={() => setActiveTab('appointments')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                  <Calendar className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Master Booking Ledger</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Inspect facility-wide schedule, filter by doctor or date, and execute emergency cancellations.
                </p>
              </div>
              <span className="text-xs font-semibold text-blue-700 pt-3 flex items-center gap-1">
                View Ledger &rarr;
              </span>
            </div>

            <div
              onClick={() => setActiveTab('patients')}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-3">
                  <Users className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Patient Directory</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Search registered patient profiles and inspect high-level visit history statistics.
                </p>
              </div>
              <span className="text-xs font-semibold text-teal-700 pt-3 flex items-center gap-1">
                Open Directory &rarr;
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Doctors */}
      {activeTab === 'doctors' && <AdminDoctorList />}

      {/* Tab 3: Appointments */}
      {activeTab === 'appointments' && <AdminAppointments />}

      {/* Tab 4: Patients */}
      {activeTab === 'patients' && <AdminPatients />}
    </div>
  );
};
