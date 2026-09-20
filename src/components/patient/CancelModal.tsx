import React, { useState } from 'react';
import { Appointment } from '../../types';
import { cancelAppointment } from '../../lib/api';
import { formatClinicDateTimeMedium } from '../../lib/dateUtils';
import { AlertTriangle, Clock, X, AlertCircle } from 'lucide-react';

interface CancelModalProps {
  appointment: Appointment;
  onClose: () => void;
  onSuccess: () => void;
}

export const CancelModal: React.FC<CancelModalProps> = ({
  appointment,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check 2-hour cutoff
  const startDt = new Date(appointment.start_time);
  const now = new Date();
  const diffHours = (startDt.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isAllowed = diffHours >= 2;

  const handleCancel = async () => {
    if (!isAllowed) return;

    setLoading(true);
    setError(null);
    try {
      await cancelAppointment(appointment.id, reason || 'Cancelled by patient');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel appointment');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (iso: string) => {
    return formatClinicDateTimeMedium(iso);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Cancel Appointment</h3>
              <p className="text-xs text-slate-500">Enforcing 2-hour cancellation policy</p>
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
        <div className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Details */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-semibold text-slate-800">
              Doctor: {appointment.doctor?.full_name || 'Clinic Doctor'} ({appointment.specialty || 'General'})
            </div>
            <div className="text-slate-600 flex items-center gap-1.5 font-mono text-[11px]">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatDateTime(appointment.start_time)}
            </div>
          </div>

          {/* Policy Notice */}
          {!isAllowed ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">Cancellation Cutoff Exceeded</p>
              This appointment is scheduled in less than 2 hours ({diffHours.toFixed(1)} hours remaining). Under clinic policy, appointments cannot be cancelled or rescheduled within 2 hours of the start time.
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reason for cancellation (optional):
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Personal schedule change, feeling better, conflict"
                rows={3}
                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Cancelling will release this 30-minute slot back to the clinic pool so other patients may book it.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Go Back
          </button>

          {isAllowed && (
            <button
              type="button"
              disabled={loading}
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Cancelling...</span>
                </>
              ) : (
                <span>Confirm Cancellation</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
