-- ==============================================================================
-- Nowshera Family Clinic - Migration 006
-- Definitive Table Grants, RLS Fixes, and Doctor Repair Script
-- Execute this script directly in Supabase SQL Editor
-- ==============================================================================

-- 1. Ensure schema usage and table grants for all Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role, postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role, postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role, postgres;

-- Explicit table permissions for PostgREST
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.specialties, public.doctors, public.profiles, public.doctor_working_hours TO anon;

-- 2. Seed Master Specialties with standard UUIDs
INSERT INTO public.specialties (id, name, description)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Family Medicine', 'Comprehensive primary healthcare for individuals and family members of all ages.'),
  ('22222222-2222-2222-2222-222222222222', 'Pediatrics', 'Specialized medical care and wellness monitoring for infants, children, and adolescents.'),
  ('33333333-3333-3333-3333-333333333333', 'General Internal Medicine', 'Prevention, diagnosis, and treatment of adult acute and chronic diseases.'),
  ('44444444-4444-4444-4444-444444444444', 'Cardiology', 'Expert cardiovascular care, hypertension management, and heart health screenings.'),
  ('55555555-5555-5555-5555-555555555555', 'Dermatology', 'Diagnosis and clinical care for skin, hair, and dermatological conditions.')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 3. Non-recursive Admin Check Helper Function
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

-- 4. Correct User Creation Trigger Function
-- Respects role metadata while defaulting public signups to 'patient'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    requested_role public.user_role;
    raw_role text;
BEGIN
    raw_role := NEW.raw_user_meta_data->>'role';
    
    IF raw_role = 'doctor' THEN
        requested_role := 'doctor'::public.user_role;
    ELSIF raw_role = 'admin' THEN
        requested_role := 'admin'::public.user_role;
    ELSE
        requested_role := 'patient'::public.user_role;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Patient'),
        NEW.raw_user_meta_data->>'phone',
        requested_role
    )
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        full_name = CASE WHEN profiles.full_name IS NULL OR profiles.full_name = 'Patient' THEN EXCLUDED.full_name ELSE profiles.full_name END,
        phone = COALESCE(profiles.phone, EXCLUDED.phone),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Hardened RLS Policies on doctors and profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_working_hours ENABLE ROW LEVEL SECURITY;

-- Reset Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public can view doctor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can do all profiles" ON public.profiles;

CREATE POLICY "Service role full access profiles" ON public.profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Public can view doctor profiles" ON public.profiles
    FOR SELECT TO anon, authenticated USING (role = 'doctor');

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" ON public.profiles
    FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Reset Doctors Policies
DROP POLICY IF EXISTS "Public can view active doctors" ON public.doctors;
DROP POLICY IF EXISTS "Admins can manage doctors" ON public.doctors;
DROP POLICY IF EXISTS "Doctors can update own record" ON public.doctors;
DROP POLICY IF EXISTS "Service role full access doctors" ON public.doctors;

CREATE POLICY "Service role full access doctors" ON public.doctors
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Public can view active doctors" ON public.doctors
    FOR SELECT TO anon, authenticated USING (is_active = true OR auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage doctors" ON public.doctors
    FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Doctors can update own record" ON public.doctors
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 6. REPAIR EXISTING 3 DOCTORS DIRECTLY IN DATABASE

-- 6a. Dr. Yaqoob ur Rehman (yaqoob@gmail.com)
DO $$
DECLARE
    v_uid uuid := '30b6de4e-174f-4381-831d-e3a6ae199596';
BEGIN
    -- Ensure profile exists with role = 'doctor'
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        v_uid,
        'yaqoob@gmail.com',
        'Dr. Yaqoob ur Rehman',
        '+92 300 9876543',
        'doctor'
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'doctor',
        full_name = 'Dr. Yaqoob ur Rehman',
        phone = COALESCE(profiles.phone, '+92 300 9876543'),
        updated_at = NOW();

    -- Ensure doctor record exists
    INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
    VALUES (
        v_uid,
        '44444444-4444-4444-4444-444444444444', -- Cardiology
        'MBBS, FCPS (Cardiology)',
        'Senior Consultant with over 12 years of experience in cardiology and general medicine.',
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        specialty_id = EXCLUDED.specialty_id,
        qualification = EXCLUDED.qualification,
        bio = EXCLUDED.bio,
        is_active = true,
        updated_at = NOW();

    -- Working Hours (Monday - Friday 09:00 - 17:00)
    FOR d IN 1..5 LOOP
        INSERT INTO public.doctor_working_hours (doctor_id, day_of_week, start_time, end_time, is_available)
        VALUES (v_uid, d, '09:00:00'::time, '17:00:00'::time, true)
        ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            is_available = true;
    END LOOP;
END $$;

-- 6b. Dr. Sardar Sohail (sardar@gmail.com)
DO $$
DECLARE
    v_uid uuid := '5af7156f-88e7-4311-84c2-36ae28875f1a';
BEGIN
    -- Ensure profile exists with role = 'doctor'
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        v_uid,
        'sardar@gmail.com',
        'Dr. Sardar Sohail',
        '03003443234',
        'doctor'
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'doctor',
        full_name = 'Dr. Sardar Sohail',
        phone = COALESCE(profiles.phone, '03003443234'),
        updated_at = NOW();

    -- Ensure doctor record exists
    INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
    VALUES (
        v_uid,
        '22222222-2222-2222-2222-222222222222', -- Pediatrics
        'MBBS, MD (Pediatrics)',
        'Consultant Pediatrician specializing in child healthcare and neonatal medicine.',
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        specialty_id = EXCLUDED.specialty_id,
        qualification = EXCLUDED.qualification,
        bio = EXCLUDED.bio,
        is_active = true,
        updated_at = NOW();

    -- Working Hours (Monday - Friday 09:00 - 17:00)
    FOR d IN 1..5 LOOP
        INSERT INTO public.doctor_working_hours (doctor_id, day_of_week, start_time, end_time, is_available)
        VALUES (v_uid, d, '09:00:00'::time, '17:00:00'::time, true)
        ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            is_available = true;
    END LOOP;
END $$;

-- 6c. Dr. Farooq Khan (dr.farooq@nowsheraclinic.pk / farooq@gmail.com)
DO $$
DECLARE
    v_uid uuid := '59ba4df6-d45b-48e2-8a20-966a9630fd0a';
BEGIN
    -- Ensure profile exists with role = 'doctor'
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        v_uid,
        'dr.farooq@nowsheraclinic.pk',
        'Dr. Farooq Khan',
        '+92 300 9876543',
        'doctor'
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'doctor',
        full_name = 'Dr. Farooq Khan',
        phone = COALESCE(profiles.phone, '+92 300 9876543'),
        updated_at = NOW();

    -- Also update any profile with farooq@gmail.com if present
    UPDATE public.profiles
    SET role = 'doctor'
    WHERE email IN ('farooq@gmail.com', 'dr.farooq@nowsheraclinic.pk');

    -- Ensure doctor record exists
    INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
    VALUES (
        v_uid,
        '11111111-1111-1111-1111-111111111111', -- Family Medicine
        'MBBS, FCPS (Family Medicine)',
        'Family Medicine Consultant dedicated to comprehensive preventive care.',
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        specialty_id = EXCLUDED.specialty_id,
        qualification = EXCLUDED.qualification,
        bio = EXCLUDED.bio,
        is_active = true,
        updated_at = NOW();

    -- If a distinct profile id exists for farooq@gmail.com, create doctor record for that id too
    INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
    SELECT p.id, '11111111-1111-1111-1111-111111111111', 'MBBS, FCPS (Family Medicine)', 'Family Medicine Consultant', true
    FROM public.profiles p
    WHERE p.email = 'farooq@gmail.com' AND p.id != v_uid
    ON CONFLICT (id) DO NOTHING;

    -- Working Hours (Monday - Friday 09:00 - 17:00)
    FOR d IN 1..5 LOOP
        INSERT INTO public.doctor_working_hours (doctor_id, day_of_week, start_time, end_time, is_available)
        VALUES (v_uid, d, '09:00:00'::time, '17:00:00'::time, true)
        ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            is_available = true;
    END LOOP;
END $$;
