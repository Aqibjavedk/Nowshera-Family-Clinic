import React, { useState, useEffect } from 'react';
import { DoctorLeave } from '../../types';
import { getDoctorLeaves, addDoctorLeave, deleteDoctorLeave } from '../../lib/api';
import { formatClinicDate } from '../../lib/dateUtils';
import { Calendar, AlertTriangle, CheckCircle2, AlertCircle, Plus, Trash2, ShieldAlert, Info } from 'lucide-react';

interface DoctorLeaveManagementProps {
  doctorId: string;
}

export const DoctorLeaveManagement: React.FC<DoctorLeaveManagementProps> = ({ doctorId }) => {
  const [leaves, setLeaves] = useState<DoctorLeave[]>([]);
  const [loading, setLoading] = useState(true);

  // New leave form state
  const [leaveDate, setLeaveDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const data = await getDoctorLeaves(doctorId);
      setLeaves(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
    // Default leave date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setLeaveDate(tomorrow.toISOString().split('T')[0]);
  }, [doctorId]);

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDate) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await addDoctorLeave(doctorId, leaveDate, reason || undefined);
      setFeedback({
        type: 'success',
        message: `Leave scheduled for ${leaveDate}. ${
          result.cancelledCount > 0
            ? `${result.cancelledCount} conflicting appointment(s) automatically cancelled and slots released.`
            : 'No existing appointments conflicted.'
        }`,
      });
      setReason('');
      fetchLeaves();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to schedule leave day',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLeave = async (leaveId: string, dateStr: string) => {
    setFeedback(null);
    try {
      await deleteDoctorLeave(doctorId, leaveId);
      setFeedback({
        type: 'success',
        message: `Scheduled leave for ${dateStr} cancelled. Regular weekly availability restored.`,
      });
      fetchLeaves();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to cancel scheduled leave',
      });
    }
  };

  // Today in YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-600" />
          Leave Days & Off-Duty Scheduling
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Schedule planned leaves, vacations, and emergency absences.
        </p>
      </div>

      {/* Critical Trigger Notice */}
      <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-amber-950">
              Automated Cancellation Trigger Invariant
            </h4>
            <p className="mt-1 leading-relaxed text-amber-900/90">
              When a leave day is recorded, the clinic system will <strong>automatically cancel all pending and confirmed appointments</strong> for that date and release the slots. Completed historical visit records remain untouched.
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
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

      {/* Schedule Leave Form */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3">
          Schedule Off-Duty Leave
        </h4>

        <form onSubmit={handleAddLeave} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Leave Date (YYYY-MM-DD) *
            </label>
            <input
              type="date"
              required
              min={todayStr}
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Reason / Clinical Note (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Annual Medical Conference, Personal"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !leaveDate}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors h-[38px]"
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Applying Leave...' : 'Schedule Leave Date'}
          </button>
        </form>
      </div>

      {/* Existing Leaves List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Scheduled Leave Registry
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">
            {leaves.length} Scheduled
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Loading scheduled leaves...
          </div>
        ) : leaves.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No upcoming leave days scheduled. Your standard weekly working hours apply.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {leaves.map((leave) => {
              const formattedDate = formatClinicDate(`${leave.leave_date}T00:00:00+05:00`);

              return (
                <div
                  key={leave.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">
                        {formattedDate}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {leave.reason ? `Reason: ${leave.reason}` : 'General off-duty schedule'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteLeave(leave.id, leave.leave_date)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors shrink-0 self-start sm:self-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Cancel Leave
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
