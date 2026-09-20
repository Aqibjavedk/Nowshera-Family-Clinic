import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Doctor, Appointment, VisitNote } from '../../types';
import { getDoctors, getMyAppointments, getVisitNote } from '../../lib/api';
import { formatClinicDateTime } from '../../lib/dateUtils';
import { BookAppointmentModal } from '../../components/patient/BookAppointmentModal';
import { CancelModal } from '../../components/patient/CancelModal';
import { RescheduleModal } from '../../components/patient/RescheduleModal';
import {
  HeartPulse,
  Calendar,
  Clock,
  Stethoscope,
  ChevronRight,
  Plus,
  AlertCircle,
  CheckCircle2,
  CalendarCheck,
  RotateCcw,
  Ban,
  ShieldCheck,
  Search,
  Filter,
  FileText
} from 'lucide-react';

export const PatientDashboard: React.FC<{ onNavigate: (view: string) => void }> = () => {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patientNotesMap, setPatientNotesMap] = useState<Record<string, VisitNote>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [filterSpecialty, setFilterSpecialty] = useState<string>('all');
  const [appointmentTab, setAppointmentTab] = useState<'all' | 'upcoming' | 'past'>('all');

  // Modals state
  const [isBookingOpen, setIsBookingOpen] = useState<boolean>(false);
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] = useState<Doctor | null>(null);
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [docsData, apptsData] = await Promise.all([
        getDoctors(),
        getMyAppointments(user?.id || 'demo-patient-001'),
      ]);
      setDoctors(docsData);
      setAppointments(apptsData);

      // Fetch visit notes for completed appointments
      const completed = apptsData.filter((a) => a.status === 'completed');
      if (completed.length > 0) {
        const notesObj: Record<string, VisitNote> = {};
        await Promise.all(
          completed.map(async (a) => {
            try {
              const note = await getVisitNote(a.id);
              if (note) notesObj[a.id] = note;
            } catch {}
          })
        );
        setPatientNotesMap(notesObj);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const specialties = ['all', ...Array.from(new Set(doctors.map((d) => d.specialty.name)))];

  const filteredDoctors = doctors.filter((doc) => {
    if (filterSpecialty === 'all') return true;
    return doc.specialty.name === filterSpecialty;
  });

  const now = new Date();
  const filteredAppointments = appointments.filter((appt) => {
    const startDt = new Date(appt.start_time);
    if (appointmentTab === 'upcoming') {
      return startDt >= now && appt.status !== 'cancelled' && appt.status !== 'completed';
    }
    if (appointmentTab === 'past') {
      return startDt < now || appt.status === 'completed' || appt.status === 'cancelled';
    }
    return true;
  });

  const formatDateTime = (iso: string) => {
    return formatClinicDateTime(iso);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <Ban className="w-3 h-3" /> Cancelled
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> No Show
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Patient Welcome Banner */}
      <div className="bg-gradient-to-r from-teal-800 to-teal-950 text-white rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-xs border border-white/20 text-teal-100 mb-3">
            <HeartPulse className="w-3.5 h-3.5 text-teal-300" />
            Nowshera Family Clinic • Patient Portal
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Welcome, {user?.full_name || 'Ahmad Khan'}
          </h2>
          <p className="text-xs sm:text-sm text-teal-100/90 mt-1.5 leading-relaxed">
            Schedule 30-minute doctor consultations, review upcoming appointments, and manage schedules with our strict 2-hour cancellation policy.
          </p>
        </div>

        <div className="relative z-10 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedDoctorForBooking(null);
              setIsBookingOpen(true);
            }}
            className="px-5 py-3 rounded-xl bg-white text-teal-900 font-bold text-xs sm:text-sm shadow-md hover:bg-teal-50 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-teal-700" />
            <span>Book New Appointment</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Total Bookings</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">{appointments.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-amber-600 font-medium">Pending Confirmation</div>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'pending').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-emerald-600 font-medium">Confirmed Upcoming</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'confirmed').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-blue-600 font-medium">Completed Visits</div>
          <div className="text-2xl font-bold text-blue-700 mt-1 font-mono">
            {appointments.filter((a) => a.status === 'completed').length}
          </div>
        </div>
      </div>

      {/* Section 1: My Appointments */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">My Appointments</h3>
              <p className="text-xs text-slate-500">
                Track status and manage bookings (reschedule/cancel allowed up to 2 hours prior)
              </p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setAppointmentTab('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                appointmentTab === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              All ({appointments.length})
            </button>
            <button
              onClick={() => setAppointmentTab('upcoming')}
              className={`px-3 py-1.5 rounded-lg transition ${
                appointmentTab === 'upcoming' ? 'bg-white text-teal-800 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setAppointmentTab('past')}
              className={`px-3 py-1.5 rounded-lg transition ${
                appointmentTab === 'past' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Past / Cancelled
            </button>
          </div>
        </div>

        {/* Appointments List */}
        <div className="p-5 sm:p-6">
          {filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CalendarCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No appointments found</p>
              <p className="text-xs text-slate-500 mt-1">
                You don't have any appointments in this view. Browse available doctors below to book a slot.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAppointments.map((appt) => {
                const startDt = new Date(appt.start_time);
                const diffHours = (startDt.getTime() - now.getTime()) / (1000 * 60 * 60);
                const canModify = (appt.status === 'pending' || appt.status === 'confirmed') && diffHours >= 2;
                const isUnderCutoff = (appt.status === 'pending' || appt.status === 'confirmed') && diffHours < 2 && diffHours > 0;

                return (
                  <div
                    key={appt.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-slate-900">
                          {appt.doctor?.full_name || 'Clinic Physician'}
                        </span>
                        {getStatusBadge(appt.status)}
                        <span className="text-xs text-teal-700 font-medium px-2 py-0.5 rounded bg-teal-50 border border-teal-100">
                          {appt.specialty || 'Family Medicine'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatDateTime(appt.start_time)}
                        </span>
                        <span>(30 Minutes Duration)</span>
                      </div>

                      {appt.cancellation_reason && (
                        <div className="text-xs text-slate-500 italic mt-0.5">
                          Reason: &ldquo;{appt.cancellation_reason}&rdquo;
                        </div>
                      )}

                      {isUnderCutoff && (
                        <div className="text-[11px] text-amber-700 font-medium">
                          Notice: Scheduled in {diffHours.toFixed(1)} hrs. Cannot cancel/reschedule within 2-hour cutoff.
                        </div>
                      )}

                      {/* Doctor's Visit Note for Patient */}
                      {patientNotesMap[appt.id] && patientNotesMap[appt.id].is_patient_visible && (
                        <div className="mt-2 p-3 bg-teal-50 border border-teal-200/80 rounded-xl text-xs text-teal-900">
                          <div className="font-bold text-teal-800 flex items-center gap-1.5 mb-1">
                            <FileText className="w-3.5 h-3.5 text-teal-600" />
                            Doctor&apos;s Clinical Visit Note & Recommendations
                          </div>
                          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{patientNotesMap[appt.id].notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canModify && (
                        <>
                          <button
                            type="button"
                            onClick={() => setAppointmentToReschedule(appt)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-teal-500 text-xs font-semibold text-slate-700 hover:text-teal-700 transition flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reschedule</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppointmentToCancel(appt)}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-xs font-semibold text-rose-700 transition flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Cancel</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Doctors Directory & Direct Booking */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Active Clinic Doctors</h3>
              <p className="text-xs text-slate-500">
                Browse medical specialties and view available 30-minute booking slots
              </p>
            </div>
          </div>

          {/* Specialty Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterSpecialty}
              onChange={(e) => setFilterSpecialty(e.target.value)}
              className="text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 outline-none"
            >
              {specialties.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Specialties' : s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Doctors Grid */}
        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDoctors.map((doc) => (
            <div
              key={doc.id}
              className="p-5 rounded-2xl border border-slate-200 hover:border-teal-500/80 transition-all flex flex-col justify-between group bg-slate-50/40"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      {doc.full_name.slice(4, 6).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{doc.full_name}</h4>
                      <p className="text-xs font-semibold text-teal-700">{doc.specialty.name}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active Doctor
                  </span>
                </div>

                <div className="text-xs text-slate-600 font-mono">
                  {doc.qualification}
                </div>

                {doc.bio && (
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {doc.bio}
                  </p>
                )}

                {/* Working hours display */}
                <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200/80">
                  <span className="font-bold text-slate-700">Practicing Days: </span>
                  Mon–Fri (09:00 AM – 05:00 PM PKT)
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-200/80 flex items-center justify-between">
                <span className="text-xs text-slate-500">30-min consultation</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDoctorForBooking(doc);
                    setIsBookingOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-600 group-hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Book Available Slot</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {isBookingOpen && (
        <BookAppointmentModal
          doctor={selectedDoctorForBooking}
          doctorsList={doctors}
          onClose={() => setIsBookingOpen(false)}
          onSuccess={loadData}
        />
      )}

      {appointmentToCancel && (
        <CancelModal
          appointment={appointmentToCancel}
          onClose={() => setAppointmentToCancel(null)}
          onSuccess={loadData}
        />
      )}

      {appointmentToReschedule && (
        <RescheduleModal
          appointment={appointmentToReschedule}
          onClose={() => setAppointmentToReschedule(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
