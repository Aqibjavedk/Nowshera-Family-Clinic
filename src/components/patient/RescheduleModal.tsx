import React, { useState, useEffect } from 'react';
import { Appointment, TimeSlot } from '../../types';
import { getAvailableSlots, rescheduleAppointment } from '../../lib/api';
import { formatClinicTime, getClinicDateOptions } from '../../lib/dateUtils';
import { Calendar, Clock, X, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';

interface RescheduleModalProps {
  appointment: Appointment;
  onClose: () => void;
  onSuccess: () => void;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  appointment,
  onClose,
  onSuccess,
}) => {
  // Check 2-hour cutoff (pure UTC epoch timestamps)
  const startDt = new Date(appointment.start_time);
  const now = new Date();
  const diffHours = (startDt.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isAllowed = diffHours >= 2;

  // Tomorrow in Asia/Karachi clinic calendar
  const tomorrowIso = getClinicDateOptions(1, 1)[0]?.iso || new Date().toISOString().split('T')[0];
  const todayClinicIso = getClinicDateOptions(1, 0)[0]?.iso || new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(tomorrowIso);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAllowed || !appointment.doctor_id || !selectedDate) return;

    let mounted = true;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);

    getAvailableSlots(appointment.doctor_id, selectedDate)
      .then((data) => {
        if (mounted) {
          // Exclude original slot if same day
          const filtered = data.filter((s) => s.start_time !== appointment.start_time);
          setSlots(filtered);
          setLoadingSlots(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || 'Failed to load slots');
          setLoadingSlots(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [appointment, selectedDate, isAllowed]);

  const handleReschedule = async () => {
    if (!selectedSlot) return;

    setLoading(true);
    setError(null);
    try {
      await rescheduleAppointment(appointment.id, selectedSlot.start_time);
      onSuccess();
      onClose();
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
        setSelectedSlot(null);
        if (appointment.doctor_id && selectedDate) {
          getAvailableSlots(appointment.doctor_id, selectedDate).then(setSlots).catch(() => {});
        }
      } else {
        setError(
          err?.message && !err.message.includes('{') && !err.message.includes('stack')
            ? err.message
            : 'Failed to reschedule appointment. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const formatSlotTime = (isoString: string) => {
    return formatClinicTime(isoString);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-teal-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Reschedule Appointment</h3>
              <p className="text-xs text-slate-500">Pick a new 30-minute slot with {appointment.doctor?.full_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isAllowed ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">Rescheduling Cutoff Exceeded</p>
              This appointment is scheduled in less than 2 hours ({diffHours.toFixed(1)} hours remaining). You cannot reschedule within the 2-hour window.
            </div>
          ) : (
            <>
              {/* Date Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select New Date:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  min={todayClinicIso}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full text-xs font-mono border border-slate-300 rounded-xl px-3 py-2 text-slate-700 bg-white"
                />
              </div>

              {/* Slots */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Choose Available 30-Minute Slot ({slots.length}):
                  </label>
                  <span className="text-[10px] text-slate-400">Asia/Karachi</span>
                </div>

                {loadingSlots ? (
                  <div className="py-6 text-center text-slate-500 flex flex-col items-center gap-1.5">
                    <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Checking doctor schedule...</span>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-slate-500">
                    No available slots on this date. Please pick another day.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => {
                      const isSelected = selectedSlot?.start_time === slot.start_time;
                      return (
                        <button
                          key={slot.start_time}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2 rounded-xl border text-center transition ${
                            isSelected
                              ? 'bg-teal-700 text-white border-teal-700 font-bold shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-teal-500 hover:bg-teal-50/40'
                          }`}
                        >
                          <div className="font-mono text-xs font-semibold">{formatSlotTime(slot.start_time)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Note */}
              <p className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                Rescheduling will automatically cancel the current appointment slot at {formatSlotTime(appointment.start_time)} to release it, and submit your new requested time in <strong>pending</strong> status for doctor review.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>

          {isAllowed && (
            <button
              type="button"
              disabled={!selectedSlot || loading}
              onClick={handleReschedule}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                selectedSlot && !loading
                  ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Rescheduling...</span>
                </>
              ) : (
                <>
                  <span>Confirm Reschedule</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
