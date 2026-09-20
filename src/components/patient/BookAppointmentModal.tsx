import React, { useState, useEffect } from 'react';
import { Doctor, TimeSlot } from '../../types';
import { getAvailableSlots, createAppointment } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatClinicTime, getClinicDateOptions } from '../../lib/dateUtils';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Stethoscope,
  ChevronRight,
  ShieldCheck,
  CalendarCheck
} from 'lucide-react';

interface BookAppointmentModalProps {
  doctor: Doctor | null;
  doctorsList: Doctor[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BookAppointmentModal: React.FC<BookAppointmentModalProps> = ({
  doctor: initialDoctor,
  doctorsList,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(
    initialDoctor || (doctorsList.length > 0 ? doctorsList[0] : null)
  );

  // Default to tomorrow or next business day
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string>(tomorrowIso);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [booking, setBooking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Generate 7 quick upcoming dates for fast selection based on Asia/Karachi clinic calendar
  const upcomingDates = getClinicDateOptions(7, 1);

  // Fetch available slots whenever doctor or date changes
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return;

    let mounted = true;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);

    getAvailableSlots(selectedDoctor.id, selectedDate)
      .then((data) => {
        if (mounted) {
          setSlots(data);
          setLoadingSlots(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || 'Failed to load available slots');
          setLoadingSlots(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedDoctor, selectedDate]);

  const handleBook = async () => {
    if (!selectedDoctor || !selectedSlot) return;

    if (!user?.id) {
      setError('Please log in with a valid patient account to book an appointment.');
      return;
    }

    setBooking(true);
    setError(null);
    try {
      await createAppointment(selectedDoctor.id, selectedSlot.start_time, {
        id: user.id,
        full_name: user.full_name || 'Patient',
        email: user.email || '',
        phone: user.phone,
      });

      setSuccessMessage('Appointment request submitted! Held in pending status.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      const isConflict =
        err?.status === 409 ||
        err?.code === 'SLOT_CONFLICT' ||
        err?.code === 'PATIENT_CONFLICT' ||
        (typeof err?.message === 'string' &&
          (err.message.toLowerCase().includes('already booked') ||
            err.message.toLowerCase().includes('conflict') ||
            err.message.toLowerCase().includes('occupied') ||
            err.message.toLowerCase().includes('no longer available')));

      if (isConflict) {
        setError('Appointment slot is already booked. Please select another available time.');
        // Reset selected slot and refresh slot list
        setSelectedSlot(null);
        if (selectedDoctor && selectedDate) {
          getAvailableSlots(selectedDoctor.id, selectedDate)
            .then(setSlots)
            .catch(() => {});
        }
      } else {
        setError(
          err?.message && !err.message.includes('{') && !err.message.includes('stack')
            ? err.message
            : 'Unable to schedule appointment at this time. Please try again.'
        );
      }
    } finally {
      setBooking(false);
    }
  };

  const formatSlotTime = (isoString: string) => {
    return formatClinicTime(isoString);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Book Doctor Appointment</h2>
              <p className="text-xs text-slate-500">30-minute consultation slots • Asia/Karachi (PKT)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 1. Doctor Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Select Doctor & Specialty
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {doctorsList.map((doc) => {
                const isSelected = selectedDoctor?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedDoctor(doc)}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/50 shadow-2xs ring-1 ring-teal-600'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Stethoscope className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-slate-900 truncate">{doc.full_name}</div>
                      <div className="text-[11px] font-medium text-teal-700 truncate">{doc.specialty.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{doc.qualification}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Date Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. Select Date
              </label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-mono border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 bg-white"
              />
            </div>

            {/* Quick dates carousel */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {upcomingDates.map((d) => {
                const isSelected = selectedDate === d.iso;
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => setSelectedDate(d.iso)}
                    className={`py-2 px-1 text-center rounded-xl border transition flex flex-col items-center ${
                      isSelected
                        ? 'bg-teal-700 text-white border-teal-700 font-bold shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[10px] uppercase">{d.dayName}</span>
                    <span className="text-xs font-semibold mt-0.5">{d.dayNum}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Slot Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                3. Available 30-Minute Slots ({slots.length} available)
              </label>
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                Clinic Time: Asia/Karachi
              </span>
            </div>

            {loadingSlots ? (
              <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Checking doctor schedule and active bookings...</span>
              </div>
            ) : slots.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No Available Slots on this Day</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  {selectedDoctor?.full_name} is either off-duty, on leave, or all 30-minute intervals for this date are already reserved. Please select another date.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.start_time === slot.start_time;
                  return (
                    <button
                      key={slot.start_time}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center ${
                        isSelected
                          ? 'bg-teal-700 text-white border-teal-700 font-bold shadow-2xs ring-2 ring-teal-700/20'
                          : 'bg-white text-slate-800 border-slate-200 hover:border-teal-500 hover:bg-teal-50/40'
                      }`}
                    >
                      <span className="text-xs font-mono font-semibold">
                        {formatSlotTime(slot.start_time)}
                      </span>
                      <span
                        className={`text-[10px] mt-0.5 ${
                          isSelected ? 'text-teal-200' : 'text-slate-400'
                        }`}
                      >
                        to {formatSlotTime(slot.end_time)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Booking Summary Box */}
          {selectedSlot && selectedDoctor && (
            <div className="p-4 rounded-xl bg-teal-50/80 border border-teal-200 space-y-2">
              <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Booking Summary & Policy
              </div>
              <div className="text-xs text-teal-950 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div>
                  <span className="text-teal-700">Doctor:</span> {selectedDoctor.full_name} ({selectedDoctor.specialty.name})
                </div>
                <div>
                  <span className="text-teal-700">Time:</span> {formatSlotTime(selectedSlot.start_time)} - {formatSlotTime(selectedSlot.end_time)}
                </div>
                <div>
                  <span className="text-teal-700">Date:</span> {selectedDate}
                </div>
                <div>
                  <span className="text-teal-700">Patient:</span> {user?.full_name || 'Ahmad Khan'}
                </div>
              </div>
              <p className="text-[11px] text-teal-800 pt-1 border-t border-teal-200/80">
                Rule Notice: Once requested, your booking enters <strong>pending</strong> status until confirmed by the physician. You can cancel or reschedule freely up to <strong>2 hours</strong> before the scheduled appointment start time.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!selectedSlot || booking}
            onClick={handleBook}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              selectedSlot && !booking
                ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {booking ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Securing Slot...</span>
              </>
            ) : (
              <>
                <span>Confirm 30-Min Appointment</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
