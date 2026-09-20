import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Appointment, VisitNote } from '../../types';
import {
  getDoctorAppointments,
  confirmAppointment,
  rejectAppointment,
  completeAppointment,
  noShowAppointment,
  createVisitNote,
  updateVisitNote,
  getVisitNote
} from '../../lib/api';
import { DoctorWorkingHours } from '../../components/doctor/DoctorWorkingHours';
import { DoctorLeaveManagement } from '../../components/doctor/DoctorLeaveManagement';
import { formatClinicDateTime } from '../../lib/dateUtils';
import {
  Stethoscope,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserCheck,
  Ban,
  Filter,
  Check,
  X,
  CalendarDays,
  CalendarOff,
  FileText,
  Lock,
  Eye,
  Save
} from 'lucide-react';

export const DoctorDashboard: React.FC<{ onNavigate: (view: string) => void }> = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'schedule' | 'hours' | 'leave'>('schedule');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Visit Notes State
  const [notesMap, setNotesMap] = useState<Record<string, VisitNote>>({});
  const [selectedApptForNote, setSelectedApptForNote] = useState<Appointment | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [isPatientVisible, setIsPatientVisible] = useState<boolean>(true);
  const [noteSaving, setNoteSaving] = useState<boolean>(false);
  const [noteModalError, setNoteModalError] = useState<string | null>(null);
  const [existingNote, setExistingNote] = useState<VisitNote | null>(null);

  const loadVisitNotes = async (appts: Appointment[]) => {
    const completed = appts.filter((a) => a.status === 'completed');
    if (completed.length === 0) return;

    const newMap: Record<string, VisitNote> = { ...notesMap };
    await Promise.all(
      completed.map(async (a) => {
        try {
          const note = await getVisitNote(a.id);
          if (note) {
            newMap[a.id] = note;
          }
        } catch {}
      })
    );
    setNotesMap(newMap);
  };

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await getDoctorAppointments(
        user?.id || 'demo-doctor-001',
        dateFilter || undefined,
        statusFilter === 'all' ? undefined : statusFilter
      );
      setAppointments(data);
      loadVisitNotes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, [user, statusFilter, dateFilter]);

  const handleConfirm = async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await confirmAppointment(id);
      setActionSuccess('Appointment confirmed successfully.');
      loadAppointments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm appointment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await rejectAppointment(id);
      setActionSuccess('Appointment rejected and slot released.');
      loadAppointments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject appointment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const completedAppt = await completeAppointment(id);
      setActionSuccess('Appointment marked as completed. You can now add visit notes below.');
      loadAppointments();
      if (completedAppt) {
        openVisitNoteModal(completedAppt);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to complete appointment');
    } finally {
      setActionLoading(null);
    }
  };

  const openVisitNoteModal = async (appt: Appointment) => {
    setSelectedApptForNote(appt);
    setNoteModalError(null);
    setNoteText('');
    setIsPatientVisible(true);
    setExistingNote(null);

    try {
      const note = await getVisitNote(appt.id);
      if (note) {
        setExistingNote(note);
        setNoteText(note.notes);
        setIsPatientVisible(note.is_patient_visible);
      }
    } catch (e: any) {
      console.warn('Could not prefetch note:', e);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedApptForNote) return;
    if (!noteText.trim()) {
      setNoteModalError('Please enter clinical visit notes before saving.');
      return;
    }

    setNoteSaving(true);
    setNoteModalError(null);

    try {
      let saved: VisitNote;
      if (existingNote) {
        saved = await updateVisitNote(selectedApptForNote.id, noteText.trim(), isPatientVisible);
      } else {
        try {
          saved = await createVisitNote(selectedApptForNote.id, noteText.trim(), isPatientVisible);
        } catch (err: any) {
          if (err.message && err.message.includes('already exists')) {
            saved = await updateVisitNote(selectedApptForNote.id, noteText.trim(), isPatientVisible);
          } else {
            throw err;
          }
        }
      }

      setNotesMap((prev) => ({ ...prev, [selectedApptForNote.id]: saved }));
      setActionSuccess('Visit note saved successfully.');
      setSelectedApptForNote(null);
      loadAppointments();
    } catch (err: any) {
      setNoteModalError(err.message || 'Failed to save visit note');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleNoShow = async (id: string) => {
    setActionLoading(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await noShowAppointment(id);
      setActionSuccess('Patient marked as no-show.');
      loadAppointments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update appointment');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDateTime = (iso: string) => {
    return formatClinicDateTime(iso);
  };

  const now = new Date();

  return (
    <div className="space-y-8">
      {/* Doctor Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/20 border border-teal-400/30 text-teal-300 mb-3">
            <Stethoscope className="w-3.5 h-3.5" />
            Physician Clinical Portal • Nowshera Family Clinic
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {user?.full_name || 'Dr. Shams ur Rehman'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            Review incoming consultation requests, manage confirmed patients, and update clinical appointment statuses.
          </p>
        </div>

        <div className="relative z-10 text-xs font-mono text-slate-300 space-y-1 bg-white/5 p-4 rounded-xl border border-white/10 shrink-0">
          <div><span className="text-teal-400 font-semibold">Specialty:</span> Family Medicine</div>
          <div><span className="text-teal-400 font-semibold">Clinic Time:</span> Asia/Karachi (PKT)</div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-amber-600 font-medium">Pending Requests</div>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'pending').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xl">
          <div className="text-xs text-emerald-600 font-medium">Confirmed Upcoming</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'confirmed').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-blue-600 font-medium">Completed Patients</div>
          <div className="text-2xl font-bold text-blue-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'completed').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Cancelled / No-Show</div>
          <div className="text-2xl font-bold text-slate-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'cancelled' || a.status === 'no_show').length}
          </div>
        </div>
      </div>

      {/* Doctor Portal Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'schedule'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Clinical Consultations & Schedule
          {appointments.filter((a) => a.status === 'pending').length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {appointments.filter((a) => a.status === 'pending').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('hours')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'hours'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Working Hours & Availability
        </button>

        <button
          onClick={() => setActiveTab('leave')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'leave'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <CalendarOff className="w-3.5 h-3.5" />
          Leave Days & Off-Duty
        </button>
      </div>

      {activeTab === 'hours' && (
        <DoctorWorkingHours doctorId={user?.id || 'demo-doctor-001'} />
      )}

      {activeTab === 'leave' && (
        <DoctorLeaveManagement doctorId={user?.id || 'demo-doctor-001'} />
      )}

      {activeTab === 'schedule' && (
        <>
          {/* Notification Toast */}
          {actionError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
          )}
          {actionSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Appointments Management List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Controls Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Schedule & Patient Appointments</h3>
            <p className="text-xs text-slate-500">
              Confirm pending requests, mark completed consultations, or record no-shows
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Requests</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>

            {/* Date Filter */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs font-mono border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 text-slate-700 outline-none"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Appointments Feed */}
        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading patient schedule...</span>
            </div>
          ) : appointments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No appointments found</p>
              <p className="text-xs text-slate-500 mt-1">
                There are no scheduled consultations matching this filter.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((appt) => {
                const startDt = new Date(appt.start_time);
                const hasStarted = now >= startDt;
                const isOperating = actionLoading === appt.id;

                return (
                  <div
                    key={appt.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-slate-900">
                          {appt.patient?.full_name || 'Patient Ahmad Khan'}
                        </span>
                        {appt.status === 'confirmed' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Confirmed
                          </span>
                        )}
                        {appt.status === 'pending' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Pending Review
                          </span>
                        )}
                        {appt.status === 'completed' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Completed
                          </span>
                        )}
                        {appt.status === 'cancelled' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Cancelled
                          </span>
                        )}
                        {appt.status === 'no_show' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            No-Show
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatDateTime(appt.start_time)}
                        </span>
                        {appt.patient?.phone && (
                          <span>Phone: {appt.patient.phone}</span>
                        )}
                        {appt.patient?.email && (
                          <span>Email: {appt.patient.email}</span>
                        )}
                      </div>

                      {appt.cancellation_reason && (
                        <div className="text-xs text-slate-500 italic">
                          Cancellation note: &ldquo;{appt.cancellation_reason}&rdquo;
                        </div>
                      )}

                      {/* Visit Note Preview for Completed Appointments */}
                      {notesMap[appt.id] && (
                        <div className="mt-2 p-2.5 bg-teal-50/60 border border-teal-200/60 rounded-xl text-xs text-teal-900 flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-teal-800 flex items-center gap-1.5 mb-0.5">
                              <FileText className="w-3.5 h-3.5 text-teal-600" />
                              Clinical Visit Note
                              {notesMap[appt.id].is_patient_visible ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-200 ml-1">
                                  Patient Visible
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 ml-1">
                                  Confidential (Doctor Only)
                                </span>
                              )}
                            </div>
                            <p className="text-slate-700 text-xs mt-1 leading-relaxed whitespace-pre-wrap">{notesMap[appt.id].notes}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Controls for Doctor */}
                    <div className="flex items-center gap-2 shrink-0">
                      {appt.status === 'completed' && (
                        <button
                          type="button"
                          disabled={isOperating}
                          onClick={() => openVisitNoteModal(appt)}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{notesMap[appt.id] ? 'View / Edit Note' : 'Add Visit Note'}</span>
                        </button>
                      )}

                      {appt.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            disabled={isOperating}
                            onClick={() => handleConfirm(appt.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirm</span>
                          </button>
                          <button
                            type="button"
                            disabled={isOperating}
                            onClick={() => handleReject(appt.id)}
                            className="px-3.5 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {appt.status === 'confirmed' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!hasStarted || isOperating}
                            onClick={() => handleComplete(appt.id)}
                            title={!hasStarted ? 'Can only mark completed once appointment start time arrives' : ''}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                              hasStarted
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Complete</span>
                          </button>

                          <button
                            type="button"
                            disabled={!hasStarted || isOperating}
                            onClick={() => handleNoShow(appt.id)}
                            title={!hasStarted ? 'Can only mark no-show once appointment start time arrives' : ''}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1 ${
                              hasStarted
                                ? 'border border-amber-300 hover:bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            }`}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>No-Show</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )}

  {/* Visit Note Modal */}
  {selectedApptForNote && (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {existingNote ? 'View / Edit Clinical Visit Note' : 'Add Clinical Visit Note'}
              </h3>
              <p className="text-xs text-slate-500">
                Patient: <span className="font-semibold text-slate-700">{selectedApptForNote.patient?.full_name || 'Patient'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedApptForNote(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {noteModalError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{noteModalError}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Observations & Visit Summary <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter clinical observations, diagnosis, advised rest, medication guidelines, or follow-up instructions..."
              className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition placeholder:text-slate-400"
            />
          </div>

          {/* Patient Visibility Checkbox / Toggle */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <input
              type="checkbox"
              id="patientVisibleCheckbox"
              checked={isPatientVisible}
              onChange={(e) => setIsPatientVisible(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <label htmlFor="patientVisibleCheckbox" className="text-xs text-slate-700 cursor-pointer space-y-0.5">
              <span className="font-bold block text-slate-900 flex items-center gap-1.5">
                {isPatientVisible ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-teal-600" />
                    <span>Patient-Visible (Shared in Patient Portal)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Confidential (Physician-Only Access)</span>
                  </>
                )}
              </span>
              <span className="text-[11px] text-slate-500 block leading-tight">
                {isPatientVisible
                  ? 'The patient can view this visit note when logged into their personal patient portal.'
                  : 'This note remains strictly private to you. Patient and admin portal access are blocked.'}
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={noteSaving}
            onClick={() => setSelectedApptForNote(null)}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={noteSaving}
            onClick={handleSaveNote}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{noteSaving ? 'Saving...' : 'Save Visit Note'}</span>
          </button>
        </div>
      </div>
    </div>
  )}
</div>
);
};
