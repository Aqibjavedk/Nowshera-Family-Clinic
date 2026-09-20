import React, { useState } from 'react';
import {
  X,
  FolderTree,
  LayoutTemplate,
  Server,
  Database,
  GitFork,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lock,
  Clock,
  CalendarDays,
  UserCheck
} from 'lucide-react';

export const ArchitectureModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<'overview' | 'phase1' | 'phase2' | 'phase3' | 'schema' | 'auth'>('overview');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-slate-900">
              Nowshera Family Clinic — Architecture & Implementation Status
            </h3>
            <p className="text-xs text-slate-500">
              Complete Full-Stack Architecture • React + TypeScript + FastAPI + Supabase PostgreSQL
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-200 px-4 pt-2 gap-2 bg-slate-50 text-xs overflow-x-auto">
          <button
            onClick={() => setTab('overview')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'overview'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            System Overview
          </button>
          <button
            onClick={() => setTab('phase1')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'phase1'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Phase 1: Foundation & Auth
          </button>
          <button
            onClick={() => setTab('phase2')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'phase2'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Phase 2: Slot & Appointment Engine
          </button>
          <button
            onClick={() => setTab('phase3')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'phase3'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Phase 3: Doctor & Admin Operations
          </button>
          <button
            onClick={() => setTab('schema')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'schema'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Database Schema & Invariants
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900">
                <h4 className="font-bold text-sm mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  All 3 Phases Implemented & Operational
                </h4>
                <p className="leading-relaxed">
                  The Nowshera Family Clinic system provides a full clinical appointment lifecycle, automated 30-minute slot generation, double-booking prevention, 2-hour cancellation rule enforcement, doctor schedule self-management, and comprehensive administrative oversight with strict clinical note privacy invariants.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <span className="font-bold text-slate-900 text-xs block mb-1">Patient Portal</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    View active doctors by specialty, select 30-min slots, book appointments, reschedule or cancel up to 2 hours prior, and review shared visit notes.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <span className="font-bold text-slate-900 text-xs block mb-1">Doctor Portal</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Manage 7-day recurring working hours, schedule off-duty leaves (with auto-cancellation trigger), confirm/reject requests, and complete appointments with clinical notes.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <span className="font-bold text-slate-900 text-xs block mb-1">Admin Portal</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Onboard doctors, toggle practicing status (immediate slot cutoff), view master appointment ledger, manage patient registry, and respect clinical notes privacy.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'phase1' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <h5 className="font-bold text-slate-800 text-xs mb-1">Database & Authentication Architecture</h5>
                <ul className="list-disc list-inside text-slate-600 space-y-1 text-[11px]">
                  <li>PostgreSQL schema with 7 core tables: profiles, specialties, doctors, doctor_working_hours, doctor_leaves, appointments, visit_notes.</li>
                  <li>Role-based access control (RBAC) with three roles: <code>patient</code>, <code>doctor</code>, <code>admin</code>.</li>
                  <li>FastAPI security dependencies validating user JWT against database profile record.</li>
                  <li>Public registration strictly restricted to patient role; doctors and admins onboarded internally.</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'phase2' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <h5 className="font-bold text-slate-800 text-xs mb-1">Slot & Appointment Engine Invariants</h5>
                <ul className="list-disc list-inside text-slate-600 space-y-1 text-[11px]">
                  <li><strong>Slot Duration</strong>: Fixed 30-minute intervals calculated in Asia/Karachi (PKT) timezone.</li>
                  <li><strong>Active Doctor Check</strong>: Inactive doctors or doctors on approved leave generate zero slots.</li>
                  <li><strong>Double-Booking Prevention</strong>: Conflict verification prevents two patients from booking the same doctor slot.</li>
                  <li><strong>Patient Conflict Check</strong>: A patient cannot hold overlapping appointments across different doctors.</li>
                  <li><strong>Cancellation/Reschedule Rule</strong>: Modifications strictly restricted to at least 2 hours prior to slot start time.</li>
                  <li><strong>Lifecycle State Machine</strong>: pending → confirmed → completed / no_show (or cancelled).</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'phase3' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <h5 className="font-bold text-slate-800 text-xs mb-1">Doctor & Admin Management Features</h5>
                <ul className="list-disc list-inside text-slate-600 space-y-1 text-[11px]">
                  <li><strong>Doctor Onboarding Modal</strong>: Create profile, assign specialty, set qualifications and bio.</li>
                  <li><strong>Doctor Active Status Toggle</strong>: Deactivating a doctor immediately removes them from future slot generation.</li>
                  <li><strong>Doctor Working Hours</strong>: Self-service configuration of daily start/end times in 30-min steps.</li>
                  <li><strong>Leave Scheduling & Invariant</strong>: Adding a leave date automatically cancels any pending or confirmed bookings on that date.</li>
                  <li><strong>Administrative Master Schedule</strong>: Search and filter facility appointments with emergency cancellation override.</li>
                  <li><strong>Confidential Visit Notes Guard</strong>: Database RLS and API authorization return 403 Forbidden to Admins trying to access medical visit notes.</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'schema' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-teal-800">1. profiles</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">id (FK auth.users), email, full_name, phone, role (patient, doctor, admin)</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-teal-800">2. specialties</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">id, name, description, created_at</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-teal-800">3. doctors</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">id (FK profiles), specialty_id, qualification, bio, is_active</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-teal-800">4. doctor_working_hours</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">id, doctor_id, day_of_week (0-6), start_time, end_time, is_available</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-teal-800">5. doctor_leaves</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">id, doctor_id, leave_date, reason, created_at</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-teal-800">6. appointments</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">30-min duration check, unique slot index WHERE status != &apos;cancelled&apos;</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 col-span-1 sm:col-span-2">
                  <span className="font-bold text-teal-800">7. visit_notes</span>
                  <p className="text-slate-600 text-[10px] mt-0.5">appointment_id (FK), doctor_id, patient_id, notes, is_patient_visible (Admin 403 Forbidden)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            Close Explorer
          </button>
        </div>
      </div>
    </div>
  );
};
