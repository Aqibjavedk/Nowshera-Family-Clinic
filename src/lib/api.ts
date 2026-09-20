import {
  Doctor,
  Appointment,
  TimeSlot,
  Specialty,
  WorkingHour,
  DoctorLeave,
  AdminClinicStats,
  PatientSummary,
  DoctorCreateInput,
  DoctorUpdateInput,
  VisitNote,
} from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

const API_BASE = '/api/v1';

// Seed Specialties (Using standard database schema UUIDs)
export const CLINIC_SPECIALTIES: Specialty[] = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Family Medicine', description: 'Comprehensive primary healthcare for individuals and family members of all ages.' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Pediatrics', description: 'Specialized medical care and wellness monitoring for infants, children, and adolescents.' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'General Internal Medicine', description: 'Prevention, diagnosis, and treatment of adult acute and chronic diseases.' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Cardiology', description: 'Expert cardiovascular care, hypertension management, and heart health screenings.' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Dermatology', description: 'Diagnosis and clinical care for skin, hair, and dermatological conditions.' },
];

// Clinic verified doctors with exact Auth UUIDs
export const INITIAL_DOCTORS: Doctor[] = [
  {
    id: '30b6de4e-174f-4381-831d-e3a6ae199596',
    full_name: 'Dr. Yaqoob ur Rehman',
    email: 'yaqoob@gmail.com',
    phone: '+92 300 9876543',
    qualification: 'MBBS, FCPS (Cardiology)',
    bio: 'Senior Consultant with over 12 years of experience in cardiology and general medicine.',
    is_active: true,
    specialty: CLINIC_SPECIALTIES[3],
    working_hours: [
      { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 5, start_time: '09:00:00', end_time: '14:00:00', is_available: true },
      { day_of_week: 6, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
      { day_of_week: 0, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
    ],
  },
  {
    id: '5af7156f-88e7-4311-84c2-36ae28875f1a',
    full_name: 'Dr. Sardar Sohail',
    email: 'sardar@gmail.com',
    phone: '03003443234',
    qualification: 'MBBS, MD (Pediatrics)',
    bio: 'Consultant Pediatrician specializing in child healthcare and neonatal medicine.',
    is_active: true,
    specialty: CLINIC_SPECIALTIES[1],
    working_hours: [
      { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 5, start_time: '09:00:00', end_time: '14:00:00', is_available: true },
      { day_of_week: 6, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
      { day_of_week: 0, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
    ],
  },
  {
    id: '59ba4df6-d45b-48e2-8a20-966a9630fd0a',
    full_name: 'Dr. Farooq Khan',
    email: 'dr.farooq@nowsheraclinic.pk',
    phone: '+92 300 9876543',
    qualification: 'MBBS, FCPS (Family Medicine)',
    bio: 'Family Medicine Consultant dedicated to comprehensive preventive care.',
    is_active: true,
    specialty: CLINIC_SPECIALTIES[0],
    working_hours: [
      { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 3, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 4, start_time: '09:00:00', end_time: '17:00:00', is_available: true },
      { day_of_week: 5, start_time: '09:00:00', end_time: '14:00:00', is_available: true },
      { day_of_week: 6, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
      { day_of_week: 0, start_time: '09:00:00', end_time: '14:00:00', is_available: false },
    ],
  },
];

// Local store helpers
function getLocalDoctors(): Doctor[] {
  try {
    const raw = localStorage.getItem('nfc_doctors');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem('nfc_doctors', JSON.stringify(INITIAL_DOCTORS));
  return INITIAL_DOCTORS;
}

function saveLocalDoctors(docs: Doctor[]) {
  localStorage.setItem('nfc_doctors', JSON.stringify(docs));
}

function getLocalAppointments(): Appointment[] {
  return [];
}

function saveLocalAppointments(_appts: Appointment[]) {
  // No-op: appointments must strictly persist to Supabase public.appointments
}

function getLocalDoctorLeaves(): DoctorLeave[] {
  try {
    const raw = localStorage.getItem('nfc_doctor_leaves');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return [];
}

function saveLocalDoctorLeaves(leaves: DoctorLeave[]) {
  localStorage.setItem('nfc_doctor_leaves', JSON.stringify(leaves));
}

// Get auth token if available
async function getAuthHeader(): Promise<Record<string, string>> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        return { Authorization: `Bearer ${data.session.access_token}` };
      }
    } catch (e) {
      console.warn('[AUTH] Could not retrieve session for header:', e);
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// Specialties
// ---------------------------------------------------------------------------
export async function getSpecialties(): Promise<Specialty[]> {
  try {
    const res = await fetch(`${API_BASE}/specialties`);
    if (res.ok) return await res.json();
  } catch {}
  return CLINIC_SPECIALTIES;
}

// ---------------------------------------------------------------------------
// Doctors - Public & Directory
// ---------------------------------------------------------------------------
export async function getDoctors(): Promise<Doctor[]> {
  try {
    const res = await fetch(`${API_BASE}/doctors`);
    if (res.ok) return await res.json();
  } catch {}
  const all = getLocalDoctors();
  return all.filter((d) => d.is_active);
}

export async function getDoctorById(id: string): Promise<Doctor | null> {
  try {
    const res = await fetch(`${API_BASE}/doctors/${id}`);
    if (res.ok) return await res.json();
  } catch {}
  const all = getLocalDoctors();
  return all.find((d) => d.id === id) || null;
}

// ---------------------------------------------------------------------------
// Slots & Booking (Asia/Karachi)
// ---------------------------------------------------------------------------
export async function getAvailableSlots(doctorId: string, dateStr: string): Promise<TimeSlot[]> {
  try {
    const res = await fetch(`${API_BASE}/slots/available?doctor_id=${doctorId}&date=${dateStr}`);
    if (res.ok) return await res.json();
  } catch {}

  const docs = getLocalDoctors();
  const doc = docs.find((d) => d.id === doctorId) || docs[0];
  if (!doc.is_active) return [];

  // Check leaves
  const leaves = getLocalDoctorLeaves();
  if (leaves.some((l) => l.doctor_id === doc.id && l.leave_date === dateStr)) {
    return []; // Doctor on scheduled leave
  }

  // Parse date components safely into UTC to get standard PostgreSQL DOW (0=Sun, 1=Mon, ..., 6=Sat)
  const [year, month, day] = dateStr.split('-').map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = targetDate.getUTCDay();

  const wh = doc.working_hours?.find((w) => w.day_of_week === dayOfWeek && w.is_available);
  if (!wh) return [];

  const [startHour, startMin] = wh.start_time.split(':').map(Number);
  const [endHour, endMin] = wh.end_time.split(':').map(Number);

  const existingAppts = getLocalAppointments().filter(
    (a) => a.doctor_id === doc.id && a.status !== 'cancelled' && a.start_time.startsWith(dateStr)
  );
  const occupiedStarts = new Set(existingAppts.map((a) => a.start_time));

  const now = new Date();
  const slots: TimeSlot[] = [];

  let curH = startHour;
  let curM = startMin;

  while (curH < endHour || (curH === endHour && curM + 30 <= endMin)) {
    const nextH = curM + 30 >= 60 ? curH + 1 : curH;
    const nextM = (curM + 30) % 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    const startIso = `${dateStr}T${pad(curH)}:${pad(curM)}:00+05:00`;
    const endIso = `${dateStr}T${pad(nextH)}:${pad(nextM)}:00+05:00`;

    const slotStartDt = new Date(startIso);

    if (slotStartDt > now && !occupiedStarts.has(startIso)) {
      slots.push({
        start_time: startIso,
        end_time: endIso,
        available: true,
      });
    }

    curH = nextH;
    curM = nextM;
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status?: number;
  code?: string;
  detail?: string;

  constructor(message: string, status?: number, code?: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Appointments Core
// ---------------------------------------------------------------------------
export async function createAppointment(
  doctorId: string,
  startTime: string,
  patientUser?: { id: string; full_name: string; email: string; phone?: string | null }
): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        doctor_id: doctorId,
        start_time: startTime,
        patient_id: patientUser?.id,
        patient_name: patientUser?.full_name,
        patient_email: patientUser?.email,
        patient_phone: patientUser?.phone,
      }),
    });
  } catch {
    throw new ApiError(
      'Unable to connect to clinic server. Please check your network connection and try again.',
      0,
      'NETWORK_ERROR'
    );
  }

  if (res.ok) {
    return await res.json();
  }

  const errData = await res.json().catch(() => ({}));
  if (res.status === 409) {
    throw new ApiError(
      'Appointment slot is already booked. Please select another available time.',
      409,
      errData.code || 'SLOT_CONFLICT',
      errData.detail
    );
  }

  throw new ApiError(
    errData.detail || 'Unable to schedule appointment at this time. Please try again.',
    res.status,
    errData.code,
    errData.detail
  );
}

export async function bookAppointment(
  doctorId: string,
  startTime: string,
  patientUser?: { id: string; full_name: string; email: string; phone?: string | null }
): Promise<Appointment> {
  return createAppointment(doctorId, startTime, patientUser);
}

export async function getMyAppointments(patientId: string): Promise<Appointment[]> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/appointments/my?patient_id=${encodeURIComponent(patientId)}`, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(errData.detail || 'Unable to retrieve appointments', res.status, errData.code);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    console.warn('[API] getMyAppointments notice:', err?.message || err);
    return [];
  }
}

export async function getDoctorAppointments(
  doctorId: string,
  dateFilter?: string,
  statusFilter?: string
): Promise<Appointment[]> {
  try {
    const headers = await getAuthHeader();
    let url = `${API_BASE}/appointments/doctor?`;
    if (dateFilter) url += `date=${dateFilter}&`;
    if (statusFilter && statusFilter !== 'all') url += `status=${statusFilter}&`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(errData.detail || 'Unable to retrieve doctor appointments', res.status, errData.code);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    console.warn('[API] getDoctorAppointments notice:', err?.message || err);
    return [];
  }
}

export async function confirmAppointment(appointmentId: string): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/confirm`, {
      method: 'POST',
      headers,
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to confirm appointment.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to confirm appointment', res.status, errData.code);
  }
  return await res.json();
}

export async function rejectAppointment(appointmentId: string): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/reject`, {
      method: 'POST',
      headers,
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to reject appointment.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to reject appointment', res.status, errData.code);
  }
  return await res.json();
}

export async function cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ reason }),
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to cancel appointment.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to cancel appointment', res.status, errData.code);
  }
  return await res.json();
}

export async function rescheduleAppointment(
  appointmentId: string,
  newStartTime: string
): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ new_start_time: newStartTime }),
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to reschedule appointment.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new ApiError(
        'Appointment slot is already booked. Please select another available time.',
        409,
        'SLOT_CONFLICT',
        errData.detail
      );
    }
    throw new ApiError(errData.detail || 'Failed to reschedule appointment', res.status, errData.code);
  }
  return await res.json();
}

export async function completeAppointment(appointmentId: string): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/complete`, {
      method: 'POST',
      headers,
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to complete appointment.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to complete appointment', res.status, errData.code);
  }
  return await res.json();
}

export async function noShowAppointment(appointmentId: string): Promise<Appointment> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/no-show`, {
      method: 'POST',
      headers,
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to update appointment.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to update appointment status to no-show', res.status, errData.code);
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Admin Management APIs
// ---------------------------------------------------------------------------

export async function getAdminStats(): Promise<AdminClinicStats> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/admin/stats`, { headers });
    if (res.ok) return await res.json();
  } catch {}

  const docs = getLocalDoctors();
  const appts = getLocalAppointments();
  const todayStr = new Date().toISOString().split('T')[0];

  return {
    total_doctors: docs.length,
    active_doctors: docs.filter((d) => d.is_active).length,
    total_patients: 12,
    today_appointments: appts.filter((a) => a.start_time.startsWith(todayStr)).length,
    pending_appointments: appts.filter((a) => a.status === 'pending').length,
    confirmed_appointments: appts.filter((a) => a.status === 'confirmed').length,
    completed_appointments: appts.filter((a) => a.status === 'completed').length,
    no_show_appointments: appts.filter((a) => a.status === 'no_show').length,
    cancelled_appointments: appts.filter((a) => a.status === 'cancelled').length,
  };
}

export async function getAllDoctorsAdmin(search?: string, specialtyId?: string, status?: string): Promise<Doctor[]> {
  const headers = await getAuthHeader();
  try {
    let url = `${API_BASE}/admin/doctors?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (specialtyId) url += `specialty_id=${specialtyId}&`;
    if (status) url += `status=${status}&`;

    const res = await fetch(url, { headers });
    if (res.ok) return await res.json();
  } catch {}

  let docs = getLocalDoctors();
  if (specialtyId) docs = docs.filter((d) => d.specialty.id === specialtyId);
  if (status === 'active') docs = docs.filter((d) => d.is_active);
  if (status === 'inactive') docs = docs.filter((d) => !d.is_active);
  if (search) {
    const term = search.toLowerCase();
    docs = docs.filter((d) => d.full_name.toLowerCase().includes(term) || d.email.toLowerCase().includes(term));
  }
  return docs;
}

export async function createDoctor(input: DoctorCreateInput): Promise<Doctor> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_BASE}/admin/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let errDetail = 'Failed to create doctor';
    try {
      const err = await res.json();
      if (err.detail) errDetail = err.detail;
    } catch {}
    throw new Error(errDetail);
  }

  const createdDoctor: Doctor = await res.json();
  const docs = getLocalDoctors();
  const existingIdx = docs.findIndex((d) => d.id === createdDoctor.id || d.email.toLowerCase() === createdDoctor.email.toLowerCase());
  if (existingIdx >= 0) {
    docs[existingIdx] = createdDoctor;
  } else {
    docs.push(createdDoctor);
  }
  saveLocalDoctors(docs);
  return createdDoctor;
}

export async function updateDoctor(doctorId: string, input: DoctorUpdateInput): Promise<Doctor> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(input),
    });
    if (res.ok) return await res.json();
  } catch {}

  const docs = getLocalDoctors();
  const target = docs.find((d) => d.id === doctorId);
  if (!target) throw new Error('Doctor not found');

  if (input.full_name) target.full_name = input.full_name;
  if (input.phone !== undefined) target.phone = input.phone;
  if (input.qualification) target.qualification = input.qualification;
  if (input.bio !== undefined) target.bio = input.bio;
  if (input.is_active !== undefined) target.is_active = input.is_active;
  if (input.specialty_id) {
    const s = CLINIC_SPECIALTIES.find((spec) => spec.id === input.specialty_id);
    if (s) target.specialty = s;
  }

  saveLocalDoctors(docs);
  return target;
}

export async function setDoctorStatus(doctorId: string, isActive: boolean): Promise<Doctor> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_active: isActive }),
    });
    if (res.ok) return await res.json();
  } catch {}

  const docs = getLocalDoctors();
  const target = docs.find((d) => d.id === doctorId);
  if (!target) throw new Error('Doctor not found');

  target.is_active = isActive;
  saveLocalDoctors(docs);
  return target;
}

export async function getPatientsDirectory(search?: string): Promise<PatientSummary[]> {
  const headers = await getAuthHeader();
  try {
    let url = `${API_BASE}/admin/patients?`;
    if (search) url += `search=${encodeURIComponent(search)}`;
    const res = await fetch(url, { headers });
    if (res.ok) return await res.json();
  } catch {}

  const patientsList: PatientSummary[] = [
    {
      id: 'pat-001',
      full_name: 'Ahmad Khan',
      email: 'patient@nowsheraclinic.pk',
      phone: '+92 300 1234567',
      created_at: '2026-09-01T08:00:00Z',
      total_appointments: 4,
      pending_appointments: 1,
      confirmed_appointments: 1,
      completed_appointments: 2,
      cancelled_appointments: 0,
      no_show_appointments: 0,
    },
    {
      id: 'pat-002',
      full_name: 'Fatima Zahra',
      email: 'fatima.z@example.com',
      phone: '+92 312 9876543',
      created_at: '2026-09-05T09:30:00Z',
      total_appointments: 2,
      pending_appointments: 0,
      confirmed_appointments: 1,
      completed_appointments: 1,
      cancelled_appointments: 0,
      no_show_appointments: 0,
    },
    {
      id: 'pat-003',
      full_name: 'Muhammad Usman',
      email: 'usman.m@example.com',
      phone: '+92 333 5556677',
      created_at: '2026-09-10T11:15:00Z',
      total_appointments: 1,
      pending_appointments: 0,
      confirmed_appointments: 0,
      completed_appointments: 0,
      cancelled_appointments: 1,
      no_show_appointments: 0,
    },
    {
      id: 'pat-004',
      full_name: 'Zainab Bibi',
      email: 'zainab.b@example.com',
      phone: '+92 345 4443322',
      created_at: '2026-09-12T14:20:00Z',
      total_appointments: 3,
      pending_appointments: 1,
      confirmed_appointments: 1,
      completed_appointments: 1,
      cancelled_appointments: 0,
      no_show_appointments: 0,
    },
  ];

  if (search) {
    const term = search.toLowerCase();
    return patientsList.filter(
      (p) => p.full_name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term) || (p.phone && p.phone.includes(term))
    );
  }
  return patientsList;
}

export async function getMasterAppointmentsAdmin(
  doctorId?: string,
  date?: string,
  status?: string,
  search?: string
): Promise<Appointment[]> {
  const headers = await getAuthHeader();
  try {
    let url = `${API_BASE}/admin/appointments?`;
    if (doctorId) url += `doctor_id=${doctorId}&`;
    if (date) url += `date=${date}&`;
    if (status && status !== 'all') url += `status=${status}&`;
    if (search) url += `search=${encodeURIComponent(search)}&`;

    const res = await fetch(url, { headers });
    if (res.ok) return await res.json();
  } catch {}

  let all = getLocalAppointments();
  if (doctorId) all = all.filter((a) => a.doctor_id === doctorId);
  if (date) all = all.filter((a) => a.start_time.startsWith(date));
  if (status && status !== 'all') all = all.filter((a) => a.status === status);
  if (search) {
    const term = search.toLowerCase();
    all = all.filter(
      (a) => (a.patient?.full_name?.toLowerCase().includes(term)) || (a.patient?.email?.toLowerCase().includes(term))
    );
  }
  return all;
}

export async function cancelAppointmentAdmin(appointmentId: string, reason?: string): Promise<Appointment> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/admin/appointments/${appointmentId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) return await res.json();
  } catch {}

  const all = getLocalAppointments();
  const target = all.find((a) => a.id === appointmentId);
  if (!target) throw new Error('Appointment not found');

  target.status = 'cancelled';
  target.cancellation_reason = reason || 'Cancelled by clinic administration';
  target.cancelled_by = 'admin';
  saveLocalAppointments(all);
  return target;
}

// ---------------------------------------------------------------------------
// Doctor Self-Management APIs (Working Hours & Leaves)
// ---------------------------------------------------------------------------

export async function getDoctorWorkingHours(doctorId: string): Promise<WorkingHour[]> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/doctors/${doctorId}/working-hours`, { headers });
    if (res.ok) return await res.json();
  } catch {}

  try {
    const res = await fetch(`${API_BASE}/doctors/me/working-hours`, { headers });
    if (res.ok) return await res.json();
  } catch {}

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('doctor_working_hours')
        .select('day_of_week, start_time, end_time, is_available')
        .eq('doctor_id', doctorId)
        .order('day_of_week');
      if (!error && data && data.length > 0) {
        return data as WorkingHour[];
      }
    } catch {}
  }

  const docs = getLocalDoctors();
  const doc = docs.find((d) => d.id === doctorId) || docs[0];
  return doc.working_hours || [];
}

export async function updateDoctorWorkingHours(doctorId: string, workingHours: WorkingHour[]): Promise<WorkingHour[]> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/doctors/${doctorId}/working-hours`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ working_hours: workingHours }),
    });
    if (res.ok) return await res.json();
  } catch {}

  try {
    const res = await fetch(`${API_BASE}/doctors/me/working-hours`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ working_hours: workingHours }),
    });
    if (res.ok) return await res.json();
  } catch {}

  if (isSupabaseConfigured && supabase) {
    try {
      const payload = workingHours.map((wh) => ({
        doctor_id: doctorId,
        day_of_week: wh.day_of_week,
        start_time: wh.start_time.length === 5 ? `${wh.start_time}:00` : wh.start_time,
        end_time: wh.end_time.length === 5 ? `${wh.end_time}:00` : wh.end_time,
        is_available: wh.is_available,
      }));
      await supabase.from('doctor_working_hours').upsert(payload, { onConflict: 'doctor_id,day_of_week' });
    } catch {}
  }

  const docs = getLocalDoctors();
  const doc = docs.find((d) => d.id === doctorId) || docs[0];
  doc.working_hours = workingHours;
  saveLocalDoctors(docs);
  return workingHours;
}

export async function getDoctorLeaves(doctorId: string): Promise<DoctorLeave[]> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/doctors/me/leaves`, { headers });
    if (res.ok) return await res.json();
  } catch {}

  const all = getLocalDoctorLeaves();
  return all.filter((l) => l.doctor_id === doctorId || doctorId.includes('doctor') || l.doctor_id === 'doc-001');
}

export async function addDoctorLeave(
  doctorId: string,
  leaveDate: string,
  reason?: string
): Promise<{ leave: DoctorLeave; cancelledCount: number }> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/doctors/me/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ leave_date: leaveDate, reason }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        leave: {
          id: data.id,
          doctor_id: data.doctor_id,
          leave_date: data.leave_date,
          reason: data.reason,
          created_at: new Date().toISOString(),
        },
        cancelledCount: data.cancelled_appointments_count || 0,
      };
    }
  } catch {}

  const allLeaves = getLocalDoctorLeaves();
  if (allLeaves.some((l) => l.doctor_id === doctorId && l.leave_date === leaveDate)) {
    throw new Error(`Leave is already scheduled for ${leaveDate}.`);
  }

  const newLeave: DoctorLeave = {
    id: `leave-${Date.now()}`,
    doctor_id: doctorId,
    leave_date: leaveDate,
    reason: reason || 'Scheduled leave',
    created_at: new Date().toISOString(),
  };

  allLeaves.push(newLeave);
  saveLocalDoctorLeaves(allLeaves);

  // Auto-cancel pending and confirmed appointments on that date
  const appts = getLocalAppointments();
  let cancelledCount = 0;
  for (const a of appts) {
    if (
      (a.doctor_id === doctorId || doctorId.includes('doctor') || a.doctor_id === 'doc-001') &&
      a.start_time.startsWith(leaveDate) &&
      (a.status === 'pending' || a.status === 'confirmed')
    ) {
      a.status = 'cancelled';
      a.cancellation_reason = `Cancelled due to doctor leave: ${reason || 'Scheduled off-duty'}`;
      a.cancelled_by = doctorId;
      cancelledCount++;
    }
  }
  saveLocalAppointments(appts);

  return { leave: newLeave, cancelledCount };
}

export async function deleteDoctorLeave(doctorId: string, leaveId: string): Promise<void> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/doctors/me/leaves/${leaveId}`, {
      method: 'DELETE',
      headers,
    });
    if (res.ok) return;
  } catch {}

  const allLeaves = getLocalDoctorLeaves();
  const filtered = allLeaves.filter((l) => l.id !== leaveId);
  saveLocalDoctorLeaves(filtered);
}

// ---------------------------------------------------------------------------
// Visit Notes API Services
// ---------------------------------------------------------------------------

export async function createVisitNote(
  appointmentId: string,
  notes: string,
  isPatientVisible: boolean = true
): Promise<VisitNote> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/visit-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ notes, is_patient_visible: isPatientVisible }),
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to save visit note.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to save visit note', res.status, errData.code);
  }
  return await res.json();
}

export async function updateVisitNote(
  appointmentId: string,
  notes: string,
  isPatientVisible: boolean = true
): Promise<VisitNote> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/visit-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ notes, is_patient_visible: isPatientVisible }),
    });
  } catch {
    throw new ApiError('Unable to reach clinic server to update visit note.', 0, 'NETWORK_ERROR');
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to update visit note', res.status, errData.code);
  }
  return await res.json();
}

export async function getVisitNote(appointmentId: string): Promise<VisitNote | null> {
  const headers = await getAuthHeader();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/appointments/${appointmentId}/visit-notes`, { headers });
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(errData.detail || 'Failed to retrieve visit note', res.status, errData.code);
  }
  return await res.json();
}

