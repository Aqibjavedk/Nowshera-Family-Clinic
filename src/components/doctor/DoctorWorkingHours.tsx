import React, { useState, useEffect } from 'react';
import { WorkingHour } from '../../types';
import { getDoctorWorkingHours, updateDoctorWorkingHours } from '../../lib/api';
import { Clock, Calendar, CheckCircle2, AlertCircle, Save, Info } from 'lucide-react';

interface DoctorWorkingHoursProps {
  doctorId: string;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DoctorWorkingHours: React.FC<DoctorWorkingHoursProps> = ({ doctorId }) => {
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadHours() {
      setLoading(true);
      try {
        const hours = await getDoctorWorkingHours(doctorId);
        // Ensure all 7 days exist
        const fullWeek: WorkingHour[] = [];
        for (let i = 0; i < 7; i++) {
          const existing = hours.find((h) => h.day_of_week === i);
          if (existing) {
            fullWeek.push({
              day_of_week: existing.day_of_week,
              start_time: existing.start_time.slice(0, 5), // "09:00"
              end_time: existing.end_time.slice(0, 5),     // "17:00"
              is_available: existing.is_available,
            });
          } else {
            fullWeek.push({
              day_of_week: i,
              start_time: '09:00',
              end_time: '17:00',
              is_available: i >= 1 && i <= 5, // Default Mon-Fri available
            });
          }
        }
        setWorkingHours(fullWeek);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load schedule');
      } finally {
        setLoading(false);
      }
    }
    loadHours();
  }, [doctorId]);

  const handleToggleDay = (dayIndex: number) => {
    setWorkingHours((prev) =>
      prev.map((wh) =>
        wh.day_of_week === dayIndex ? { ...wh, is_available: !wh.is_available } : wh
      )
    );
    setSuccessMsg(null);
  };

  const handleTimeChange = (dayIndex: number, field: 'start_time' | 'end_time', value: string) => {
    setWorkingHours((prev) =>
      prev.map((wh) => (wh.day_of_week === dayIndex ? { ...wh, [field]: value } : wh))
    );
    setSuccessMsg(null);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation
    for (const wh of workingHours) {
      if (wh.is_available) {
        const [sh, sm] = wh.start_time.split(':').map(Number);
        const [eh, em] = wh.end_time.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;

        if (startMins >= endMins) {
          setErrorMsg(
            `Invalid hours for ${DAY_NAMES[wh.day_of_week]}: start time (${wh.start_time}) must be earlier than end time (${wh.end_time}).`
          );
          return;
        }

        if (endMins - startMins < 30) {
          setErrorMsg(
            `Invalid hours for ${DAY_NAMES[wh.day_of_week]}: working hours must span at least one 30-minute appointment slot.`
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      // Normalize times to HH:MM:SS format
      const payload: WorkingHour[] = workingHours.map((wh) => ({
        day_of_week: wh.day_of_week,
        start_time: wh.start_time.length === 5 ? `${wh.start_time}:00` : wh.start_time,
        end_time: wh.end_time.length === 5 ? `${wh.end_time}:00` : wh.end_time,
        is_available: wh.is_available,
      }));

      await updateDoctorWorkingHours(doctorId, payload);
      setSuccessMsg('Working hours and recurring availability successfully updated.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save working hours');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
        Loading weekly schedule...
      </div>
    );
  }

  // Display Monday first through Sunday
  const displayOrder = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="space-y-5">
      {/* Header & Explanation */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              Weekly Working Hours & Availability
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Define your recurring operating hours. The slot generator uses these boundaries to create 30-minute patient appointments.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Schedule...' : 'Save Schedule'}
          </button>
        </div>
      </div>

      {/* Info Callout */}
      <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block">Timezone Note (Asia/Karachi — PKT)</span>
          <span>
            All consultation hours are evaluated in Pakistan Standard Time. 30-minute intervals are automatically generated between your start and end times.
          </span>
        </div>
      </div>

      {/* Feedback Messages */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Days Table / Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs divide-y divide-slate-100">
        {displayOrder.map((dayIdx) => {
          const wh = workingHours.find((h) => h.day_of_week === dayIdx);
          if (!wh) return null;

          return (
            <div
              key={dayIdx}
              className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                wh.is_available ? 'bg-white' : 'bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Checkbox Toggle */}
                <input
                  type="checkbox"
                  id={`day-toggle-${dayIdx}`}
                  checked={wh.is_available}
                  onChange={() => handleToggleDay(dayIdx)}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
                />

                <label
                  htmlFor={`day-toggle-${dayIdx}`}
                  className="cursor-pointer select-none"
                >
                  <div className="font-bold text-sm text-slate-900">
                    {DAY_NAMES[dayIdx]}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {wh.is_available ? 'Practicing consultations' : 'Off-duty / Clinic closed'}
                  </div>
                </label>
              </div>

              {/* Time Pickers */}
              {wh.is_available ? (
                <div className="flex items-center gap-3 pl-8 sm:pl-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-medium">From:</span>
                    <input
                      type="time"
                      step="1800"
                      value={wh.start_time}
                      onChange={(e) => handleTimeChange(dayIdx, 'start_time', e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-medium text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <span className="text-slate-400 font-bold text-xs">—</span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-medium">To:</span>
                    <input
                      type="time"
                      step="1800"
                      value={wh.end_time}
                      onChange={(e) => handleTimeChange(dayIdx, 'end_time', e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-medium text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="pl-8 sm:pl-0 text-xs font-medium text-slate-400 italic">
                  Day Off — No appointments will be scheduled
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Save Action */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving Schedule...' : 'Save All Working Hours'}
        </button>
      </div>
    </div>
  );
};
