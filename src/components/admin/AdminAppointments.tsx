import React, { useState, useEffect } from 'react';
import { Appointment, Doctor } from '../../types';
import { getMasterAppointmentsAdmin, getAllDoctorsAdmin, cancelAppointmentAdmin } from '../../lib/api';
import {
  Calendar,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Stethoscope,
  Ban,
  X,
  Lock
} from 'lucide-react';

export const AdminAppointments: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Cancellation Modal
  const [cancellingAppt, setCancellingAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('Facility schedule adjustment / Doctor unavailable');
  const [cancellingLoading, setCancellingLoading] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const data = await getMasterAppointmentsAdmin(
        selectedDoctorId || undefined,
        selectedDate || undefined,
        selectedStatus === 'all' ? undefined : selectedStatus,
        searchTerm || undefined
      );
      setAppointments(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load master appointments' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAllDoctorsAdmin().then(setDoctors);
  }, []);

  useEffect(() => {
    fetchLedger();
  }, [selectedDoctorId, selectedDate, selectedStatus, searchTerm]);

  const handleExecuteCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingAppt) return;

    setCancellingLoading(true);
    setFeedback(null);
    try {
      await cancelAppointmentAdmin(cancellingAppt.id, cancelReason);
      setFeedback({
        type: 'success',
        message: 'Appointment cancelled by administration. Slot released for re-booking.',
      });
      setCancellingAppt(null);
      fetchLedger();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to cancel appointment',
      });
    } finally {
      setCancellingLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Confirmed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Pending Request
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3 h-3 text-blue-600" />
            Completed
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            <AlertCircle className="w-3 h-3 text-purple-600" />
            No-Show
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const formatSlotTime = (startIso: string, endIso: string) => {
    try {
      const start = new Date(startIso);
      const end = new Date(endIso);
      const date = start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Karachi',
      });
      const startTime = start.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Karachi',
      });
      const endTime = end.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Karachi',
      });
      return { date, time: `${startTime} – ${endTime} (PKT)` };
    } catch {
      return { date: startIso, time: '' };
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Privacy Reminder */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-600" />
            Master Facility Appointment Ledger
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time audit schedule across all practicing clinic physicians.
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shrink-0">
          <Lock className="w-3.5 h-3.5 text-amber-700" />
          <span>Patient visit notes confidential & inaccessible to admin</span>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patient name or email..."
            className="w-full pl-9 pr-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          >
            <option value="">All Practicing Doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name} ({d.specialty.name})
              </option>
            ))}
          </select>
        </div>

        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          >
            <option value="all">All Appointment Statuses</option>
            <option value="pending">Pending Only</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="completed">Completed Only</option>
            <option value="cancelled">Cancelled Only</option>
            <option value="no_show">No-Show Only</option>
          </select>
        </div>
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Loading master appointment schedule...
        </div>
      ) : appointments.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
          No appointments found matching the current criteria.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Patient Profile</th>
                  <th className="px-4 py-3">Assigned Physician</th>
                  <th className="px-4 py-3">Date & Time (Asia/Karachi)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Administrative Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((appt) => {
                  const { date, time } = formatSlotTime(appt.start_time, appt.end_time);
                  const isCancelable = appt.status === 'pending' || appt.status === 'confirmed';

                  return (
                    <tr key={appt.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {appt.patient?.full_name || 'Patient'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {appt.patient?.email || 'N/A'}
                        </div>
                        {appt.patient?.phone && (
                          <div className="text-[11px] text-slate-400">
                            {appt.patient.phone}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-purple-600" />
                          {appt.doctor?.full_name || 'Clinic Physician'}
                        </div>
                        <span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                          {appt.doctor?.specialty || appt.specialty || 'General'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{date}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{time}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {getStatusBadge(appt.status)}
                        {appt.status === 'cancelled' && (
                          <div className="text-[10px] text-rose-600 mt-1 max-w-xs">
                            Reason: {appt.cancellation_reason || 'Administrative release'}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {isCancelable ? (
                          <button
                            onClick={() => setCancellingAppt(appt)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors"
                          >
                            <Ban className="w-3 h-3" />
                            Emergency Cancel
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">
                            No Action Needed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Emergency Cancellation Modal */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                <Ban className="w-4 h-4" />
                Administrative Cancellation
              </div>
              <button
                onClick={() => setCancellingAppt(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel the appointment for{' '}
              <strong>{cancellingAppt.patient?.full_name}</strong> with{' '}
              <strong>{cancellingAppt.doctor?.full_name}</strong>? This will release the slot and notify the patient.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Cancellation
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancellingAppt(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                disabled={cancellingLoading}
                onClick={handleExecuteCancel}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                {cancellingLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
