-- ==============================================================================
-- Nowshera Family Clinic - Phase 1 Database Migration
-- Target Engine: Supabase PostgreSQL
-- Description: Core 7 tables, ENUMs, relational integrity, RLS, & triggers
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create PostgreSQL ENUM types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- TABLE 1: profiles
-- Extends Supabase auth.users. Automatically populated on signup via trigger.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'patient',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for searching users and role-filtering
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ==============================================================================
-- TABLE 2: specialties
-- Master list of medical departments/specialties practiced at the clinic.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_specialties_name ON public.specialties(name);

-- ==============================================================================
-- TABLE 3: doctors
-- Doctor-specific metadata extending the profiles table.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.doctors (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    specialty_id UUID NOT NULL REFERENCES public.specialties(id) ON DELETE RESTRICT,
    qualification TEXT NOT NULL,
    bio TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON public.doctors(specialty_id);
CREATE INDEX IF NOT EXISTS idx_doctors_is_active ON public.doctors(is_active);

-- ==============================================================================
-- TABLE 4: doctor_working_hours
-- Recurring weekly working schedule for doctors.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.doctor_working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL, -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validations
    CONSTRAINT chk_day_of_week CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_working_hours_validity CHECK (end_time > start_time),
    CONSTRAINT unique_doctor_day UNIQUE (doctor_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_working_hours_doctor_day ON public.doctor_working_hours(doctor_id, day_of_week);

-- ==============================================================================
-- TABLE 5: doctor_leaves
-- Specific calendar dates when a doctor is unavailable.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.doctor_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_doctor_leave_date UNIQUE (doctor_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_doctor_leaves_date ON public.doctor_leaves(doctor_id, leave_date);

-- ==============================================================================
-- TABLE 6: appointments
-- Core appointments with 30-min duration check and slot exclusivity constraints.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status appointment_status NOT NULL DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Invariant: Appointment duration must be exactly 30 minutes
    CONSTRAINT chk_appointment_30_min_duration CHECK (end_time = start_time + INTERVAL '30 minutes')
);

-- Essential foreign key indexes
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- CRITICAL INVARIANT 1: A slot can only have ONE active appointment.
-- Cancelled appointments do NOT block an appointment slot.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_slot 
ON public.appointments (doctor_id, start_time) 
WHERE status != 'cancelled';

-- CRITICAL INVARIANT 2: A patient cannot have two active appointments at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_patient_slot 
ON public.appointments (patient_id, start_time) 
WHERE status != 'cancelled';

-- ==============================================================================
-- TABLE 7: visit_notes
-- Confidential consultation notes recorded by doctors.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.visit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    notes TEXT NOT NULL,
    is_patient_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_notes_patient ON public.visit_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_notes_doctor ON public.visit_notes(doctor_id);

-- ==============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_doctors_updated_at ON public.doctors;
CREATE TRIGGER trg_doctors_updated_at
    BEFORE UPDATE ON public.doctors
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_visit_notes_updated_at ON public.visit_notes;
CREATE TRIGGER trg_visit_notes_updated_at
    BEFORE UPDATE ON public.visit_notes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- SUPABASE AUTH USER TRIGGER
-- Automatically creates a patient profile upon Supabase auth sign-up.
-- Public registration is strictly restricted to the 'patient' role.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Patient'),
        NEW.raw_user_meta_data->>'phone',
        'patient' -- Enforced: Normal public registration ALWAYS creates a patient
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_notes ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin role without recursive RLS evaluation
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id AND role = 'admin'
  );
$$;

-- 1. Profiles RLS
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        public.is_admin(auth.uid())
    );

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 2. Specialties RLS (Public read)
CREATE POLICY "Public read specialties" ON public.specialties
    FOR SELECT USING (true);

-- 3. Doctors RLS (Public read active doctors, admins manage)
CREATE POLICY "Public read active doctors" ON public.doctors
    FOR SELECT USING (is_active = true OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Admins can insert/update doctors" ON public.doctors
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 4. Doctor Working Hours RLS
CREATE POLICY "Public read doctor working hours" ON public.doctor_working_hours
    FOR SELECT USING (true);

CREATE POLICY "Doctors can manage own working hours" ON public.doctor_working_hours
    FOR ALL USING (auth.uid() = doctor_id);

-- 5. Doctor Leaves RLS
CREATE POLICY "Public read doctor leaves" ON public.doctor_leaves
    FOR SELECT USING (true);

CREATE POLICY "Doctors can manage own leaves" ON public.doctor_leaves
    FOR ALL USING (auth.uid() = doctor_id);

-- 6. Appointments RLS
CREATE POLICY "Patients can view own appointments" ON public.appointments
    FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Doctors can view assigned appointments" ON public.appointments
    FOR SELECT USING (auth.uid() = doctor_id);

CREATE POLICY "Admins can view all appointments" ON public.appointments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Patients can create appointments" ON public.appointments
    FOR INSERT WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Authorized status updates" ON public.appointments
    FOR UPDATE USING (
        auth.uid() = patient_id OR 
        auth.uid() = doctor_id OR 
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 7. Visit Notes RLS (STRICT PRIVACY: Admin CANNOT view private visit notes)
CREATE POLICY "Doctors can manage own notes" ON public.visit_notes
    FOR ALL USING (auth.uid() = doctor_id);

CREATE POLICY "Patients can view own notes if visible" ON public.visit_notes
    FOR SELECT USING (auth.uid() = patient_id AND is_patient_visible = true);
