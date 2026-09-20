import React, { useState, useEffect } from 'react';
import { Doctor, Specialty } from '../../types';
import { getAllDoctorsAdmin, getSpecialties, setDoctorStatus } from '../../lib/api';
import { OnboardDoctorModal } from './OnboardDoctorModal';
import { EditDoctorModal } from './EditDoctorModal';
import {
  Stethoscope,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Edit2,
  Phone,
  Mail,
  Award,
  Calendar,
  AlertCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export const AdminDoctorList: React.FC = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const docs = await getAllDoctorsAdmin(
        searchTerm || undefined,
        selectedSpecialty || undefined,
        selectedStatus === 'all' ? undefined : selectedStatus
      );
      setDoctors(docs);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getSpecialties().then(setSpecialties);
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [searchTerm, selectedSpecialty, selectedStatus]);

  const handleToggleStatus = async (doctor: Doctor) => {
    setTogglingId(doctor.id);
    setActionError(null);
    setActionSuccess(null);
    const newStatus = !doctor.is_active;

    try {
      await setDoctorStatus(doctor.id, newStatus);
      setActionSuccess(
        `${doctor.full_name} is now ${newStatus ? 'Active' : 'Inactive'}. ${
          !newStatus ? 'New slot bookings halted.' : 'Available for patient bookings.'
        }`
      );
      fetchDoctors();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update doctor status');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with Search & Onboard Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-purple-600" />
            Physician & Medical Staff Directory
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage practicing credentials, specialty assignments, and availability status.
          </p>
        </div>

        <button
          onClick={() => setIsOnboardOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Onboard New Doctor
        </button>
      </div>

      {/* Action feedback */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filters & Search Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by doctor name or email..."
            className="w-full pl-9 pr-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>

        <div className="relative">
          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          >
            <option value="">All Specialties</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
          >
            <option value="all">All Statuses (Active & Inactive)</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Doctors List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Loading clinic medical roster...
        </div>
      ) : doctors.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
          No doctors match the selected search and filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {doctors.map((doctor) => {
            const activeDaysCount = doctor.working_hours?.filter((w) => w.is_available).length || 0;

            return (
              <div
                key={doctor.id}
                className={`bg-white rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                  doctor.is_active ? 'border-slate-200 shadow-2xs' : 'border-slate-200 bg-slate-50/60 opacity-80'
                }`}
              >
                <div>
                  {/* Top line: Name, specialty badge, status badge */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
                        {doctor.full_name}
                      </h4>
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        {doctor.specialty?.name || 'Specialist'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          doctor.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {doctor.is_active ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-slate-400" />
                            Inactive
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Qualifications & Bio */}
                  <div className="space-y-1.5 my-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2 text-slate-700 font-medium">
                      <Award className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{doctor.qualification}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{doctor.email}</span>
                    </div>
                    {doctor.phone && (
                      <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{doctor.phone}</span>
                      </div>
                    )}
                    {doctor.bio && (
                      <p className="text-[11px] text-slate-500 pt-1 line-clamp-2 leading-relaxed">
                        {doctor.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Bar: Schedule summary & Controls */}
                <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span>{activeDaysCount} Days Scheduled / Week</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Active/Inactive Switch */}
                    <button
                      onClick={() => handleToggleStatus(doctor)}
                      disabled={togglingId === doctor.id}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 ${
                        doctor.is_active
                          ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                      }`}
                      title={doctor.is_active ? 'Deactivate doctor' : 'Activate doctor'}
                    >
                      {doctor.is_active ? 'Deactivate' : 'Activate'}
                    </button>

                    {/* Edit Profile */}
                    <button
                      onClick={() => setEditingDoctor(doctor)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <OnboardDoctorModal
        isOpen={isOnboardOpen}
        onClose={() => setIsOnboardOpen(false)}
        onSuccess={() => {
          setActionSuccess('New doctor successfully onboarded into Nowshera Family Clinic.');
          fetchDoctors();
        }}
      />

      <EditDoctorModal
        doctor={editingDoctor}
        isOpen={!!editingDoctor}
        onClose={() => setEditingDoctor(null)}
        onSuccess={() => {
          setActionSuccess('Doctor profile updated successfully.');
          fetchDoctors();
        }}
      />
    </div>
  );
};
