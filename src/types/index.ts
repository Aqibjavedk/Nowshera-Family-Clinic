export type UserRole = 'patient' | 'doctor' | 'admin';

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
}

export interface Specialty {
  id: string;
  name: string;
  description?: string | null;
}

export interface WorkingHour {
  day_of_week: number; // 0=Sunday, 1=Monday ... 6=Saturday
  start_time: string; // HH:MM:SS or HH:MM
  end_time: string;   // HH:MM:SS or HH:MM
  is_available: boolean;
}

export interface Doctor {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  qualification: string;
  bio?: string | null;
  is_active: boolean;
  specialty: Specialty;
  working_hours?: WorkingHour[];
}

export interface DoctorLeave {
  id: string;
  doctor_id: string;
  leave_date: string; // YYYY-MM-DD
  reason?: string | null;
  created_at?: string;
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
  available: boolean;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  cancellation_reason?: string | null;
  cancelled_by?: string | null;
  cancellation_email_sent_at?: string | null;
  created_at: string;
  doctor?: {
    id: string;
    full_name: string;
    qualification: string;
    specialty: string;
  };
  patient?: {
    id: string;
    full_name: string;
    email: string;
    phone?: string | null;
  };
  specialty?: string;
}

export interface VisitNote {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  notes: string;
  is_patient_visible: boolean;
  created_at: string;
}

export interface AdminClinicStats {
  total_doctors: number;
  active_doctors: number;
  total_patients: number;
  today_appointments: number;
  pending_appointments: number;
  confirmed_appointments: number;
  completed_appointments: number;
  no_show_appointments: number;
  cancelled_appointments: number;
}

export interface PatientSummary {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  created_at: string;
  total_appointments: number;
  pending_appointments: number;
  confirmed_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  no_show_appointments: number;
}

export interface DoctorCreateInput {
  full_name: string;
  email: string;
  phone?: string;
  specialty_id: string;
  qualification: string;
  bio?: string;
  password?: string;
  is_active: boolean;
}

export interface DoctorUpdateInput {
  full_name?: string;
  phone?: string;
  specialty_id?: string;
  qualification?: string;
  bio?: string;
  is_active?: boolean;
}
