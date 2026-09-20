-- ==============================================================================
-- Migration 007: Repair Table Grants & Fix RLS Policy Recursion (42P17 & 42501)
-- Nowshera Family Clinic
-- Execute this SQL script directly in your Supabase Project SQL Editor
-- ==============================================================================

-- 1. Ensure schema usage and table grants for all Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role, postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role, postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role, postgres;

-- PostgREST role table access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.specialties, public.doctors, public.profiles, public.doctor_working_hours TO anon;

-- 2. Repair Infinite Recursion (42P17) on public.profiles
-- Helper function to check admin status safely without triggering RLS recursion
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

-- Helper function to check doctor status safely
CREATE OR REPLACE FUNCTION public.is_doctor(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id AND role = 'doctor'
  );
$$;

-- Drop recursive profile policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Create safe, non-recursive profile policies
CREATE POLICY "Public read access to profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. Ensure clean RLS on appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can view their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can view their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authorized status updates" ON public.appointments;

CREATE POLICY "Patients view own appointments" ON public.appointments
    FOR SELECT USING (
        auth.uid() = patient_id OR 
        auth.uid() = doctor_id OR 
        public.is_admin(auth.uid())
    );

CREATE POLICY "Patients can create appointments" ON public.appointments
    FOR INSERT WITH CHECK (
        auth.uid() = patient_id OR
        public.is_admin(auth.uid())
    );

CREATE POLICY "Authorized status updates" ON public.appointments
    FOR UPDATE USING (
        auth.uid() = patient_id OR 
        auth.uid() = doctor_id OR 
        public.is_admin(auth.uid())
    );

-- 4. Ensure foreign key references and indices on appointments
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_slot ON public.appointments (doctor_id, start_time) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_appointments_patient_slot ON public.appointments (patient_id, start_time) WHERE status != 'cancelled';
