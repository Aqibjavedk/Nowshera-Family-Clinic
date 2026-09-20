import React, { useState, useEffect } from 'react';
import { PatientSummary } from '../../types';
import { getPatientsDirectory } from '../../lib/api';
import {
  Users,
  Search,
  Mail,
  Phone,
  Calendar,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';

export const AdminPatients: React.FC = () => {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const data = await getPatientsDirectory(searchTerm || undefined);
      setPatients(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [searchTerm]);

  return (
    <div className="space-y-5">
      {/* Header & Privacy Reminder */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            Patient Registry & History Overview
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Directory of registered clinic patients and high-level appointment counts.
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shrink-0">
          <Lock className="w-3.5 h-3.5 text-amber-700" />
          <span>Clinical visit notes strictly confidential and doctor/patient private</span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by patient name, email, or phone number..."
          className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
        />
      </div>

      {/* Patients Table */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Loading patient directory...
        </div>
      ) : patients.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
          No patients match the search query.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Patient Profile</th>
                  <th className="px-4 py-3">Contact Information</th>
                  <th className="px-4 py-3">Registration Date</th>
                  <th className="px-4 py-3">Total Visits</th>
                  <th className="px-4 py-3">Status Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((patient) => {
                  const regDate = new Date(patient.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'Asia/Karachi',
                  });

                  return (
                    <tr key={patient.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
                            {patient.full_name.charAt(0)}
                          </div>
                          <span>{patient.full_name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-slate-600 font-mono text-[11px] flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{patient.email}</span>
                        </div>
                        {patient.phone && (
                          <div className="text-slate-500 text-[11px] flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{patient.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{regDate}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {patient.total_appointments} visits
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span
                            className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold"
                            title="Completed"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {patient.completed_appointments}
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 text-blue-700 font-semibold"
                            title="Confirmed"
                          >
                            <Clock className="w-3 h-3" />
                            {patient.confirmed_appointments}
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 text-amber-700 font-semibold"
                            title="Pending"
                          >
                            <Clock className="w-3 h-3" />
                            {patient.pending_appointments}
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 text-rose-600 font-semibold"
                            title="Cancelled"
                          >
                            <XCircle className="w-3 h-3" />
                            {patient.cancelled_appointments}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
