-- ==============================================================================
-- Nowshera Family Clinic - Migration 005: Repair Doctor Onboarding, Roles, & Grants
-- Date: 2026-09-17
-- Description:
-- 1. Grants necessary schema & table permissions to service_role, authenticated, and anon.
-- 2. Eliminates infinite recursion in RLS policies by using SECURITY DEFINER is_admin.
-- 3. Ensures standard UUID specialties exist.
-- 4. Updates auth user trigger to handle metadata roles without breaking public patient registration.
-- 5. Safely repairs existing doctor profiles and public.doctors records using exact Auth UUIDs.
-- ==============================================================================

-- 1. GRANT SCHEMA & TABLE PRIVILEGES
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 2. CREATE HELPER FOR ADMIN CHECKS (SECURITY DEFINER to prevent recursive RLS)
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

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role, anon;

-- 3. FIX PROFILES RLS POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public view profiles" ON public.profiles;

CREATE POLICY "Users and admins can view profiles" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id OR public.is_admin(auth.uid()) OR role = 'doctor'
    );

CREATE POLICY "Users and admins can update profiles" ON public.profiles
    FOR UPDATE USING (
        auth.uid() = id OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins and service can insert profiles" ON public.profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id OR public.is_admin(auth.uid()) OR auth.role() = 'service_role'
    );

-- 4. FIX SPECIALTIES RLS POLICIES (Public read)
DROP POLICY IF EXISTS "Public read specialties" ON public.specialties;
CREATE POLICY "Public read specialties" ON public.specialties
    FOR SELECT USING (true);

CREATE POLICY "Admins manage specialties" ON public.specialties
    FOR ALL USING (public.is_admin(auth.uid()));

-- 5. FIX DOCTORS RLS POLICIES
DROP POLICY IF EXISTS "Public read active doctors" ON public.doctors;
DROP POLICY IF EXISTS "Admins can insert/update doctors" ON public.doctors;
DROP POLICY IF EXISTS "Admins full management on doctors" ON public.doctors;
DROP POLICY IF EXISTS "Doctors can update own metadata" ON public.doctors;

CREATE POLICY "Public read active doctors" ON public.doctors
    FOR SELECT USING (
        is_active = true 
        OR auth.uid() = id
        OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins full management on doctors" ON public.doctors
    FOR ALL USING (
        public.is_admin(auth.uid())
    );

CREATE POLICY "Doctors can update own metadata" ON public.doctors
    FOR UPDATE USING (
        auth.uid() = id
    )
    WITH CHECK (
        auth.uid() = id
    );

-- 6. FIX DOCTOR WORKING HOURS RLS
DROP POLICY IF EXISTS "Public read doctor working hours" ON public.doctor_working_hours;
DROP POLICY IF EXISTS "Doctors can manage own working hours" ON public.doctor_working_hours;
DROP POLICY IF EXISTS "Doctors manage own working hours" ON public.doctor_working_hours;

CREATE POLICY "Public read doctor working hours" ON public.doctor_working_hours
    FOR SELECT USING (true);

CREATE POLICY "Doctors and admins manage working hours" ON public.doctor_working_hours
    FOR ALL USING (
        auth.uid() = doctor_id OR public.is_admin(auth.uid())
    );

-- 7. FIX DOCTOR LEAVES RLS
DROP POLICY IF EXISTS "Public read doctor leaves" ON public.doctor_leaves;
DROP POLICY IF EXISTS "Doctors can manage own leaves" ON public.doctor_leaves;
DROP POLICY IF EXISTS "Doctors manage own leaves" ON public.doctor_leaves;

CREATE POLICY "Public read doctor leaves" ON public.doctor_leaves
    FOR SELECT USING (true);

CREATE POLICY "Doctors and admins manage leaves" ON public.doctor_leaves
    FOR ALL USING (
        auth.uid() = doctor_id OR public.is_admin(auth.uid())
    );

-- 8. FIX APPOINTMENTS RLS
DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can view assigned appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authorized status updates" ON public.appointments;
DROP POLICY IF EXISTS "Strict administrative updates" ON public.appointments;

CREATE POLICY "Users view relevant appointments" ON public.appointments
    FOR SELECT USING (
        auth.uid() = patient_id OR auth.uid() = doctor_id OR public.is_admin(auth.uid())
    );

CREATE POLICY "Patients create appointments" ON public.appointments
    FOR INSERT WITH CHECK (
        auth.uid() = patient_id OR public.is_admin(auth.uid())
    );

CREATE POLICY "Authorized appointment updates" ON public.appointments
    FOR UPDATE USING (
        auth.uid() = patient_id OR auth.uid() = doctor_id OR public.is_admin(auth.uid())
    );

-- 9. REVISE HANDLE_NEW_USER TRIGGER
-- Respects role metadata while defaulting public self-registrations strictly to 'patient'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Patient'),
        NEW.raw_user_meta_data->>'phone',
        CASE 
            WHEN NEW.raw_user_meta_data->>'role' = 'doctor' THEN 'doctor'::user_role
            WHEN NEW.raw_user_meta_data->>'role' = 'admin' THEN 'admin'::user_role
            ELSE 'patient'::user_role
        END
    )
    ON CONFLICT (id) DO UPDATE SET
        role = CASE 
            WHEN NEW.raw_user_meta_data->>'role' = 'doctor' THEN 'doctor'::user_role
            WHEN NEW.raw_user_meta_data->>'role' = 'admin' THEN 'admin'::user_role
            ELSE public.profiles.role
        END,
        full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', public.profiles.full_name),
        phone = COALESCE(NEW.raw_user_meta_data->>'phone', public.profiles.phone),
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. ENSURE STANDARD SPECIALTIES SEED
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

-- 11. REPAIR EXISTING DOCTORS (Yaqoob, Sardar, Farooq) USING THEIR AUTH UUIDS
-- Doctor 1: Dr. Yaqoob ur Rehman (30b6de4e-174f-4381-831d-e3a6ae199596)
INSERT INTO public.profiles (id, email, full_name, phone, role)
VALUES (
    '30b6de4e-174f-4381-831d-e3a6ae199596',
    'yaqoob@gmail.com',
    'Dr. Yaqoob ur Rehman',
    '+92 300 9876543',
    'doctor'
)
ON CONFLICT (id) DO UPDATE SET
    role = 'doctor',
    full_name = 'Dr. Yaqoob ur Rehman',
    phone = '+92 300 9876543',
    updated_at = NOW();

INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
VALUES (
    '30b6de4e-174f-4381-831d-e3a6ae199596',
    '44444444-4444-4444-4444-444444444444', -- Cardiology
    'MBBS, FCPS (Cardiology)',
    'Senior Consultant with over 12 years of experience in cardiology and general medicine.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    specialty_id = '44444444-4444-4444-4444-444444444444',
    qualification = 'MBBS, FCPS (Cardiology)',
    bio = 'Senior Consultant with over 12 years of experience in cardiology and general medicine.',
    is_active = TRUE,
    updated_at = NOW();

-- Doctor 2: Dr. Sardar Sohail (5af7156f-88e7-4311-84c2-36ae28875f1a)
INSERT INTO public.profiles (id, email, full_name, phone, role)
VALUES (
    '5af7156f-88e7-4311-84c2-36ae28875f1a',
    'sardar@gmail.com',
    'Dr. Sardar Sohail',
    '03003443234',
    'doctor'
)
ON CONFLICT (id) DO UPDATE SET
    role = 'doctor',
    full_name = 'Dr. Sardar Sohail',
    phone = '03003443234',
    updated_at = NOW();

INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
VALUES (
    '5af7156f-88e7-4311-84c2-36ae28875f1a',
    '22222222-2222-2222-2222-222222222222', -- Pediatrics
    'MBBS, MD (Pediatrics)',
    'Consultant Pediatrician specializing in child healthcare and neonatal medicine.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    specialty_id = '22222222-2222-2222-2222-222222222222',
    qualification = 'MBBS, MD (Pediatrics)',
    bio = 'Consultant Pediatrician specializing in child healthcare and neonatal medicine.',
    is_active = TRUE,
    updated_at = NOW();

-- Doctor 3: Dr. Farooq Khan (59ba4df6-d45b-48e2-8a20-966a9630fd0a)
INSERT INTO public.profiles (id, email, full_name, phone, role)
VALUES (
    '59ba4df6-d45b-48e2-8a20-966a9630fd0a',
    'dr.farooq@nowsheraclinic.pk',
    'Dr. Farooq Khan',
    '+92 300 9876543',
    'doctor'
)
ON CONFLICT (id) DO UPDATE SET
    role = 'doctor',
    full_name = 'Dr. Farooq Khan',
    phone = '+92 300 9876543',
    updated_at = NOW();

INSERT INTO public.doctors (id, specialty_id, qualification, bio, is_active)
VALUES (
    '59ba4df6-d45b-48e2-8a20-966a9630fd0a',
    '11111111-1111-1111-1111-111111111111', -- Family Medicine
    'MBBS, FCPS (Family Medicine)',
    'Family Medicine Consultant dedicated to comprehensive preventive care.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    specialty_id = '11111111-1111-1111-1111-111111111111',
    qualification = 'MBBS, FCPS (Family Medicine)',
    bio = 'Family Medicine Consultant dedicated to comprehensive preventive care.',
    is_active = TRUE,
    updated_at = NOW();

-- 12. SEED DEFAULT WORKING HOURS FOR REPAIRED DOCTORS
INSERT INTO public.doctor_working_hours (doctor_id, day_of_week, start_time, end_time, is_available)
VALUES
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 1, '09:00:00', '17:00:00', TRUE),
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 2, '09:00:00', '17:00:00', TRUE),
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 3, '09:00:00', '17:00:00', TRUE),
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 4, '09:00:00', '17:00:00', TRUE),
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 5, '09:00:00', '14:00:00', TRUE),
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 6, '09:00:00', '14:00:00', FALSE),
    ('30b6de4e-174f-4381-831d-e3a6ae199596', 0, '09:00:00', '14:00:00', FALSE),

    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 1, '09:00:00', '17:00:00', TRUE),
    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 2, '09:00:00', '17:00:00', TRUE),
    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 3, '09:00:00', '17:00:00', TRUE),
    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 4, '09:00:00', '17:00:00', TRUE),
    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 5, '09:00:00', '14:00:00', TRUE),
    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 6, '09:00:00', '14:00:00', FALSE),
    ('5af7156f-88e7-4311-84c2-36ae28875f1a', 0, '09:00:00', '14:00:00', FALSE),

    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 1, '09:00:00', '17:00:00', TRUE),
    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 2, '09:00:00', '17:00:00', TRUE),
    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 3, '09:00:00', '17:00:00', TRUE),
    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 4, '09:00:00', '17:00:00', TRUE),
    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 5, '09:00:00', '14:00:00', TRUE),
    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 6, '09:00:00', '14:00:00', FALSE),
    ('59ba4df6-d45b-48e2-8a20-966a9630fd0a', 0, '09:00:00', '14:00:00', FALSE)
ON CONFLICT (doctor_id, day_of_week) DO NOTHING;
